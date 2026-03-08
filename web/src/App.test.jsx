import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

// Mock fetch
global.fetch = vi.fn()

// Format a Date as a js-joda-style string: "2026-02-15T19:00:00-08:00"
// Omits the IANA bracket so day-grouping uses the local (test-runner) timezone,
// keeping it consistent with how the app computes todayStart.
function toJodaDateString(date) {
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const absOff = Math.abs(offset)
  const offHours = pad(Math.floor(absOff / 60))
  const offMins = pad(absOff % 60)
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${offHours}:${offMins}`
  return iso
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
      expect(screen.getByPlaceholderText('Search calendars and events... (press "/" to focus)')).toBeInTheDocument()
    })
    
    const searchInput = screen.getByPlaceholderText('Search calendars and events... (press "/" to focus)')
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
      expect(screen.getByPlaceholderText('Search calendars and events... (press "/" to focus)')).toBeInTheDocument()
    })
    
    const searchInput = screen.getByPlaceholderText('Search calendars and events... (press "/" to focus)')
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

    // Use fake timers set to noon to avoid midnight-crossing issues
    // ("+2 hours from now" could land on tomorrow if test runs after 10 PM)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fakeNow = new Date()
    fakeNow.setHours(12, 0, 0, 0)
    vi.setSystemTime(fakeNow)

    const todayEvent = new Date(fakeNow.getTime() + 2 * 60 * 60 * 1000) // 2 PM today
    const todayEventEnd = new Date(fakeNow.getTime() + 3 * 60 * 60 * 1000) // 3 PM today
    const tomorrowEvent = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate() + 1, 20, 0)
    const tomorrowEventEnd = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate() + 1, 22, 0)

    const mockEventsIndex = [
      {
        icsUrl: 'test-ripper-calendar1.ics',
        summary: 'Tonight Concert',
        description: 'A great show',
        location: 'The Venue',
        date: toJodaDateString(todayEvent),
        endDate: toJodaDateString(todayEventEnd),
      },
      {
        icsUrl: 'test-ripper-calendar2.ics',
        summary: 'Tomorrow Movie',
        description: 'A great movie',
        location: 'The Theater',
        date: toJodaDateString(tomorrowEvent),
        endDate: toJodaDateString(tomorrowEventEnd),
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

    vi.useRealTimers()
  })

  it('filters out events whose end time has already passed', async () => {
    const user = userEvent.setup()

    const now = new Date()
    // An event that started and ended in the past (today, but already over)
    const pastStart = new Date(now.getTime() - 3 * 60 * 60 * 1000) // 3 hours ago
    const pastEnd = new Date(now.getTime() - 1 * 60 * 60 * 1000) // 1 hour ago
    // A future event today
    const futureStart = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const futureEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000)

    const mockEventsIndex = [
      {
        icsUrl: 'test-ripper-calendar1.ics',
        summary: 'Already Over Event',
        date: toJodaDateString(pastStart),
        endDate: toJodaDateString(pastEnd),
      },
      {
        icsUrl: 'test-ripper-calendar1.ics',
        summary: 'Future Event',
        date: toJodaDateString(futureStart),
        endDate: toJodaDateString(futureEnd),
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
      expect(screen.getByText('Future Event')).toBeInTheDocument()
    })

    expect(screen.queryByText('Already Over Event')).not.toBeInTheDocument()
  })

  it('shows end time for today events but not for other days', async () => {
    // Pin time so the test is deterministic regardless of when/where it runs
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-15T10:00:00'))  // 10 AM local, well before our events

    const user = userEvent.setup()

    // "Today" event: 2 PM local today (4 hours from "now")
    const todayStart = new Date(2026, 5, 15, 14, 0)  // June 15, 2 PM
    const todayEnd = new Date(2026, 5, 15, 15, 0)     // June 15, 3 PM

    // "Day after" event: tomorrow at 6 PM
    const dayAfter = new Date(2026, 5, 16, 18, 0)     // June 16, 6 PM
    const dayAfterEnd = new Date(2026, 5, 16, 20, 0)   // June 16, 8 PM

    const mockEventsIndex = [
      {
        icsUrl: 'test-ripper-calendar1.ics',
        summary: 'Today Event',
        date: toJodaDateString(todayStart),
        endDate: toJodaDateString(todayEnd),
      },
      {
        icsUrl: 'test-ripper-calendar2.ics',
        summary: 'Day After Event',
        date: toJodaDateString(dayAfter),
        endDate: toJodaDateString(dayAfterEnd),
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
      expect(screen.getByText('Today Event')).toBeInTheDocument()
    })

    // Today event should show a time range (start – end) in its event-date element
    const todayEventTitle = screen.getByText('Today Event')
    const todayEventItem = todayEventTitle.closest('.event-item')
    const todayEventDate = todayEventItem.querySelector('.event-date')
    expect(todayEventDate.textContent).toMatch(/\u2013/)

    // Day-after event should show only start time (no en-dash range)
    expect(screen.getByText('Day After Event')).toBeInTheDocument()
    const dayAfterEventTitle = screen.getByText('Day After Event')
    const dayAfterEventItem = dayAfterEventTitle.closest('.event-item')
    const dayAfterEventDate = dayAfterEventItem.querySelector('.event-date')
    expect(dayAfterEventDate.textContent).not.toMatch(/\u2013/)

    vi.useRealTimers()
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

  it('shows detail (favorites events) view on mobile when favorites tag is clicked', async () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    // Set up a favorited calendar in localStorage
    localStorage.setItem('calendar-ripper-favorites', JSON.stringify(['test-ripper-calendar1.ics']))

    const user = userEvent.setup()

    fetch.mockReset()
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockManifest })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    render(<App />)

    // Wait for loading to complete — on mobile, the app starts in 'detail' (homepage) view
    await waitFor(() => {
      expect(screen.queryByText('Loading calendars...')).not.toBeInTheDocument()
    })

    // Press the mobile back button to navigate from homepage to the list (sidebar) view
    const backBtn = document.querySelector('.mobile-back-btn')
    await user.click(backBtn)

    // Now in 'list' view, the sidebar with the favorites tag is visible
    await waitFor(() => {
      expect(screen.getByText('♥ Favorites')).toBeInTheDocument()
    })

    // Click the favorites tag
    await user.click(screen.getByText('♥ Favorites'))

    // The mobile back bar title should show '♥ Favorites', confirming we switched to detail view
    await waitFor(() => {
      const backBar = document.querySelector('.mobile-back-bar')
      expect(backBar).toBeInTheDocument()
      // In detail view on mobile the sidebar (with 'Happening Soon') is hidden
      expect(screen.queryByText('Happening Soon')).not.toBeInTheDocument()
    })

    // Clean up
    localStorage.removeItem('calendar-ripper-favorites')
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    window.dispatchEvent(new Event('resize'))
  })

  it('shows detail (favorites events) view on mobile when navigating directly to #tag=__favorites__', async () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    // Set up a favorited calendar in localStorage
    localStorage.setItem('calendar-ripper-favorites', JSON.stringify(['test-ripper-calendar1.ics']))

    // Simulate direct navigation to the favorites URL (e.g., browser bookmark or back/forward)
    window.location.hash = '#tag=__favorites__'

    fetch.mockReset()
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockManifest })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    render(<App />)

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading calendars...')).not.toBeInTheDocument()
    })

    // The sidebar (with 'Happening Soon') should NOT be visible because mobileView is 'detail'
    expect(screen.queryByText('Happening Soon')).not.toBeInTheDocument()

    // The mobile-back-bar is only rendered in detail view on mobile; it should be present
    const backBar = document.querySelector('.mobile-back-bar')
    expect(backBar).toBeInTheDocument()

    // Clean up
    localStorage.removeItem('calendar-ripper-favorites')
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    window.dispatchEvent(new Event('resize'))
  })

  it('shows calendar list (not homepage) on mobile when browser back is pressed from a calendar detail', async () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    fetch.mockReset()
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockManifest })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    render(<App />)

    // Wait for loading to complete (mobile starts in detail/homepage view)
    await waitFor(() => {
      expect(screen.queryByText('Loading calendars...')).not.toBeInTheDocument()
    })

    // Simulate the state the app would be in after a user navigated to a calendar detail:
    // the URL has view=detail and a calendarId. We test the browser back by simulating
    // a popstate event with an empty URL (as if the user pressed back from that detail).
    window.location.hash = '#calendar=test-ripper-calendar1&view=detail'
    window.dispatchEvent(new Event('hashchange'))

    await waitFor(() => {
      // In calendar detail view, the sidebar (Happening Soon) is hidden
      expect(screen.queryByText('Happening Soon')).not.toBeInTheDocument()
    })

    // Simulate browser back: URL reverts to empty.
    // Real browsers fire popstate THEN hashchange for history navigations that change the hash.
    // The hashchange must NOT override the popstate result (resetting to homepage).
    window.location.hash = ''
    window.dispatchEvent(new PopStateEvent('popstate'))
    window.dispatchEvent(new Event('hashchange'))  // browsers fire this right after popstate

    // After browser back, mobile should show the calendar list (sidebar), not the homepage
    await waitFor(() => {
      expect(screen.getByText('Happening Soon')).toBeInTheDocument()
    })

    // Clean up
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    window.dispatchEvent(new Event('resize'))
  })
})
