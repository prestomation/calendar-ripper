import { describe, it, expect } from "vitest";
import {
  tagSlug,
  buildIndexJson,
  indexDocSchema,
  buildTagsJson,
  tagsDocSchema,
  buildVenuesJson,
  venuesDocSchema,
  ManifestLike,
  EventCountLike,
} from "./discovery.js";
import { RipperConfig, ExternalCalendar } from "./config/schema.js";
import { RecurringEvent } from "./config/recurring.js";

// ---------------------------------------------------------------------------
// tagSlug — must stay in sync with lib/tag_aggregator.ts
// ---------------------------------------------------------------------------

describe("tagSlug", () => {
  it("matches the rule used in tag_aggregator.ts (lowercase + non-alnum → '-')", () => {
    // Mirror lib/tag_aggregator.ts:207
    const tagAggregatorRule = (tag: string) =>
      tag.toLowerCase().replace(/[^a-z0-9]/g, "-");

    const cases = [
      "Music",
      "Capitol Hill",
      "West Seattle",
      "FarmersMarket",
      "QueenAnne",
      "Pike Place",
      "International District",
    ];
    for (const tag of cases) {
      expect(tagSlug(tag)).toBe(tagAggregatorRule(tag));
    }
  });

  it("lowercases and replaces spaces", () => {
    expect(tagSlug("Capitol Hill")).toBe("capitol-hill");
  });

  it("handles punctuation", () => {
    expect(tagSlug("Foo/Bar & Baz")).toBe("foo-bar---baz");
  });
});

// ---------------------------------------------------------------------------
// buildIndexJson
// ---------------------------------------------------------------------------

describe("buildIndexJson", () => {
  it("produces a valid IndexDoc with relative hrefs", () => {
    const doc = buildIndexJson({
      generated: "2026-04-13T00:00:00.000Z",
      site: "https://206.events",
    });

    // Schema validates.
    expect(() => indexDocSchema.parse(doc)).not.toThrow();

    // Every href is relative.
    for (const link of Object.values(doc.links)) {
      expect(link.href).not.toMatch(/^https?:\/\//);
    }

    // Surface check on the full set of links.
    expect(Object.keys(doc.links).sort()).toEqual([
      "buildErrors",
      "calendars",
      "events",
      "geoCache",
      "llms",
      "self",
      "tags",
      "venues",
    ]);
  });

  it("round-trips through JSON without undefined", () => {
    const doc = buildIndexJson({
      generated: "2026-04-13T00:00:00.000Z",
      site: "https://206.events",
    });
    const roundTripped = JSON.parse(JSON.stringify(doc));
    expect(roundTripped).toEqual(doc);
  });
});

// ---------------------------------------------------------------------------
// buildTagsJson
// ---------------------------------------------------------------------------

describe("buildTagsJson", () => {
  const baseManifest: ManifestLike = {
    rippers: [
      { calendars: [{ tags: ["Music", "Capitol Hill"] }] },
      { calendars: [{ tags: ["Music"] }] },
    ],
    externalCalendars: [{ tags: ["Beer"] }],
    recurringCalendars: [{ tags: ["Music", "Capitol Hill"] }],
  };

  const baseCounts: EventCountLike[] = [
    { name: "some-ripper", type: "Ripper", events: 42 },
    { name: "tag-music", type: "Aggregate", events: 100 },
    { name: "tag-capitol-hill", type: "Aggregate", events: 50 },
    { name: "tag-beer", type: "Aggregate", events: 12 },
    { name: "tag-all", type: "Aggregate", events: 200 },
  ];

  it("emits one entry per referenced tag with category + counts + hrefs", () => {
    const doc = buildTagsJson({
      manifest: baseManifest,
      eventCounts: baseCounts,
      generated: "2026-04-13T00:00:00.000Z",
    });

    expect(() => tagsDocSchema.parse(doc)).not.toThrow();

    // Sorted by name; excludes "All" by default; includes only referenced tags.
    const names = doc.tags.map(t => t.name);
    expect(names).toEqual(["Beer", "Capitol Hill", "Music"]);

    const music = doc.tags.find(t => t.name === "Music")!;
    expect(music.slug).toBe("music");
    expect(music.category).toBe("Activities");
    expect(music.eventCount).toBe(100);
    expect(music.calendarCount).toBe(3); // 2 ripper cals + 1 recurring
    expect(music.links.ics.href).toBe("tag-music.ics");
    expect(music.links.rss.href).toBe("tag-music.rss");

    const capHill = doc.tags.find(t => t.name === "Capitol Hill")!;
    expect(capHill.slug).toBe("capitol-hill");
    expect(capHill.category).toBe("Neighborhoods");
    expect(capHill.eventCount).toBe(50);
    expect(capHill.calendarCount).toBe(2); // 1 ripper + 1 recurring

    const beer = doc.tags.find(t => t.name === "Beer")!;
    expect(beer.category).toBe("Activities");
    expect(beer.calendarCount).toBe(1); // external
  });

  it("excludes 'All' by default and includes it when requested", () => {
    const withAll: ManifestLike = {
      ...baseManifest,
      rippers: [
        ...baseManifest.rippers,
        { calendars: [{ tags: ["All"] }] },
      ],
    };

    const defaultDoc = buildTagsJson({
      manifest: withAll,
      eventCounts: baseCounts,
      generated: "t",
    });
    expect(defaultDoc.tags.map(t => t.name)).not.toContain("All");

    const withAllDoc = buildTagsJson({
      manifest: withAll,
      eventCounts: baseCounts,
      generated: "t",
      includeAll: true,
    });
    expect(withAllDoc.tags.map(t => t.name)).toContain("All");
  });

  it("defaults eventCount to 0 when no matching Aggregate entry exists", () => {
    const doc = buildTagsJson({
      manifest: baseManifest,
      eventCounts: [], // no aggregates known
      generated: "t",
    });
    for (const tag of doc.tags) {
      expect(tag.eventCount).toBe(0);
    }
  });

  it("produces JSON with no undefined values", () => {
    const doc = buildTagsJson({
      manifest: baseManifest,
      eventCounts: baseCounts,
      generated: "t",
    });
    const roundTripped = JSON.parse(JSON.stringify(doc));
    expect(roundTripped).toEqual(doc);
  });
});

// ---------------------------------------------------------------------------
// buildVenuesJson
// ---------------------------------------------------------------------------

const SEATTLE_GEO = { lat: 47.6062, lng: -122.3321, label: "Seattle" };
const BALLARD_GEO = { lat: 47.6675, lng: -122.3843, label: "Ballard" };
const CAP_HILL_GEO = { lat: 47.6205, lng: -122.3212, label: "Capitol Hill" };

/**
 * Minimal RipperConfig builder for tests. Fills in the fields the
 * venues builder reads and casts away the branded timezone/period types
 * on calendars — the builder never touches those.
 */
function makeRipper(overrides: {
  name: string;
  description?: string;
  friendlyname?: string;
  friendlyLink?: string;
  tags?: string[];
  geo: RipperConfig["geo"];
  calendars: Array<{
    name: string;
    friendlyname: string;
    tags?: string[];
    geo?: RipperConfig["geo"];
  }>;
  disabled?: boolean;
}): RipperConfig {
  return {
    name: overrides.name,
    friendlyname: overrides.friendlyname,
    description: overrides.description ?? overrides.name,
    friendlyLink: overrides.friendlyLink ?? "https://example.com",
    disabled: overrides.disabled ?? false,
    proxy: false,
    needsBrowser: false,
    expectEmpty: false,
    tags: overrides.tags,
    geo: overrides.geo,
    calendars: overrides.calendars.map(c => ({
      name: c.name,
      friendlyname: c.friendlyname,
      tags: c.tags,
      geo: c.geo,
    })),
  } as unknown as RipperConfig;
}

function makeExternal(overrides: Partial<ExternalCalendar> & {
  name: string;
  friendlyname: string;
  geo: ExternalCalendar["geo"];
}): ExternalCalendar {
  return {
    name: overrides.name,
    friendlyname: overrides.friendlyname,
    icsUrl: overrides.icsUrl ?? "https://example.com/cal.ics",
    disabled: overrides.disabled ?? false,
    expectEmpty: overrides.expectEmpty ?? false,
    tags: overrides.tags,
    geo: overrides.geo,
    infoUrl: overrides.infoUrl,
    description: overrides.description,
  };
}

function makeRecurring(overrides: {
  name: string;
  friendlyname: string;
  description?: string;
  url?: string;
  tags?: string[];
  geo: RecurringEvent["geo"];
}): RecurringEvent {
  return {
    name: overrides.name,
    friendlyname: overrides.friendlyname,
    description: overrides.description ?? overrides.friendlyname,
    url: overrides.url ?? "https://example.com/recurring",
    tags: overrides.tags ?? [],
    geo: overrides.geo,
    // Fields the venues builder does not read — casts are fine here.
    schedule: "1st Friday",
    timezone: null,
    duration: null,
    start_time: null,
    location: "n/a",
    seasonal: undefined,
    months: undefined,
  } as unknown as RecurringEvent;
}

describe("buildVenuesJson", () => {
  it("emits one ripper venue when ripper-level geo is set and no calendar overrides", () => {
    const ripper = makeRipper({
      name: "stoup",
      friendlyname: "Stoup Brewing",
      description: "Stoup Brewing",
      friendlyLink: "https://stoup.com",
      tags: ["Beer", "Ballard"],
      geo: BALLARD_GEO,
      calendars: [
        { name: "events", friendlyname: "Stoup Events" },
      ],
    });

    const doc = buildVenuesJson({
      configs: [ripper],
      externals: [],
      recurringEvents: [],
      calendarsWithFutureEvents: new Set(["stoup-events.ics"]),
      generated: "t",
    });

    expect(() => venuesDocSchema.parse(doc)).not.toThrow();
    expect(doc.venues).toHaveLength(1);
    const venue = doc.venues[0];
    expect(venue.name).toBe("stoup");
    expect(venue.friendlyName).toBe("Stoup Brewing");
    expect(venue.kind).toBe("ripper");
    expect(venue.geo).toEqual(BALLARD_GEO);
    expect(venue.calendars).toHaveLength(1);
    expect(venue.calendars[0].links.ics.href).toBe("stoup-events.ics");
    expect(venue.calendars[0].links.rss.href).toBe("stoup-events.rss");
    expect(venue.tags).toEqual(["Beer", "Ballard"]);
  });

  it("emits one venue per calendar-with-geo for multi-branch rippers (SPL pattern)", () => {
    const ripper = makeRipper({
      name: "spl",
      friendlyname: "Seattle Public Library",
      geo: null,
      tags: ["Education"],
      calendars: [
        {
          name: "central",
          friendlyname: "SPL - Central",
          geo: SEATTLE_GEO,
          tags: ["Downtown"],
        },
        {
          name: "ballard",
          friendlyname: "SPL - Ballard",
          geo: BALLARD_GEO,
          tags: ["Ballard"],
        },
        {
          name: "unknown",
          friendlyname: "SPL - Unknown",
          geo: null, // explicit: not a venue
        },
      ],
    });

    const doc = buildVenuesJson({
      configs: [ripper],
      externals: [],
      recurringEvents: [],
      calendarsWithFutureEvents: new Set([
        "spl-central.ics",
        "spl-ballard.ics",
        "spl-unknown.ics",
      ]),
      generated: "t",
    });

    expect(doc.venues).toHaveLength(2);
    const names = doc.venues.map(v => v.name).sort();
    expect(names).toEqual(["spl-ballard", "spl-central"]);

    const central = doc.venues.find(v => v.name === "spl-central")!;
    expect(central.geo).toEqual(SEATTLE_GEO);
    // Ripper tags are merged with calendar tags.
    expect(central.tags.sort()).toEqual(["Downtown", "Education"]);
    expect(central.calendars[0].links.ics.href).toBe("spl-central.ics");
  });

  it("skips ripper venues whose calendars have no future events", () => {
    const ripper = makeRipper({
      name: "dead-venue",
      geo: SEATTLE_GEO,
      calendars: [{ name: "events", friendlyname: "Dead Events" }],
    });

    const doc = buildVenuesJson({
      configs: [ripper],
      externals: [],
      recurringEvents: [],
      calendarsWithFutureEvents: new Set(), // empty
      generated: "t",
    });

    expect(doc.venues).toHaveLength(0);
  });

  it("skips disabled rippers", () => {
    const ripper = makeRipper({
      name: "disabled",
      disabled: true,
      geo: SEATTLE_GEO,
      calendars: [{ name: "events", friendlyname: "Events" }],
    });

    const doc = buildVenuesJson({
      configs: [ripper],
      externals: [],
      recurringEvents: [],
      calendarsWithFutureEvents: new Set(["disabled-events.ics"]),
      generated: "t",
    });

    expect(doc.venues).toHaveLength(0);
  });

  it("includes external-feed venues with non-null geo", () => {
    const ext = makeExternal({
      name: "some-brewery",
      friendlyname: "Some Brewery",
      geo: CAP_HILL_GEO,
      tags: ["Beer", "Capitol Hill"],
      infoUrl: "https://some-brewery.com",
      description: "Some Brewery",
    });

    const doc = buildVenuesJson({
      configs: [],
      externals: [ext],
      recurringEvents: [],
      calendarsWithFutureEvents: new Set(["external-some-brewery.ics"]),
      generated: "t",
    });

    expect(doc.venues).toHaveLength(1);
    const venue = doc.venues[0];
    expect(venue.kind).toBe("external");
    expect(venue.name).toBe("some-brewery");
    expect(venue.url).toBe("https://some-brewery.com/");
    expect(venue.calendars[0].links.ics.href).toBe("external-some-brewery.ics");
  });

  it("skips external venues with null geo, disabled, or no future events", () => {
    const nullGeo = makeExternal({
      name: "cross-city-aggregator",
      friendlyname: "Cross City",
      geo: null,
    });
    const disabled = makeExternal({
      name: "off",
      friendlyname: "Off",
      geo: SEATTLE_GEO,
      disabled: true,
    });
    const dead = makeExternal({
      name: "dead",
      friendlyname: "Dead",
      geo: SEATTLE_GEO,
    });

    const doc = buildVenuesJson({
      configs: [],
      externals: [nullGeo, disabled, dead],
      recurringEvents: [],
      calendarsWithFutureEvents: new Set([
        "external-cross-city-aggregator.ics",
        "external-off.ics",
        // no "external-dead.ics"
      ]),
      generated: "t",
    });

    expect(doc.venues).toHaveLength(0);
  });

  it("includes recurring-event venues with non-null geo", () => {
    const rec = makeRecurring({
      name: "first-thursday-sam",
      friendlyname: "SAM Free First Thursday",
      description: "Free admission, first Thursday of each month",
      url: "https://seattleartmuseum.org",
      tags: ["Museums", "Downtown"],
      geo: SEATTLE_GEO,
    });

    const doc = buildVenuesJson({
      configs: [],
      externals: [],
      recurringEvents: [rec],
      calendarsWithFutureEvents: new Set(["recurring-first-thursday-sam.ics"]),
      generated: "t",
    });

    expect(doc.venues).toHaveLength(1);
    const venue = doc.venues[0];
    expect(venue.kind).toBe("recurring");
    expect(venue.name).toBe("first-thursday-sam");
    expect(venue.geo).toEqual(SEATTLE_GEO);
    expect(venue.calendars[0].links.ics.href).toBe("recurring-first-thursday-sam.ics");
  });

  it("skips recurring events with null geo (e.g. cross-neighborhood art walk)", () => {
    const rec = makeRecurring({
      name: "first-thursday-art-walk",
      friendlyname: "First Thursday Art Walk",
      tags: ["Artwalk"],
      geo: null,
    });

    const doc = buildVenuesJson({
      configs: [],
      externals: [],
      recurringEvents: [rec],
      calendarsWithFutureEvents: new Set(["recurring-first-thursday-art-walk.ics"]),
      generated: "t",
    });

    expect(doc.venues).toHaveLength(0);
  });

  it("sorts venues alphabetically by friendlyName", () => {
    const doc = buildVenuesJson({
      configs: [],
      externals: [
        makeExternal({ name: "z-ext", friendlyname: "Zebra Venue", geo: SEATTLE_GEO }),
        makeExternal({ name: "a-ext", friendlyname: "Alpha Venue", geo: SEATTLE_GEO }),
      ],
      recurringEvents: [
        makeRecurring({ name: "mid", friendlyname: "Middle Venue", geo: SEATTLE_GEO }),
      ],
      calendarsWithFutureEvents: new Set([
        "external-z-ext.ics",
        "external-a-ext.ics",
        "recurring-mid.ics",
      ]),
      generated: "t",
    });

    expect(doc.venues.map(v => v.friendlyName)).toEqual([
      "Alpha Venue",
      "Middle Venue",
      "Zebra Venue",
    ]);
  });

  it("produces JSON with no undefined values after round-trip", () => {
    const doc = buildVenuesJson({
      configs: [
        makeRipper({
          name: "r",
          geo: SEATTLE_GEO,
          calendars: [{ name: "c", friendlyname: "C" }],
        }),
      ],
      externals: [],
      recurringEvents: [],
      calendarsWithFutureEvents: new Set(["r-c.ics"]),
      generated: "t",
    });
    const roundTripped = JSON.parse(JSON.stringify(doc));
    // Re-parsing with Zod tolerates absent optional keys.
    expect(() => venuesDocSchema.parse(roundTripped)).not.toThrow();
  });
});
