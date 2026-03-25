import { useState, useEffect, useRef } from 'react'

const RADIUS_OPTIONS = [1, 2, 5, 10, 20]
const DEFAULT_RADIUS = 2
const PHOTON_URL = 'https://photon.komoot.io/api/'
const PHOTON_BBOX = '-122.6,47.3,-121.9,47.8'

/**
 * A chip showing a single geo filter with edit and delete buttons.
 */
function GeoFilterChip({ filter, index, onEdit, onDelete }) {
  const label = filter.label || 'Location'
  return (
    <span className="geo-filter-chip">
      <span className="geo-filter-chip-label" onClick={() => onEdit(index)} title="Click to edit">
        📍 {label} · {filter.radiusKm} km
      </span>
      <button
        className="geo-filter-chip-edit"
        onClick={() => onEdit(index)}
        title="Edit"
        aria-label={`Edit ${label}`}
      >
        ✏️
      </button>
      <button
        className="geo-filter-chip-remove"
        onClick={() => onDelete(index)}
        title="Remove"
        aria-label={`Remove ${label}`}
      >
        ✕
      </button>
    </span>
  )
}

/**
 * Address autocomplete using the Photon geocoding API.
 */
// Rate limit: max requests per window
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute
const MIN_QUERY_LENGTH = 3
let _rateLimitCount = 0
let _rateLimitReset = Date.now() + RATE_LIMIT_WINDOW_MS

function checkRateLimit() {
  const now = Date.now()
  if (now > _rateLimitReset) {
    _rateLimitCount = 0
    _rateLimitReset = now + RATE_LIMIT_WINDOW_MS
  }
  if (_rateLimitCount >= RATE_LIMIT_MAX) return false
  _rateLimitCount++
  return true
}

function AddressAutocomplete({ onSelect }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      if (val.trim().length < MIN_QUERY_LENGTH) return
      if (!checkRateLimit()) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: val, limit: 5, bbox: PHOTON_BBOX })
        const res = await fetch(`${PHOTON_URL}?${params}`)
        if (res.ok) {
          const data = await res.json()
          // Validate response shape before using it
          const features = Array.isArray(data?.features) ? data.features.filter(
            f => f && typeof f === 'object' &&
              f.geometry && typeof f.geometry === 'object' &&
              Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2 &&
              typeof f.geometry.coordinates[0] === 'number' &&
              typeof f.geometry.coordinates[1] === 'number' &&
              f.properties && typeof f.properties === 'object'
          ) : []
          setSuggestions(features)
          setShowDropdown(true)
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  const handleSelect = (feature) => {
    const [lng, lat] = feature.geometry.coordinates
    const props = feature.properties
    const name = [props.name, props.street, props.city, props.state]
      .filter(Boolean)
      .join(', ')
    setQuery(name)
    setSuggestions([])
    setShowDropdown(false)
    onSelect(lat, lng, name)
  }

  return (
    <div className="address-autocomplete-wrap" ref={wrapRef}>
      <input
        type="text"
        className="geo-filter-address-input"
        placeholder="Search address or place..."
        value={query}
        onChange={handleInput}
        autoComplete="off"
      />
      {loading && <span className="geo-filter-address-loading">⏳</span>}
      {showDropdown && suggestions.length > 0 && (
        <ul className="address-dropdown">
          {suggestions.map((feat, i) => {
            const p = feat.properties
            const display = [p.name, p.street, p.city, p.state, p.country]
              .filter(Boolean)
              .join(', ')
            const [lng, lat] = feat.geometry.coordinates
            return (
              <li
                key={`${lat}-${lng}-${i}`}
                className="address-dropdown-item"
                onMouseDown={() => handleSelect(feat)}
              >
                {display}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Form for adding or editing a geo filter.
 */
function GeoFilterForm({ initialFilter, onSave, onCancel, isMobile }) {
  const [lat, setLat] = useState(initialFilter?.lat ?? null)
  const [lng, setLng] = useState(initialFilter?.lng ?? null)
  const [locationLabel, setLocationLabel] = useState('')
  const [radiusKm, setRadiusKm] = useState(initialFilter?.radiusKm ?? DEFAULT_RADIUS)
  const [label, setLabel] = useState(initialFilter?.label ?? '')
  const [geolocating, setGeolocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  const hasLocation = lat !== null && lng !== null

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }
    setGeolocating(true)
    setGeoError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setLocationLabel('Current location')
        setGeolocating(false)
      },
      (err) => {
        setGeoError('Location access denied. You can search for an address instead.')
        setGeolocating(false)
      },
      { timeout: 10000 }
    )
  }

  const handleAddressSelect = (selLat, selLng, name) => {
    setLat(selLat)
    setLng(selLng)
    setLocationLabel(name)
    setGeoError('')
  }

  const handleSave = () => {
    if (!hasLocation) return
    onSave({ lat, lng, radiusKm, label: label.trim() || undefined })
  }

  const radiusIndex = RADIUS_OPTIONS.indexOf(radiusKm)

  return (
    <div className="geo-filter-form">
      {!hasLocation ? (
        <>
          <button
            className="geo-filter-use-location-btn"
            onClick={handleUseMyLocation}
            disabled={geolocating}
          >
            {geolocating ? '⏳ Getting location...' : '📍 Use my location'}
          </button>
          {geoError && <div className="geo-filter-error">{geoError}</div>}
          <div className="geo-filter-or">or</div>
          <AddressAutocomplete onSelect={handleAddressSelect} />
        </>
      ) : (
        <>
          <div className="geo-filter-location-set">
            📍 {locationLabel || 'Location set'}
            <button
              className="geo-filter-change-location-btn"
              onClick={() => { setLat(null); setLng(null); setLocationLabel('') }}
            >
              Change
            </button>
          </div>

          <div className="geo-filter-radius-section">
            <label className="geo-filter-radius-label">
              Radius: <strong>{radiusKm} km</strong>
            </label>
            {isMobile ? (
              <div className="geo-filter-radius-presets">
                {RADIUS_OPTIONS.map(r => (
                  <button
                    key={r}
                    className={`geo-filter-radius-preset-btn${radiusKm === r ? ' active' : ''}`}
                    onClick={() => setRadiusKm(r)}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="range"
                className="geo-filter-radius-slider"
                min={0}
                max={RADIUS_OPTIONS.length - 1}
                step={1}
                value={radiusIndex === -1 ? 1 : radiusIndex}
                onChange={(e) => setRadiusKm(RADIUS_OPTIONS[parseInt(e.target.value)])}
              />
            )}
          </div>

          <div className="geo-filter-label-section">
            <input
              type="text"
              className="geo-filter-label-input"
              placeholder="Label (e.g. Home, Work, Capitol Hill)"
              value={label}
              maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="geo-filter-form-actions">
            <button className="geo-filter-cancel-btn" onClick={onCancel}>Cancel</button>
            <button className="geo-filter-save-btn" onClick={handleSave}>Save</button>
          </div>
        </>
      )}
      {hasLocation && (
        <div className="geo-filter-form-actions-cancel-only">
          <button className="geo-filter-cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      )}
    </div>
  )
}

/**
 * The full Geo Filters section shown in the Favorites view.
 */
export function GeoFiltersSection({ authUser, geoFilters, onAdd, onDelete, onEdit, isMobile }) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)

  const handleSaveNew = (filter) => {
    onAdd(filter)
    setIsAdding(false)
  }

  const handleSaveEdit = (filter) => {
    onEdit(editingIndex, filter)
    setEditingIndex(null)
  }

  const handleDelete = (index) => {
    onDelete(index)
    if (editingIndex === index) setEditingIndex(null)
  }

  return (
    <div className="geo-filters-section">
      <div className="geo-filters-header">
        <strong>Location Filters</strong>
        <span className="geo-filters-hint">Only see events near these locations</span>
      </div>

      {geoFilters.length > 0 && (
        <div className="geo-filters-chips">
          {geoFilters.map((filter, index) => (
            <span key={`${filter.lat}-${filter.lng}-${filter.radiusKm}-${index}`}>
              <GeoFilterChip
                filter={filter}
                index={index}
                onEdit={(i) => {
                  setIsAdding(false)
                  setEditingIndex(i)
                }}
                onDelete={handleDelete}
              />
              {editingIndex === index && (
                <GeoFilterForm
                  initialFilter={filter}
                  onSave={handleSaveEdit}
                  onCancel={() => setEditingIndex(null)}
                  isMobile={isMobile}
                />
              )}
            </span>
          ))}
        </div>
      )}

      {!isAdding && editingIndex === null && (
        <button
          className="geo-filter-add-btn"
          onClick={() => setIsAdding(true)}
          disabled={geoFilters.length >= 10}
          title={geoFilters.length >= 10 ? 'Maximum 10 location filters' : 'Add a location filter'}
        >
          + Add location
        </button>
      )}

      {isAdding && (
        <GeoFilterForm
          onSave={handleSaveNew}
          onCancel={() => setIsAdding(false)}
          isMobile={isMobile}
        />
      )}
    </div>
  )
}
