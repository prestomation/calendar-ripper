import { useMemo, useRef, useCallback, useEffect, useState } from 'react'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDateLabel(date) {
  if (!date) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelative(date, today) {
  if (!date) return ''
  const days = Math.round((startOfDay(date) - today) / MS_PER_DAY)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 0) return formatDateLabel(date)
  if (days < 7) return `In ${days} days`
  if (days < 31) return `In ${Math.round(days / 7)} weeks`
  if (days < 365) return `In ${Math.round(days / 30)} months`
  return formatDateLabel(date)
}

const HISTOGRAM_BINS = 60

/**
 * Builds a fixed-bin histogram of upcoming-event counts between todayStart and maxDate.
 * Returns { bins: number[], maxCount: number }.
 */
function buildHistogram(eventDates, todayStart, maxDate) {
  const bins = new Array(HISTOGRAM_BINS).fill(0)
  const total = maxDate.getTime() - todayStart.getTime()
  if (total <= 0) return { bins, maxCount: 0 }
  for (const t of eventDates) {
    if (t < todayStart.getTime() || t > maxDate.getTime()) continue
    const frac = (t - todayStart.getTime()) / total
    const idx = Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor(frac * HISTOGRAM_BINS)))
    bins[idx]++
  }
  const maxCount = bins.reduce((m, c) => (c > m ? c : m), 0)
  return { bins, maxCount }
}

/**
 * DateWindowSlider — dual-handle range slider that selects a [start, end] date window.
 *
 * Props:
 *   eventTimestamps  Array<number>   ms timestamps of all events (drives histogram + max)
 *   value            { start: Date|null, end: Date|null } current window (null = open)
 *   onChange         (next: { start: Date|null, end: Date|null }) => void
 *   maxDate          optional Date — clamp slider to this; defaults to last event
 *   matchedCount     optional number — events currently in window (for label)
 *   totalCount       optional number — total events (for label)
 *   compact          optional boolean — hide histogram for tight headers
 */
export function DateWindowSlider({
  eventTimestamps,
  value,
  onChange,
  maxDate,
  matchedCount,
  totalCount,
  compact = false,
}) {
  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(null) // 'start' | 'end' | null

  const todayStart = useMemo(() => startOfDay(new Date()), [])
  const lastEventDate = useMemo(() => {
    if (maxDate) return startOfDay(maxDate)
    if (!eventTimestamps?.length) return addDays(todayStart, 90)
    let max = 0
    for (const t of eventTimestamps) if (t > max) max = t
    if (!max) return addDays(todayStart, 90)
    return startOfDay(new Date(max))
  }, [eventTimestamps, maxDate, todayStart])

  const minMs = todayStart.getTime()
  const maxMs = lastEventDate.getTime()
  const range = Math.max(MS_PER_DAY, maxMs - minMs)

  const startMs = value.start ? Math.max(minMs, Math.min(maxMs, startOfDay(value.start).getTime())) : minMs
  const endMs = value.end ? Math.max(minMs, Math.min(maxMs, startOfDay(value.end).getTime())) : maxMs

  const startPct = ((startMs - minMs) / range) * 100
  const endPct = ((endMs - minMs) / range) * 100

  const histogram = useMemo(
    () => buildHistogram(eventTimestamps || [], todayStart, lastEventDate),
    [eventTimestamps, todayStart, lastEventDate],
  )

  const positionToMs = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return minMs
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return Math.round(minMs + frac * range)
  }, [minMs, range])

  const snapToDay = (ms) => startOfDay(new Date(ms)).getTime()

  const handlePointerDown = (handle) => (e) => {
    e.preventDefault()
    setDragging(handle)
    e.target.setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return
    const ms = snapToDay(positionToMs(e.clientX))
    if (dragging === 'start') {
      const clamped = Math.min(ms, endMs)
      onChange({
        start: clamped === minMs ? null : new Date(clamped),
        end: value.end,
      })
    } else {
      const clamped = Math.max(ms, startMs)
      onChange({
        start: value.start,
        end: clamped === maxMs ? null : new Date(clamped),
      })
    }
  }, [dragging, positionToMs, endMs, startMs, minMs, maxMs, value.start, value.end, onChange])

  const handlePointerUp = useCallback(() => setDragging(null), [])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [dragging, handlePointerMove, handlePointerUp])

  const applyPreset = (preset) => {
    if (preset === 'all') {
      onChange({ start: null, end: null })
      return
    }
    const days = { today: 1, weekend: null, week: 7, month: 30, threeMonths: 90 }[preset]
    if (preset === 'weekend') {
      const day = todayStart.getDay()
      const friday = day <= 5 ? addDays(todayStart, 5 - day) : addDays(todayStart, 6)
      const sunday = addDays(friday, 2)
      onChange({ start: friday, end: sunday })
      return
    }
    if (preset === 'today') {
      onChange({ start: todayStart, end: todayStart })
      return
    }
    onChange({ start: todayStart, end: addDays(todayStart, days) })
  }

  const presets = [
    { key: 'today', label: 'Today' },
    { key: 'weekend', label: 'Weekend' },
    { key: 'week', label: 'Next 7d' },
    { key: 'month', label: 'Next 30d' },
    { key: 'threeMonths', label: 'Next 90d' },
    { key: 'all', label: 'All' },
  ]

  const isAll = value.start == null && value.end == null
  const startDisplay = value.start ? value.start : todayStart
  const endDisplay = value.end ? value.end : lastEventDate

  return (
    <div className="date-window-slider" data-testid="date-window-slider">
      <div className="date-window-header">
        <span className="date-window-label">
          <span className="date-window-range-text">
            {formatRelative(startDisplay, todayStart)} – {formatRelative(endDisplay, todayStart)}
          </span>
          {typeof matchedCount === 'number' && typeof totalCount === 'number' && (
            <span className="date-window-count">
              {matchedCount} of {totalCount}
            </span>
          )}
        </span>
        <div className="date-window-presets">
          {presets.map(p => (
            <button
              key={p.key}
              type="button"
              className={`date-window-preset${p.key === 'all' && isAll ? ' active' : ''}`}
              onClick={() => applyPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="date-window-track-wrap">
        {!compact && histogram.maxCount > 0 && (
          <svg
            className="date-window-histogram"
            viewBox={`0 0 ${HISTOGRAM_BINS} 20`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {histogram.bins.map((count, i) => {
              const h = (count / histogram.maxCount) * 20
              const inWindow = (i / HISTOGRAM_BINS) * 100 >= startPct &&
                ((i + 1) / HISTOGRAM_BINS) * 100 <= endPct + 0.0001
              return (
                <rect
                  key={i}
                  x={i}
                  y={20 - h}
                  width={1}
                  height={h}
                  className={inWindow ? 'date-window-bar in' : 'date-window-bar out'}
                />
              )
            })}
          </svg>
        )}
        <div ref={trackRef} className="date-window-track">
          <div
            className="date-window-track-active"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
          <button
            type="button"
            className="date-window-handle date-window-handle-start"
            style={{ left: `${startPct}%` }}
            onPointerDown={handlePointerDown('start')}
            aria-label={`Start date: ${formatDateLabel(startDisplay)}`}
            aria-valuemin={minMs}
            aria-valuemax={endMs}
            aria-valuenow={startMs}
            role="slider"
          >
            <span className="date-window-handle-tooltip">{formatDateLabel(startDisplay)}</span>
          </button>
          <button
            type="button"
            className="date-window-handle date-window-handle-end"
            style={{ left: `${endPct}%` }}
            onPointerDown={handlePointerDown('end')}
            aria-label={`End date: ${formatDateLabel(endDisplay)}`}
            aria-valuemin={startMs}
            aria-valuemax={maxMs}
            aria-valuenow={endMs}
            role="slider"
          >
            <span className="date-window-handle-tooltip">{formatDateLabel(endDisplay)}</span>
          </button>
        </div>
      </div>
      <div className="date-window-axis">
        <span>{formatDateLabel(todayStart)}</span>
        <span>{formatDateLabel(lastEventDate)}</span>
      </div>
    </div>
  )
}
