export function mergeIcsFiles(icsContents: string[]): string {
  const seenUids = new Set<string>()
  const eventBlocks: string[] = []

  for (const ics of icsContents) {
    // Extract calendar name from X-WR-CALNAME header for source identification
    const calNameMatch = ics.match(/^X-WR-CALNAME:(.+)$/m)
    const calName = calNameMatch ? calNameMatch[1].trim() : null

    const events = ics.split('BEGIN:VEVENT')
    for (let i = 1; i < events.length; i++) {
      const block = events[i].split('END:VEVENT')[0]
      const uidMatch = block.match(/^UID:(.+)$/m)
      const uid = uidMatch ? uidMatch[1].trim() : null

      if (uid && seenUids.has(uid)) continue
      if (uid) seenUids.add(uid)

      // Inject source identification if we know the calendar name
      // and the event doesn't already have X-CALRIPPER-SOURCE (tag aggregates already have it)
      let enrichedBlock = block
      if (calName && !block.includes('X-CALRIPPER-SOURCE:')) {
        enrichedBlock = `\r\nX-CALRIPPER-SOURCE:${calName}\r\nCATEGORIES:${calName}${block}`

        // Append calendar name to event description
        const descRegex = /^(DESCRIPTION:.*(?:\r?\n[ \t].*)*)/m
        if (descRegex.test(enrichedBlock)) {
          enrichedBlock = enrichedBlock.replace(descRegex, `$1\\n\\nFrom ${calName}`)
        } else {
          enrichedBlock += `DESCRIPTION:From ${calName}\r\n`
        }
      }

      eventBlocks.push(`BEGIN:VEVENT${enrichedBlock}END:VEVENT`)
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
