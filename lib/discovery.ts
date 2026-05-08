import { z } from "zod";
import {
  RipperConfig,
  ExternalCalendar,
  Geo,
  OSM_CHECKED_COOLDOWN_DAYS,
  geoSchema,
} from "./config/schema.js";
import { RecurringEvent } from "./config/recurring.js";
import { categoryFor } from "./config/tags.js";

/**
 * Discovery API — HATEOAS-style data files that let programmatic consumers
 * (LLMs, scripts, downstream apps) enumerate everything the build publishes
 * starting from a single `index.json`.
 *
 * See `docs/design-discovery-api.md` for the design rationale.
 *
 * Everything in this module is pure: inputs in, JSON-serializable doc out.
 * No filesystem or network access — that lives in the caller in
 * `lib/calendar_ripper.ts`.
 */

// -----------------------------------------------------------------------------
// Shared primitives
// -----------------------------------------------------------------------------

/**
 * Slugify a tag for use in aggregate-feed filenames (`tag-<slug>.ics`).
 * MUST match the rule in `lib/tag_aggregator.ts` exactly — this is part of
 * the Discovery API contract and the post-build test asserts parity.
 */
export function tagSlug(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

const linkSchema = z.object({
  href: z.string().refine(
    h => !/^https?:\/\//i.test(h),
    "href must be relative (no http:// or https:// prefix)",
  ),
  type: z.string().optional(),
});

export type Link = z.infer<typeof linkSchema>;

// -----------------------------------------------------------------------------
// index.json — the entry point
// -----------------------------------------------------------------------------

export const indexDocSchema = z.object({
  generated: z.string(),
  site: z.string().url(),
  links: z.object({
    self: linkSchema,
    llms: linkSchema,
    tags: linkSchema,
    venues: linkSchema,
    calendars: linkSchema,
    events: linkSchema,
    buildErrors: linkSchema,
    geoCache: linkSchema,
  }),
});

export type IndexDoc = z.infer<typeof indexDocSchema>;

export function buildIndexJson(opts: { generated: string; site: string }): IndexDoc {
  return {
    generated: opts.generated,
    site: opts.site,
    links: {
      self: { href: "index.json", type: "application/json" },
      llms: { href: "llms.txt", type: "text/plain" },
      tags: { href: "tags.json", type: "application/json" },
      venues: { href: "venues.json", type: "application/json" },
      calendars: { href: "manifest.json", type: "application/json" },
      events: { href: "events-index.json", type: "application/json" },
      buildErrors: { href: "build-errors.json", type: "application/json" },
      geoCache: { href: "geo-cache.json", type: "application/json" },
    },
  };
}

// -----------------------------------------------------------------------------
// tags.json
// -----------------------------------------------------------------------------

export const tagEntrySchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: z.string(),
  eventCount: z.number().int().nonnegative(),
  calendarCount: z.number().int().nonnegative(),
  links: z.object({
    ics: linkSchema,
    rss: linkSchema,
  }),
});

export const tagsDocSchema = z.object({
  generated: z.string(),
  tags: z.array(tagEntrySchema),
});

export type TagEntry = z.infer<typeof tagEntrySchema>;
export type TagsDoc = z.infer<typeof tagsDocSchema>;

/**
 * Shape matching the object built around line 825 of `calendar_ripper.ts`.
 * We accept a minimal subset rather than importing a full manifest type so
 * this module stays easy to unit-test.
 */
export interface ManifestLike {
  rippers: Array<{ calendars: Array<{ tags: string[] }> }>;
  recurringCalendars: Array<{ tags: string[] }>;
  externalCalendars: Array<{ tags: string[] }>;
}

export interface EventCountLike {
  name: string;
  type: string;
  events: number;
}

/**
 * Build the `tags.json` document.
 *
 * @param manifest      Manifest-like struct to count calendars per tag.
 * @param eventCounts   Per-calendar event counts, including aggregate
 *                      `tag-<slug>` entries (that's where the deduplicated
 *                      per-tag event count comes from).
 * @param generated     ISO timestamp for the `generated` field.
 * @param includeAll    Whether to include the synthetic "All" tag. Default
 *                      false — the "All" aggregate feed is mostly a UI
 *                      convenience, not a discovery target.
 */
export function buildTagsJson(opts: {
  manifest: ManifestLike;
  eventCounts: EventCountLike[];
  generated: string;
  includeAll?: boolean;
}): TagsDoc {
  const { manifest, eventCounts, generated, includeAll = false } = opts;

  // Count how many calendars reference each tag across the manifest.
  const calendarCountPerTag = new Map<string, number>();
  const bump = (tag: string) => calendarCountPerTag.set(tag, (calendarCountPerTag.get(tag) ?? 0) + 1);
  for (const ripper of manifest.rippers) {
    for (const calendar of ripper.calendars) {
      for (const tag of calendar.tags) bump(tag);
    }
  }
  for (const calendar of manifest.recurringCalendars) {
    for (const tag of calendar.tags) bump(tag);
  }
  for (const calendar of manifest.externalCalendars) {
    for (const tag of calendar.tags) bump(tag);
  }

  // Look up each tag's deduplicated event count in the aggregate calendar.
  const aggregateCount = new Map<string, number>();
  for (const entry of eventCounts) {
    if (entry.type === "Aggregate" && entry.name.startsWith("tag-")) {
      aggregateCount.set(entry.name, entry.events);
    }
  }

  // Emit one entry per tag that's actually used by a calendar. Tags don't
  // need to be pre-registered — the build derives the tag universe from
  // the configs themselves.
  const tagsToEmit = [...calendarCountPerTag.keys()].filter(tag => {
    if (!includeAll && tag === "All") return false;
    return true;
  });

  const entries: TagEntry[] = tagsToEmit
    .map(tag => {
      const slug = tagSlug(tag);
      const aggregateName = `tag-${slug}`;
      return {
        name: tag,
        slug,
        category: categoryFor(tag),
        eventCount: aggregateCount.get(aggregateName) ?? 0,
        calendarCount: calendarCountPerTag.get(tag) ?? 0,
        links: {
          ics: { href: `${aggregateName}.ics`, type: "text/calendar" },
          rss: { href: `${aggregateName}.rss`, type: "application/rss+xml" },
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { generated, tags: entries };
}

// -----------------------------------------------------------------------------
// venues.json
// -----------------------------------------------------------------------------

export const venueCalendarSchema = z.object({
  name: z.string(),
  friendlyName: z.string(),
  links: z.object({
    ics: linkSchema,
    rss: linkSchema,
  }),
});

export const venueEntrySchema = z.object({
  name: z.string(),
  friendlyName: z.string(),
  description: z.string(),
  url: z.string().url().optional(),
  tags: z.array(z.string()),
  geo: geoSchema,
  kind: z.enum(["ripper", "external", "recurring"]),
  calendars: z.array(venueCalendarSchema),
});

export const venuesDocSchema = z.object({
  generated: z.string(),
  venues: z.array(venueEntrySchema),
});

export type VenueCalendar = z.infer<typeof venueCalendarSchema>;
export type VenueEntry = z.infer<typeof venueEntrySchema>;
export type VenuesDoc = z.infer<typeof venuesDocSchema>;

/**
 * Build the `venues.json` document.
 *
 * A source appears in venues.json iff its declared `geo` is non-null. The
 * way we get events (ripper, recurring, external feed) is orthogonal to
 * whether the source is a venue.
 *
 * For rippers, each calendar can optionally declare its own `geo` which
 * overrides the ripper-level default — a multi-branch source like SPL may
 * declare ripper `geo: null` and provide a branch-level `geo` per calendar.
 * Each branch-with-geo becomes its own venue entry.
 */
export function buildVenuesJson(opts: {
  configs: RipperConfig[];
  externals: ExternalCalendar[];
  recurringEvents: RecurringEvent[];
  calendarsWithFutureEvents: Set<string>;
  generated: string;
}): VenuesDoc {
  const {
    configs,
    externals,
    recurringEvents,
    calendarsWithFutureEvents,
    generated,
  } = opts;

  const venues: VenueEntry[] = [];

  // --- Rippers ------------------------------------------------------------
  for (const ripper of configs) {
    if (ripper.disabled) continue;

    // Classify calendars by what `geo` resolves to after inheritance.
    // A ripper produces venue entries in two shapes:
    //   1. Ripper-level geo set → one venue, with all its calendars.
    //   2. Calendar-level geos set → one venue per calendar-with-geo
    //      (useful for multi-branch rippers like SPL).
    const ripperGeo = ripper.geo;
    const anyCalendarHasOwnGeo = ripper.calendars.some(
      c => c.geo !== undefined && c.geo !== null,
    );

    if (ripperGeo && !anyCalendarHasOwnGeo) {
      // Single venue, covering all live calendars for this ripper.
      const liveCalendars = ripper.calendars.filter(c =>
        calendarsWithFutureEvents.has(`${ripper.name}-${c.name}.ics`),
      );
      if (liveCalendars.length === 0) continue;

      venues.push({
        name: ripper.name,
        friendlyName: ripper.friendlyname ?? ripper.description ?? ripper.name,
        description: ripper.description,
        url: safeUrlString(ripper.friendlyLink),
        tags: dedupe([...(ripper.tags ?? [])]),
        geo: ripperGeo,
        kind: "ripper",
        calendars: liveCalendars.map(c => ({
          name: c.name,
          friendlyName: c.friendlyname,
          links: {
            ics: { href: `${ripper.name}-${c.name}.ics`, type: "text/calendar" },
            rss: { href: `${ripper.name}-${c.name}.rss`, type: "application/rss+xml" },
          },
        })),
      });
      continue;
    }

    // Otherwise: emit one venue per calendar that resolves to a non-null geo.
    for (const calendar of ripper.calendars) {
      const resolvedGeo =
        calendar.geo !== undefined ? calendar.geo : ripperGeo;
      if (!resolvedGeo) continue;
      if (!calendarsWithFutureEvents.has(`${ripper.name}-${calendar.name}.ics`)) continue;

      venues.push({
        name: `${ripper.name}-${calendar.name}`,
        friendlyName: calendar.friendlyname,
        description: ripper.description,
        url: safeUrlString(ripper.friendlyLink),
        tags: dedupe([...(ripper.tags ?? []), ...(calendar.tags ?? [])]),
        geo: resolvedGeo,
        kind: "ripper",
        calendars: [
          {
            name: calendar.name,
            friendlyName: calendar.friendlyname,
            links: {
              ics: { href: `${ripper.name}-${calendar.name}.ics`, type: "text/calendar" },
              rss: { href: `${ripper.name}-${calendar.name}.rss`, type: "application/rss+xml" },
            },
          },
        ],
      });
    }
  }

  // --- External feeds -----------------------------------------------------
  for (const ext of externals) {
    if (ext.disabled) continue;
    if (!ext.geo) continue;
    if (!calendarsWithFutureEvents.has(`external-${ext.name}.ics`)) continue;

    venues.push({
      name: ext.name,
      friendlyName: ext.friendlyname,
      description: ext.description ?? ext.friendlyname,
      url: safeUrlString(ext.infoUrl),
      tags: dedupe([...(ext.tags ?? [])]),
      geo: ext.geo,
      kind: "external",
      calendars: [
        {
          name: ext.name,
          friendlyName: ext.friendlyname,
          links: {
            ics: { href: `external-${ext.name}.ics`, type: "text/calendar" },
            rss: { href: `external-${ext.name}.rss`, type: "application/rss+xml" },
          },
        },
      ],
    });
  }

  // --- Recurring events ---------------------------------------------------
  for (const event of recurringEvents) {
    if (!event.geo) continue;
    if (!calendarsWithFutureEvents.has(`recurring-${event.name}.ics`)) continue;

    venues.push({
      name: event.name,
      friendlyName: event.friendlyname,
      description: event.description,
      url: safeUrlString(event.url),
      tags: dedupe([...(event.tags ?? [])]),
      geo: event.geo,
      kind: "recurring",
      calendars: [
        {
          name: event.name,
          friendlyName: event.friendlyname,
          links: {
            ics: { href: `recurring-${event.name}.ics`, type: "text/calendar" },
            rss: { href: `recurring-${event.name}.rss`, type: "application/rss+xml" },
          },
        },
      ],
    });
  }

  venues.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
  return { generated, venues };
}

// -----------------------------------------------------------------------------
// osmGaps — venues whose geo is populated but missing an OSM feature id
// -----------------------------------------------------------------------------

export const osmGapSchema = z.object({
  source: z.enum(["ripper", "external", "recurring"]),
  name: z.string(),
  label: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
});

export type OsmGap = z.infer<typeof osmGapSchema>;

/**
 * Enumerate every declared `geo` block that has coords but no OSM feature
 * identity. Consumers (notably the osm-resolver daily skill) use this to
 * know which venues to try to reconcile against OpenStreetMap.
 *
 * A source appears here iff:
 *   - it has coords declared (lat+lng numeric), AND
 *   - either osmId or osmType is missing (Zod enforces both-or-neither
 *     on the source YAMLs, so in practice this means both are missing), AND
 *   - it is not currently silenced by a recent `osmChecked` marker
 *     (Tier D/F rejections cool down for OSM_CHECKED_COOLDOWN_DAYS so the
 *     same wrong matches don't re-propose every run).
 *
 * Ripper-level geo and per-calendar geo overrides are both enumerated;
 * for multi-branch sources like SPL that set calendar-level geo, each
 * branch becomes its own gap entry.
 *
 * @param opts.now Optional reference date for the cooldown window.
 *                 Defaults to "today" — exposed so tests can pin time.
 */
export function buildOsmGaps(opts: {
  configs: RipperConfig[];
  externals: ExternalCalendar[];
  recurringEvents: RecurringEvent[];
  now?: Date;
}): OsmGap[] {
  const gaps: OsmGap[] = [];
  const referenceDate = opts.now ?? new Date();

  const isGap = (geo: Geo | null | undefined): boolean => {
    if (!geo) return false;
    if (geo.osmId !== undefined && geo.osmType !== undefined) return false;
    if (isOsmCheckedFresh(geo.osmChecked, referenceDate)) return false;
    return true;
  };

  for (const ripper of opts.configs) {
    if (ripper.disabled) continue;
    const ripperGeo = ripper.geo;
    const anyCalendarHasOwnGeo = ripper.calendars.some(c => c.geo !== undefined && c.geo !== null);

    if (ripperGeo && !anyCalendarHasOwnGeo) {
      if (isGap(ripperGeo)) {
        gaps.push({
          source: "ripper",
          name: ripper.name,
          label: ripperGeo.label,
          lat: ripperGeo.lat,
          lng: ripperGeo.lng,
        });
      }
      continue;
    }
    for (const calendar of ripper.calendars) {
      const resolvedGeo = calendar.geo !== undefined ? calendar.geo : ripperGeo;
      if (!resolvedGeo) continue;
      if (!isGap(resolvedGeo)) continue;
      gaps.push({
        source: "ripper",
        name: `${ripper.name}/${calendar.name}`,
        label: resolvedGeo.label,
        lat: resolvedGeo.lat,
        lng: resolvedGeo.lng,
      });
    }
  }

  for (const ext of opts.externals) {
    if (ext.disabled) continue;
    if (!ext.geo) continue;
    if (!isGap(ext.geo)) continue;
    gaps.push({
      source: "external",
      name: ext.name,
      label: ext.geo.label,
      lat: ext.geo.lat,
      lng: ext.geo.lng,
    });
  }

  for (const event of opts.recurringEvents) {
    if (!event.geo) continue;
    if (!isGap(event.geo)) continue;
    gaps.push({
      source: "recurring",
      name: event.name,
      label: event.geo.label,
      lat: event.geo.lat,
      lng: event.geo.lng,
    });
  }

  gaps.sort((a, b) => a.name.localeCompare(b.name));
  return gaps;
}

/**
 * Return true if `osmChecked` is set to a date within the last
 * OSM_CHECKED_COOLDOWN_DAYS days of `referenceDate`. Malformed values are
 * treated as not-fresh so a typo can't permanently silence a venue.
 *
 * Exported for unit tests; the schema guarantees a YYYY-MM-DD string here.
 */
export function isOsmCheckedFresh(
  osmChecked: string | undefined,
  referenceDate: Date,
): boolean {
  if (!osmChecked) return false;
  const checked = Date.parse(`${osmChecked}T00:00:00Z`);
  if (Number.isNaN(checked)) return false;
  const ageMs = referenceDate.getTime() - checked;
  if (ageMs < 0) return true; // future date — treat as fresh, don't re-propose
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return ageDays < OSM_CHECKED_COOLDOWN_DAYS;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function safeUrlString(u: unknown): string | undefined {
  if (typeof u !== "string" || u.length === 0) return undefined;
  try {
    return new URL(u).toString();
  } catch {
    return undefined;
  }
}
