import { useState, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'
import ICAL from 'ical.js'

function App() {
  const [calendars, setCalendars] = useState([])
  const [manifest, setManifest] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [previousTag, setPreviousTag] = useState('')
  const [selectedCalendar, setSelectedCalendar] = useState(null)
  const [showHomepage, setShowHomepage] = useState(true)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState(null)

  // URL state management
  useEffect(() => {
    const updateFromURL = () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      setSearchTerm(params.get('search') || '')
      setSelectedTag(params.get('tag') || '')
      const calendarId = params.get('calendar')
      if (calendarId && calendars.length > 0) {
        const calendar = findCalendarById(calendarId)
        if (calendar) setSelectedCalendar(calendar)
      }
    }
    
    updateFromURL()
    window.addEventListener('hashchange', updateFromURL)
    return () => window.removeEventListener('hashchange', updateFromURL)
  }, [calendars])

  const updateURL = (search, tag, calendar) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (tag) params.set('tag', tag)
    if (calendar) params.set('calendar', `${calendar.ripperName}-${calendar.name}`)
    window.location.hash = params.toString()
  }

  const findCalendarById = (id) => {
    for (const ripper of calendars) {
      for (const calendar of ripper.calendars) {
        if (`${ripper.name}-${calendar.name}` === id) {
          return { ...calendar, ripperName: ripper.name }
        }
      }
    }
    return null
  }

  const handleSearchChange = (value) => {
    setSearchTerm(value)
    
    // If starting to type and we have a tag selected, save it and clear tag selection
    if (value && selectedTag) {
      setPreviousTag(selectedTag)
      setSelectedTag('')
      updateURL(value, '', selectedCalendar)
    }
    // If search is cleared and we had a previous tag, restore it
    else if (!value && previousTag) {
      setSelectedTag(previousTag)
      updateURL(value, previousTag, selectedCalendar)
    } else {
      updateURL(value, selectedTag, selectedCalendar)
    }
  }

  const handleTagChange = (tag) => {
    // Save current tag as previous if switching to a different tag
    if (selectedTag && selectedTag !== tag) {
      setPreviousTag(selectedTag)
    }
    
    // Clear search when selecting a tag
    if (searchTerm) {
      setSearchTerm('')
    }
    
    setSelectedTag(tag)
    
    // If selecting a tag (not clearing), auto-select first calendar in that tag
    if (tag) {
      const filteredCalendars = calendars.filter(ripper => 
        ripper.calendars.some(calendar => calendar.tags.includes(tag))
      )
      
      if (filteredCalendars.length > 0) {
        const firstRipper = filteredCalendars[0]
        const firstCalendar = firstRipper.calendars.find(calendar => 
          calendar.tags.includes(tag)
        )
        
        if (firstCalendar) {
          const calendarWithRipper = { ...firstCalendar, ripperName: firstRipper.name }
          setSelectedCalendar(calendarWithRipper)
          setShowHomepage(false)
          updateURL('', tag, calendarWithRipper)
          return
        }
      }
    }
    
    updateURL('', tag, selectedCalendar)
  }

  const handleTagSelect = (tag) => {
    const tagCalendar = {
      name: `tag-${tag.toLowerCase()}`,
      fullName: `Tag: ${tag}`,
      icsUrl: `tag-${tag.toLowerCase()}.ics`,
      tags: [tag],
      ripperName: 'tag-aggregate'
    }
    setSelectedCalendar(tagCalendar)
    setShowHomepage(false)
    updateURL(searchTerm, selectedTag, tagCalendar)
  }

  const handleCalendarSelect = (calendar, ripperName) => {
    const calendarWithRipper = { ...calendar, ripperName }
    setSelectedCalendar(calendarWithRipper)
    setShowHomepage(false)
    updateURL(searchTerm, selectedTag, calendarWithRipper)
  }

  const createGoogleMapsUrl = (location) => {
    return `https://maps.google.com/maps?q=${encodeURIComponent(location)}`
  }

  const createWebcalUrl = (icsUrl, originalIcsUrl) => {
    const urlToUse = originalIcsUrl || icsUrl
    const fullUrl = originalIcsUrl ? urlToUse : new URL(icsUrl, window.location.origin + window.location.pathname).href
    return fullUrl.replace(/^https?:/, 'webcal:')
  }

  const createGoogleCalendarUrl = (icsUrl, originalIcsUrl) => {
    const webcalUrl = createWebcalUrl(icsUrl, originalIcsUrl)
    return `webcal://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(webcalUrl)}`
  }

  const copyToClipboard = async (text, buttonElement) => {
    try {
      await navigator.clipboard.writeText(text)
      showPopover(buttonElement, 'Copied!')
    } catch (err) {
      showPopover(buttonElement, 'Copy failed')
    }
  }

  const showPopover = (element, message) => {
    const popover = document.createElement('div')
    popover.textContent = message
    popover.style.cssText = `
      position: absolute;
      background: #333;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      pointer-events: none;
    `
    
    const rect = element.getBoundingClientRect()
    popover.style.left = rect.left + 'px'
    popover.style.top = (rect.top - 30) + 'px'
    
    document.body.appendChild(popover)
    setTimeout(() => document.body.removeChild(popover), 2000)
  }

  // Load calendar metadata from JSON manifest
  useEffect(() => {
    const loadCalendars = async () => {
      try {
        const response = await fetch('./manifest.json')
        const manifestData = await response.json()
        setManifest(manifestData)
        
        const ripperGroups = manifestData.rippers.map(ripper => ({
          name: ripper.name,
          description: ripper.description,
          friendlyLink: ripper.friendlyLink,
          calendars: ripper.calendars.map(calendar => ({
            name: calendar.name,
            fullName: calendar.friendlyName,
            icsUrl: calendar.icsUrl,
            tags: calendar.tags
          }))
        }))
        
        // Add external calendars as individual groups
        const externalGroups = (manifestData.externalCalendars || []).map(calendar => ({
          name: calendar.name,
          description: calendar.description,
          friendlyLink: calendar.infoUrl,
          calendars: [{
            name: calendar.name,
            fullName: calendar.friendlyName,
            icsUrl: calendar.icsUrl, // Local file for viewing
            originalIcsUrl: calendar.originalIcsUrl, // Original URL for subscription
            tags: calendar.tags,
            isExternal: true
          }]
        }))

        // Add recurring calendars as individual groups
        const recurringGroups = (manifestData.recurringCalendars || []).map(calendar => ({
          name: calendar.name,
          description: `Recurring: ${calendar.friendlyName}`,
          friendlyLink: null,
          calendars: [{
            name: calendar.name,
            fullName: calendar.friendlyName,
            icsUrl: calendar.icsUrl,
            tags: calendar.tags,
            isRecurring: true
          }]
        }))
        
        setCalendars([...ripperGroups, ...externalGroups, ...recurringGroups])
      } catch (error) {
        console.error('Failed to load calendars:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadCalendars()
  }, [])

  // Fuzzy search setup
  const fuse = useMemo(() => {
    const searchData = []
    calendars.forEach(ripper => {
      ripper.calendars.forEach(calendar => {
        searchData.push({
          ...calendar,
          ripperName: ripper.name,
          searchText: `${ripper.name} ${calendar.name} ${calendar.fullName} ${calendar.tags.join(' ')}`
        })
      })
    })
    
    return new Fuse(searchData, {
      keys: ['searchText'],
      threshold: 0.3
    })
  }, [calendars])

  // Filter calendars based on search and tag
  const filteredCalendars = useMemo(() => {
    let result = calendars
    
    if (searchTerm || selectedTag) {
      const matchingCalendars = new Set()
      
      if (searchTerm) {
        fuse.search(searchTerm).forEach(item => {
          matchingCalendars.add(`${item.item.ripperName}-${item.item.name}`)
        })
      }
      
      result = calendars.map(ripper => ({
        ...ripper,
        calendars: ripper.calendars.filter(calendar => {
          const matchesSearch = !searchTerm || matchingCalendars.has(`${ripper.name}-${calendar.name}`)
          const matchesTag = !selectedTag || calendar.tags.includes(selectedTag)
          return matchesSearch && matchesTag
        })
      })).filter(ripper => ripper.calendars.length > 0)
    }
    
    return result
  }, [calendars, searchTerm, selectedTag, fuse])

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set()
    calendars.forEach(ripper => {
      ripper.calendars.forEach(calendar => {
        calendar.tags.forEach(tag => tags.add(tag))
      })
    })
    return Array.from(tags).sort()
  }, [calendars])

  // Load events for selected calendar
  useEffect(() => {
    setEvents([]) // Clear events immediately when calendar changes
    if (!selectedCalendar) {
      setEventsLoading(false)
      return
    }

    const loadEvents = async () => {
      setEventsLoading(true)
      setEventsError(null)
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
        
        const response = await fetch(selectedCalendar.icsUrl, { 
          signal: controller.signal 
        })
        clearTimeout(timeoutId)
        
        const icsData = await response.text()
        
        const jcalData = ICAL.parse(icsData)
        const comp = new ICAL.Component(jcalData)
        const vevents = comp.getAllSubcomponents('vevent')
        
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // Start of today
        const eventList = vevents
          .map(vevent => {
            const event = new ICAL.Event(vevent)
            const startDate = event.startDate.toJSDate()
            const description = event.description || ''
            
            // Extract calendar name from description for tag aggregates
            let calendarName = null
            const fromMatch = description.match(/From (.+?)$/m)
            if (fromMatch) {
              calendarName = fromMatch[1]
            }
            
            return {
              id: event.uid,
              title: event.summary,
              description: event.description,
              location: event.location,
              url: vevent.getFirstPropertyValue('url'),
              startDate: startDate,
              endDate: event.endDate?.toJSDate(),
              calendarName: calendarName
            }
          })
          .filter(event => event.startDate >= today) // Filter from today onwards
          .sort((a, b) => a.startDate - b.startDate)
        
        setEvents(eventList)
      } catch (error) {
        if (error.name === 'AbortError') {
          setEventsError('Calendar loading timed out. This calendar may be too large.')
        } else {
          setEventsError('Failed to load events. Please try again.')
        }
        console.error('Failed to load events:', error)
        setEvents([])
      } finally {
        setEventsLoading(false)
      }
    }

    loadEvents()
  }, [selectedCalendar])

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return <div className="loading">Loading calendars...</div>
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="header-bar">
          <button 
            className="home-button"
            onClick={() => {
              setSelectedCalendar(null)
              setShowHomepage(true)
              window.location.hash = ''
            }}
            title="Home"
          >
            🏠
          </button>
          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder="Search calendars..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>
        
        <div className="tags">
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Tags:</div>
          <div
            className={`tag ${selectedTag === '' ? 'active' : ''}`}
            onClick={() => handleTagChange('')}
          >
            All
          </div>
          {allTags.map(tag => (
            <div
              key={tag}
              className={`tag ${selectedTag === tag ? 'active' : ''}`}
              onClick={() => handleTagChange(tag)}
            >
              {tag}
            </div>
          ))}
        </div>
        
        <div className="calendar-list">
          {selectedTag && (
            <div className="tag-header">
              <div 
                className="tag-header-content clickable"
                onClick={() => handleTagSelect(selectedTag)}
                title="Click to view tag calendar events"
              >
                <div className="tag-title">Tag: {selectedTag}</div>
                <div className="tag-actions">
                  <div className="ics-group">
                    <a 
                      href={createWebcalUrl(`tag-${selectedTag.toLowerCase()}.ics`)}
                      title="Subscribe to tag calendar"
                      className="action-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      📥 ICS
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const webcalUrl = createWebcalUrl(`tag-${selectedTag.toLowerCase()}.ics`)
                        copyToClipboard(webcalUrl, e.target)
                      }}
                      title="Copy ICS link"
                      className="clipboard-btn"
                    >
                      🔗
                    </button>
                  </div>
                  <a 
                    href={createGoogleCalendarUrl(`tag-${selectedTag.toLowerCase()}.ics`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Add tag calendar to Google Calendar"
                    className="action-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    📅 Google
                  </a>
                </div>
              </div>
            </div>
          )}
          
          {filteredCalendars.map((ripper) => (
            <div key={ripper.name} className="ripper-group">
              <div className="ripper-header">
                <div className="ripper-title-container">
                  <div className="ripper-title">
                    {ripper.description}
                    {ripper.calendars[0]?.isExternal && (
                      <span 
                        className="external-indicator"
                        title="External calendar from original organization"
                      >
                        🔗
                      </span>
                    )}
                  </div>
                  {ripper.friendlyLink && (
                    <a 
                      href={ripper.friendlyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ripper-link-icon"
                      title="Visit organization website"
                    >
                      🌐
                    </a>
                  )}
                </div>
                <div className="ripper-actions">
                  {ripper.calendars[0]?.isExternal ? (
                    // External calendar - use original URL
                    <>
                      <div className="ics-group">
                        <a 
                          href={createWebcalUrl(ripper.calendars[0].icsUrl, ripper.calendars[0].originalIcsUrl)}
                          title="Subscribe to calendar"
                          className="action-link"
                        >
                          📥 ICS
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const webcalUrl = createWebcalUrl(ripper.calendars[0].icsUrl, ripper.calendars[0].originalIcsUrl)
                            copyToClipboard(webcalUrl, e.target)
                          }}
                          title="Copy ICS link"
                          className="clipboard-btn"
                        >
                          🔗
                        </button>
                      </div>
                      <a 
                        href={createGoogleCalendarUrl(ripper.calendars[0].icsUrl, ripper.calendars[0].originalIcsUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Add to Google Calendar"
                        className="action-link"
                      >
                        📅 Google
                      </a>
                    </>
                  ) : (
                    // Regular ripper - use tag aggregation
                    <>
                      <div className="ics-group">
                        <a 
                          href={createWebcalUrl(`tag-${ripper.name.toLowerCase()}.ics`)}
                          title="Subscribe to all calendars"
                          className="action-link"
                        >
                          📥 ICS
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const webcalUrl = createWebcalUrl(`tag-${ripper.name.toLowerCase()}.ics`)
                            copyToClipboard(webcalUrl, e.target)
                          }}
                          title="Copy ICS link"
                          className="clipboard-btn"
                        >
                          🔗
                        </button>
                      </div>
                      <a 
                        href={createGoogleCalendarUrl(`tag-${ripper.name.toLowerCase()}.ics`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Add all calendars to Google Calendar"
                        className="action-link"
                      >
                        📅 Google
                      </a>
                    </>
                  )}
                </div>
              </div>
              
              {ripper.calendars.map((calendar) => (
                <div
                  key={`${ripper.name}-${calendar.name}`}
                  className={`calendar-item ${selectedCalendar?.name === calendar.name && selectedCalendar?.ripperName === ripper.name ? 'selected' : ''}`}
                >
                  <div
                    onClick={() => handleCalendarSelect(calendar, ripper.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="calendar-title">{calendar.fullName}</div>
                    <div className="calendar-tags">
                      {calendar.tags.map(tag => (
                        <span 
                          key={tag}
                          className="clickable-tag"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTagChange(tag)
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="calendar-actions">
                    <div className="ics-group">
                      <a 
                        href={createWebcalUrl(calendar.icsUrl, calendar.originalIcsUrl)}
                        title="Subscribe to calendar"
                        className="action-link"
                      >
                        📥 ICS
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const webcalUrl = createWebcalUrl(calendar.icsUrl, calendar.originalIcsUrl)
                          copyToClipboard(webcalUrl, e.target)
                        }}
                        title="Copy ICS link"
                        className="clipboard-btn"
                      >
                        🔗
                      </button>
                    </div>
                    <a 
                      href={createGoogleCalendarUrl(calendar.icsUrl, calendar.originalIcsUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Add to Google Calendar"
                      className="action-link"
                    >
                      📅 Google
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filteredCalendars.length === 0 && (
            <div className="empty-state">No calendars found</div>
          )}
        </div>
      </div>
      
      <div className="main-content">
        {showHomepage ? (
          <div className="homepage">
            <h1>Calendar Browser</h1>
            <p>Welcome to the iCalendar Ripper web interface! This tool aggregates events from various websites and presents them as searchable, filterable calendars.</p>
            
            <h2>How to Use</h2>
            <ul>
              <li><strong>Browse:</strong> Select any calendar from the sidebar to view upcoming events</li>
              <li><strong>Search:</strong> Use the search bar to find specific calendars by name or content</li>
              <li><strong>Filter by Tags:</strong> Click on tags to filter calendars by category</li>
              <li><strong>Subscribe:</strong> Use the 📥 ICS links to subscribe to calendars in your calendar app.</li>
              <li><strong>Copy Link:</strong> Use the 📋 buttons to copy calendar links to your clipboard.</li>
              <li><strong>Google Calendar:</strong> Use the 📅 Google links to add calendars to Google Calendar</li>
            </ul>
            
            <h2>Tags</h2>
            <p>Tags help organize calendars by category or theme. You can:</p>
            <ul>
              <li>Click any tag to filter calendars</li>
              <li>Download aggregate calendars that combine all events with the same tag</li>
              <li>Each calendar can have multiple tags for flexible organization</li>
            </ul>
            
            <p>Select a calendar from the sidebar to get started!</p>
          </div>
        ) : selectedCalendar ? (
          <div className="agenda-panel">
            <div className="agenda-header">
              <div className="agenda-title-container">
                <h1>{selectedCalendar.fullName}</h1>
                {(() => {
                  const ripper = calendars.find(r => r.name === selectedCalendar.ripperName)
                  return ripper?.friendlyLink ? (
                    <a 
                      href={ripper.friendlyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="agenda-link-icon"
                      title="Visit organization website"
                    >
                      🔗
                    </a>
                  ) : null
                })()}
              </div>
              <p>Upcoming events</p>
            </div>
            
            {eventsLoading ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>Loading events...</p>
              </div>
            ) : eventsError ? (
              <div className="error-state">
                <p>⚠️ {eventsError}</p>
                <button 
                  onClick={() => {
                    const loadEvents = async () => {
                      setEventsLoading(true)
                      setEventsError(null)
                      // ... (same loading logic)
                    }
                    loadEvents()
                  }}
                  className="retry-button"
                >
                  Try Again
                </button>
              </div>
            ) : events.length > 0 ? (
              events.map(event => (
                <div key={event.id} className="event-item">
                  <div className="event-date">{formatDate(event.startDate)}</div>
                  <div className="event-title">
                    {event.title}
                    {selectedCalendar?.ripperName === 'tag-aggregate' && event.calendarName && (
                      <span className="event-source" title={`From ${event.calendarName}`}>
                        {event.calendarName}
                      </span>
                    )}
                    {event.url && (
                      <a 
                        href={event.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="event-link-icon"
                        title="View event details"
                      >
                        🔗
                      </a>
                    )}
                  </div>
                  {event.description && (
                    <div className="event-details">{event.description}</div>
                  )}
                  {event.location && (
                    <div className="event-location">
                      📍 <a 
                        href={createGoogleMapsUrl(event.location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="location-link"
                      >
                        {event.location}
                      </a>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">No upcoming events</div>
            )}
          </div>
        ) : (
          <div className="empty-state">Select a calendar to view events</div>
        )}
        <footer className="footer">
          <p style={{ color: 'red', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>
            ⚠️ No guarantee these calendars are accurate to their sources as they are scraped automatically. Open an issue or pull request to add a new calendar to this page.
          </p>
          <p style={{ fontSize: '12px' }}>
            Powered by <a href="https://github.com/prestomation/icalendar-ripper" target="_blank" rel="noopener noreferrer">iCalendar Ripper</a>
            {manifest && (
              <span> • Last generated at {new Date(manifest.lastUpdated).toLocaleString()}</span>
            )}
          </p>
        </footer>
      </div>
    </div>
  )
}

export default App
