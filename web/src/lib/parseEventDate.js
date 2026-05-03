/**
 * Parses an event's `date`/`endDate` strings emitted by the build (js-joda format
 * with optional `[IANA_TZ]` suffix, e.g. "2026-02-15T19:00-08:00[America/Los_Angeles]").
 *
 * Returns { parsedDate, parsedEndDate, eventTimezone } with millisecond-accurate
 * Date objects, or null parsedDate if the start date can't be parsed.
 */
export function parseEventDate(event) {
  if (!event?.date) return { parsedDate: null, parsedEndDate: null, eventTimezone: undefined }
  const tzMatch = event.date.match(/\[(.+)\]$/)
  const eventTimezone = tzMatch ? tzMatch[1] : undefined
  const dateStr = event.date.replace(/\[.*\]$/, '')
  const parsed = new Date(dateStr)
  if (isNaN(parsed.getTime())) return { parsedDate: null, parsedEndDate: null, eventTimezone }
  let parsedEndDate = null
  if (event.endDate) {
    const endDateStr = event.endDate.replace(/\[.*\]$/, '')
    const parsedEnd = new Date(endDateStr)
    if (!isNaN(parsedEnd.getTime())) parsedEndDate = parsedEnd
  }
  return { parsedDate: parsed, parsedEndDate, eventTimezone }
}
