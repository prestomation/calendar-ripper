import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import DOMPurify from 'dompurify'
import Fuse from 'fuse.js'
import { TAG_CATEGORIES } from '../../lib/config/tags.ts'
import { GeoFiltersSection } from './GeoFiltersSection.jsx'
import { EventsMap } from './EventsMap.jsx'
import { haversineKm } from './lib/haversine.js'
import { deduplicateEvents } from './lib/event-dedup.js'
import { eventKey } from './lib/eventKey.js'
import { AttributionChips } from './AttributionChips.jsx'

const FUSE_THRESHOLD = 0.1
import ICAL from 'ical.js'

// Mobile: single-view nav. Tablet: compact sidebar. Desktop: full sidebar.
const BREAKPOINT_MOBILE = 768

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
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

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
}

function formatICSDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function generateICS({ title, startDate, endDate, description, location, url }) {
  const start = formatICSDate(startDate)
  const end = formatICSDate(endDate || new Date(startDate.getTime() + 3600000))
  const plainDesc = stripHtml(description)
  const fullDesc = [plainDesc, url].filter(Boolean).join('\n\n')
  // Fold long lines per RFC 5545 (max 75 octets per line)
  const foldLine = (key, value) => {
    if (!value) return ''
    const line = `${key}:${value.replace(/\r?\n/g, '\\n')}`
    const folded = []
    for (let i = 0; i < line.length; i += 73) {
      folded.push((i > 0 ? ' ' : '') + line.slice(i, i + 73))
    }
    return folded.join('\r\n')
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//206.events//EN',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    foldLine('SUMMARY', title),
    foldLine('DESCRIPTION', fullDesc),
    foldLine('LOCATION', location),
    url ? foldLine('URL', url) : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

function buildGoogleCalendarUrl({ title, startDate, endDate, description, location, url }) {
  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const start = fmt(startDate)
  const end = fmt(endDate || new Date(startDate.getTime() + 3600000))
  const plainDesc = stripHtml(description)
  const desc = [plainDesc, url].filter(Boolean).join('\n\n').slice(0, 1000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || '',
    dates: `${start}/${end}`,
  })
  if (desc) params.set('details', desc)
  if (location) params.set('location', location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function AddToCalendar({ title, startDate, endDate, description, location, url }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const handleDownloadICS = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const ics = generateICS({ title, startDate, endDate, description, location, url })
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = (title || 'event').replace(/[^a-z0-9]+/gi, '-').slice(0, 50) + '.ics'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(href)
    setOpen(false)
  }

  const handleGoogleCalendar = (e) => {
    e.stopPropagation()
    setOpen(false)
  }

  return (
    <span className="add-to-cal-wrap" ref={wrapRef}>
      <button
        className="add-to-cal-btn"
        title="Add to calendar"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
      >
        📅
      </button>
      {open && (
        <div className="add-to-cal-dropdown">
          <button className="add-to-cal-option" onClick={handleDownloadICS}>
            Download .ics
          </button>
          <a
            className="add-to-cal-option"
            href={buildGoogleCalendarUrl({ title, startDate, endDate, description, location, url })}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleGoogleCalendar}
          >
            Google Calendar
          </a>
        </div>
      )}
    </span>
  )
}

function HealthDashboard({ buildErrors, calendars }) {
  const [expandedSource, setExpandedSource] = useState(null)

  if (!buildErrors) {
    return (
      <div className="health-dashboard">
        <h1>Source Health Dashboard</h1>
        <p className="health-unavailable">Build errors data is not available. The health dashboard requires a successful build to generate data.</p>
      </div>
    )
  }

  const eventCountMap = {}
  if (buildErrors.eventCounts) {
    buildErrors.eventCounts.forEach(c => { eventCountMap[c.name] = c })
  }

  const errorMap = {}
  if (buildErrors.sources) {
    buildErrors.sources.forEach(s => {
      const key = `${s.source}-${s.calendar}`
      errorMap[key] = s
    })
  }

  const zeroSet = new Set(buildErrors.zeroEventCalendars || [])
  const expectedEmptySet = new Set(buildErrors.expectedEmptyCalendars || [])

  // Build a unified source list from eventCounts (most complete) or fallback to calendars
  const sources = buildErrors.eventCounts
    ? buildErrors.eventCounts.map(c => {
        const errorKey = Object.keys(errorMap).find(k => k.endsWith(`-${c.name}`) || k === c.name)
        const errorEntry = errorKey ? errorMap[errorKey] : null
        let status = 'ok'
        if (errorEntry && errorEntry.errorCount > 0) status = 'error'
        else if (c.events === 0 && !c.expectEmpty) status = 'warning'
        else if (c.events === 0 && c.expectEmpty) status = 'expected-empty'
        else if (c.events > 0 && c.expectEmpty) status = 'unexpected-non-empty'
        return {
          name: c.name,
          type: c.type,
          events: c.events,
          errors: errorEntry?.errorCount || 0,
          errorDetails: errorEntry?.errors || [],
          status,
          expectEmpty: c.expectEmpty,
        }
      })
    : [] // No eventCounts available in older builds

  // Sort: errors first, then warnings, then unexpected-non-empty, then expected-empty, then ok
  const statusOrder = { error: 0, warning: 1, 'unexpected-non-empty': 2, 'expected-empty': 3, ok: 4 }
  sources.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

  const healthyCount = sources.filter(s => s.status === 'ok').length
  const errorCount = sources.filter(s => s.status === 'error').length
  const warningCount = sources.filter(s => s.status === 'warning').length
  const expectedEmptyCount = sources.filter(s => s.status === 'expected-empty').length
  const unexpectedNonEmptyCount = sources.filter(s => s.status === 'unexpected-non-empty').length
  // Use geoStats.totalEvents for unique event count (deduplicated across tag-aggregate feeds)
  // Fall back to sum of per-source counts if geoStats not available
  const uniqueEventCount = buildErrors.geoStats?.totalEvents ?? sources.reduce((sum, s) => sum + s.events, 0)

  const configErrors = buildErrors.configErrors || []
  const externalFailures = buildErrors.externalCalendarFailures || []

  const statusIcon = (status) => {
    if (status === 'ok') return <span className="health-status-dot health-status-ok" title="Healthy" />
    if (status === 'error') return <span className="health-status-dot health-status-error" title="Has errors" />
    if (status === 'warning') return <span className="health-status-dot health-status-warning" title="Zero events (unexpected)" />
    if (status === 'expected-empty') return <span className="health-status-dot health-status-expected-empty" title="Zero events (expected)" />
    if (status === 'unexpected-non-empty') return <span className="health-status-dot health-status-unexpected-non-empty" title="Has events but marked expectEmpty" />
    return null
  }

  return (
    <div className="health-dashboard">
      <h1>Source Health Dashboard</h1>
      <p className="health-subtitle">
        Last built: {new Date(buildErrors.buildTime).toLocaleString()}
      </p>

      <div className="health-summary">
        <div className="health-card">
          <div className="health-card-value">{sources.length}</div>
          <div className="health-card-label">Total Sources</div>
        </div>
        <div className="health-card health-card--ok">
          <div className="health-card-value">{healthyCount}</div>
          <div className="health-card-label">Healthy</div>
        </div>
        <div className="health-card health-card--error">
          <div className="health-card-value">{errorCount}</div>
          <div className="health-card-label">With Errors</div>
        </div>
        <div className="health-card health-card--warning">
          <div className="health-card-value">{warningCount}</div>
          <div className="health-card-label">Zero Events</div>
        </div>
        {expectedEmptyCount > 0 && (
          <div className="health-card">
            <div className="health-card-value">{expectedEmptyCount}</div>
            <div className="health-card-label">Expected Empty</div>
          </div>
        )}
        {unexpectedNonEmptyCount > 0 && (
          <div className="health-card health-card--info">
            <div className="health-card-value">{unexpectedNonEmptyCount}</div>
            <div className="health-card-label">Expected Empty w/ Events</div>
          </div>
        )}
        <div className="health-card">
          <div className="health-card-value">{uniqueEventCount.toLocaleString()}</div>
          <div className="health-card-label">Unique Events</div>
        </div>
        {buildErrors.geoStats && (
          <div className="health-card health-card--ok">
            <div className="health-card-value">{buildErrors.geoStats.eventsWithGeo.toLocaleString()} / {buildErrors.geoStats.totalEvents.toLocaleString()}</div>
            <div className="health-card-label">Events with Geo</div>
          </div>
        )}
        <div className="health-card health-card--warning">
          <div className="health-card-value">📍 {buildErrors.geoStats?.geocodeErrors ?? buildErrors.geocodeErrors?.length ?? 0}</div>
          <div className="health-card-label">Geo Misses</div>
        </div>
      </div>

      <div className="health-section">
        <h2>Discovery API</h2>
        <p>
          Machine-readable data files for LLMs, scripts, and downstream apps.
          Start at <a href="index.json" target="_blank" rel="noopener noreferrer">index.json</a> —
          it links to every other file. See <a href="llms.txt" target="_blank" rel="noopener noreferrer">llms.txt</a>{' '}
          for usage info.
        </p>
      </div>

      {configErrors.length > 0 && (
        <div className="health-section">
          <h2>Configuration Errors ({configErrors.length})</h2>
          <div className="health-error-list">
            {configErrors.map((err, i) => (
              <div key={i} className="health-error-item">
                <span className="health-error-type">{err.type}</span>
                <span className="health-error-reason">{err.reason || err.error}</span>
                {err.path && <span className="health-error-path">{err.path}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {externalFailures.length > 0 && (
        <div className="health-section">
          <h2>External Calendar Failures ({externalFailures.length})</h2>
          <div className="health-error-list">
            {externalFailures.map((f, i) => (
              <div key={i} className="health-error-item">
                <span className="health-error-type">{f.friendlyName || f.name}</span>
                <span className="health-error-reason">{f.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(buildErrors.geocodeErrors?.length || 0) > 0 && (
        <div className="health-section">
          <h2>📍 Geocode Errors ({buildErrors.geocodeErrors.length})</h2>
          <div className="health-error-list">
            {buildErrors.geocodeErrors.map((err, i) => (
              <div key={i} className="health-error-item">
                <span className="health-error-type">{err.source}</span>
                <span className="health-error-reason">{err.location}</span>
                <span className="health-error-path">{err.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="health-section">
          <h2>Source Status</h2>
          <div className="health-table-wrapper">
            <table className="health-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Events</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(source => (
                  <tr
                    key={source.name}
                    className={`health-row health-row--${source.status} ${source.errorDetails.length > 0 ? 'health-row--expandable' : ''}`}
                    onClick={() => source.errorDetails.length > 0 && setExpandedSource(expandedSource === source.name ? null : source.name)}
                  >
                    <td>{statusIcon(source.status)}</td>
                    <td className="health-source-name">
                      {source.name}
                      {source.errorDetails.length > 0 && (
                        <span className="health-expand-icon">{expandedSource === source.name ? '▼' : '▶'}</span>
                      )}
                      {expandedSource === source.name && (
                        <div className="health-error-details" onClick={e => e.stopPropagation()}>
                          {source.errorDetails.map((err, i) => (
                            <div key={i} className="health-error-detail">
                              <span className="health-error-type">{err.type}</span>
                              <span className="health-error-reason">{err.reason}</span>
                              {err.context && <span className="health-error-context">{err.context}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{source.type}</td>
                    <td>{source.events}{source.expectEmpty && source.events === 0 ? ' (expected)' : ''}{source.expectEmpty && source.events > 0 ? ' (remove expectEmpty)' : ''}</td>
                    <td>{source.errors > 0 ? source.errors : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {buildErrors.totalErrors > 0 && (
        <p className="health-total-errors">Total parse errors across all sources: {buildErrors.totalErrors}</p>
      )}
    </div>
  )
}

function App() {
  const [calendars, setCalendars] = useState([])
  const [manifest, setManifest] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [selectedCalendar, setSelectedCalendar] = useState(null)
  const [showHomepage, setShowHomepage] = useState(true)
  const [showHappeningSoon, setShowHappeningSoon] = useState(false)
  const [showHealthDashboard, setShowHealthDashboard] = useState(false)
  const [buildErrors, setBuildErrors] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsIndex, setEventsIndex] = useState([])
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    window.innerWidth < 1440 ? 320 : 360
  )
  const [tagsHeight, setTagsHeight] = useState(150)
  const [footerMinimized, setFooterMinimized] = useState(true)
  // Mobile: 'list' shows sidebar, 'detail' shows events
  // Start on 'detail' so the homepage is visible on mobile
  const [mobileView, setMobileView] = useState('detail')
  const [tagsCollapsed, setTagsCollapsed] = useState(false)
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [dataRefreshed, setDataRefreshed] = useState(false)
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem('calendar-ripper-favorites')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  // Search filters state
  const [searchFilters, setSearchFilters] = useState(() => {
    try {
      const stored = localStorage.getItem('calendar-ripper-search-filters')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [newFilterInput, setNewFilterInput] = useState('')
  // View mode for favorites: 'all' | 'calendars' | 'search' | filter string
  const [favoritesViewMode, setFavoritesViewMode] = useState('all')

  // Geo filters state
  const [geoFilters, setGeoFilters] = useState(() => {
    try {
      const stored = localStorage.getItem('calendar-ripper-geo-filters')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  // Map view toggle (for events panel)
  const [showMapView, setShowMapView] = useState(false)
  const [showFavoritesMap, setShowFavoritesMap] = useState(false)

  // Auth state
  const [authUser, setAuthUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const API_URL = import.meta.env.VITE_FAVORITES_API_URL || ''

  const toggleFavorite = useCallback((icsUrl) => {
    setFavorites(prev => {
      const isFav = prev.includes(icsUrl)
      const next = isFav
        ? prev.filter(u => u !== icsUrl)
        : [...prev, icsUrl]
      try { localStorage.setItem('calendar-ripper-favorites', JSON.stringify(next)) } catch {}

      // Fire-and-forget API call when logged in
      if (API_URL && authUser) {
        const method = isFav ? 'DELETE' : 'POST'
        fetch(`${API_URL}/favorites/${encodeURIComponent(icsUrl)}`, {
          method,
          credentials: 'include',
        }).catch(() => {})
      }

      return next
    })
  }, [authUser])

  const addSearchFilter = useCallback((filter) => {
    const trimmed = filter.trim()
    if (!trimmed) return
    setSearchFilters(prev => {
      if (prev.some(f => f.toLowerCase() === trimmed.toLowerCase())) return prev
      if (prev.length >= 25) return prev
      const next = [...prev, trimmed]
      try { localStorage.setItem('calendar-ripper-search-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        fetch(`${API_URL}/search-filters`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: trimmed }),
        }).catch(() => {})
      }
      return next
    })
  }, [authUser])

  const removeSearchFilter = useCallback((filter) => {
    setSearchFilters(prev => {
      const next = prev.filter(f => f.toLowerCase() !== filter.toLowerCase())
      try { localStorage.setItem('calendar-ripper-search-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        fetch(`${API_URL}/search-filters/${encodeURIComponent(filter)}`, {
          method: 'DELETE',
          credentials: 'include',
        }).catch(() => {})
      }
      return next
    })
  }, [authUser])

  // Geo filter CRUD
  const addGeoFilter = useCallback((filter) => {
    setGeoFilters(prev => {
      if (prev.length >= 10) return prev
      const next = [...prev, filter]
      try { localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        fetch(`${API_URL}/geo-filters`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filter),
        }).catch(() => {})
      }
      return next
    })
  }, [API_URL, authUser])

  const deleteGeoFilter = useCallback((index) => {
    setGeoFilters(prev => {
      const next = prev.filter((_, i) => i !== index)
      try { localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        // Send full updated array (not index) to avoid race conditions when
        // local and server state are out of sync
        fetch(`${API_URL}/geo-filters`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(() => {})
      }
      return next
    })
  }, [API_URL, authUser])

  const editGeoFilter = useCallback((index, filter) => {
    setGeoFilters(prev => {
      const next = prev.map((f, i) => i === index ? filter : f)
      try { localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        fetch(`${API_URL}/geo-filters`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(() => {})
      }
      return next
    })
  }, [API_URL, authUser])

  // Check auth on mount
  useEffect(() => {
    if (!API_URL) { setAuthLoading(false); return }
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.user) setAuthUser(data.user) })
      .catch(() => {})
      .finally(() => setAuthLoading(false))
  }, [])

  const handleLogin = () => {
    if (API_URL) {
      const returnTo = encodeURIComponent(window.location.href)
      window.location.href = `${API_URL}/auth/login?provider=google&return_to=${returnTo}`
    }
  }

  const handleLogout = async () => {
    if (API_URL) {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
    }
    setAuthUser(null)
  }

  // Sync favorites on login
  useEffect(() => {
    if (!authUser || !API_URL) return

    fetch(`${API_URL}/favorites`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        if (data.favorites.length === 0 && favorites.length > 0) {
          // First-time migration: push localStorage to server
          fetch(`${API_URL}/favorites`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorites }),
          })
        } else {
          // Server is source of truth
          setFavorites(data.favorites)
          try { localStorage.setItem('calendar-ripper-favorites', JSON.stringify(data.favorites)) } catch {}
        }
      })
      .catch(() => {})

    // Sync search filters
    fetch(`${API_URL}/search-filters`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        if (data.searchFilters.length === 0 && searchFilters.length > 0) {
          fetch(`${API_URL}/search-filters`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchFilters }),
          })
        } else {
          setSearchFilters(data.searchFilters)
          try { localStorage.setItem('calendar-ripper-search-filters', JSON.stringify(data.searchFilters)) } catch {}
        }
      })
      .catch(() => {})

    // Sync geo filters
    fetch(`${API_URL}/geo-filters`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        const serverFilters = data.geoFilters || []
        if (serverFilters.length === 0 && geoFilters.length > 0) {
          fetch(`${API_URL}/geo-filters`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geoFilters),
          })
        } else {
          setGeoFilters(serverFilters)
          try { localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(serverFilters)) } catch {}
        }
      })
      .catch(() => {})
  }, [authUser])

  // Load calendar metadata from JSON manifest
  const loadCalendars = useCallback(async () => {
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
          rssUrl: calendar.rssUrl,
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
          rssUrl: calendar.rssUrl,
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

      // Load build errors for health dashboard
      try {
        const errorsResponse = await fetch('./build-errors.json')
        if (errorsResponse.ok) {
          setBuildErrors(await errorsResponse.json())
        }
      } catch (e) {
        console.warn('Build errors not available, health dashboard will show limited data')
      }
    } catch (error) {
      console.error('Failed to load calendars:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // Listen for service worker data update messages and reload in-memory data
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handler = (event) => {
      if (event.data?.type === 'DATA_UPDATED') {
        loadCalendars().then(() => setDataRefreshed(true))
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [loadCalendars])

  // Auto-dismiss the "data refreshed" toast after 4 seconds
  useEffect(() => {
    if (!dataRefreshed) return
    const timer = setTimeout(() => setDataRefreshed(false), 4000)
    return () => clearTimeout(timer)
  }, [dataRefreshed])

  const [currentDayHeader, setCurrentDayHeader] = useState(null)

  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'

  const sidebarRef = useRef(null)
  const resizeHandleRef = useRef(null)
  const verticalResizeHandleRef = useRef(null)
  const tagsRef = useRef(null)
  const calendarListRef = useRef(null)
  const agendaRef = useRef(null)
  // When the browser fires a history navigation (back/forward), both popstate AND hashchange
  // fire (popstate first). This ref prevents the hashchange from overriding the popstate result.
  const popstateJustFiredRef = useRef(false)
  const savedCalendarListScrollRef = useRef(0)
  const searchInputRef = useRef(null)
  
  // Track current day-group-header on mobile scroll for the back bar
  useEffect(() => {
    if (!isMobile || mobileView !== 'detail') {
      setCurrentDayHeader(null)
      return
    }

    let scrollCleanup = null
    let attached = false

    const setup = () => {
      if (attached) return
      const container = agendaRef.current
      if (!container) return

      const handleScroll = () => {
        const headers = container.querySelectorAll('.day-group-header')
        let current = null
        const containerTop = container.getBoundingClientRect().top

        for (const header of headers) {
          if (header.getBoundingClientRect().top <= containerTop + 10) {
            current = {
              label: header.querySelector('.day-group-label')?.textContent || '',
              date: header.querySelector('.day-group-date')?.textContent || ''
            }
          }
        }
        setCurrentDayHeader(current)
      }

      container.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll()
      attached = true
      scrollCleanup = () => container.removeEventListener('scroll', handleScroll)
    }

    // Try immediately, and also after a frame for navigation timing
    // (agendaRef may not be set yet after view transitions)
    setup()
    const frameId = requestAnimationFrame(setup)

    return () => {
      cancelAnimationFrame(frameId)
      scrollCleanup?.()
    }
  }, [isMobile, mobileView, showHappeningSoon, selectedCalendar, events, eventsLoading])

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
  const syncStateFromURL = useCallback((event) => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    setSearchTerm(params.get('search') || '')
    setSelectedTag(params.get('tag') || '')
    const calendarId = params.get('calendar')
    const urlView = params.get('view')
    const urlTag = params.get('tag') || ''
    if (urlView === 'health') {
      setShowHealthDashboard(true)
      setShowHomepage(false)
      setShowHappeningSoon(false)
      setSelectedCalendar(null)
      if (isMobile) setMobileView('detail')
    } else if (urlTag === '__favorites__') {
      setShowHealthDashboard(false)
      setSelectedCalendar(null)
      setShowHomepage(false)
      setShowHappeningSoon(false)
      if (isMobile) setMobileView('detail')
    } else if (urlView === 'happening-soon') {
      setShowHappeningSoon(true)
      setShowHomepage(false)
      setShowHealthDashboard(false)
      setSelectedCalendar(null)
      if (isMobile) setMobileView('detail')
    } else if (calendarId && calendars.length > 0) {
      const calendar = findCalendarById(calendarId)
      if (calendar) {
        setSelectedCalendar(calendar)
        setShowHomepage(false)
        setShowHappeningSoon(false)
        setShowHealthDashboard(false)
      }
    } else if (!calendarId) {
      // No calendar in URL — reset to homepage
      setSelectedCalendar(null)
      setShowHomepage(true)
      setShowHappeningSoon(false)
      setShowHealthDashboard(false)
    }
    // Sync mobile view from URL
    if (urlView === 'detail') {
      setMobileView('detail')
    } else if (urlView === 'happening-soon') {
      setMobileView('detail')
    } else if (urlView === 'health') {
      setMobileView('detail')
    } else if (urlTag === '__favorites__') {
      // Favorites view shows the detail panel (events list), not the calendar sidebar
      setMobileView('detail')
    } else if (params.toString() !== '') {
      // URL has tag/search/other params but no view=detail — show sidebar
      setMobileView('list')
    } else if (isMobile && event?.type === 'popstate') {
      // Browser back/forward to empty URL on mobile → show calendar list, not homepage.
      // This happens when the user presses back after navigating into a calendar detail
      // from an unfiltered list (whose URL was also empty).
      setMobileView('list')
    } else {
      // Initial load or home-button reset → show homepage in detail view
      setMobileView('detail')
    }
  }, [calendars, isMobile])

  useEffect(() => {
    syncStateFromURL()

    // popstate: handles browser back / Android hardware back.
    // When the hash changes due to history navigation, browsers fire popstate THEN hashchange.
    // We set a flag so the trailing hashchange doesn't re-run syncStateFromURL and undo
    // the popstate result (e.g. resetting mobileView back to 'detail'/homepage).
    const onPopstate = (event) => {
      popstateJustFiredRef.current = true
      syncStateFromURL(event)
      // Clear the flag after hashchange has had a chance to fire (same task, next microtask).
      setTimeout(() => { popstateJustFiredRef.current = false }, 0)
    }

    // hashchange: handles direct hash edits, home-button resets, and window.location.hash
    // assignments from within the app. Skip if a popstate already handled this navigation.
    const onHashchange = (event) => {
      if (popstateJustFiredRef.current) return
      syncStateFromURL(event)
    }

    window.addEventListener('hashchange', onHashchange)
    window.addEventListener('popstate', onPopstate)
    return () => {
      window.removeEventListener('hashchange', onHashchange)
      window.removeEventListener('popstate', onPopstate)
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

  // Restore the saved calendar list scroll position when returning to the list on mobile
  useEffect(() => {
    if (isMobile && mobileView === 'list' && calendarListRef.current && savedCalendarListScrollRef.current > 0) {
      calendarListRef.current.scrollTop = savedCalendarListScrollRef.current
    }
  }, [isMobile, mobileView])

  const updateURL = (search, tag, calendar, view, { replace = false } = {}) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (tag) params.set('tag', tag)
    if (calendar) params.set('calendar', `${calendar.ripperName}-${calendar.name}`)
    if (view === 'detail') params.set('view', 'detail')
    if (view === 'happening-soon') params.set('view', 'happening-soon')
    if (view === 'health') params.set('view', 'health')
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

    // When on the Happening Soon page, stay there — just filter events by tag
    // (including __favorites__). Use replace to avoid hashchange re-triggering syncStateFromURL.
    if (showHappeningSoon) {
      updateURL(searchTerm, tag, null, 'happening-soon', { replace: true })
      return
    }

    // When favorites tag is selected, show the favorites events view
    if (tag === '__favorites__') {
      setSelectedCalendar(null)
      setShowHomepage(false)
      setShowHappeningSoon(false)
      setShowHealthDashboard(false)
      if (isMobile) setMobileView('detail')
      // Use replace to avoid hashchange re-triggering syncStateFromURL, which would
      // override mobileView back to 'list' (since tag=__favorites__ has no view param).
      updateURL(searchTerm, tag, null, undefined, { replace: true })
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
    setShowHealthDashboard(false)
    if (isMobile) setMobileView('detail')
    updateURL(searchTerm, selectedTag, tagCalendar, isMobile ? 'detail' : undefined)
  }

  const handleCalendarSelect = (calendar, ripperName) => {
    const calendarWithRipper = { ...calendar, ripperName }
    setSelectedCalendar(calendarWithRipper)
    setShowHomepage(false)
    setShowHappeningSoon(false)
    setShowHealthDashboard(false)
    if (isMobile) {
      // Save the calendar list scroll position so we can restore it when the user goes back
      if (calendarListRef.current) {
        savedCalendarListScrollRef.current = calendarListRef.current.scrollTop
      }
      setMobileView('detail')
    }
    // When clicking a calendar that matched by name/description, clear the search
    // so the user sees all events for the calendar they were looking for
    const isNameMatch = searchTerm && calendarNameMatches.has(`${ripperName}-${calendar.name}`)
    const effectiveSearch = isNameMatch ? '' : searchTerm
    if (isNameMatch) setSearchTerm('')
    updateURL(effectiveSearch, selectedTag, calendarWithRipper, isMobile ? 'detail' : undefined)
  }

  const handleHappeningSoon = () => {
    setShowHappeningSoon(true)
    setShowHomepage(false)
    setShowHealthDashboard(false)
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

  const createHttpsUrl = (icsUrl, originalIcsUrl) => {
    const urlToUse = originalIcsUrl || icsUrl
    return originalIcsUrl ? urlToUse : new URL(icsUrl, window.location.origin + window.location.pathname).href
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

  useEffect(() => {
    loadCalendars()
  }, [loadCalendars])

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
      threshold: FUSE_THRESHOLD
    })
  }, [calendars])

  // Fuzzy search setup — event content
  const eventFuse = useMemo(() => {
    if (!eventsIndex.length) return null
    return new Fuse(eventsIndex, {
      keys: ['summary', 'description', 'location'],
      threshold: FUSE_THRESHOLD
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

  // When searching, filter loaded events to only matching ones (fuzzy, consistent with sidebar hints)
  const filteredEvents = useMemo(() => {
    if (!searchTerm || !selectedCalendar) return events
    const fuse = new Fuse(events, {
      keys: ['title', 'description', 'location'],
      threshold: FUSE_THRESHOLD
    })
    return fuse.search(searchTerm).map(r => r.item)
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
        let parsedEndDate = null
        if (event.endDate) {
          const endDateStr = event.endDate.replace(/\[.*\]$/, '')
          const parsedEnd = new Date(endDateStr)
          if (!isNaN(parsedEnd.getTime())) parsedEndDate = parsedEnd
        }
        return { ...event, parsedDate: parsed, parsedEndDate, eventTimezone }
      })
      .filter(event => {
        if (!event) return false
        if (event.parsedDate >= endDate) return false
        if (event.parsedDate < todayStart) return false
        // Filter out events whose end time has already passed
        const effectiveEnd = event.parsedEndDate || event.parsedDate
        if (effectiveEnd <= now) return false
        return true
      })

    // Apply tag filter
    if (selectedTag) {
      if (selectedTag === '__favorites__') {
        upcoming = upcoming.filter(event => favoritesSet.has(event.icsUrl))
      } else {
        upcoming = upcoming.filter(event => {
          const tags = calendarTagsByIcsUrl[event.icsUrl] || []
          return tags.includes(selectedTag)
        })
      }
    }

    // Apply search filter (fuzzy, consistent with calendar list sidebar hints)
    if (searchTerm) {
      const upcomingFuse = new Fuse(upcoming, {
        keys: ['summary', 'description', 'location'],
        threshold: FUSE_THRESHOLD
      })
      upcoming = upcomingFuse.search(searchTerm).map(r => r.item)
    }

    // Sort by date
    upcoming.sort((a, b) => a.parsedDate - b.parsedDate)

    // Group by day label using diffDays as the key so timezone-shifted
    // events that resolve to the same calendar day always merge into one group
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const groupsByDiffDays = new Map()

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

      if (!groupsByDiffDays.has(diffDays)) {
        const dateSubtitle = eventDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        groupsByDiffDays.set(diffDays, { label, dateSubtitle, events: [] })
      }
      groupsByDiffDays.get(diffDays).events.push(event)
    }

    const groups = [...groupsByDiffDays.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, group]) => group)

    return groups
  }, [eventsIndex, selectedTag, searchTerm, calendarTagsByIcsUrl, favoritesSet])

  // Per-filter match counts and match sets for view mode filtering
  const perFilterMatches = useMemo(() => {
    if (!eventsIndex.length) return new Map()
    const fuse = new Fuse(eventsIndex, {
      keys: ['summary', 'description', 'location'],
      threshold: FUSE_THRESHOLD,
    })
    const result = new Map()
    for (const filter of searchFilters) {
      const matches = new Set()
      for (const r of fuse.search(filter)) {
        matches.add(eventKey(r.item))
      }
      result.set(filter, matches)
    }
    return result
  }, [searchFilters, eventsIndex])

  // Compute summaries matching search filters (for favorites view) — derived from perFilterMatches
  const searchFilterMatchSummaries = useMemo(() => {
    const set = new Set()
    for (const matchSet of perFilterMatches.values()) {
      for (const key of matchSet) set.add(key)
    }
    return set
  }, [perFilterMatches])

  // Attribution map: Map<compositeKey, Attribution[]>
  // compositeKey = eventKey(event) = event.summary + '|' + event.date
  // Derives search attributions from perFilterMatches to avoid re-running Fuse
  const eventAttributions = useMemo(() => {
    const map = new Map()
    const addAttr = (key, attr) => {
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(attr)
    }

    // 1. Favorited calendars
    for (const event of eventsIndex) {
      if (favoritesSet.has(event.icsUrl)) {
        const calName = calendarNameByIcsUrl[event.icsUrl] || event.icsUrl
        addAttr(eventKey(event), { type: 'calendar', value: calName })
      }
    }

    // 2. Search filters — derive from perFilterMatches (already computed above)
    for (const [filter, matchSet] of perFilterMatches) {
      for (const key of matchSet) {
        addAttr(key, { type: 'search', value: filter })
      }
    }

    // 3. Geo filters — haversine formula matching infra/favorites-worker/src/feed.ts exactly
    if (geoFilters.length) {
      for (const event of eventsIndex) {
        if (event.lat == null || event.lng == null) continue
        for (const gf of geoFilters) {
          if (haversineKm(gf.lat, gf.lng, event.lat, event.lng) <= gf.radiusKm) {
            addAttr(eventKey(event), {
              type: 'geo',
              value: gf.label || `${gf.radiusKm} km`,
            })
          }
        }
      }
    }

    return map
  }, [eventsIndex, favoritesSet, perFilterMatches, geoFilters, calendarNameByIcsUrl])

  // Live preview: match count for the text currently being typed in the input
  const livePreviewMatches = useMemo(() => {
    const trimmed = newFilterInput.trim()
    if (!trimmed || !eventsIndex.length) return null
    const fuse = new Fuse(eventsIndex, {
      keys: ['summary', 'description', 'location'],
      threshold: FUSE_THRESHOLD,
    })
    const results = fuse.search(trimmed)
    return {
      count: results.length,
      samples: results.slice(0, 5).map(r => r.item),
    }
  }, [newFilterInput, eventsIndex])

  // Reset view mode when switching away from favorites or when filters change
  useEffect(() => {
    if (selectedTag !== '__favorites__') return
    if (favoritesViewMode !== 'all' && favoritesViewMode !== 'calendars' && favoritesViewMode !== 'search') {
      if (favoritesViewMode.startsWith('geo:')) {
        const idx = parseInt(favoritesViewMode.split(':')[1])
        if (!geoFilters[idx]) setFavoritesViewMode('all')
      } else {
        // It's a specific filter — check if it still exists
        if (!searchFilters.includes(favoritesViewMode)) {
          setFavoritesViewMode('all')
        }
      }
    }
  }, [searchFilters, selectedTag, geoFilters, favoritesViewMode])

  // Compute events for the favorites view
  const favoritesEvents = useMemo(() => {
    if (!eventsIndex.length || selectedTag !== '__favorites__') return []
    if (!favorites.length && !searchFilters.length && !geoFilters.length) return []

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate())

    let upcoming = eventsIndex
      .map(event => {
        const tzMatch = event.date.match(/\[(.+)\]$/)
        const eventTimezone = tzMatch ? tzMatch[1] : undefined
        const dateStr = event.date.replace(/\[.*\]$/, '')
        const parsed = new Date(dateStr)
        if (isNaN(parsed.getTime())) return null
        let parsedEndDate = null
        if (event.endDate) {
          const endDateStr = event.endDate.replace(/\[.*\]$/, '')
          const parsedEnd = new Date(endDateStr)
          if (!isNaN(parsedEnd.getTime())) parsedEndDate = parsedEnd
        }
        return { ...event, parsedDate: parsed, parsedEndDate, eventTimezone }
      })
      .filter(event => {
        if (!event) return false
        if (event.parsedDate >= sixMonthsFromNow) return false
        if (event.parsedDate < todayStart) return false
        const effectiveEnd = event.parsedEndDate || event.parsedDate
        if (effectiveEnd <= now) return false

        const isFavorited = favoritesSet.has(event.icsUrl)
        const key = eventKey(event)
        const isSearchMatch = searchFilterMatchSummaries.has(key)
        const isGeoMatch = geoFilters.length > 0 && event.lat != null && event.lng != null &&
          geoFilters.some(gf => haversineKm(gf.lat, gf.lng, event.lat, event.lng) <= gf.radiusKm)

        if (favoritesViewMode === 'calendars') {
          return isFavorited
        } else if (favoritesViewMode === 'search') {
          return isSearchMatch
        } else if (favoritesViewMode.startsWith('geo:')) {
          const geoIndex = parseInt(favoritesViewMode.split(':')[1])
          const gf = geoFilters[geoIndex]
          if (!gf) return false
          if (event.lat == null || event.lng == null) return false
          return haversineKm(gf.lat, gf.lng, event.lat, event.lng) <= gf.radiusKm
        } else if (favoritesViewMode !== 'all') {
          // Specific search filter selected
          const filterMatches = perFilterMatches.get(favoritesViewMode)
          return filterMatches ? filterMatches.has(key) : false
        }
        // 'all' mode — include events from any active source
        if (!isFavorited && !isSearchMatch && !isGeoMatch) return false
        return true
      })

    // Deduplicate cross-source events (same date + location + title)
    // Mirrors the dedup logic in infra/favorites-worker/src/feed.ts
    upcoming = deduplicateEvents(upcoming)

    if (searchTerm) {
      const fuse = new Fuse(upcoming, {
        keys: ['summary', 'description', 'location'],
        threshold: FUSE_THRESHOLD
      })
      upcoming = fuse.search(searchTerm).map(r => r.item)
    }

    upcoming.sort((a, b) => a.parsedDate - b.parsedDate)

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const groupsByDiffDays = new Map()

    for (const event of upcoming) {
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
      else if (diffDays > 1 && diffDays < 7) label = dayNames[eventDay.getDay()]
      else label = eventDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

      if (!groupsByDiffDays.has(diffDays)) {
        const dateSubtitle = eventDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        groupsByDiffDays.set(diffDays, { label, dateSubtitle, events: [] })
      }
      groupsByDiffDays.get(diffDays).events.push(event)
    }

    const groups = [...groupsByDiffDays.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, group]) => group)

    return groups
  }, [eventsIndex, favorites, favoritesSet, selectedTag, searchTerm, searchFilters, searchFilterMatchSummaries, favoritesViewMode, perFilterMatches, geoFilters])

  // Flat list of favorites events for the map (EventsMap expects a flat array, not day groups)
  const favoritesEventsFlat = useMemo(
    () => favoritesEvents.flatMap(group => group.events),
    [favoritesEvents]
  )

  // Track which calendars matched by name/description (not just event content)
  const calendarNameMatches = useMemo(() => {
    const nameMatches = new Set()
    if (searchTerm) {
      fuse.search(searchTerm).forEach(item => {
        nameMatches.add(`${item.item.ripperName}-${item.item.name}`)
      })
    }
    return nameMatches
  }, [searchTerm, fuse])

  // Filter calendars based on search and tag
  const filteredCalendars = useMemo(() => {
    let result = calendars

    if (searchTerm || selectedTag) {
      const matchingCalendars = new Set()

      if (searchTerm) {
        // Calendar name/tag matches
        calendarNameMatches.forEach(id => matchingCalendars.add(id))

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
          const matchesTag = !selectedTag || (selectedTag === '__favorites__' ? favoritesSet.has(calendar.icsUrl) : calendar.tags.includes(selectedTag))
          return matchesSearch && matchesTag
        })
      })).filter(ripper => ripper.calendars.length > 0)

      // Sort name/description matches to the top when searching
      if (searchTerm && calendarNameMatches.size > 0) {
        result.sort((a, b) => {
          const aHasNameMatch = a.calendars.some(c => calendarNameMatches.has(`${a.name}-${c.name}`))
          const bHasNameMatch = b.calendars.some(c => calendarNameMatches.has(`${b.name}-${c.name}`))
          if (aHasNameMatch && !bHasNameMatch) return -1
          if (!aHasNameMatch && bHasNameMatch) return 1
          return 0
        })
      }
    }

    return result
  }, [calendars, searchTerm, selectedTag, calendarNameMatches, eventMatchesByCalendar, favoritesSet])

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
      }
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

  const MobileIcsButton = ({ icsUrl, originalIcsUrl }) => {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef(null)

    useEffect(() => {
      if (!open) return
      const onClickOutside = (e) => {
        if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
      }
      const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
      document.addEventListener('mousedown', onClickOutside)
      document.addEventListener('keydown', onEsc)
      return () => {
        document.removeEventListener('mousedown', onClickOutside)
        document.removeEventListener('keydown', onEsc)
      }
    }, [open])

    if (isIOS()) {
      // iOS: webcal:// works natively — single tap to subscribe
      return (
        <a
          href={createWebcalUrl(icsUrl, originalIcsUrl)}
          title="Subscribe to calendar"
          className="action-link mobile-ics-btn"
          onClick={() => trackEvent('webcal', icsUrl)}
        >
          📥 Subscribe
        </a>
      )
    }

    // Android / other: dropdown with copy link + download
    const webcalUrl = createWebcalUrl(icsUrl, originalIcsUrl)
    const httpsUrl = createHttpsUrl(icsUrl, originalIcsUrl)

    return (
      <span className="mobile-ics-wrap" ref={wrapRef}>
        <button
          className="action-link mobile-ics-btn"
          onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        >
          📥 ICS
        </button>
        {open && (
          <div className="mobile-ics-dropdown">
            <button
              className="mobile-ics-option"
              onClick={(e) => {
                e.stopPropagation()
                copyToClipboard(webcalUrl, e.target)
                trackEvent('copy-link', icsUrl)
                setOpen(false)
              }}
            >
              🔗 Copy subscription link
            </button>
            <a
              className="mobile-ics-option"
              href={httpsUrl}
              download
              onClick={(e) => {
                e.stopPropagation()
                trackEvent('download-ics', icsUrl)
                setOpen(false)
              }}
            >
              📥 Download .ics (one-time)
            </a>
          </div>
        )}
      </span>
    )
  }

  if (loading) {
    return <div className="loading">Loading calendars...</div>
  }

  return (
    <div className={`app ${isMobile ? 'app--mobile' : ''} ${isTablet ? 'app--tablet' : ''}`}>
      {isOffline && (
        <div className="offline-banner" role="status">
          Offline — showing cached events
        </div>
      )}
      {dataRefreshed && (
        <div className="update-toast" role="status">
          New events loaded
        </div>
      )}
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
              setShowHealthDashboard(false)
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
        </div>
        <div className="auth-section">
          {authLoading ? <div className="auth-loading-spinner" aria-label="Loading…" /> : authUser ? (
            <div className="auth-user-dropdown">
              <button className="auth-user-btn" title={authUser.email}>
                <img src={authUser.picture} alt="" className="auth-avatar" />
                <span className="auth-name">{authUser.name}</span>
              </button>
              <div className="auth-dropdown-menu">
                {authUser.feedUrl && (
                  <button className="auth-dropdown-item" onClick={() => {
                    navigator.clipboard.writeText(authUser.feedUrl)
                  }}>
                    Copy Feed URL
                  </button>
                )}
                <button className="auth-dropdown-item" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            </div>
          ) : API_URL ? (
            <button className="auth-login-btn" onClick={handleLogin}>
              Sign in
            </button>
          ) : null}
        </div>
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
                  aria-label={`Clear ${selectedTag === '__favorites__' ? 'Favorites' : formatTagLabel(selectedTag)} filter`}
                >
                  {selectedTag === '__favorites__' ? '♥ Favorites' : formatTagLabel(selectedTag)} ×
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
                {favorites.length > 0 && (
                  <div
                    className={`tag favorites-tag ${selectedTag === '__favorites__' ? 'active' : ''}`}
                    onClick={() => handleTagChange('__favorites__')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTagChange('__favorites__') } }}
                    title={`Favorites — ${favorites.length} calendar${favorites.length !== 1 ? 's' : ''}`}
                  >
                    {selectedTag === '__favorites__' && <span className="tag-check" aria-hidden="true">✓ </span>}
                    <span>♥ Favorites</span>
                    <span className="tag-count">{favorites.length}</span>
                  </div>
                )}
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
                if (selectedTag) parts.push(`in ${selectedTag === '__favorites__' ? 'Favorites' : formatTagLabel(selectedTag)}`)
                return parts.join(' ')
              })()}
            </div>
          )}
          {selectedTag && selectedTag !== '__favorites__' && (
            <div className="tag-header">
              <div
                className="tag-header-content clickable"
                onClick={() => handleTagSelect(selectedTag)}
                title="Click to view tag calendar events"
              >
                <div className="tag-title">Tag: {formatTagLabel(selectedTag)}</div>
                <div className="tag-actions">
                  {isMobile ? (
                    <MobileIcsButton icsUrl={`tag-${selectedTag.toLowerCase()}.ics`} />
                  ) : (
                    <>
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
                        className="action-link google-cal-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          trackEvent('google-calendar', `tag-${selectedTag.toLowerCase()}.ics`)
                        }}
                      >
                        📅 Google
                      </a>
                    </>
                  )}
                  <a
                    href={`tag-${selectedTag.toLowerCase()}.rss`}
                    title="RSS Feed"
                    className="action-link"
                    onClick={(e) => {
                      e.stopPropagation()
                      trackEvent('rss', `tag-${selectedTag.toLowerCase()}.rss`)
                    }}
                  >
                    RSS
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
                      <button
                        className={`favorite-btn ${favoritesSet.has(singleCal.icsUrl) ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(singleCal.icsUrl) }}
                        title={favoritesSet.has(singleCal.icsUrl) ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={favoritesSet.has(singleCal.icsUrl) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {favoritesSet.has(singleCal.icsUrl) ? '♥' : '♡'}
                      </button>
                      <span className={searchTerm && calendarNameMatches.has(`${ripper.name}-${singleCal.name}`) ? 'calendar-name-match' : ''}>
                        {ripper.friendlyName || singleCal.fullName}
                      </span>
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
                    {isMobile ? (
                      <MobileIcsButton icsUrl={singleCal.icsUrl} originalIcsUrl={singleCal.originalIcsUrl} />
                    ) : (
                      <>
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
                          className="action-link google-cal-link"
                          onClick={() => trackEvent('google-calendar', singleCal.icsUrl)}
                        >
                          📅 Google
                        </a>
                      </>
                    )}
                    {singleCal.rssUrl && !singleCal.isExternal && (
                      <a
                        href={singleCal.rssUrl}
                        title="RSS Feed"
                        className="action-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          trackEvent('rss', singleCal.rssUrl)
                        }}
                      >
                        RSS
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                /* Multiple calendars: full ripper header + calendar items */
                <>
              <div className="ripper-header">
                <div className="ripper-title-container">
                  <div className="ripper-title">
                    <span className={searchTerm && ripper.calendars.some(c => calendarNameMatches.has(`${ripper.name}-${c.name}`)) ? 'calendar-name-match' : ''}>
                      {ripper.friendlyName || ripper.description}
                    </span>
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
                    isMobile ? (
                      <MobileIcsButton icsUrl={ripper.calendars[0].icsUrl} originalIcsUrl={ripper.calendars[0].originalIcsUrl} />
                    ) : (
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
                          className="action-link google-cal-link"
                          onClick={() => trackEvent('google-calendar', ripper.calendars[0].icsUrl)}
                        >
                          📅 Google
                        </a>
                      </>
                    )
                  ) : (
                    // Regular ripper - use tag aggregation
                    isMobile ? (
                      <MobileIcsButton icsUrl={`tag-${ripper.name.toLowerCase()}.ics`} />
                    ) : (
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
                          className="action-link google-cal-link"
                          onClick={() => trackEvent('google-calendar', `tag-${ripper.name.toLowerCase()}.ics`)}
                        >
                          📅 Google
                        </a>
                      </>
                    )
                  )}
                  {!ripper.calendars[0]?.isExternal && (
                    <a
                      href={ripper.calendars.length === 1
                        ? ripper.calendars[0].rssUrl
                        : `tag-${ripper.name.toLowerCase()}.rss`}
                      title="RSS Feed"
                      className="action-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        trackEvent('rss', ripper.calendars.length === 1
                          ? ripper.calendars[0].rssUrl
                          : `tag-${ripper.name.toLowerCase()}.rss`)
                      }}
                    >
                      RSS
                    </a>
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
                      <button
                        className={`favorite-btn ${favoritesSet.has(calendar.icsUrl) ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(calendar.icsUrl) }}
                        title={favoritesSet.has(calendar.icsUrl) ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={favoritesSet.has(calendar.icsUrl) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {favoritesSet.has(calendar.icsUrl) ? '♥' : '♡'}
                      </button>
                      <span className={searchTerm && calendarNameMatches.has(`${ripper.name}-${calendar.name}`) ? 'calendar-name-match' : ''}>
                        {calendar.fullName}
                      </span>
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
                    {isMobile ? (
                      <MobileIcsButton icsUrl={calendar.icsUrl} originalIcsUrl={calendar.originalIcsUrl} />
                    ) : (
                      <>
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
                          className="action-link google-cal-link"
                          onClick={() => trackEvent('google-calendar', calendar.icsUrl)}
                        >
                          📅 Google
                        </a>
                      </>
                    )}
                    {calendar.rssUrl && !calendar.isExternal && (
                      <a
                        href={calendar.rssUrl}
                        title="RSS Feed"
                        className="action-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          trackEvent('rss', calendar.rssUrl)
                        }}
                      >
                        RSS
                      </a>
                    )}
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
              if (showHappeningSoon || selectedTag === '__favorites__' || (!showHomepage && selectedCalendar)) {
                // Going back from detail/happening-soon/favorites to the list
                const clearTag = selectedTag === '__favorites__'
                setSelectedCalendar(null)
                setShowHomepage(true)
                setShowHappeningSoon(false)
                if (clearTag) setSelectedTag('')
                setMobileView('list')
                const params = new URLSearchParams()
                if (searchTerm) params.set('search', searchTerm)
                if (!clearTag && selectedTag) params.set('tag', selectedTag)
                const hash = params.toString()
                history.replaceState(null, '', hash ? '#' + hash : window.location.pathname)
              } else {
                setMobileView('list')
              }
            }}>
              <span className="mobile-back-icon">📅</span> ←
            </button>
            {currentDayHeader ? (
              <span className="mobile-bar-day">
                <span className="mobile-bar-day-label">{currentDayHeader.label}</span>
                {currentDayHeader.date && <span className="mobile-bar-day-date">{currentDayHeader.date}</span>}
              </span>
            ) : (
              <span className="mobile-back-title">
                {showHappeningSoon ? 'Happening Soon' : selectedTag === '__favorites__' ? '♥ Favorites' : selectedCalendar?.fullName || ''}
              </span>
            )}
          </div>
        )}
        {showHappeningSoon ? (
          <div className="agenda-panel" ref={agendaRef}>
            {!isMobile && (
              <div className="agenda-header">
                <div className="agenda-title-container">
                  <h1>Happening Soon</h1>
                  <button
                    className={`map-toggle-btn${showMapView ? ' active' : ''}`}
                    onClick={() => setShowMapView(v => !v)}
                    title={showMapView ? 'Show list view' : 'Show map view'}
                  >
                    {showMapView ? '📋 List' : '🗺️ Map'}
                  </button>
                </div>
                <p>
                  {(() => {
                    const totalEvents = happeningSoonEvents.reduce((sum, g) => sum + g.events.length, 0)
                    const parts = []
                    if (totalEvents > 0) parts.push(`${totalEvents} event${totalEvents !== 1 ? 's' : ''}`)
                    else parts.push('Events')
                    if (selectedTag === '__favorites__') parts.push('from your favorited calendars in the next 7 days')
                    else {
                      parts.push('across all calendars in the next 7 days')
                      if (selectedTag) parts.push(`tagged "${formatTagLabel(selectedTag)}"`)
                    }
                    return parts.join(' ')
                  })()}
                </p>
              </div>
            )}

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
                {favorites.length > 0 && (
                  <div
                    className={`tag favorites-tag ${selectedTag === '__favorites__' ? 'active' : ''}`}
                    onClick={() => handleTagChange('__favorites__')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTagChange('__favorites__') } }}
                  >
                    {selectedTag === '__favorites__' && <span className="tag-check" aria-hidden="true">✓ </span>}
                    ♥ Favorites
                  </div>
                )}
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
                {selectedTag && selectedTag !== '__favorites__' && ` in ${formatTagLabel(selectedTag)}`}
                <button className="link-button" onClick={() => handleSearchChange('')}>Clear search</button>
              </div>
            )}

            {showMapView ? (
              <EventsMap
                eventsIndex={eventsIndex}
                geoFilters={geoFilters}
                calendarFilter={null}
                calendarTagsByIcsUrl={calendarTagsByIcsUrl}
                selectedTag={selectedTag}
                calendarNameByIcsUrl={calendarNameByIcsUrl}
                eventAttributions={eventAttributions}
              />
            ) : happeningSoonEvents.length > 0 ? (
              happeningSoonEvents.map(group => (
                <div key={group.label} className="day-group">
                  <div className="day-group-header">
                    <span className="day-group-label">{group.label}</span>
                    <span className="day-group-date">{group.dateSubtitle}</span>
                  </div>
                  {group.events.map((event, idx) => (
                    <div key={`${event.icsUrl}-${event.summary}-${idx}`} className="event-item">
                      {event.image && (
                        <img
                          src={event.image}
                          alt={event.summary}
                          className="event-image"
                          loading="lazy"
                          onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                      )}
                      <div className="event-date">
                        {(() => {
                          const timeOpts = { hour: '2-digit', minute: '2-digit' }
                          const tzOpts = event.eventTimezone ? { timeZone: event.eventTimezone } : {}
                          let startTime
                          try {
                            startTime = event.parsedDate.toLocaleTimeString('en-US', { ...timeOpts, ...tzOpts })
                          } catch {
                            startTime = event.parsedDate.toLocaleTimeString('en-US', timeOpts)
                          }
                          if (group.label === 'Today' && event.parsedEndDate) {
                            let endTime
                            try {
                              endTime = event.parsedEndDate.toLocaleTimeString('en-US', { ...timeOpts, ...tzOpts })
                            } catch {
                              endTime = event.parsedEndDate.toLocaleTimeString('en-US', timeOpts)
                            }
                            return `${startTime} – ${endTime}`
                          }
                          return startTime
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
                        <AddToCalendar
                          title={event.summary}
                          startDate={event.parsedDate}
                          endDate={event.parsedEndDate}
                          description={event.description}
                          location={event.location}
                          url={event.url}
                        />
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
                      <AttributionChips attributions={eventAttributions?.get(eventKey(event))} />
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
        ) : selectedTag === '__favorites__' && !selectedCalendar ? (
          <div className="agenda-panel" ref={agendaRef}>
            {!isMobile && (
              <div className="agenda-header">
                <div className="agenda-title-container">
                  <h1>♥ Favorites</h1>
                </div>
                <p>
                  {(() => {
                    const totalEvents = favoritesEvents.reduce((sum, g) => sum + g.events.length, 0)
                    const parts = []
                    if (favorites.length > 0) parts.push(`${favorites.length} favorited calendar${favorites.length !== 1 ? 's' : ''}`)
                    if (searchFilters.length > 0) parts.push(`${searchFilters.length} search filter${searchFilters.length !== 1 ? 's' : ''}`)
                    const source = parts.join(' and ') || 'your favorites'
                    return totalEvents > 0
                      ? `${totalEvents} event${totalEvents !== 1 ? 's' : ''} from ${source}`
                      : `Events from ${source}`
                  })()}
                </p>
              </div>
            )}

            {authUser?.feedUrl && (
              <div className="feed-url-banner">
                <div className="feed-url-text">
                  <strong>Subscribe to your favorites</strong>
                  <span>Add this URL to any calendar app to see your favorites automatically.</span>
                </div>
                <div className="feed-url-actions">
                  <input
                    className="feed-url-input"
                    readOnly
                    value={authUser.feedUrl}
                    onClick={(e) => e.target.select()}
                  />
                  <button className="feed-url-copy" onClick={() => navigator.clipboard.writeText(authUser.feedUrl)}>
                    Copy
                  </button>
                </div>
              </div>
            )}
            {!authUser && favorites.length > 0 && API_URL && (
              <div className="feed-url-banner feed-url-prompt">
                <span>Sign in to sync favorites across devices and get a calendar subscription link</span>
                <button className="auth-login-btn" onClick={handleLogin}>Sign in</button>
              </div>
            )}

            <div className="search-filters-section">
              <div className="search-filters-header">
                <strong>Search Filters</strong>
                <span className="search-filters-hint">Events matching these terms are included in your feed</span>
              </div>
              {searchFilters.length > 0 && (
                <div className="search-filters-chips">
                  {searchFilters.map(filter => {
                    const matchCount = perFilterMatches.get(filter)?.size || 0
                    const isActive = favoritesViewMode === filter
                    return (
                      <span
                        key={filter}
                        className={`search-filter-chip${isActive ? ' search-filter-chip-active' : ''}`}
                        onClick={() => setFavoritesViewMode(isActive ? 'all' : filter)}
                        title={isActive ? 'Click to show all' : `Click to show only "${filter}" matches`}
                      >
                        {filter}
                        <span className="search-filter-chip-count">{matchCount}</span>
                        <button
                          className="search-filter-chip-remove"
                          onClick={(e) => { e.stopPropagation(); removeSearchFilter(filter) }}
                          title="Remove filter"
                        >
                          x
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
              <form className="search-filters-add" onSubmit={(e) => {
                e.preventDefault()
                addSearchFilter(newFilterInput)
                setNewFilterInput('')
              }}>
                <input
                  type="text"
                  className="search-filter-input"
                  placeholder="e.g. jazz, trivia night, farmers market..."
                  value={newFilterInput}
                  onChange={(e) => setNewFilterInput(e.target.value)}
                  maxLength={200}
                />
                <button type="submit" className="search-filter-add-btn" disabled={!newFilterInput.trim()}>
                  Add
                </button>
              </form>
              {livePreviewMatches && (
                <div className="search-filter-preview">
                  <span className="search-filter-preview-count">
                    {livePreviewMatches.count} event{livePreviewMatches.count !== 1 ? 's' : ''} match "{newFilterInput.trim()}"
                  </span>
                  {livePreviewMatches.samples.length > 0 && (
                    <ul className="search-filter-preview-list">
                      {livePreviewMatches.samples.map((evt, i) => (
                        <li key={i}>{evt.summary}</li>
                      ))}
                      {livePreviewMatches.count > 5 && (
                        <li className="search-filter-preview-more">+{livePreviewMatches.count - 5} more</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <GeoFiltersSection
              authUser={authUser}
              geoFilters={geoFilters}
              onAdd={addGeoFilter}
              onDelete={deleteGeoFilter}
              onEdit={editGeoFilter}
              isMobile={isMobile}
            />

            {searchTerm && (
              <div className="search-filter-banner">
                Showing events matching "{searchTerm}"
                <button className="link-button" onClick={() => handleSearchChange('')}>Clear search</button>
              </div>
            )}

            {((favorites.length > 0 && searchFilters.length > 0) || geoFilters.length > 0) && (
              <div className="favorites-view-switcher">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'calendars', label: '❤️ Only' },
                  { key: 'search', label: 'Search Only' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    className={`favorites-view-btn${favoritesViewMode === key ? ' favorites-view-btn-active' : ''}`}
                    onClick={() => setFavoritesViewMode(key)}
                  >
                    {label}
                  </button>
                ))}
                {geoFilters.length > 0 && geoFilters.map((gf, i) => {
                  const geoKey = `geo:${i}`
                  const geoLabel = gf.label ? `📍 ${gf.label}` : `📍 Filter ${i + 1}`
                  return (
                    <button
                      key={geoKey}
                      className={`favorites-view-btn${favoritesViewMode === geoKey ? ' favorites-view-btn-active' : ''}`}
                      onClick={() => setFavoritesViewMode(geoKey)}
                    >
                      {geoLabel}
                    </button>
                  )
                })}
                <button
                  className={`map-toggle-btn${showFavoritesMap ? ' active' : ''}`}
                  onClick={() => setShowFavoritesMap(v => !v)}
                  title={showFavoritesMap ? 'Hide map' : 'Show map'}
                >
                  🗺️ Map
                </button>
              </div>
            )}

            {showFavoritesMap && (
              <EventsMap
                eventsIndex={favoritesEventsFlat}
                geoFilters={geoFilters}
                eventAttributions={eventAttributions}
                calendarNameByIcsUrl={calendarNameByIcsUrl}
                selectedTag={selectedTag}
                calendarTagsByIcsUrl={calendarTagsByIcsUrl}
              />
            )}

            {favoritesEvents.length > 0 ? (
              favoritesEvents.map(group => (
                <div key={group.label} className="day-group">
                  <div className="day-group-header">
                    <span className="day-group-label">{group.label}</span>
                    <span className="day-group-date">{group.dateSubtitle}</span>
                  </div>
                  {group.events.map((event, idx) => (
                    <div key={`${event.icsUrl}-${event.summary}-${idx}`} className="event-item">
                      {event.image && (
                        <img
                          src={event.image}
                          alt={event.summary}
                          className="event-image"
                          loading="lazy"
                          onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                      )}
                      <div className="event-date">
                        {(() => {
                          const timeOpts = { hour: '2-digit', minute: '2-digit' }
                          const tzOpts = event.eventTimezone ? { timeZone: event.eventTimezone } : {}
                          let startTime
                          try {
                            startTime = event.parsedDate.toLocaleTimeString('en-US', { ...timeOpts, ...tzOpts })
                          } catch {
                            startTime = event.parsedDate.toLocaleTimeString('en-US', timeOpts)
                          }
                          if (event.parsedEndDate) {
                            let endTime
                            try {
                              endTime = event.parsedEndDate.toLocaleTimeString('en-US', { ...timeOpts, ...tzOpts })
                            } catch {
                              endTime = event.parsedEndDate.toLocaleTimeString('en-US', timeOpts)
                            }
                            return `${startTime} – ${endTime}`
                          }
                          return startTime
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
                        <AddToCalendar
                          title={event.summary}
                          startDate={event.parsedDate}
                          endDate={event.parsedEndDate}
                          description={event.description}
                          location={event.location}
                          url={event.url}
                        />
                        <span
                          className="event-source clickable"
                          title={`From ${calendarNameByIcsUrl[event.icsUrl] || event.icsUrl}`}
                          onClick={() => {
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
                      <AttributionChips attributions={eventAttributions?.get(eventKey(event))} />
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <span>No upcoming events from your favorites</span>
                <span className="empty-state-hint">
                  {searchTerm
                    ? <><button className="link-button" onClick={() => handleSearchChange('')}>Clear your search</button> to see all favorite events</>
                    : 'Your favorited calendars have no upcoming events'}
                </span>
              </div>
            )}
          </div>
        ) : showHealthDashboard ? (
          <HealthDashboard buildErrors={buildErrors} calendars={calendars} />
        ) : showHomepage ? (
          <div className="homepage">
            <h1>206.events</h1>
            <p>Browse and subscribe to event calendars from venues, neighborhoods, and organizations across the Seattle area. Search and filter here, or add any calendar to your favorite app using the ICS links to keep events synced automatically.</p>

            {!authUser && API_URL && (
              <div className="homepage-signin-cta">
                <div className="homepage-signin-cta-text">
                  <strong>Sign in to sync your favorites</strong>
                  <span>Save calendars across devices and get a personal ICS link that combines all your favorites into one feed.</span>
                </div>
                <button className="auth-login-btn" onClick={handleLogin}>Sign in with Google</button>
              </div>
            )}

            {favorites.length > 0 ? (
              <button
                className="homepage-favorites-cta"
                onClick={() => {
                  setShowHappeningSoon(true)
                  setShowHomepage(false)
                  setSelectedCalendar(null)
                  setSelectedTag('__favorites__')
                  if (isMobile) setMobileView('detail')
                  updateURL(searchTerm, '__favorites__', null, 'happening-soon')
                }}
              >
                <span className="homepage-favorites-cta-icon">♥</span>
                <span className="homepage-favorites-cta-text">
                  <span className="homepage-favorites-cta-title">View Your Favorites</span>
                  <span className="homepage-favorites-cta-sub">{favorites.length} calendar{favorites.length !== 1 ? 's' : ''} saved</span>
                </span>
                <span className="homepage-favorites-cta-arrow">→</span>
              </button>
            ) : isMobile && (
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
              <li><strong>Favorites:</strong> Click the ♡ heart icon on any calendar to save it, then use the <strong>♥ Favorites</strong> tag to see only events from your saved calendars</li>
              <li><strong>Subscribe:</strong> Use the 📥 ICS link to add a calendar to your app, 📅 to add it to Google Calendar, or 🔗 to copy the link</li>
              <li><strong>Add a single event:</strong> Click the 📅 button on any event to add just that event to Google Calendar or download it as an .ics file</li>
              <li><strong>RSS:</strong> Every calendar and tag has an RSS feed — look for the <strong>RSS</strong> link next to each calendar to follow events in your RSS reader</li>
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
                <button
                  className={`map-toggle-btn${showMapView ? ' active' : ''}`}
                  onClick={() => setShowMapView(v => !v)}
                  title={showMapView ? 'Show list view' : 'Show map view'}
                >
                  {showMapView ? '📋 List' : '🗺️ Map'}
                </button>
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

            {showMapView ? (
              <EventsMap
                eventsIndex={eventsIndex}
                geoFilters={geoFilters}
                calendarFilter={selectedCalendar.icsUrl}
                calendarTagsByIcsUrl={calendarTagsByIcsUrl}
                selectedTag={selectedTag}
                calendarNameByIcsUrl={calendarNameByIcsUrl}
              />
            ) : eventsLoading ? (
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
                            <AddToCalendar
                              title={event.title}
                              startDate={event.startDate}
                              endDate={event.endDate}
                              description={event.description}
                              location={event.location}
                              url={event.url}
                            />
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
              <a href="https://github.com/prestomation/206events" target="_blank" rel="noopener noreferrer">
               Open an issue or pull request to add a new calendar to this page. </a>
            </p>
            <p style={{ fontSize: '12px' }}>
              Powered by <a href="https://github.com/prestomation/206events" target="_blank" rel="noopener noreferrer">206.events</a>
              {manifest && (
                <span> • Last generated at {new Date(manifest.lastUpdated).toLocaleString()}</span>
              )}
              {' • '}
              <a
                href="#view=health"
                onClick={(e) => {
                  e.preventDefault()
                  setShowHealthDashboard(true)
                  setShowHomepage(false)
                  setShowHappeningSoon(false)
                  setSelectedCalendar(null)
                  if (isMobile) setMobileView('detail')
                  updateURL('', '', null, 'health')
                }}
              >
                Source Health
              </a>
            </p>
          </div>
        </footer>
      </div>
      )}
    </div>
  )
}

export default App
