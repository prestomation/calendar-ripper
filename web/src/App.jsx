import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import DOMPurify from 'dompurify'
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

const TAG_CATEGORIES = {
  'Neighborhoods': ['Downtown', 'QueenAnne', 'CapitolHill'],
  'Activities': ['Music', 'Movies', 'Beer', 'Arts', 'Art', 'Dogs'],
  'Markets': ['FarmersMarket', 'MakersMarket'],
  'Community': ['Activism', 'Community', 'Volunteer'],
}

function formatTagLabel(tag) {
  return tag.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

const CONTAINS_HTML = /<[a-z][\s\S]*?>/i

function sanitizeHtml(text) {
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ADD_ATTR: ['target'],
  })
}

function EventDescription({ text }) {
  if (!text) return null
  if (CONTAINS_HTML.test(text)) {
    const clean = sanitizeHtml(text)
    return <div className="event-details" dangerouslySetInnerHTML={{ __html: clean }} />
  }
  return <div className="event-details">{text}</div>
}

function App() {
  const [calendars, setCalendars] = useState([])
  const [manifest, setManifest] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [selectedCalendar, setSelectedCalendar] = useState(null)
  const [showHomepage, setShowHomepage] = useState(true)
  const [showHappeningSoon, setShowHappeningSoon] = useState(false)
  const [events, setEvents] = useState([])
  const [eventsIndex, setEventsIndex] = useState([])
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(400)
  const [tagsHeight, setTagsHeight] = useState(150)
  const [footerMinimized, setFooterMinimized] = useState(false)
  // Mobile: 'list' shows sidebar, 'detail' shows events
  // Start on 'detail' so the homepage is visible on mobile
  const [mobileView, setMobileView] = useState('detail')
  const [tagsCollapsed, setTagsCollapsed] = useState(false)

  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'

  const sidebarRef = useRef(null)
  const resizeHandleRef = useRef(null)
  const verticalResizeHandleRef = useRef(null)
  const tagsRef = useRef(null)
  const calendarListRef = useRef(null)
  const agendaRef = useRef(null)
  const searchInputRef = useRef(null)
  
  // Keyboard shortcuts: "/" to focus search, Escape to clear
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement
        const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable
        if (!isInput) {
          e.preventDefault()
          searchInputRef.current?.focus()
        }
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current && searchTerm) {
        handleSearchChange('')
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchTerm])

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

  // URL state management — sync React state from URL hash
  const syncStateFromURL = useCallback(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    setSearchTerm(params.get('search') || '')
    setSelectedTag(params.get('tag') || '')
    const calendarId = params.get('calendar')
    const urlView = params.get('view')
    if (urlView === 'happening-soon') {
      setShowHappeningSoon(true)
      setShowHomepage(false)
      setSelectedCalendar(null)
      if (isMobile) setMobileView('detail')
    } else if (calendarId && calendars.length > 0) {
      const calendar = findCalendarById(calendarId)
      if (calendar) {
        setSelectedCalendar(calendar)
        setShowHomepage(false)
        setShowHappeningSoon(false)
      }
    } else if (!calendarId) {
      // No calendar in URL — reset to homepage
      setSelectedCalendar(null)
      setShowHomepage(true)
      setShowHappeningSoon(false)
    }
    // Sync mobile view from URL
    if (urlView === 'detail') {
      setMobileView('detail')
    } else if (urlView === 'happening-soon') {
      setMobileView('detail')
    } else if (params.toString() !== '') {
      // URL has tag/search/other params but no view=detail — show sidebar
      setMobileView('list')
    } else {
      // Empty URL — show homepage in detail view
      setMobileView('detail')
    }
  }, [calendars, isMobile])

  useEffect(() => {
    syncStateFromURL()
    // hashchange: handles direct hash edits / home button resets
    window.addEventListener('hashchange', syncStateFromURL)
    // popstate: handles Android back button / browser back
    window.addEventListener('popstate', syncStateFromURL)
    return () => {
      window.removeEventListener('hashchange', syncStateFromURL)
      window.removeEventListener('popstate', syncStateFromURL)
    }
  }, [syncStateFromURL])

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
          if (params.get('view') === 'detail') setMobileView('detail')
        }
      }
    }
  }, [calendars.length])

  const updateURL = (search, tag, calendar, view, { replace = false } = {}) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (tag) params.set('tag', tag)
    if (calendar) params.set('calendar', `${calendar.ripperName}-${calendar.name}`)
    if (view === 'detail') params.set('view', 'detail')
    if (view === 'happening-soon') params.set('view', 'happening-soon')
    const hash = params.toString()
    if (replace) {
      history.replaceState(null, '', hash ? '#' + hash : window.location.pathname)
    } else {
      window.location.hash = hash
    }
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

  const searchDebounceRef = useRef(null)
  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => clearTimeout(searchDebounceRef.current)
  }, [])
  const handleSearchChange = (value) => {
    setSearchTerm(value)
    // Debounce URL update
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      updateURL(value, selectedTag, selectedCalendar, undefined, { replace: true })
    }, 150)
  }

  const handleTagChange = (tag) => {
    setSelectedTag(tag)

    // When on the Happening Soon page, stay there — just filter events by tag.
    // Use replace to avoid hashchange re-triggering syncStateFromURL.
    if (showHappeningSoon) {
      updateURL(searchTerm, tag, null, 'happening-soon', { replace: true })
      return
    }

    // On mobile, just filter the list — don't auto-select a calendar.
    // On desktop/tablet where both panels are visible, auto-select
    // the first matching calendar so the right panel isn't empty.
    if (tag && !isMobile) {
      const filtered = calendars.filter(ripper =>
        ripper.calendars.some(calendar => calendar.tags.includes(tag))
      )

      if (filtered.length > 0) {
        const firstRipper = filtered[0]
        const firstCalendar = firstRipper.calendars.find(calendar =>
          calendar.tags.includes(tag)
        )

        if (firstCalendar) {
          const calendarWithRipper = { ...firstCalendar, ripperName: firstRipper.name }
          setSelectedCalendar(calendarWithRipper)
          setShowHomepage(false)
          updateURL(searchTerm, tag, calendarWithRipper)
          return
        }
      }
    }

    // Use replace so clearing the tag doesn't trigger hashchange → syncStateFromURL
    // which would reset to homepage when no calendar is selected.
    updateURL(searchTerm, tag, selectedCalendar, undefined, { replace: true })
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
    setShowHappeningSoon(false)
    if (isMobile) setMobileView('detail')
    updateURL(searchTerm, selectedTag, tagCalendar, isMobile ? 'detail' : undefined)
  }

  const handleCalendarSelect = (calendar, ripperName) => {
    const calendarWithRipper = { ...calendar, ripperName }
    setSelectedCalendar(calendarWithRipper)
    setShowHomepage(false)
    setShowHappeningSoon(false)
    if (isMobile) setMobileView('detail')
    updateURL(searchTerm, selectedTag, calendarWithRipper, isMobile ? 'detail' : undefined)
  }

  const handleHappeningSoon = () => {
    setShowHappeningSoon(true)
    setShowHomepage(false)
    setSelectedCalendar(null)
    if (isMobile) setMobileView('detail')
    updateURL(searchTerm, selectedTag, null, 'happening-soon')
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
      background: var(--text-primary);
      color: var(--bg-surface);
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

  const trackEvent = (action, icsUrl) => {
    if (window.goatcounter?.count) {
      window.goatcounter.count({
        path: `${action}/${icsUrl}`,
        event: true,
      })
    }
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
          friendlyName: ripper.friendlyName,
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
          description: null,
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

        // Load events index for full-text event search
        try {
          const eventsResponse = await fetch('./events-index.json')
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json()
            setEventsIndex(eventsData)
          }
        } catch (e) {
          console.warn('Events index not available, event search disabled')
        }
      } catch (error) {
        console.error('Failed to load calendars:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCalendars()
  }, [])

  // Fuzzy search setup — calendar names
  const fuse = useMemo(() => {
    const searchData = []
    calendars.forEach(ripper => {
      ripper.calendars.forEach(calendar => {
        searchData.push({
          ...calendar,
          ripperName: ripper.name,
          searchText: `${ripper.name} ${ripper.friendlyName || ''} ${ripper.description || ''} ${calendar.name} ${calendar.fullName} ${calendar.tags.join(' ')}`
        })
      })
    })

    return new Fuse(searchData, {
      keys: ['searchText'],
      threshold: 0.3
    })
  }, [calendars])

  // Fuzzy search setup — event content
  const eventFuse = useMemo(() => {
    if (!eventsIndex.length) return null
    return new Fuse(eventsIndex, {
      keys: ['summary', 'description', 'location'],
      threshold: 0.3
    })
  }, [eventsIndex])

  // Event matches grouped by calendar icsUrl (only computed when searching)
  const eventMatchesByCalendar = useMemo(() => {
    const map = new Map()
    if (!searchTerm || !eventFuse) return map
    eventFuse.search(searchTerm, { limit: 100 }).forEach(({ item }) => {
      if (!map.has(item.icsUrl)) map.set(item.icsUrl, [])
      map.get(item.icsUrl).push(item)
    })
    return map
  }, [searchTerm, eventFuse])

  // When searching, filter loaded events to only matching ones
  const filteredEvents = useMemo(() => {
    if (!searchTerm || !selectedCalendar) return events
    const term = searchTerm.toLowerCase()
    const matched = events.filter(event =>
      (event.title && event.title.toLowerCase().includes(term)) ||
      (event.description && event.description.toLowerCase().includes(term)) ||
      (event.location && event.location.toLowerCase().includes(term))
    )
    return matched
  }, [events, searchTerm, selectedCalendar])

  // Helper: look up a calendar's friendly name from its icsUrl
  const calendarNameByIcsUrl = useMemo(() => {
    const map = {}
    calendars.forEach(ripper => {
      ripper.calendars.forEach(cal => {
        map[cal.icsUrl] = ripper.friendlyName || cal.fullName
      })
    })
    return map
  }, [calendars])

  // Helper: count upcoming events per calendar from events-index
  const eventCountByIcsUrl = useMemo(() => {
    const counts = {}
    eventsIndex.forEach(event => {
      counts[event.icsUrl] = (counts[event.icsUrl] || 0) + 1
    })
    return counts
  }, [eventsIndex])

  // Helper: look up a calendar's tags from its icsUrl
  const calendarTagsByIcsUrl = useMemo(() => {
    const map = {}
    calendars.forEach(ripper => {
      ripper.calendars.forEach(cal => {
        map[cal.icsUrl] = cal.tags || []
      })
    })
    return map
  }, [calendars])

  // Happening Soon: group events from events-index into day buckets for the next 7 days
  const happeningSoonEvents = useMemo(() => {
    if (!eventsIndex.length) return []

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endDate = new Date(todayStart)
    endDate.setDate(endDate.getDate() + 7)

    // Parse and filter events to the next 7 days
    let upcoming = eventsIndex
      .map(event => {
        // js-joda toString() format: "2026-02-15T19:00-08:00[America/Los_Angeles]"
        // Extract the IANA timezone from brackets for display, then strip for Date parsing
        const tzMatch = event.date.match(/\[(.+)\]$/)
        const eventTimezone = tzMatch ? tzMatch[1] : undefined
        const dateStr = event.date.replace(/\[.*\]$/, '')
        const parsed = new Date(dateStr)
        if (isNaN(parsed.getTime())) return null
        return { ...event, parsedDate: parsed, eventTimezone }
      })
      .filter(event => event && event.parsedDate >= todayStart && event.parsedDate < endDate)

    // Apply tag filter
    if (selectedTag) {
      upcoming = upcoming.filter(event => {
        const tags = calendarTagsByIcsUrl[event.icsUrl] || []
        return tags.includes(selectedTag)
      })
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      upcoming = upcoming.filter(event =>
        (event.summary && event.summary.toLowerCase().includes(term)) ||
        (event.description && event.description.toLowerCase().includes(term)) ||
        (event.location && event.location.toLowerCase().includes(term))
      )
    }

    // Sort by date
    upcoming.sort((a, b) => a.parsedDate - b.parsedDate)

    // Group by day label
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const groups = []
    let currentLabel = null
    let currentGroup = null

    for (const event of upcoming) {
      // Use the event's timezone for day grouping so "Today" is correct
      // for the event's local date, not the viewer's timezone
      let eventDay
      if (event.eventTimezone) {
        try {
          const parts = event.parsedDate.toLocaleDateString('en-CA', { timeZone: event.eventTimezone }).split('-')
          eventDay = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        } catch {
          eventDay = new Date(event.parsedDate.getFullYear(), event.parsedDate.getMonth(), event.parsedDate.getDate())
        }
      } else {
        eventDay = new Date(event.parsedDate.getFullYear(), event.parsedDate.getMonth(), event.parsedDate.getDate())
      }
      const diffDays = Math.round((eventDay - todayStart) / (1000 * 60 * 60 * 24))

      let label
      if (diffDays === 0) label = 'Today'
      else if (diffDays === 1) label = 'Tomorrow'
      else label = dayNames[eventDay.getDay()]

      if (label !== currentLabel) {
        currentLabel = label
        const dateSubtitle = eventDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        currentGroup = { label, dateSubtitle, events: [] }
        groups.push(currentGroup)
      }
      if (currentGroup) {
        currentGroup.events.push(event)
      }
    }

    return groups
  }, [eventsIndex, selectedTag, searchTerm, calendarTagsByIcsUrl])

  // Filter calendars based on search and tag
  const filteredCalendars = useMemo(() => {
    let result = calendars

    if (searchTerm || selectedTag) {
      const matchingCalendars = new Set()

      if (searchTerm) {
        // Calendar name/tag matches
        fuse.search(searchTerm).forEach(item => {
          matchingCalendars.add(`${item.item.ripperName}-${item.item.name}`)
        })

        // Event content matches — surface calendars containing matching events
        for (const icsUrl of eventMatchesByCalendar.keys()) {
          calendars.forEach(ripper => {
            ripper.calendars.forEach(calendar => {
              if (calendar.icsUrl === icsUrl) {
                matchingCalendars.add(`${ripper.name}-${calendar.name}`)
              }
            })
          })
        }
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
  }, [calendars, searchTerm, selectedTag, fuse, eventMatchesByCalendar])

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

  const groupedTags = useMemo(() => {
    const tagSet = new Set(allTags)
    const groups = []
    for (const [category, categoryTags] of Object.entries(TAG_CATEGORIES)) {
      const matching = categoryTags.filter(t => tagSet.has(t))
      if (matching.length > 0) {
        groups.push({ category, tags: matching })
        matching.forEach(t => tagSet.delete(t))
      }
    }
    if (tagSet.size > 0) {
      groups.push({ category: 'Other', tags: Array.from(tagSet).sort() })
    }
    return groups
  }, [allTags])

  const tagCounts = useMemo(() => {
    const counts = {}
    calendars.forEach(ripper => {
      ripper.calendars.forEach(calendar => {
        calendar.tags.forEach(tag => {
          counts[tag] = (counts[tag] || 0) + 1
        })
      })
    })
    return counts
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

  const formatDateRange = (startDate, endDate) => {
    const start = formatDate(startDate)
    if (!endDate) return start

    const sameDay = startDate.toDateString() === endDate.toDateString()
    if (sameDay) {
      const endTime = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      return `${start} – ${endTime}`
    }

    return `${start} – ${formatDate(endDate)}`
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
              setShowHappeningSoon(false)
              setMobileView(isMobile ? 'detail' : 'list')
              window.location.hash = ''
            }}
            title="Home"
          >
            🏠
          </button>
          <button
            className={`happening-soon-button ${showHappeningSoon ? 'active' : ''}`}
            onClick={handleHappeningSoon}
            title="See what's happening in the next 7 days"
          >
            Happening Soon
          </button>
          <div className="search-bar">
            <div className="search-input-wrapper">
              <svg className="search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder='Search calendars and events... (press "/" to focus)'
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchTerm && (
                <button
                  className="search-clear-btn"
                  onClick={() => handleSearchChange('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div
          className={`tags ${tagsCollapsed ? 'tags--collapsed' : ''}`}
          ref={tagsRef}
          style={!isMobile && !isTablet && !tagsCollapsed ? { maxHeight: `${tagsHeight}px` } : undefined}
        >
          <div
            className="tags-header"
            onClick={() => setTagsCollapsed(!tagsCollapsed)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTagsCollapsed(!tagsCollapsed) } }}
            aria-expanded={!tagsCollapsed}
          >
            <span className="tags-header-label">Tags</span>
            <div className="tags-header-right">
              {selectedTag && (
                <button
                  className="tags-clear-btn"
                  onClick={(e) => { e.stopPropagation(); handleTagChange('') }}
                  title="Clear tag filter"
                  aria-label={`Clear ${formatTagLabel(selectedTag)} filter`}
                >
                  {formatTagLabel(selectedTag)} ×
                </button>
              )}
              <span className="tags-collapse-icon" aria-hidden="true">{tagsCollapsed ? '▶' : '▼'}</span>
            </div>
          </div>
          {!tagsCollapsed && (
            <>
              <div className={`tags-body ${isMobile ? 'tags-body--mobile' : ''}`}>
                <div
                  className={`tag ${selectedTag === '' ? 'active' : ''}`}
                  onClick={() => handleTagChange('')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTagChange('') } }}
                >
                  All
                </div>
                {isMobile ? (
                  allTags.map(tag => (
                    <div
                      key={tag}
                      className={`tag ${selectedTag === tag ? 'active' : ''}`}
                      onClick={() => handleTagChange(tag)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTagChange(tag) } }}
                    >
                      {selectedTag === tag && <span className="tag-check" aria-hidden="true">✓ </span>}
                      <span>{formatTagLabel(tag)}</span>
                      <span className="tag-count">{tagCounts[tag] || 0}</span>
                    </div>
                  ))
                ) : (
                  groupedTags.map(group => (
                    <div key={group.category} className="tag-category">
                      <div className="tag-category-label">{group.category}</div>
                      {group.tags.map(tag => (
                        <div
                          key={tag}
                          className={`tag ${selectedTag === tag ? 'active' : ''}`}
                          onClick={() => handleTagChange(tag)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTagChange(tag) } }}
                          title={`${formatTagLabel(tag)} — ${tagCounts[tag] || 0} calendar${(tagCounts[tag] || 0) !== 1 ? 's' : ''}`}
                        >
                          {selectedTag === tag && <span className="tag-check" aria-hidden="true">✓ </span>}
                          <span>{formatTagLabel(tag)}</span>
                          <span className="tag-count">{tagCounts[tag] || 0}</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
              {!isMobile && !isTablet && (
                <div
                  className="resize-handle-vertical"
                  ref={verticalResizeHandleRef}
                  onMouseDown={handleVerticalMouseDown}
                />
              )}
            </>
          )}
        </div>
        
        <div className="calendar-list" ref={calendarListRef}>
          {(searchTerm || selectedTag) && filteredCalendars.length > 0 && (
            <div className="search-result-count">
              {(() => {
                const total = filteredCalendars.reduce((sum, r) => sum + r.calendars.length, 0)
                const parts = []
                parts.push(`${total} calendar${total !== 1 ? 's' : ''}`)
                if (searchTerm) parts.push(`matching "${searchTerm}"`)
                if (selectedTag) parts.push(`in ${formatTagLabel(selectedTag)}`)
                return parts.join(' ')
              })()}
            </div>
          )}
          {selectedTag && (
            <div className="tag-header">
              <div 
                className="tag-header-content clickable"
                onClick={() => handleTagSelect(selectedTag)}
                title="Click to view tag calendar events"
              >
                <div className="tag-title">Tag: {formatTagLabel(selectedTag)}</div>
                <div className="tag-actions">
                  <div className="ics-group">
                    <a
                      href={createWebcalUrl(`tag-${selectedTag.toLowerCase()}.ics`)}
                      title="Subscribe to tag calendar"
                      className="action-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        trackEvent('webcal', `tag-${selectedTag.toLowerCase()}.ics`)
                      }}
                    >
                      📥 ICS
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const webcalUrl = createWebcalUrl(`tag-${selectedTag.toLowerCase()}.ics`)
                        copyToClipboard(webcalUrl, e.target)
                        trackEvent('copy-link', `tag-${selectedTag.toLowerCase()}.ics`)
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
                    onClick={(e) => {
                      e.stopPropagation()
                      trackEvent('google-calendar', `tag-${selectedTag.toLowerCase()}.ics`)
                    }}
                  >
                    📅 Google
                  </a>
                </div>
              </div>
            </div>
          )}
          
          {filteredCalendars.map((ripper) => {
            const isSingleCalendar = ripper.calendars.length === 1
            const singleCal = isSingleCalendar ? ripper.calendars[0] : null

            return (
            <div key={ripper.name} className={`ripper-group ${isSingleCalendar ? 'ripper-group--single' : ''}`}>
              {isSingleCalendar ? (
                /* Single calendar: merged compact view */
                <div
                  className={`calendar-item calendar-item--solo ${selectedCalendar?.name === singleCal.name && selectedCalendar?.ripperName === ripper.name ? 'selected' : ''}`}
                >
                  <div
                    onClick={() => handleCalendarSelect(singleCal, ripper.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="calendar-title">
                      {ripper.friendlyName || singleCal.fullName}
                      {singleCal.isExternal && (
                        <span className="external-indicator" title="External calendar from original organization"> 🔗</span>
                      )}
                      {singleCal.isRecurring && (
                        <span className="recurring-indicator" title="Recurring event"> 🔄</span>
                      )}
                      {ripper.friendlyLink && (
                        <a
                          href={ripper.friendlyLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ripper-link-icon"
                          title="Visit organization website"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🌐
                        </a>
                      )}
                      {eventCountByIcsUrl[singleCal.icsUrl] > 0 && (
                        <span className="calendar-event-count" title={`${eventCountByIcsUrl[singleCal.icsUrl]} upcoming event${eventCountByIcsUrl[singleCal.icsUrl] !== 1 ? 's' : ''}`}>
                          {eventCountByIcsUrl[singleCal.icsUrl]}
                        </span>
                      )}
                    </div>
                    {ripper.description && ripper.description !== (ripper.friendlyName || singleCal.fullName) && (
                      <div className="calendar-subtitle">{ripper.description}</div>
                    )}
                    <div className="calendar-tags">
                      {singleCal.tags.map(tag => (
                        <span
                          key={tag}
                          className="clickable-tag"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTagChange(tag)
                          }}
                        >
                          {formatTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                    {searchTerm && eventMatchesByCalendar.get(singleCal.icsUrl)?.length > 0 && (
                      <div className="event-match-hint">
                        {eventMatchesByCalendar.get(singleCal.icsUrl).length} matching event{eventMatchesByCalendar.get(singleCal.icsUrl).length !== 1 ? 's' : ''}
                        <span className="event-match-preview">
                          {' — '}
                          {eventMatchesByCalendar.get(singleCal.icsUrl).slice(0, 3).map(e => e.summary).join(', ')}
                          {eventMatchesByCalendar.get(singleCal.icsUrl).length > 3 && ', ...'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="calendar-actions">
                    <div className="ics-group">
                      <a
                        href={createWebcalUrl(singleCal.icsUrl, singleCal.originalIcsUrl)}
                        title="Subscribe to calendar"
                        className="action-link"
                        onClick={() => trackEvent('webcal', singleCal.icsUrl)}
                      >
                        📥 ICS
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const webcalUrl = createWebcalUrl(singleCal.icsUrl, singleCal.originalIcsUrl)
                          copyToClipboard(webcalUrl, e.target)
                          trackEvent('copy-link', singleCal.icsUrl)
                        }}
                        title="Copy ICS link"
                        className="clipboard-btn"
                      >
                        🔗
                      </button>
                    </div>
                    <a
                      href={createGoogleCalendarUrl(singleCal.icsUrl, singleCal.originalIcsUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Add to Google Calendar"
                      className="action-link"
                      onClick={() => trackEvent('google-calendar', singleCal.icsUrl)}
                    >
                      📅 Google
                    </a>
                  </div>
                </div>
              ) : (
                /* Multiple calendars: full ripper header + calendar items */
                <>
              <div className="ripper-header">
                <div className="ripper-title-container">
                  <div className="ripper-title">
                    {ripper.friendlyName || ripper.description}
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
                  {ripper.friendlyName && ripper.description && ripper.description !== ripper.friendlyName && (
                    <div className="calendar-subtitle">{ripper.description}</div>
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
                          onClick={() => trackEvent('webcal', ripper.calendars[0].icsUrl)}
                        >
                          📥 ICS
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const webcalUrl = createWebcalUrl(ripper.calendars[0].icsUrl, ripper.calendars[0].originalIcsUrl)
                            copyToClipboard(webcalUrl, e.target)
                            trackEvent('copy-link', ripper.calendars[0].icsUrl)
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
                        onClick={() => trackEvent('google-calendar', ripper.calendars[0].icsUrl)}
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
                          onClick={() => trackEvent('webcal', `tag-${ripper.name.toLowerCase()}.ics`)}
                        >
                          📥 ICS
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const webcalUrl = createWebcalUrl(`tag-${ripper.name.toLowerCase()}.ics`)
                            copyToClipboard(webcalUrl, e.target)
                            trackEvent('copy-link', `tag-${ripper.name.toLowerCase()}.ics`)
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
                        onClick={() => trackEvent('google-calendar', `tag-${ripper.name.toLowerCase()}.ics`)}
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
                    <div className="calendar-title">
                      {calendar.fullName}
                      {eventCountByIcsUrl[calendar.icsUrl] > 0 && (
                        <span className="calendar-event-count" title={`${eventCountByIcsUrl[calendar.icsUrl]} upcoming event${eventCountByIcsUrl[calendar.icsUrl] !== 1 ? 's' : ''}`}>
                          {eventCountByIcsUrl[calendar.icsUrl]}
                        </span>
                      )}
                    </div>
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
                          {formatTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                    {searchTerm && eventMatchesByCalendar.get(calendar.icsUrl)?.length > 0 && (
                      <div className="event-match-hint">
                        {eventMatchesByCalendar.get(calendar.icsUrl).length} matching event{eventMatchesByCalendar.get(calendar.icsUrl).length !== 1 ? 's' : ''}
                        <span className="event-match-preview">
                          {' — '}
                          {eventMatchesByCalendar.get(calendar.icsUrl).slice(0, 3).map(e => e.summary).join(', ')}
                          {eventMatchesByCalendar.get(calendar.icsUrl).length > 3 && ', ...'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="calendar-actions">
                    <div className="ics-group">
                      <a
                        href={createWebcalUrl(calendar.icsUrl, calendar.originalIcsUrl)}
                        title="Subscribe to calendar"
                        className="action-link"
                        onClick={() => trackEvent('webcal', calendar.icsUrl)}
                      >
                        📥 ICS
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const webcalUrl = createWebcalUrl(calendar.icsUrl, calendar.originalIcsUrl)
                          copyToClipboard(webcalUrl, e.target)
                          trackEvent('copy-link', calendar.icsUrl)
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
                      onClick={() => trackEvent('google-calendar', calendar.icsUrl)}
                    >
                      📅 Google
                    </a>
                  </div>
                </div>
              ))}
                </>
              )}
            </div>
            )
          })}
          {filteredCalendars.length === 0 && (
            <div className="empty-state">
              <span>No calendars found</span>
              <span className="empty-state-hint">
                {searchTerm && selectedTag
                  ? <>Try removing the tag filter or <button className="link-button" onClick={() => handleSearchChange('')}>clearing your search</button></>
                  : searchTerm
                  ? <>Try a different search term or <button className="link-button" onClick={() => handleSearchChange('')}>clear search</button></>
                  : selectedTag
                  ? <>No calendars with this tag. <button className="link-button" onClick={() => handleTagChange('')}>Show all</button></>
                  : 'Try browsing by tag or searching for a topic'}
              </span>
            </div>
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
            <button className="mobile-back-btn" onClick={() => {
              if (showHappeningSoon || (!showHomepage && selectedCalendar)) {
                // Going back from detail/happening-soon to the list
                setSelectedCalendar(null)
                setShowHomepage(true)
                setShowHappeningSoon(false)
                setMobileView('list')
                const params = new URLSearchParams()
                if (searchTerm) params.set('search', searchTerm)
                if (selectedTag) params.set('tag', selectedTag)
                const hash = params.toString()
                history.replaceState(null, '', hash ? '#' + hash : window.location.pathname)
              } else {
                setMobileView('list')
              }
            }}>
              {showHomepage ? '← Browse Calendars' : '← Calendars'}
            </button>
          </div>
        )}
        {showHappeningSoon ? (
          <div className="agenda-panel" ref={agendaRef}>
            <div className="agenda-header">
              <div className="agenda-title-container">
                <h1>Happening Soon</h1>
              </div>
              <p>
                {(() => {
                  const totalEvents = happeningSoonEvents.reduce((sum, g) => sum + g.events.length, 0)
                  const parts = []
                  if (totalEvents > 0) parts.push(`${totalEvents} event${totalEvents !== 1 ? 's' : ''}`)
                  else parts.push('Events')
                  parts.push('across all calendars in the next 7 days')
                  if (selectedTag) parts.push(`tagged "${formatTagLabel(selectedTag)}"`)
                  return parts.join(' ')
                })()}
              </p>
            </div>

            {isMobile && (
              <div className="agenda-tags">
                <div
                  className={`tag ${selectedTag === '' ? 'active' : ''}`}
                  onClick={() => handleTagChange('')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTagChange('') } }}
                >
                  All
                </div>
                {allTags.map(tag => (
                  <div
                    key={tag}
                    className={`tag ${selectedTag === tag ? 'active' : ''}`}
                    onClick={() => handleTagChange(tag)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTagChange(tag) } }}
                  >
                    {selectedTag === tag && <span className="tag-check" aria-hidden="true">✓ </span>}
                    {formatTagLabel(tag)}
                  </div>
                ))}
              </div>
            )}

            {searchTerm && (
              <div className="search-filter-banner">
                Showing events matching "{searchTerm}"
                {selectedTag && ` in ${formatTagLabel(selectedTag)}`}
                <button className="link-button" onClick={() => handleSearchChange('')}>Clear search</button>
              </div>
            )}

            {happeningSoonEvents.length > 0 ? (
              happeningSoonEvents.map(group => (
                <div key={group.label} className="day-group">
                  <div className="day-group-header">
                    <span className="day-group-label">{group.label}</span>
                    <span className="day-group-date">{group.dateSubtitle}</span>
                  </div>
                  {group.events.map((event, idx) => (
                    <div key={`${event.icsUrl}-${event.summary}-${idx}`} className="event-item">
                      <div className="event-date">
                        {(() => {
                          try {
                            return event.parsedDate.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              ...(event.eventTimezone ? { timeZone: event.eventTimezone } : {})
                            })
                          } catch {
                            return event.parsedDate.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          }
                        })()}
                      </div>
                      <div className="event-title">
                        {event.summary}
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
                        <span
                          className="event-source clickable"
                          title={`From ${calendarNameByIcsUrl[event.icsUrl] || event.icsUrl}`}
                          onClick={() => {
                            // Find and select the source calendar
                            for (const ripper of calendars) {
                              const cal = ripper.calendars.find(c => c.icsUrl === event.icsUrl)
                              if (cal) {
                                handleCalendarSelect(cal, ripper.name)
                                return
                              }
                            }
                          }}
                        >
                          {calendarNameByIcsUrl[event.icsUrl] || event.icsUrl.replace('.ics', '')}
                        </span>
                      </div>
                      <EventDescription text={event.description} />
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
                  ))}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <span>No upcoming events in the next 7 days</span>
                {(selectedTag || searchTerm) && (
                  <span className="empty-state-hint">
                    Try {selectedTag && <><button className="link-button" onClick={() => handleTagChange('')}>clearing the tag filter</button></>}
                    {selectedTag && searchTerm && ' or '}
                    {searchTerm && <><button className="link-button" onClick={() => handleSearchChange('')}>clearing your search</button></>}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : showHomepage ? (
          <div className="homepage">
            <h1>Yet Another Seattle Calendar</h1>
            <p>Welcome to YASC! This tool aggregates events from various websites and presents them as searchable, filterable calendars. You're welcome to use this interface, but it's really meant for you to add the ICS to your favorite calendar app so you can aggregate events in your calendar however you like</p>

            {isMobile && (
              <button
                className="explore-btn"
                onClick={() => setMobileView('list')}
              >
                Explore Calendars
              </button>
            )}

            <h2>How to Use</h2>
            <ul>
              <li><strong>Browse:</strong> Select any calendar from the sidebar to view upcoming events</li>
              <li><strong>Search:</strong> Use the search bar to find calendars by name, or search across all event titles, descriptions, and locations</li>
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

            {isMobile ? (
              <button
                className="explore-btn"
                onClick={() => setMobileView('list')}
              >
                Explore Calendars
              </button>
            ) : (
              <p>Select a calendar from the sidebar to get started!</p>
            )}
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
              {(() => {
                const ripper = calendars.find(r => r.name === selectedCalendar.ripperName)
                const description = ripper?.description
                if (description && description !== selectedCalendar.fullName && description !== ripper?.friendlyName) {
                  return <p className="agenda-description">{description}</p>
                }
                return null
              })()}
              <p>Upcoming events{events.length > 0 && !eventsLoading ? ` (${searchTerm ? filteredEvents.length : events.length})` : ''}</p>
            </div>

            {searchTerm && (
              <div className="detail-search-bar">
                <div className="search-input-wrapper">
                  <svg className="search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search events..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                  <button
                    className="search-clear-btn"
                    onClick={() => handleSearchChange('')}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

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
              <>
                {searchTerm && (
                  <div className="search-filter-banner">
                    {filteredEvents.length > 0
                      ? `Showing ${filteredEvents.length} of ${events.length} events matching "${searchTerm}"`
                      : `No events matching "${searchTerm}"`}
                    <button className="link-button" onClick={() => handleSearchChange('')}>Show all events</button>
                  </div>
                )}
                {(() => {
                  const displayEvents = searchTerm ? filteredEvents : events
                  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                  const now = new Date()
                  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  let lastDateLabel = null

                  return displayEvents.map(event => {
                    const eventDay = new Date(event.startDate.getFullYear(), event.startDate.getMonth(), event.startDate.getDate())
                    const diffDays = Math.round((eventDay - todayStart) / (1000 * 60 * 60 * 24))
                    let dateLabel
                    if (diffDays === 0) dateLabel = 'Today'
                    else if (diffDays === 1) dateLabel = 'Tomorrow'
                    else if (diffDays > 1 && diffDays < 7) dateLabel = dayNames[eventDay.getDay()]
                    else dateLabel = eventDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

                    const showHeader = dateLabel !== lastDateLabel
                    lastDateLabel = dateLabel
                    const dateSubtitle = eventDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                    return (
                      <div key={event.id}>
                        {showHeader && (
                          <div className="day-group-header">
                            <span className="day-group-label">{dateLabel}</span>
                            {diffDays < 7 && <span className="day-group-date">{dateSubtitle}</span>}
                          </div>
                        )}
                        <div className="event-item">
                          <div className="event-date">{formatDateRange(event.startDate, event.endDate)}</div>
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
                          <EventDescription text={event.description} />
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
                      </div>
                    )
                  })
                })()}
              </>
            ) : (
              <div className="empty-state">No upcoming events</div>
            )}
          </div>
        ) : (
          <div className="empty-state">Select a calendar to view events</div>
        )}
        <footer className={`footer ${footerMinimized ? 'footer--minimized' : ''}`}>
          <button
            className="footer-toggle"
            onClick={() => setFooterMinimized(!footerMinimized)}
            title={footerMinimized ? 'Show disclaimer' : 'Hide disclaimer'}
          >
            {footerMinimized ? '▲' : '▼'}
          </button>
          <div className="footer-content">
            <p className="footer-warning">
              ⚠️ No guarantee these calendars are accurate to their sources as they are scraped automatically.
              <a href="https://github.com/prestomation/calendar-ripper" target="_blank" rel="noopener noreferrer">
               Open an issue or pull request to add a new calendar to this page. </a>
            </p>
            <p style={{ fontSize: '12px' }}>
              Powered by <a href="https://github.com/prestomation/calendar-ripper" target="_blank" rel="noopener noreferrer">iCalendar Ripper</a>
              {manifest && (
                <span> • Last generated at {new Date(manifest.lastUpdated).toLocaleString()}</span>
              )}
            </p>
          </div>
        </footer>
      </div>
      )}
    </div>
  )
}

export default App
