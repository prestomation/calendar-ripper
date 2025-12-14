import { useState, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'
import ICAL from 'ical.js'

function App() {
  const [calendars, setCalendars] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [selectedCalendar, setSelectedCalendar] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

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
    updateURL(value, selectedTag, selectedCalendar)
  }

  const handleTagChange = (tag) => {
    setSelectedTag(tag)
    updateURL(searchTerm, tag, selectedCalendar)
  }

  const handleCalendarSelect = (calendar, ripperName) => {
    const calendarWithRipper = { ...calendar, ripperName }
    setSelectedCalendar(calendarWithRipper)
    updateURL(searchTerm, selectedTag, calendarWithRipper)
  }

  const createGoogleMapsUrl = (location) => {
    return `https://maps.google.com/maps?q=${encodeURIComponent(location)}`
  }

  const createGoogleCalendarUrl = (icsUrl) => {
    const basePath = window.location.pathname.includes('/pr-') ? './' : '../output/'
    const fullUrl = new URL(`${basePath}${icsUrl}`, window.location.origin + window.location.pathname).href
    return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(fullUrl)}`
  }

  // Load calendar metadata from the output directory
  useEffect(() => {
    const loadCalendars = async () => {
      try {
        // Determine the correct path based on environment
        const basePath = window.location.pathname.includes('/pr-') ? './' : '../output/'
        
        // Parse the existing index.html to extract calendar data
        const response = await fetch(`${basePath}index.html`)
        const html = await response.text()
        
        // Extract calendar information from HTML
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        
        const ripperGroups = {}
        const calendarItems = doc.querySelectorAll('.calendar-item')
        
        // Extract ripper descriptions from section headers
        const ripperDescriptions = {}
        doc.querySelectorAll('h2').forEach(header => {
          const text = header.textContent.trim()
          if (text.includes(' - ')) {
            const [name, description] = text.split(' - ', 2)
            ripperDescriptions[name.toLowerCase().replace(/\s+/g, '-')] = description
          }
        })
        
        calendarItems.forEach(item => {
          const titleEl = item.querySelector('.calendar-title')
          const tagsEl = item.querySelector('.calendar-tags')
          const linkEl = item.querySelector('a[href$=".ics"]')
          
          if (titleEl && linkEl) {
            const fullName = titleEl.textContent.trim()
            const icsUrl = linkEl.getAttribute('href')
            
            // Extract ripper name and calendar name from the ICS filename
            const icsFilename = icsUrl.split('/').pop().replace('.ics', '')
            const parts = icsFilename.split('-')
            
            let ripperName, calendarName
            if (icsFilename.startsWith('tag-')) {
              // Skip tag aggregates for now
              return
            } else if (parts.length >= 2) {
              ripperName = parts[0]
              calendarName = parts.slice(1).join('-')
            } else {
              ripperName = 'Other'
              calendarName = icsFilename
            }
            
            const tags = []
            if (tagsEl) {
              tagsEl.querySelectorAll('.tag').forEach(tag => {
                tags.push(tag.textContent.trim())
              })
            }
            
            if (!ripperGroups[ripperName]) {
              ripperGroups[ripperName] = {
                name: ripperName,
                description: ripperDescriptions[ripperName] || ripperName,
                calendars: [],
                tags: new Set()
              }
            }
            
            ripperGroups[ripperName].calendars.push({
              name: calendarName,
              fullName: fullName,
              icsUrl: icsUrl,
              tags: tags
            })
            
            tags.forEach(tag => ripperGroups[ripperName].tags.add(tag))
          }
        })
        
        // Convert to array and finalize tags
        const ripperArray = Object.values(ripperGroups).map(ripper => ({
          ...ripper,
          tags: Array.from(ripper.tags)
        }))
        
        setCalendars(ripperArray)
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
    if (!selectedCalendar) {
      setEvents([])
      return
    }

    const loadEvents = async () => {
      try {
        const basePath = window.location.pathname.includes('/pr-') ? './' : '../output/'
        const response = await fetch(`${basePath}${selectedCalendar.icsUrl}`)
        const icsData = await response.text()
        
        const jcalData = ICAL.parse(icsData)
        const comp = new ICAL.Component(jcalData)
        const vevents = comp.getAllSubcomponents('vevent')
        
        const now = new Date()
        const eventList = vevents
          .map(vevent => {
            const event = new ICAL.Event(vevent)
            const startDate = event.startDate.toJSDate()
            
            return {
              id: event.uid,
              title: event.summary,
              description: event.description,
              location: event.location,
              url: vevent.getFirstPropertyValue('url'),
              startDate: startDate,
              endDate: event.endDate?.toJSDate()
            }
          })
          .filter(event => event.startDate >= now)
          .sort((a, b) => a.startDate - b.startDate)
          .slice(0, 50) // Limit to next 50 events
        
        setEvents(eventList)
      } catch (error) {
        console.error('Failed to load events:', error)
        setEvents([])
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
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search calendars..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
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
          {filteredCalendars.map((ripper, ripperIndex) => (
            <div key={ripperIndex} className="ripper-group">
              <div className="ripper-header">
                <div className="ripper-title">{ripper.description}</div>
                <div className="ripper-actions">
                  <a 
                    href={`${window.location.pathname.includes('/pr-') ? './' : '../output/'}tag-${ripper.name.toLowerCase()}.ics`}
                    download
                    title="Download all calendars as ICS"
                    className="action-link"
                  >
                    📥 ICS
                  </a>
                  <a 
                    href={createGoogleCalendarUrl(`tag-${ripper.name.toLowerCase()}.ics`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Add all calendars to Google Calendar"
                    className="action-link"
                  >
                    📅 Google
                  </a>
                </div>
              </div>
              
              {ripper.calendars.map((calendar, calIndex) => (
                <div
                  key={calIndex}
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
                    <a 
                      href={`${window.location.pathname.includes('/pr-') ? './' : '../output/'}${calendar.icsUrl}`}
                      download
                      title="Download ICS file"
                      className="action-link"
                    >
                      📥 ICS
                    </a>
                    <a 
                      href={createGoogleCalendarUrl(calendar.icsUrl)}
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
        {selectedCalendar ? (
          <div className="agenda-panel">
            <div className="agenda-header">
              <h1>{selectedCalendar.fullName}</h1>
              <p>Upcoming events</p>
            </div>
            
            {events.length > 0 ? (
              events.map(event => (
                <div key={event.id} className="event-item">
                  <div className="event-date">{formatDate(event.startDate)}</div>
                  <div className="event-title">
                    {event.title}
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
          <p>
            Powered by <a href="https://github.com/prestomation/icalendar-ripper" target="_blank" rel="noopener noreferrer">iCalendar Ripper</a>
          </p>
        </footer>
      </div>
    </div>
  )
}

export default App
