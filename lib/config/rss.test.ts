import { describe, it, expect } from "vitest";
import { toRSS, escapeXml } from "./rss.js";
import { RipperCalendar, RipperCalendarEvent } from "./schema.js";
import { ZonedDateTime, Duration } from "@js-joda/core";
import "@js-joda/timezone";

function makeEvent(
  overrides: Partial<RipperCalendarEvent> = {}
): RipperCalendarEvent {
  return {
    id: "test-1",
    ripped: new Date(),
    date: ZonedDateTime.parse(
      "2025-06-01T18:00:00-07:00[America/Los_Angeles]"
    ),
    duration: Duration.ofHours(2),
    summary: "Test Event",
    ...overrides,
  };
}

function makeCalendar(
  events: RipperCalendarEvent[],
  overrides: Partial<RipperCalendar> = {}
): RipperCalendar {
  return {
    name: "test-calendar",
    friendlyname: "Test Calendar",
    events,
    errors: [],
    tags: [],
    ...overrides,
  };
}

const BASE_OPTIONS = {
  baseUrl: "https://example.com/calendars/",
  friendlyLink: "https://example.com/events",
};

describe("escapeXml", () => {
  it("should escape all XML special characters", () => {
    expect(escapeXml('Tom & Jerry <"friends">')).toBe(
      "Tom &amp; Jerry &lt;&quot;friends&quot;&gt;"
    );
  });

  it("should handle strings with no special characters", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });

  it("should escape apostrophes", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });
});

describe("toRSS", () => {
  it("should generate valid RSS 2.0 XML structure", () => {
    const calendar = makeCalendar([makeEvent()]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain("xmlns:atom=");
    expect(rss).toContain("<channel>");
    expect(rss).toContain("</channel>");
    expect(rss).toContain("</rss>");
  });

  it("should include channel metadata", () => {
    const calendar = makeCalendar([makeEvent()]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("<title>Test Calendar</title>");
    expect(rss).toContain("<link>https://example.com/events</link>");
    expect(rss).toContain(
      "<description>Upcoming events for Test Calendar</description>"
    );
    expect(rss).toContain('<atom:link href="https://example.com/calendars/recurring-test-calendar.rss"');
    expect(rss).toContain('rel="self"');
    expect(rss).toContain('type="application/rss+xml"');
  });

  it("should include event items with correct fields", () => {
    const event = makeEvent({
      summary: "Concert Night",
      description: "Live music at the venue",
      location: "The Venue, 123 Main St",
      url: "https://example.com/concert",
    });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("<title>Concert Night</title>");
    expect(rss).toContain("Live music at the venue");
    expect(rss).toContain("The Venue, 123 Main St");
    expect(rss).toContain("<link>https://example.com/concert</link>");
    expect(rss).toContain("<pubDate>");
    expect(rss).toContain('<guid isPermaLink="false">');
  });

  it("should sort events by date ascending", () => {
    const early = makeEvent({
      id: "early",
      summary: "Early Event",
      date: ZonedDateTime.parse(
        "2025-06-01T10:00:00-07:00[America/Los_Angeles]"
      ),
    });
    const late = makeEvent({
      id: "late",
      summary: "Late Event",
      date: ZonedDateTime.parse(
        "2025-06-15T20:00:00-07:00[America/Los_Angeles]"
      ),
    });
    // Pass in reverse order
    const calendar = makeCalendar([late, early]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    const earlyIdx = rss.indexOf("Early Event");
    const lateIdx = rss.indexOf("Late Event");
    expect(earlyIdx).toBeLessThan(lateIdx);
  });

  it("should escape XML special characters in event data", () => {
    const event = makeEvent({
      summary: 'Tom & Jerry <Live "Show">',
      description: "Rock & Roll at <The Venue>",
      location: "Bar & Grill",
    });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain(
      "<title>Tom &amp; Jerry &lt;Live &quot;Show&quot;&gt;</title>"
    );
    // Description is in CDATA, but individual parts are escaped
    expect(rss).toContain("Rock &amp; Roll at &lt;The Venue&gt;");
    expect(rss).toContain("Bar &amp; Grill");
  });

  it("should fall back to friendlyLink when event has no URL", () => {
    const event = makeEvent({ url: undefined });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("<link>https://example.com/events</link>");
  });

  it("should fall back to baseUrl when no friendlyLink provided", () => {
    const event = makeEvent({ url: undefined });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, { baseUrl: "https://example.com/" });

    // Channel link uses baseUrl
    expect(rss).toContain("<link>https://example.com/</link>");
  });

  it("should include source attribution for aggregate feed events", () => {
    const event = makeEvent({
      sourceCalendar: "Stoup Brewing",
      sourceCalendarName: "stoup-brewing",
    });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("From Stoup Brewing");
  });

  it("should generate valid RSS with zero events", () => {
    const calendar = makeCalendar([]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("<channel>");
    expect(rss).toContain("</channel>");
    expect(rss).not.toContain("<item>");
  });

  it("should produce deterministic GUIDs for events with id", () => {
    const event = makeEvent({ id: "event-42" });
    const calendar = makeCalendar([event]);
    const rss1 = toRSS(calendar, BASE_OPTIONS);
    const rss2 = toRSS(calendar, BASE_OPTIONS);

    const guidRegex = /<guid isPermaLink="false">(.*?)<\/guid>/;
    const guid1 = rss1.match(guidRegex)?.[1];
    const guid2 = rss2.match(guidRegex)?.[1];
    expect(guid1).toBe(guid2);
    expect(guid1).toBe("test-calendar-event-42");
  });

  it("should produce deterministic GUIDs for events without id", () => {
    const event = makeEvent({ id: undefined, summary: "My Event" });
    const calendar = makeCalendar([event]);
    const rss1 = toRSS(calendar, BASE_OPTIONS);
    const rss2 = toRSS(calendar, BASE_OPTIONS);

    const guidRegex = /<guid isPermaLink="false">(.*?)<\/guid>/;
    const guid1 = rss1.match(guidRegex)?.[1];
    const guid2 = rss2.match(guidRegex)?.[1];
    expect(guid1).toBe(guid2);
    expect(guid1).toContain("test-calendar-");
  });

  it("should use ripper parent name in self-link when parent exists", () => {
    const calendar = makeCalendar([makeEvent()], {
      parent: {
        name: "stoup-brewing",
        friendlyLink: "https://stoup.com",
        description: "Stoup Brewing",
        url: new URL("https://stoup.com"),
        calendars: [],
        disabled: false,
        proxy: false,
        expectEmpty: false,
      } as any,
    });
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("stoup-brewing-test-calendar.rss");
  });

  it("should use tag prefix in self-link for tag calendars", () => {
    const calendar = makeCalendar([makeEvent()], {
      name: "tag-music",
    });
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("tag-music.rss");
  });

  it("should include event link as clickable link in description", () => {
    const event = makeEvent({
      url: "https://example.com/my-event",
    });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain('href="https://example.com/my-event"');
    expect(rss).toContain("Event details");
  });

  it("should not include event link in description when URL is not http", () => {
    const event = makeEvent({
      url: "not-a-url",
    });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).not.toContain("Event details");
  });

  it("should include location in description when present", () => {
    const event = makeEvent({
      location: "The Showbox, Seattle",
    });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("Location: The Showbox, Seattle");
  });

  it("should format date/time readably in description", () => {
    const event = makeEvent({
      date: ZonedDateTime.parse(
        "2025-06-01T18:00:00-07:00[America/Los_Angeles]"
      ),
    });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("Sunday, June 1, 2025 at 6 PM");
  });

  it("should include minutes in time when not on the hour", () => {
    const event = makeEvent({
      date: ZonedDateTime.parse(
        "2025-06-01T18:30:00-07:00[America/Los_Angeles]"
      ),
    });
    const calendar = makeCalendar([event]);
    const rss = toRSS(calendar, BASE_OPTIONS);

    expect(rss).toContain("6:30 PM");
  });
});
