/**
 * AttributionChips — renders attribution badges showing why an event appears
 * in the user's feed (favorited calendar, search filter, or geo filter).
 *
 * The CSS class is whitelisted to prevent injection via unknown attr.type values.
 */
export function AttributionChips({ attributions }) {
  if (!attributions?.length) return null
  return (
    <div className="event-attributions">
      {attributions.map((attr, i) => (
        <span
          key={`${attr.type}-${attr.value}-${i}`}
          className={`attribution-chip attribution-${['calendar','search','geo'].includes(attr.type) ? attr.type : 'unknown'}`}
        >
          {attr.type === 'calendar' ? '🗓️' : attr.type === 'search' ? '🔍' : '📍'}
          {' '}{attr.value}
        </span>
      ))}
    </div>
  )
}
