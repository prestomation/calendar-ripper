import { useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { eventKey } from './lib/eventKey.js'
import { AttributionChips } from './AttributionChips.jsx'

// Fix Leaflet default marker icons in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const SEATTLE_CENTER = [47.6062, -122.3321]
const DEFAULT_ZOOM = 12

function createClusterIcon(cluster) {
  const count = cluster.getChildCount()
  let size, colorClass
  if (count < 10) { size = 36; colorClass = 'cluster-small' }
  else if (count < 50) { size = 44; colorClass = 'cluster-medium' }
  else { size = 52; colorClass = 'cluster-large' }
  return L.divIcon({
    html: `<div class="cluster-icon ${colorClass}"><span>${count}</span></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function FitBounds({ events, geoFilters }) {
  const map = useMap()
  useEffect(() => {
    const points = []
    for (const e of events) {
      if (e.lat && e.lng) points.push([e.lat, e.lng])
    }
    for (const gf of geoFilters) {
      const kmToDeg = gf.radiusKm / 111
      points.push([gf.lat + kmToDeg, gf.lng + kmToDeg])
      points.push([gf.lat - kmToDeg, gf.lng - kmToDeg])
    }
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
    }
  }, []) // only on mount
  return null
}

function formatEventDate(dateStr) {
  if (!dateStr) return ''
  try {
    const cleaned = dateStr.replace(/\[.*\]$/, '')
    const d = new Date(cleaned)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/**
 * EventsMap renders a Leaflet map with event markers and optional geo filter circles.
 *
 * Props:
 *   eventsIndex      - array of EventsIndexEntry (all events)
 *   geoFilters       - array of GeoFilter ({ lat, lng, radiusKm, label? })
 *   calendarFilter   - optional: icsUrl of selected calendar (or tag icsUrl) to filter by
 *   calendarTagsByIcsUrl - map of icsUrl → tags[]
 *   selectedTag      - currently active tag ('' means all)
 *   calendarNameByIcsUrl - map of icsUrl → friendly calendar name
 *   eventAttributions  - optional Map<compositeKey, Attribution[]> from App.jsx for showing why events appear
 */
export function EventsMap({
  eventsIndex,
  geoFilters,
  calendarFilter,
  calendarTagsByIcsUrl,
  selectedTag,
  calendarNameByIcsUrl,
  eventAttributions,
}) {
  // Filter events: only those with lat/lng, and respecting active tag/calendar filter
  const mappableEvents = useMemo(() => eventsIndex.filter(event => {
    if (!event.lat || !event.lng) return false

    // Calendar/tag filter
    if (calendarFilter) {
      // If a specific calendar is selected, only show events from it
      if (event.icsUrl !== calendarFilter) return false
    } else if (selectedTag && selectedTag !== '__favorites__') {
      const tags = calendarTagsByIcsUrl[event.icsUrl] || []
      if (!tags.includes(selectedTag)) return false
    }

    return true
  }), [eventsIndex, calendarFilter, selectedTag, calendarTagsByIcsUrl])

  // Parse dates for popup display
  const eventsWithDates = useMemo(() => mappableEvents.map(event => ({
    ...event,
    formattedDate: formatEventDate(event.date),
    calendarName: calendarNameByIcsUrl[event.icsUrl] || event.icsUrl?.replace('.ics', ''),
  })), [mappableEvents, calendarNameByIcsUrl])

  return (
    <div className="events-map-container" data-testid="events-map">
      <MapContainer
        center={SEATTLE_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        className="events-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Geo filter circles */}
        {geoFilters.map((filter, i) => (
          <Circle
            key={`geo-filter-${filter.lat}-${filter.lng}-${filter.radiusKm}`}
            center={[filter.lat, filter.lng]}
            radius={filter.radiusKm * 1000}
            pathOptions={{
              color: '#4a90d9',
              fillColor: '#4a90d9',
              fillOpacity: 0.12,
              weight: 2,
            }}
          >
            <Popup>
              <strong>{filter.label || 'Location filter'}</strong><br />
              Radius: {filter.radiusKm} km
            </Popup>
          </Circle>
        ))}

        <FitBounds events={eventsWithDates} geoFilters={geoFilters} />

        {/* Event markers */}
        <MarkerClusterGroup
          chunkedLoading
          iconCreateFunction={createClusterIcon}
          showCoverageOnHover={true}
          maxClusterRadius={45}
          spiderfyOnMaxZoom={true}
        >
          {eventsWithDates.map((event, i) => (
            <Marker key={`event-${i}-${event.summary}`} position={[event.lat, event.lng]}>
              <Popup>
                <div className="map-popup">
                  <strong className="map-popup-title">{event.summary}</strong>
                  <div className="map-popup-date">{event.formattedDate}</div>
                  {event.calendarName && (
                    <div className="map-popup-source">{event.calendarName}</div>
                  )}
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="map-popup-link"
                    >
                      View event →
                    </a>
                  )}
                  <AttributionChips attributions={eventAttributions?.get(eventKey(event))} />
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {eventsWithDates.length === 0 && (
        <div className="events-map-empty">
          No geocoded events to display
          {selectedTag ? ` for this filter` : ''}
        </div>
      )}
    </div>
  )
}
