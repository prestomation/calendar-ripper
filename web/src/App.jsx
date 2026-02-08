import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Fuse from 'fuse.js'
import ICAL from 'ical.js'

// Mobile: single-view nav. Tablet: compact sidebar. Desktop: full sidebar.
const BREAKPOINT_MOBILE = 768
const BREAKPOINT_TABLET = 1024

function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  if (width < BREAKPOINT_MOBILE) return 'mobile'
  if (width < BREAKPOINT_TABLET) return 'tablet'
  return 'desktop'
}

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
  const [sidebarWidth, setSidebarWidth] = useState(400)
  const [tagsHeight, setTagsHeight] = useState(150)
  // Mobile: 'list' shows sidebar, 'detail' shows events
  const [mobileView, setMobileView] = useState('list')

  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'

  const sidebarRef = useRef(null)
  const resizeHandleRef = useRef(null)
  const verticalResizeHandleRef = useRef(null)
  const tagsRef = useRef(null)
  const calendarListRef = useRef(null)
  const agendaRef = useRef(null)
  
  // Resize functionality
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    
    const handleMouseMove = (e) => {
      const newWidth = Math.max(250, Math.min(600, startWidth + e.clientX - startX))
      setSidebarWidth(newWidth)
    }
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (resizeHandleRef.current) {
        resizeHandleRef.current.classList.remove('dragging')
      }
    }
    
    if (resizeHandleRef.current) {
      resizeHandleRef.current.classList.add('dragging')
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [sidebarWidth])
  
  // Vertical resize functionality
  const handleVerticalMouseDown = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = tagsHeight
    
    const handleMouseMove = (e) => {
      const newHeight = Math.max(80, Math.min(300, startHeight + e.clientY - startY))
      setTagsHeight(newHeight)
    }
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (verticalResizeHandleRef.current) {
        verticalResizeHandleRef.current.classList.remove('dragging')
      }
    }
    
    if (verticalResizeHandleRef.current) {
      verticalResizeHandleRef.current.classList.add('dragging')
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [tagsHeight])
  
  // Scroll fade indicators
  const updateScrollFade = useCallback((element, container) => {
    if (!element || !container) return
    
    const { scrollTop, scrollHeight, clientHeight } = element
    const canScrollUp = scrollTop > 0
    const canScrollDown = scrollTop < scrollHeight - clientHeight - 1
    
    let topFade = container.querySelector('.scroll-fade-top')
    let bottomFade = container.querySelector('.scroll-fade-bottom')
    
    if (!topFade) {
      topFade = document.createElement('div')
      topFade.className = 'scroll-fade-top'
      container.appendChild(topFade)
    }
    
    if (!bottomFade) {
      bottomFade = document.createElement('div')
      bottomFade.className = 'scroll-fade-bottom'
      container.appendChild(bottomFade)
    }
    
    topFade.style.opacity = canScrollUp ? '1' : '0'
    bottomFade.style.opacity = canScrollDown ? '1' : '0'
  }, [])
  
  // Set up scroll listeners
  useEffect(() => {
    const setupScrollListener = (ref) => {
      const element = ref.current
      if (!element) return
      
      const handleScroll = () => updateScrollFade(element, element)
      
      element.addEventListener('scroll', handleScroll)
      // Initial check
      setTimeout(() => handleScroll(), 100)
      
      return () => element.removeEventListener('scroll', handleScroll)
    }
    
    const cleanupTags = setupScrollListener(tagsRef)
    const cleanupCalendarList = setupScrollListener(calendarListRef)
    const cleanupAgenda = setupScrollListener(agendaRef)
    
    return () => {
      cleanupTags?.()
      cleanupCalendarList?.()
      cleanupAgenda?.()
    }
  }, [updateScrollFade, calendars, events])

  // URL state management
  useEffect(() => {
    const updateFromURL = () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      setSearchTerm(params.get('search') || '')
      setSelectedTag(params.get('tag') || '')
      const calendarId = params.get('calendar')
      if (calendarId && calendars.length > 0) {
        const calendar = findCalendarById(calendarId)
        if (calendar) {
          setSelectedCalendar(calendar)
          setShowHomepage(false)
        }
      }
    }
    
    updateFromURL()
    window.addEventListener('hashchange', updateFromURL)
    return () => window.removeEventListener('hashchange', updateFromURL)
  }, [calendars])

  // Handle deeplinking when calendars first load
  useEffect(() => {
    if (calendars.length > 0) {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const calendarId = params.get('calendar')
      if (calendarId) {
        const calendar = findCalendarById(calendarId)
        if (calendar) {
          setSelectedCalendar(calendar)
          setShowHomepage(false)
        }
      }
    }
  }, [calendars.length])

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
          if (isMobile) setMobileView('detail')
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
    if (isMobile) setMobileView('detail')
    updateURL(searchTerm, selectedTag, tagCalendar)
  }

  const handleCalendarSelect = (calendar, ripperName) => {
    const calendarWithRipper = { ...calendar, ripperName }
    setSelectedCalendar(calendarWithRipper)
    setShowHomepage(false)
    if (isMobile) setMobileView('detail')
    updateURL(searchTerm, selectedTag, calendarWithRipper)
  }

  const handleMobileBack = () => {
    setMobileView('list')
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

  const parseRRuleDescription = (rrule) => {
    if (!rrule) return null
    
    try {
      const parts = rrule.split(';')
      let freq = null
      let byday = null
      let bymonth = null
      
      parts.forEach(part => {
        const [key, value] = part.split('=')
        if (key === 'FREQ') freq = value
        if (key === 'BYDAY') byday = value
        if (key === 'BYMONTH') bymonth = value
      })
      
      if (freq === 'MONTHLY' && byday) {
        const match = byday.match(/^(\d+)([A-Z]{2})$/)
        if (match) {
          const ordinal = match[1]
          const day = match[2]
          
          const ordinalMap = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th' }
          const dayMap = { 'MO': 'Monday', 'TU': 'Tuesday', 'WE': 'Wednesday', 'TH': 'Thursday', 'FR': 'Friday', 'SA': 'Saturday', 'SU': 'Sunday' }
          
          let description = `${ordinalMap[ordinal]} ${dayMap[day]} of each month`
          
          if (bymonth) {
            const months = bymonth.split(',').map(m => {
              const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
              return monthNames[parseInt(m)]
            })
            description += ` (${months.join(', ')} only)`
          }
          
          return description
        }
      }
      
      return `Recurring: ${rrule}`
    } catch (e) {
      return 'Recurring event'
    }
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
        const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()) // 6 months ahead
        
        const eventList = []
        
        vevents.forEach(vevent => {
          const event = new ICAL.Event(vevent)
          const description = event.description || ''
          
          // Extract calendar name from description for tag aggregates
          let calendarName = null
          const fromMatch = description.match(/From (.+?)$/m)
          if (fromMatch) {
            calendarName = fromMatch[1]
          }
          
          // Check if this is a recurring event by looking for RRULE
          const rrule = vevent.getFirstProperty('rrule')
          const hasRRule = !!rrule
          
          if (hasRRule) {
            // Handle recurring event
            const expand = new ICAL.RecurExpansion({
              component: vevent,
              dtstart: vevent.getFirstPropertyValue('dtstart')
            })
            
            // Get the RRULE string for description
            const rruleString = rrule.toICALString()
            
            let next
            let instanceCount = 0
            const maxInstances = 100 // Prevent infinite loops
            
            while (instanceCount < maxInstances && (next = expand.next())) {
              const startDate = next.toJSDate()
              
              // Only include events from today onwards and within 6 months
              if (startDate >= today && startDate <= sixMonthsFromNow) {
                // Calculate end date for this instance
                const duration = event.endDate ? 
                  event.endDate.toUnixTime() - event.startDate.toUnixTime() : 
                  3600 // Default 1 hour if no end time
                
                const endDate = new Date(startDate.getTime() + (duration * 1000))
                
                eventList.push({
                  id: `${event.uid}-${startDate.getTime()}`, // Unique ID for each instance
                  title: event.summary,
                  description: event.description,
                  location: event.location,
                  url: vevent.getFirstPropertyValue('url'),
                  startDate: startDate,
                  endDate: endDate,
                  calendarName: calendarName,
                  isRecurring: true,
                  rrule: rruleString
                })
              }
              
              instanceCount++
              
              // Stop if we're past our date range
              if (startDate > sixMonthsFromNow) {
                break
              }
            }
          } else {
            // Handle single event
            const startDate = event.startDate.toJSDate()
            
            if (startDate >= today) {
              eventList.push({
                id: event.uid,
                title: event.summary,
                description: event.description,
                location: event.location,
                url: vevent.getFirstPropertyValue('url'),
                startDate: startDate,
                endDate: event.endDate?.toJSDate(),
                calendarName: calendarName,
                isRecurring: false
              })
            }
          }
        })
        
        // Sort all events by start date
        eventList.sort((a, b) => a.startDate - b.startDate)
        
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
    <div className={`app ${isMobile ? 'app--mobile' : ''} ${isTablet ? 'app--tablet' : ''}`}>
      {/* On mobile, only show sidebar when in 'list' view */}
      {(!isMobile || mobileView === 'list') && (
      <div
        className="sidebar"
        ref={sidebarRef}
        style={!isMobile && !isTablet ? { width: `${sidebarWidth}px` } : undefined}
      >
        <div className="header-bar">
          <button
            className="home-button"
            onClick={() => {
              setSelectedCalendar(null)
              setShowHomepage(true)
              setMobileView('list')
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
        
        <div 
          className="tags"
          ref={tagsRef}
          style={!isMobile && !isTablet ? { maxHeight: `${tagsHeight}px` } : undefined}
        >
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
          {!isMobile && !isTablet && (
            <div
              className="resize-handle-vertical"
              ref={verticalResizeHandleRef}
              onMouseDown={handleVerticalMouseDown}
            />
          )}
        </div>
        
        <div className="calendar-list" ref={calendarListRef}>
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
        
        {/* Hide resize handles on mobile and tablet */}
        {!isMobile && !isTablet && (
          <div
            className="resize-handle"
            ref={resizeHandleRef}
            onMouseDown={handleMouseDown}
          />
        )}
      </div>
      )}

      {/* On mobile, only show main content when in 'detail' view */}
      {(!isMobile || mobileView === 'detail') && (
      <div className="main-content">
        {isMobile && mobileView === 'detail' && (
          <div className="mobile-back-bar">
            <button className="mobile-back-btn" onClick={handleMobileBack}>
              ← Calendars
            </button>
          </div>
        )}
        {showHomepage ? (
          <div className="homepage">
            <h1>Yet Another Seattle Calendar</h1>
            <p>Welcome to YASC! This tool aggregates events from various websites and presents them as searchable, filterable calendars. You're welcome to use this interface, but it's really meant for you to add the ICS to your favorite calendar app so you can aggregate events in your calendar however you like</p>
            
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
          <div className="agenda-panel" ref={agendaRef}>
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
                    {event.isRecurring && (
                      <span 
                        className="recurring-indicator" 
                        title={parseRRuleDescription(event.rrule) || "Recurring event"}
                      >
                        🔄
                      </span>
                    )}
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
            ⚠️ No guarantee these calendars are accurate to their sources as they are scraped automatically.
            <a href="https://github.com/prestomation/icalendar-ripper" target="_blank" rel="noopener noreferrer">
             Open an issue or pull request to add a new calendar to this page. </a>
          </p>
          <p style={{ fontSize: '12px' }}>
            Powered by <a href="https://github.com/prestomation/icalendar-ripper" target="_blank" rel="noopener noreferrer">iCalendar Ripper</a>
            {manifest && (
              <span> • Last generated at {new Date(manifest.lastUpdated).toLocaleString()}</span>
            )}
          </p>
        </footer>
      </div>
      )}
    </div>
  )
}

export default App
