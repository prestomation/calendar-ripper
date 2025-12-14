import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

// Mock fetch
global.fetch = vi.fn()

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
      expect(screen.getByText('music')).toBeInTheDocument()
    })
    
    expect(screen.getByText('movies')).toBeInTheDocument()
    expect(screen.getByText('events')).toBeInTheDocument()
  })

  it('filters calendars by tag when tag is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText('Test Calendar 1')).toBeInTheDocument()
    })
    
    // Click on music tag
    await user.click(screen.getByText('music'))
    
    // Should still show calendar 1 (has music tag)
    expect(screen.getByText('Test Calendar 1')).toBeInTheDocument()
    // Should hide calendar 2 (no music tag) - check ripper group is hidden
    expect(screen.queryByText('Test Calendar 2')).not.toBeInTheDocument()
  })

  it('shows search functionality', async () => {
    const user = userEvent.setup()
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search calendars...')).toBeInTheDocument()
    })
    
    const searchInput = screen.getByPlaceholderText('Search calendars...')
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
      expect(screen.getByPlaceholderText('Search calendars...')).toBeInTheDocument()
    })
    
    const searchInput = screen.getByPlaceholderText('Search calendars...')
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
    await user.click(screen.getByText('music'))
    
    // Click All to reset
    await user.click(screen.getByText('All'))
    
    // Both calendars should be visible again
    expect(screen.getByText('Test Calendar 1')).toBeInTheDocument()
    expect(screen.getByText('Test Calendar 2')).toBeInTheDocument()
  })
})
