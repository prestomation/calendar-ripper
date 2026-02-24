export function mergeIcsFiles(icsContents: string[]): string {
  const seenUids = new Set<string>()
  const eventBlocks: string[] = []

  for (const ics of icsContents) {
    const events = ics.split('BEGIN:VEVENT')
    for (let i = 1; i < events.length; i++) {
      const block = events[i].split('END:VEVENT')[0]
      const uidMatch = block.match(/^UID:(.+)$/m)
      const uid = uidMatch ? uidMatch[1].trim() : null

      if (uid && seenUids.has(uid)) continue
      if (uid) seenUids.add(uid)

      eventBlocks.push(`BEGIN:VEVENT${block}END:VEVENT`)
    }
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendar Ripper//Favorites//EN',
    'X-WR-CALNAME:Seattle Calendar Ripper — Favorites',
    ...eventBlocks,
    'END:VCALENDAR',
  ]

  return lines.join('\r\n')
}
