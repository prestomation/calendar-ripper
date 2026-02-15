import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

// Mock fetch
global.fetch = vi.fn()

// Format a Date as a js-joda-style string: "2026-02-15T19:00:00-08:00[America/Los_Angeles]"
function toJodaDateString(date) {
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const absOff = Math.abs(offset)
  const offHours = pad(Math.floor(absOff / 60))
  const offMins = pad(absOff % 60)
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${offHours}:${offMins}`
  return `${iso}[America/Los_Angeles]`
}

const mockManifest = {
  lastUpdated: '2024-12-13T17:00:00.000Z',
  rippers: [
    {
      name: 'test-ripper',
      description: 'Test Ripper Description',
      calendars: [
        {
          name: 'calendar1',
          friendlyName: 'Test Calendar 1',
          icsUrl: 'test-ripper-calendar1.ics',
          tags: ['music', 'events']
        },
        {
          name: 'calendar2', 
          friendlyName: 'Test Calendar 2',
          icsUrl: 'test-ripper-calendar2.ics',
          tags: ['movies', 'events']
        }
      ]
    }
  ],
  tags: ['music', 'movies', 'events']
}

describe('App', () => {
  beforeEach(() => {
    fetch.mockClear()
    // Reset URL hash to avoid state leaking between tests
    window.location.hash = ''
    // Mock successful manifest fetch
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockManifest
    })
  })

  it('renders loading state initially', () => {
    render(<App />)
    expect(screen.getByText('Loading calendars...')).toBeInTheDocument()
  })

  it('loads and displays calendars from manifest', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText('Test Ripper Description')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Test Calendar 1')).toBeInTheDocument()
    expect(screen.getByText('Test Calendar 2')).toBeInTheDocument()
  })

  it('displays all tags in filter section', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText('music').length).toBeGreaterThan(0)
    })

    expect(screen.getAllByText('movies').length).toBeGreaterThan(0)
    expect(screen.getAllByText('events').length).toBeGreaterThan(0)
  })

  it('filters calendars by tag when tag is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText('Test Calendar 1')).toBeInTheDocument()
    })
    
    // Click on music tag pill (first match is in the tags panel)
    await user.click(screen.getAllByText('music')[0])

    // Should still show calendar 1 (has music tag)
    expect(screen.getAllByText('Test Calendar 1').length).toBeGreaterThan(0)
    // Should hide calendar 2 (no music tag) - check ripper group is hidden
    expect(screen.queryByText('Test Calendar 2')).not.toBeInTheDocument()
  })

  it('shows search functionality', async () => {
    const user = userEvent.setup()
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search calendars and events...')).toBeInTheDocument()
    })
    
    const searchInput = screen.getByPlaceholderText('Search calendars and events...')
    await user.type(searchInput, 'Calendar 1')
    
    expect(searchInput.value).toBe('Calendar 1')
  })

  it('displays last generated date in footer', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText(/Last generated at/)).toBeInTheDocument()
    })
  })

  it('shows empty state when no calendars match filter', async () => {
    const user = userEvent.setup()
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search calendars and events...')).toBeInTheDocument()
    })
    
    const searchInput = screen.getByPlaceholderText('Search calendars and events...')
    await user.type(searchInput, 'nonexistent')
    
    await waitFor(() => {
      expect(screen.getByText('No calendars found')).toBeInTheDocument()
    })
  })

  it('resets tag filter when All is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Test Calendar 1')).toBeInTheDocument()
    })

    // Click music tag to filter
    await user.click(screen.getAllByText('music')[0])

    // Click All to reset
    await user.click(screen.getByText('All'))

    // Both calendars should be visible again
    expect(screen.getAllByText('Test Calendar 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Test Calendar 2').length).toBeGreaterThan(0)
  })

  it('shows Happening Soon button in header', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Happening Soon')).toBeInTheDocument()
    })
  })

  it('switches to Happening Soon view when button is clicked', async () => {
    const user = userEvent.setup()

    // Create events that are happening "today"
    const now = new Date()
    const todayEvent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0)
    const tomorrowEvent = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 20, 0)

    const mockEventsIndex = [
      {
        icsUrl: 'test-ripper-calendar1.ics',
        summary: 'Tonight Concert',
        description: 'A great show',
        location: 'The Venue',
        date: toJodaDateString(todayEvent),
      },
      {
        icsUrl: 'test-ripper-calendar2.ics',
        summary: 'Tomorrow Movie',
        description: 'A great movie',
        location: 'The Theater',
        date: toJodaDateString(tomorrowEvent),
      }
    ]

    // Override fetch to return manifest + events index
    fetch.mockReset()
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockManifest })
      .mockResolvedValueOnce({ ok: true, json: async () => mockEventsIndex })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Happening Soon')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Happening Soon'))

    await waitFor(() => {
      expect(screen.getByText('Tonight Concert')).toBeInTheDocument()
    })

    expect(screen.getByText('Tomorrow Movie')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
  })

  it('shows empty state in Happening Soon when no events in next 7 days', async () => {
    const user = userEvent.setup()

    // Create events far in the future (outside 7-day window)
    const farFutureEvent = new Date()
    farFutureEvent.setDate(farFutureEvent.getDate() + 30)

    const mockEventsIndex = [
      {
        icsUrl: 'test-ripper-calendar1.ics',
        summary: 'Far Future Event',
        date: toJodaDateString(farFutureEvent),
      }
    ]

    fetch.mockReset()
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockManifest })
      .mockResolvedValueOnce({ ok: true, json: async () => mockEventsIndex })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Happening Soon')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Happening Soon'))

    await waitFor(() => {
      expect(screen.getByText('No upcoming events in the next 7 days')).toBeInTheDocument()
    })
  })

  it('updates URL hash when Happening Soon is activated', async () => {
    const user = userEvent.setup()

    fetch.mockReset()
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockManifest })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Happening Soon')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Happening Soon'))

    expect(window.location.hash).toContain('view=happening-soon')
  })
})
