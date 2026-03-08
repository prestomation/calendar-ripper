import { RipperCalendar, RipperCalendarEvent } from "./schema.js";
import { ZoneOffset, DayOfWeek } from "@js-joda/core";

/**
 * Escape special XML characters in text content.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert a ZonedDateTime to an RFC 2822 date string for RSS <pubDate>.
 */
function toRFC2822(event: RipperCalendarEvent): string {
  const utc = event.date.withZoneSameInstant(ZoneOffset.UTC);
  const jsDate = new Date(
    Date.UTC(
      utc.year(),
      utc.monthValue() - 1,
      utc.dayOfMonth(),
      utc.hour(),
      utc.minute(),
      utc.second()
    )
  );
  return jsDate.toUTCString();
}

/**
 * Format event date/time for human-readable display in RSS description.
 * Uses the event's local date/time (not UTC).
 */
function formatDateTime(event: RipperCalendarEvent): string {
  const d = event.date;
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  // DayOfWeek in js-joda: 1=Monday ... 7=Sunday
  const dayOfWeek = days[d.dayOfWeek().value() - 1];
  const month = months[d.monthValue() - 1];
  const hour = d.hour();
  const minute = d.minute();
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const minuteStr = minute > 0 ? `:${String(minute).padStart(2, "0")}` : "";
  return `${dayOfWeek}, ${month} ${d.dayOfMonth()}, ${d.year()} at ${hour12}${minuteStr} ${ampm}`;
}

/**
 * Generate a deterministic GUID for an event.
 */
function eventGuid(calendarName: string, event: RipperCalendarEvent): string {
  if (event.id) {
    return `${calendarName}-${event.id}`;
  }
  const epoch = event.date.withZoneSameInstant(ZoneOffset.UTC).toEpochSecond();
  return `${calendarName}-${epoch}-${event.summary}`;
}

/**
 * Build the HTML description content for an RSS item.
 */
function buildDescription(event: RipperCalendarEvent, friendlyLink?: string): string {
  const parts: string[] = [];
  parts.push(`<p><strong>${escapeXml(formatDateTime(event))}</strong></p>`);
  if (event.location) {
    parts.push(`<p>Location: ${escapeXml(event.location)}</p>`);
  }
  if (event.description) {
    parts.push(`<p>${escapeXml(event.description)}</p>`);
  }
  if (event.sourceCalendar) {
    parts.push(`<p><em>From ${escapeXml(event.sourceCalendar)}</em></p>`);
  }
  if (event.url && event.url.startsWith("http")) {
    parts.push(`<p><a href="${escapeXml(event.url)}">Event details</a></p>`);
  }
  return parts.join("\n");
}

/**
 * Generate an RSS 2.0 feed from a RipperCalendar.
 *
 * @param calendar - The calendar to convert
 * @param options.baseUrl - Base URL of the deployed site (for self-link and fallback link)
 * @param options.friendlyLink - Optional human-friendly URL for the channel link
 */
export function toRSS(
  calendar: RipperCalendar,
  options: { baseUrl: string; friendlyLink?: string }
): string {
  const { baseUrl, friendlyLink } = options;

  // Determine the RSS file name for the self-link
  const rssFileName = calendar.parent
    ? `${calendar.parent.name}-${calendar.name}.rss`
    : calendar.name.startsWith("tag-")
      ? `${calendar.name}.rss`
      : `recurring-${calendar.name}.rss`;

  const selfUrl = `${baseUrl.replace(/\/$/, "")}/${rssFileName}`;
  const channelLink = friendlyLink || baseUrl;

  // Sort events by date ascending
  const sortedEvents = [...calendar.events].sort((a, b) => {
    const aEpoch = a.date.withZoneSameInstant(ZoneOffset.UTC).toEpochSecond();
    const bEpoch = b.date.withZoneSameInstant(ZoneOffset.UTC).toEpochSecond();
    return aEpoch - bEpoch;
  });

  const items = sortedEvents.map((event) => {
    const link = (event.url && event.url.startsWith("http")) ? event.url : (friendlyLink || baseUrl);
    const description = buildDescription(event, friendlyLink);
    const guid = eventGuid(calendar.name, event);
    const pubDate = toRFC2822(event);

    return `    <item>
      <title>${escapeXml(event.summary)}</title>
      <description><![CDATA[${description}]]></description>
      <link>${escapeXml(link)}</link>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
    </item>`;
  });

  const lastBuildDate = new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(calendar.friendlyname)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>Upcoming events for ${escapeXml(calendar.friendlyname)}</description>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>`;
}
