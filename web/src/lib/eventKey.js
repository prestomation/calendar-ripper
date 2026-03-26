/**
 * Composite key for deduplicating events across attribution maps and filter sets.
 * Used in App.jsx, EventsMap.jsx, and filter-parity tests.
 */
export const eventKey = (event) => `${event.summary}|${event.date}`
