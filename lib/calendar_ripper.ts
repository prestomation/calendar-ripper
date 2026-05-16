import { RipperLoader } from "./config/loader.js";
import { writeFile, mkdir, readFile, appendFile } from "fs/promises";
import {
  RipperConfig,
  RipperError,
  GeocodeError,
  UncertaintyError,
  toICS,
  externalConfigSchema,
  ExternalConfig,
  ExternalCalendar,
  RipperCalendar,
  serializeRipperErrors,
  serializeRipperError,
} from "./config/schema.js";
import { loadGeoCache, saveGeoCache, resolveEventCoords } from "./geocoder.js";
import {
  loadUncertaintyCache,
  saveUncertaintyCache,
} from "./event-uncertainty-cache.js";
import {
  applyUncertaintyResolutions,
  type UncertaintyMergeStats,
} from "./uncertainty-merge.js";
import { toRSS } from "./config/rss.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  prepareTaggedCalendars,
  prepareTaggedExternalCalendars,
  createAggregateCalendars,
  collectAllTags,
  parseExternalCalendarEvents,
  TaggedCalendar,
  TaggedExternalCalendar,
} from "./tag_aggregator.js";
import { RecurringEventProcessor } from "./config/recurring.js";
import { loadYamlDir } from "./config/dir-loader.js";
import { LocalDate } from "@js-joda/core";
import { detectTagDuplicates } from "./config/tags.js";
import {
  buildIndexJson,
  buildTagsJson,
  buildVenuesJson,
  buildOsmGaps,
} from "./discovery.js";
// @ts-ignore — ical.js has no type declarations
import ICAL from "ical.js";

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SITE_BASE_URL = process.env.SITE_BASE_URL || "https://206.events/";

/**
 * Check if ICS content contains any events with a start date on or after today.
 * Uses ical.js to properly handle recurring events (RRULE expansion).
 */
export function hasFutureEventsInICS(icsContent: string, today?: Date): boolean {
  const now = today ?? new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maxDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  try {
    const jcalData = ICAL.parse(icsContent);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents("vevent");

    for (const vevent of vevents) {
      const rrule = vevent.getFirstProperty("rrule");

      if (rrule) {
        // Recurring event — expand instances to check for future occurrences
        try {
          const expand = new ICAL.RecurExpansion({
            component: vevent,
            dtstart: vevent.getFirstPropertyValue("dtstart"),
          });

          let next;
          let instanceCount = 0;
          while (instanceCount < 10000 && (next = expand.next())) {
            const startDate = next.toJSDate();
            if (startDate >= todayStart) return true;
            if (startDate > maxDate) break;
            instanceCount++;
          }
        } catch {
          // If RRULE expansion fails, fall back to checking DTSTART directly
          const event = new ICAL.Event(vevent);
          if (event.startDate?.toJSDate() >= todayStart) return true;
        }
      } else {
        // Single event — check DTSTART
        const event = new ICAL.Event(vevent);
        const startDate = event.startDate?.toJSDate();
        if (startDate && startDate >= todayStart) return true;
      }
    }
  } catch {
    // If ical.js parsing fails entirely, return false (calendar is malformed)
    return false;
  }

  return false;
}

interface CalendarOutput {
  friendlyName: string;
  icsPath: string;
  errorsPath: string;
  errorCount: number;
  tags: string[]
}

const generateRecurringCalendarList = (calendars: RipperCalendar[]) => {
  if (calendars.length === 0) return "";

  const calendarItems = calendars
    .map((calendar) => {
      const webcalUrl = `webcal://localhost:8000/recurring-${calendar.name}.ics`;
      const httpUrl = `recurring-${calendar.name}.ics`;
      const errorsUrl = `recurring-${calendar.name}-errors.txt`;
      
      const tagsHtml = calendar.tags && calendar.tags.length > 0
        ? `<div class="calendar-tags">${calendar.tags
            .map((tag) => `<span class="tag">${tag}</span>`)
            .join(" ")}</div>`
        : "";

      return `
        <li>
          <strong>${calendar.friendlyname}</strong> 
          (<a href="${httpUrl}">Download</a> | 
          <a href="${webcalUrl}">Subscribe</a> | 
          <a href="${errorsUrl}">Errors</a>)
          ${tagsHtml}
          <div class="event-count">${calendar.events.length} events</div>
        </li>`;
    })
    .join("");

  return `
    <div class="ripper-section">
      <h2>Recurring Events</h2>
      <p>Regular events like art walks that occur on predictable schedules</p>
      <ul>
        ${calendarItems}
      </ul>
    </div>`;
};

const generateCalendarList = (
  ripper: RipperConfig,
  outputs: CalendarOutput[],
  calendarTags: Map<string, string[]>
) => {
  // Get ripper-level tags
  const ripperTagsArray = ripper.tags || [];
  const ripperTagsHtml =
    ripperTagsArray.length > 0
      ? `<div class="ripper-tags">${ripperTagsArray
          .map((tag) => `<span class="tag">${tag}</span>`)
          .join(" ")}</div>`
      : "";

  const toc = outputs
    .map((calendar) => {
      // Create a webcal link by replacing http with webcal
      // Since we don't know the actual host, we'll use a relative path that works with the server
      const webcalLink = `webcal://REPLACE_WITH_BASE${calendar.icsPath}`;
      const fullIcsLink = `https://REPLACE_WITH_BASE${calendar.icsPath}`;

      // Get calendar-specific tags
      const calendarKey = `${ripper.name}-${
        calendar.icsPath.split("-")[1].split(".")[0]
      }`;
      const calendarTagsHtml =
        calendar.tags.length > 0
          ? `<div class="calendar-tags">${calendar.tags
              .map((tag) => `<span class="tag">${tag}</span>`)
              .join(" ")}</div>`
          : "";

      return `<div class="calendar-item">
            <div class="calendar-title">
                <a href="${calendar.icsPath}">${calendar.friendlyName}</a>
            </div>
            ${calendarTagsHtml}
            <div class="calendar-actions">
                <a href="${calendar.errorsPath}">(${calendar.errorCount} errors)</a>
                <a href="${webcalLink}" title="Subscribe to this calendar in iCal/Outlook">[Subscribe]</a>
                <button class="copy-btn" data-clipboard-text="${fullIcsLink}" title="Copy calendar URL to clipboard">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                        <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                    </svg>
                </button>
            </div>
        </div>`;
    })
    .join("\n");

  return `<div class="calendar-section">
        <h2>${ripper.description}</h2>
        ${ripperTagsHtml}
        ${toc}
    </div>`;
};

const generateExternalCalendarList = (externals: ExternalCalendar[]) => {
  if (externals.length === 0) {
    return "";
  }

  const toc = externals
    .map((calendar) => {
      // Create a webcal link by replacing http/https with webcal
      const webcalLink = calendar.icsUrl.replace(/^https?:\/\//, "webcal://");

      // Get external calendar tags
      const tagsArray = calendar.tags || [];
      const tagsHtml =
        tagsArray.length > 0
          ? `<div class="calendar-tags">${tagsArray
              .map((tag) => `<span class="tag">${tag}</span>`)
              .join(" ")}</div>`
          : "";

      let entry = `<div class="calendar-item">
            <div class="calendar-title">
                <a href="${calendar.icsUrl}">${calendar.friendlyname}</a>
                ${
                  calendar.infoUrl
                    ? `(<a href="${calendar.infoUrl}">info</a>)`
                    : ""
                }
            </div>
            ${tagsHtml}
            <div class="calendar-actions">
                <a href="${webcalLink}" title="Subscribe to this calendar in iCal/Outlook">[Subscribe]</a>
                <button class="copy-btn" data-clipboard-text="${
                  calendar.icsUrl
                }" title="Copy calendar URL to clipboard">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                        <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                    </svg>
                </button>
            </div>`;

      if (calendar.description) {
        entry += `<div><small>${calendar.description}</small></div>`;
      }

      entry += `</div>`;
      return entry;
    })
    .join("\n");

  return `<div class="calendar-section">
        <h2>External Calendars</h2>
        ${toc}
    </div>`;
};

const CONCURRENCY = 8;

/**
 * Runs async operations over an array with bounded concurrency.
 * Returns results in the same order as input items.
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export const main = async () => {
  const loader = new RipperLoader("sources/");
  const [configs, errors] = await loader.loadConfigs();

  // Load external calendars from sources/external/<name>.yaml
  let externalCalendars: ExternalConfig = [];
  try {
    const externalDir = join("sources", "external");
    const entries = await loadYamlDir(externalDir);
    const result = externalConfigSchema.safeParse(entries);
    if (!result.success) {
      throw new Error(`Failed to parse sources/external/: ${result.error.message}`);
    }
    externalCalendars = result.data;
  } catch (error) {
    if ((error as any).code !== "ENOENT") {
      console.error("Error loading external calendars:", error);
      throw error;
    }
  }

  // Load the out-of-band report (downloaded from S3 by download-outofband.ts).
  // It carries pre-built ripper outputs and pre-fetched external ICS files
  // for sources marked `proxy: "outofband"`. Loaded once here and reused
  // throughout main() for externals registration, manifest building, and
  // error count merging.
  interface OutOfBandReport {
    buildTime: string;
    totalErrors: number;
    sources: Array<{
      source: string;
      friendlyName: string;
      description: string;
      friendlyLink: string;
      tags: string[];
      calendars: Array<{
        name: string;
        friendlyName: string;
        icsFile: string;
        events: number;
        hasFutureEvents: boolean;
        errors: string[];
        tags: string[];
      }>;
    }>;
    externalCalendars?: Array<{
      name: string;
      icsFile: string;
      events: number;
      hasFutureEvents: boolean;
      fetchError?: string;
    }>;
  }
  let outofbandReport: OutOfBandReport | null = null;
  try {
    const reportRaw = await readFile("outofband-report.json", "utf-8");
    outofbandReport = JSON.parse(reportRaw) as OutOfBandReport;
  } catch (err: any) {
    console.warn(`[outofband] Warning: could not read outofband-report.json: ${err?.message ?? err} — skipping out-of-band calendars`);
  }

  // Load recurring events from sources/recurring/<name>.yaml
  let recurringCalendars: RipperCalendar[] = [];
  let recurringProcessor: RecurringEventProcessor | null = null;
  try {
    const recurringDir = join("sources", "recurring");
    recurringProcessor = new RecurringEventProcessor(recurringDir);

    // Generate events for the next 12 months
    const startDate = LocalDate.now();
    const endDate = startDate.plusMonths(12);

    recurringCalendars = recurringProcessor.generateCalendars(startDate, endDate);
    console.log(`Generated ${recurringCalendars.length} recurring event calendars`);
  } catch (error) {
    if ((error as any).code !== "ENOENT") {
      console.error("Error loading recurring events:", error);
      // Don't fail the program, just continue without recurring events
    }
  }

  // Load geo-cache for geocoding event locations
  let geoCache = await loadGeoCache('geo-cache.json');
  const geocodeErrors: GeocodeError[] = [];

  // Load event-uncertainty-cache: a parallel cache to geo-cache that
  // records resolved values for fields rippers couldn't determine
  // (start times, durations, locations, images). The infra layer below
  // merges ripper output against this cache between rip and ICS write
  // — rippers themselves don't read it. See docs/event-uncertainty.md.
  const uncertaintyCache = await loadUncertaintyCache('event-uncertainty-cache.json');
  const uncertaintyTotals: UncertaintyMergeStats = {
    resolved: 0,
    acknowledgedUnresolvable: 0,
    outstanding: 0,
  };

  try {
    // Create the output directory
    // If it exists, just ignore the failure. that's fine.
    await mkdir("output");
  } catch (e) {}

  let tableOfContents: string = "";
  let totalErrorCount = 0;

  // Track event counts per calendar for summary
  const eventCounts: Array<{ name: string; type: string; events: number; expectEmpty: boolean; source: string }> = [];

  // Collect all errors for consolidated build-errors.json. Aggregate
  // (tag-*) calendars are intentionally absent from this list and from
  // `totalErrorCount` — every error in an aggregate is a duplicate of an
  // error in one of its source calendars. Counting them inflates the
  // build's error number by the number of tags each broken source
  // belongs to (e.g. one Book Larder parse failure shows up under
  // tag-fremont, tag-food, tag-books, and tag-all). Fixing the upstream
  // ripper resolves the aggregate "errors" automatically.
  interface BuildErrorEntry {
    source: string;
    calendar: string;
    type: "Ripper" | "Recurring";
    errorCount: number;
    errors: RipperError[];
  }
  const buildErrors: BuildErrorEntry[] = [];
  const configErrors: RipperError[] = [...errors]; // from loader
  const externalCalendarFailures: Array<{
    name: string;
    friendlyName: string;
    url: string;
    error: string;
  }> = [];

  // Track which calendars have future events (on or after today)
  // Calendars with no future events will be excluded from the manifest
  const calendarsWithFutureEvents = new Set<string>();
  const todayLocal = LocalDate.now();

  // Collect all calendars and their tags
  const allCalendars: RipperCalendar[] = [];
  const ripperTags = new Map<string, string[]>();
  const calendarTags = new Map<string, string[]>();

  // Add recurring calendars first
  allCalendars.push(...recurringCalendars);
  
  // Process recurring calendars for output
  const recurringWritePromises: Promise<void>[] = [];
  for (const calendar of recurringCalendars) {
    const icsPath = `recurring-${calendar.name}.ics`;
    const errorsPath = `recurring-${calendar.name}-errors.txt`;
    const errorCount = calendar.errors.length;
    totalErrorCount += errorCount;
    const icsString = await toICS(calendar);
    console.log(`${calendar.events.length} events for recurring-${calendar.name}`);
    eventCounts.push({ name: `recurring-${calendar.name}`, type: "Recurring", events: calendar.events.length, expectEmpty: false, source: calendar.name });
    if (calendar.events.some(e => e.date.toLocalDate().compareTo(todayLocal) >= 0)) {
      calendarsWithFutureEvents.add(`recurring-${calendar.name}.ics`);
    }
    if (calendar.events.length === 0) {
      console.log(`::warning::Calendar recurring-${calendar.name} has 0 events — this may indicate a problem`);
    }
    console.error(`${errorCount} errors for recurring-${calendar.name}`);
    if (errorCount > 0) {
      console.error(calendar.errors);
      buildErrors.push({
        source: "recurring",
        calendar: calendar.name,
        type: "Recurring",
        errorCount,
        errors: calendar.errors,
      });
    }
    recurringWritePromises.push(writeFile(`output/${icsPath}`, icsString));
    const rssPath = icsPath.replace('.ics', '.rss');
    recurringWritePromises.push(writeFile(`output/${rssPath}`, toRSS(calendar, { baseUrl: SITE_BASE_URL })));
    recurringWritePromises.push(writeFile(
      `output/${errorsPath}`,
      JSON.stringify(serializeRipperErrors(calendar.errors), null, 2)
    ));
  }
  await Promise.all(recurringWritePromises);

  // Separate enabled from disabled/outofband configs
  const enabledConfigs = configs.filter(c => !c.config.disabled && c.config.proxy !== "outofband");
  for (const config of configs.filter(c => c.config.disabled)) {
    console.log(`Skipping disabled ripper: ${config.config.name}`);
  }
  for (const config of configs.filter(c => !c.config.disabled && c.config.proxy === "outofband")) {
    console.log(`Skipping out-of-band ripper: ${config.config.name}`);
  }

  // Propagate ripper tags to their calendars before parallel execution
  for (const config of enabledConfigs) {
    for (const calConfig of config.config.calendars) {
        calConfig.tags = calConfig.tags || []
        calConfig.tags = [...new Set([...(calConfig.tags || []), ...(config.config.tags || [])])]
    }
  }

  // Split externals into live (fetched here) vs. out-of-band (fetched by the
  // outofband runner; the ICS file is already on disk via download-outofband).
  // An outofband external is included only when the report has a corresponding
  // entry — mirrors how outofband rippers are skipped when the report is absent.
  const outofbandExternalEntries = new Map(
    (outofbandReport?.externalCalendars ?? []).map(e => [e.name, e])
  );
  const liveExternalCalendars = externalCalendars.filter(
    (cal) => !cal.disabled && cal.proxy !== "outofband"
  );
  const outofbandExternalCalendars = externalCalendars.filter(
    (cal) => !cal.disabled && cal.proxy === "outofband" && outofbandExternalEntries.has(cal.name)
  );
  for (const cal of externalCalendars.filter(c => !c.disabled && c.proxy === "outofband" && !outofbandExternalEntries.has(c.name))) {
    console.log(`[outofband] Skipping external calendar ${cal.name} — no entry in outofband-report.json`);
  }
  const activeExternalCalendars = [...liveExternalCalendars, ...outofbandExternalCalendars];

  // --- PARALLEL PHASE: Rip all calendars + fetch all external calendars concurrently ---
  interface ExternalFetchResult {
    calendar: ExternalCalendar;
    icsContent: string | null;
    error: unknown;
  }

  const [ripperResults, externalFetchResults] = await Promise.all([
    // Rip all calendars with bounded concurrency
    parallelMap(
      enabledConfigs,
      async (config) => {
        const proxyLabel = config.config.proxy ? ` with proxy ${config.config.proxy}` : '';
        console.log(`Ripping ${config.config.name}${proxyLabel}`);
        let calendars: RipperCalendar[];
        try {
          calendars = await config.ripperImpl.rip(config);
        } catch (error) {
          console.error(`Ripper ${config.config.name} threw an unhandled error: ${error}`);
          calendars = config.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: [],
            errors: [{ type: "ParseError" as const, reason: `Ripper crashed: ${error}`, context: "" }],
            parent: config.config,
            tags: cal.tags || [],
          }));
        }
        return { config, calendars };
      },
      CONCURRENCY
    ),
    // Fetch all live external calendars with bounded concurrency.
    // Outofband externals are merged in below from pre-fetched files on disk.
    parallelMap(
      liveExternalCalendars,
      async (calendar): Promise<ExternalFetchResult> => {
        try {
          console.log(`Fetching external calendar: ${calendar.friendlyname}`);
          const response = await fetch(calendar.icsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return { calendar, icsContent: await response.text(), error: null };
        } catch (error) {
          console.error(`  - Failed to fetch ${calendar.friendlyname}: ${error}`);
          return { calendar, icsContent: null, error };
        }
      },
      CONCURRENCY
    )
  ]);

  // Merge outofband externals into externalFetchResults by reading the
  // pre-fetched ICS file from disk (downloaded by download-outofband.ts).
  for (const calendar of outofbandExternalCalendars) {
    const reportEntry = outofbandExternalEntries.get(calendar.name)!;
    if (reportEntry.fetchError) {
      console.error(`  - [outofband] ${calendar.friendlyname}: ${reportEntry.fetchError}`);
      externalFetchResults.push({ calendar, icsContent: null, error: reportEntry.fetchError });
      continue;
    }
    try {
      const icsContent = await readFile(join("output", reportEntry.icsFile), "utf-8");
      console.log(`[outofband] Loaded pre-fetched external calendar: ${calendar.friendlyname}`);
      externalFetchResults.push({ calendar, icsContent, error: null });
    } catch (err: any) {
      const message = `Pre-fetched ICS missing: ${err?.message ?? err}`;
      console.error(`  - [outofband] ${calendar.friendlyname}: ${message}`);
      externalFetchResults.push({ calendar, icsContent: null, error: message });
    }
  }

  // Build ICS content cache from external fetch results
  const externalIcsCache = new Map<string, string>();
  for (const result of externalFetchResults) {
    if (result.icsContent) {
      externalIcsCache.set(result.calendar.icsUrl, result.icsContent);
    }
  }

  // Apply uncertainty-cache resolutions to every ripper's output before
  // we serialize anything. The merge is pure and per-source: it rewrites
  // events whose UncertaintyError has a cache hit, and drops the now-
  // satisfied error. Outstanding uncertainties remain in calendar.errors
  // so they still surface in build-errors.json — and so totalErrors
  // continues to count them, per the design.
  for (const { config, calendars } of ripperResults) {
    for (const calendar of calendars) {
      const merged = applyUncertaintyResolutions(
        calendar.events,
        calendar.errors,
        uncertaintyCache,
        config.config.name,
      );
      calendar.events = merged.events;
      calendar.errors = merged.errors;
      uncertaintyTotals.resolved += merged.stats.resolved;
      uncertaintyTotals.acknowledgedUnresolvable += merged.stats.acknowledgedUnresolvable;
      uncertaintyTotals.outstanding += merged.stats.outstanding;
    }
  }

  // --- Process ripper results (preserving original order for ToC) ---
  for (const { config, calendars } of ripperResults) {
    allCalendars.push(...calendars);

    const outputs: CalendarOutput[] = [];
    const writePromises: Promise<void>[] = [];

    for (const calendar of calendars) {
      const icsPath = `${config.config.name}-${calendar.name}.ics`;
      const errorsPath = `${config.config.name}-${calendar.name}-errors.txt`;
      const errorCount = calendar.errors.length;
      totalErrorCount += errorCount;
      const icsString = await toICS(calendar);
      const calConfig = config.config.calendars.find(c => c.name === calendar.name);
      const isExpectEmpty = calConfig?.expectEmpty ?? config.config.expectEmpty ?? false;
      console.log(`${calendar.events.length} events for ${config.config.name}-${calendar.name}`);
      eventCounts.push({ name: `${config.config.name}-${calendar.name}`, type: "Ripper", events: calendar.events.length, expectEmpty: isExpectEmpty, source: config.config.name });
      if (calendar.events.some(e => e.date.toLocalDate().compareTo(todayLocal) >= 0)) {
        calendarsWithFutureEvents.add(icsPath);
      }
      if (calendar.events.length === 0 && !isExpectEmpty) {
        console.log(`::warning::Calendar ${config.config.name}-${calendar.name} has 0 events — this may indicate a problem`);
      }
      if (calendar.events.length > 0 && isExpectEmpty) {
        console.log(`::warning::Calendar ${config.config.name}-${calendar.name} has expectEmpty set but produced ${calendar.events.length} events — consider removing expectEmpty`);
      }
      console.error(`${errorCount} errors for ${config.config.name}-${calendar.name}`);
      if (errorCount > 0) {
        console.error(calendar.errors);
        buildErrors.push({
          source: config.config.name,
          calendar: calendar.name,
          type: "Ripper",
          errorCount,
          errors: calendar.errors,
        });
      }
      writePromises.push(writeFile(`output/${icsPath}`, icsString));
      const rssPath = icsPath.replace('.ics', '.rss');
      writePromises.push(writeFile(`output/${rssPath}`, toRSS(calendar, { baseUrl: SITE_BASE_URL, friendlyLink: config.config.friendlyLink })));
      writePromises.push(writeFile(
        `output/${errorsPath}`,
        JSON.stringify(serializeRipperErrors(calendar.errors), null, 2)
      ));
      outputs.push({
        errorCount,
        errorsPath,
        icsPath,
        friendlyName: calendar.friendlyname,
        tags: calendar.tags || [],
      });
    }

    await Promise.all(writePromises);

    tableOfContents += generateCalendarList(
      config.config,
      outputs,
      calendarTags
    );
  }

  // Add recurring calendars to the table of contents
  if (recurringCalendars.length > 0) {
    tableOfContents += generateRecurringCalendarList(recurringCalendars);
  }

  // Add external calendars to the table of contents
  if (activeExternalCalendars.length > 0) {
    tableOfContents += generateExternalCalendarList(activeExternalCalendars);
  }

  const taggedExternalCalendars = prepareTaggedExternalCalendars(
    activeExternalCalendars
  );

  console.log(
    "Tagged External Calendars:",
    taggedExternalCalendars.map(
      (tec) => `${tec.calendar.friendlyname} (${tec.tags.join(", ")})`
    )
  );

  console.log("Generating aggregate calendars based on tags...");
  const aggregateCalendars = await createAggregateCalendars(
    allCalendars,
    taggedExternalCalendars,
    externalIcsCache
  );

  // Compute expectEmpty for each tag: true only if ALL contributing sources are expectEmpty
  const tagExpectEmpty = new Map<string, boolean>();
  for (const tag of collectAllTags(allCalendars, taggedExternalCalendars)) {
    let hasContributors = false;
    let allExpectEmpty = true;
    for (const cal of allCalendars) {
      if (cal.tags.includes(tag)) {
        hasContributors = true;
        const calConfig = cal.parent?.calendars.find(c => c.name === cal.name);
        if (!(calConfig?.expectEmpty ?? cal.parent?.expectEmpty ?? false)) {
          allExpectEmpty = false;
          break;
        }
      }
    }
    if (allExpectEmpty) {
      for (const tec of taggedExternalCalendars) {
        if (tec.tags.includes(tag)) {
          hasContributors = true;
          if (!tec.calendar.expectEmpty) {
            allExpectEmpty = false;
            break;
          }
        }
      }
    }
    tagExpectEmpty.set(tag, hasContributors && allExpectEmpty);
  }

  // Add aggregate calendars to output
  if (aggregateCalendars.length > 0) {
    const aggregateOutputs: CalendarOutput[] = [];
    const aggregateWritePromises: Promise<void>[] = [];

    for (const calendar of aggregateCalendars) {
      const icsPath = `${calendar.name}.ics`;
      const errorsPath = `${calendar.name}-errors.txt`;
      // Aggregate errors are duplicates of upstream ripper errors — they
      // are written to the per-aggregate `*-errors.txt` file for raw
      // visibility but deliberately excluded from `totalErrorCount` and
      // `buildErrors.sources` (see `BuildErrorEntry` comment above).
      const errorCount = calendar.errors.length;
      const icsString = await toICS(calendar);
      const aggTag = calendar.tags[0];
      const isAggExpectEmpty = aggTag ? (tagExpectEmpty.get(aggTag) ?? false) : false;
      console.log(`${calendar.events.length} events for ${calendar.name}`);
      eventCounts.push({ name: calendar.name, type: "Aggregate", events: calendar.events.length, expectEmpty: isAggExpectEmpty, source: calendar.name });
      if (calendar.events.length === 0 && !isAggExpectEmpty) {
        console.log(`::warning::Aggregate calendar ${calendar.name} has 0 events — this may indicate a problem`);
      }

      aggregateWritePromises.push(writeFile(`output/${icsPath}`, icsString));
      const rssPath = icsPath.replace('.ics', '.rss');
      aggregateWritePromises.push(writeFile(`output/${rssPath}`, toRSS(calendar, { baseUrl: SITE_BASE_URL })));
      aggregateWritePromises.push(writeFile(
        `output/${errorsPath}`,
        JSON.stringify(serializeRipperErrors(calendar.errors), null, 2)
      ));

      aggregateOutputs.push({
        errorCount,
        errorsPath,
        icsPath,
        friendlyName: calendar.friendlyname,
        tags: calendar.tags || [],
      });
    }

    await Promise.all(aggregateWritePromises);
  }

  // Write external calendar files from pre-fetched results
  console.log("Writing external calendar files...");
  const externalWritePromises: Promise<void>[] = [];
  for (const { calendar, icsContent, error } of externalFetchResults) {
    if (icsContent) {
      const localFileName = `external-${calendar.name}.ics`;
      externalWritePromises.push(writeFile(`output/${localFileName}`, icsContent));
      const eventCount = (icsContent.match(/BEGIN:VEVENT/g) || []).length;
      console.log(`${eventCount} events for external-${calendar.name}`);
      eventCounts.push({ name: `external-${calendar.name}`, type: "External", events: eventCount, expectEmpty: calendar.expectEmpty, source: calendar.name });
      if (hasFutureEventsInICS(icsContent)) {
        calendarsWithFutureEvents.add(localFileName);
      }
      if (eventCount === 0 && !calendar.expectEmpty) {
        console.log(`::warning::External calendar ${calendar.friendlyname} (external-${calendar.name}) has 0 events — this may indicate a problem`);
      }
      if (eventCount > 0 && calendar.expectEmpty) {
        console.log(`::warning::External calendar ${calendar.friendlyname} (external-${calendar.name}) has expectEmpty set but produced ${eventCount} events — consider removing expectEmpty`);
      }
    } else {
      // Create empty calendar file as fallback
      const emptyCalendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//206.events//External Calendar Error//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${calendar.friendlyname} (Error)
X-WR-CALDESC:Failed to fetch external calendar: ${error}
END:VCALENDAR`;
      externalWritePromises.push(writeFile(`output/external-${calendar.name}.ics`, emptyCalendar));
      externalCalendarFailures.push({
        name: calendar.name,
        friendlyName: calendar.friendlyname,
        url: calendar.icsUrl,
        error: String(error),
      });
    }
  }
  await Promise.all(externalWritePromises);

  console.log("generating JSON manifest");

  // Collect all unique tags and validate them
  const allTags = new Set<string>();

  configs.forEach(ripper => {
    if (ripper.config.tags) ripper.config.tags.forEach(tag => allTags.add(tag));
    ripper.config.calendars.forEach(calendar => {
      if (calendar.tags) calendar.tags.forEach(tag => allTags.add(tag));
    });
  });

  activeExternalCalendars.forEach(calendar => {
    if (calendar.tags) calendar.tags.forEach(tag => allTags.add(tag));
  });

  recurringCalendars.forEach(calendar => {
    if (calendar.tags) calendar.tags.forEach(tag => allTags.add(tag));
  });

  // Tags don't need to be in a central allow-list anymore — any string a
  // source uses is valid. The only gating check is for near-duplicates
  // (e.g. "Capitol Hill" vs "CapitolHill"), which produce divergent ICS
  // URLs and are almost always an unintentional typo.
  const tagDuplicates = detectTagDuplicates(allTags);
  if (tagDuplicates.length > 0) {
    const desc = tagDuplicates
      .map(d => `  ${d.spellings.join(' / ')}`)
      .join('\n');
    throw new Error(
      `Build failed: tags differ only in casing or whitespace. ` +
      `Pick one spelling and update the source(s) using the others:\n${desc}`
    );
  }

  // Log calendars excluded from manifest due to no future events
  const allCalendarIcsUrls: string[] = [];
  for (const ripper of configs.filter(r => !r.config.disabled && r.config.proxy !== "outofband")) {
    for (const cal of ripper.config.calendars) {
      allCalendarIcsUrls.push(`${ripper.config.name}-${cal.name}.ics`);
    }
  }
  for (const cal of recurringCalendars) {
    allCalendarIcsUrls.push(`recurring-${cal.name}.ics`);
  }
  for (const cal of activeExternalCalendars) {
    allCalendarIcsUrls.push(`external-${cal.name}.ics`);
  }

  // --- Out-of-band calendars: register entries from the report loaded earlier ---
  // The report (downloaded from S3 by download-outofband.ts) is the single source of truth:
  // it already knows which calendars have future events, error counts, and all metadata.
  interface OutOfBandManifestEntry {
    ripperName: string;
    friendlyName: string;
    description: string;
    friendlyLink: string;
    tags: string[];
    calendars: Array<{
      name: string;
      friendlyName: string;
      icsUrl: string;
      rssUrl: string;
      tags: string[];
    }>;
  }
  const outofbandManifestEntries: OutOfBandManifestEntry[] = [];

  if (outofbandReport) {
    console.log(`[outofband] Report from ${outofbandReport.buildTime}: ${outofbandReport.sources.length} source(s), ${outofbandReport.externalCalendars?.length ?? 0} external(s), ${outofbandReport.totalErrors} error(s)`);

    for (const source of outofbandReport.sources) {
      const calendarEntries: OutOfBandManifestEntry["calendars"] = [];
      for (const cal of source.calendars) {
        allCalendarIcsUrls.push(cal.icsFile);
        if (cal.hasFutureEvents) {
          calendarsWithFutureEvents.add(cal.icsFile);
          calendarEntries.push({
            name: cal.name,
            friendlyName: cal.friendlyName,
            icsUrl: cal.icsFile,
            rssUrl: cal.icsFile.replace(".ics", ".rss"),
            tags: cal.tags,
          });
          console.log(`[outofband] Registered ${cal.icsFile} (${cal.events} events)`);
        } else {
          console.log(`[outofband] Skipping ${cal.icsFile} — no future events (${cal.errors.length} error(s))`);
        }
      }
      if (calendarEntries.length > 0) {
        outofbandManifestEntries.push({
          ripperName: source.source,
          friendlyName: source.friendlyName,
          description: source.description,
          friendlyLink: source.friendlyLink,
          tags: source.tags,
          calendars: calendarEntries,
        });
      }
    }
  }

  const excludedFromManifest = allCalendarIcsUrls.filter(url => !calendarsWithFutureEvents.has(url));
  if (excludedFromManifest.length > 0) {
    console.log(`\nExcluding ${excludedFromManifest.length} calendar(s) with no future events from manifest: ${excludedFromManifest.join(', ')}`);
  }

  // Generate JSON manifest for React app, filtering out calendars with no future events
  const manifest = {
    lastUpdated: new Date().toISOString(),
    rippers: [
      ...configs.filter(ripper => !ripper.config.disabled && ripper.config.proxy !== "outofband").map(ripper => ({
        name: ripper.config.name,
        friendlyName: ripper.config.friendlyname,
        description: ripper.config.description,
        friendlyLink: ripper.config.friendlyLink,
        calendars: ripper.config.calendars
          .filter(calendar => calendarsWithFutureEvents.has(`${ripper.config.name}-${calendar.name}.ics`))
          .map(calendar => ({
            name: calendar.name,
            friendlyName: calendar.friendlyname,
            icsUrl: `${ripper.config.name}-${calendar.name}.ics`,
            rssUrl: `${ripper.config.name}-${calendar.name}.rss`,
            tags: [...new Set([...(ripper.config.tags || []), ...(calendar.tags || [])])]
          }))
      })).filter(ripper => ripper.calendars.length > 0),
      ...outofbandManifestEntries.map(entry => ({
        name: entry.ripperName,
        friendlyName: entry.friendlyName,
        description: entry.description,
        friendlyLink: entry.friendlyLink,
        calendars: entry.calendars,
      })),
    ],
    recurringCalendars: recurringCalendars
      .filter(calendar => calendarsWithFutureEvents.has(`recurring-${calendar.name}.ics`))
      .map(calendar => ({
        name: calendar.name,
        friendlyName: calendar.friendlyname,
        icsUrl: `recurring-${calendar.name}.ics`,
        rssUrl: `recurring-${calendar.name}.rss`,
        tags: calendar.tags || []
      })),
    externalCalendars: activeExternalCalendars
      .filter(calendar => calendarsWithFutureEvents.has(`external-${calendar.name}.ics`))
      .map(calendar => ({
        name: calendar.name,
        friendlyName: calendar.friendlyname,
        description: calendar.description,
        icsUrl: `external-${calendar.name}.ics`, // Local file for web app
        originalIcsUrl: calendar.icsUrl, // Original URL for subscription links
        infoUrl: calendar.infoUrl,
        tags: calendar.tags || []
      })),
    tags: [] as string[]
  };

  // Recompute tags from only the calendars that made it into the manifest
  const manifestTags = new Set<string>();
  manifest.rippers.forEach(ripper => {
    ripper.calendars.forEach(calendar => {
      calendar.tags.forEach(tag => manifestTags.add(tag));
    });
  });
  manifest.recurringCalendars.forEach(calendar => {
    calendar.tags.forEach(tag => manifestTags.add(tag));
  });
  manifest.externalCalendars.forEach(calendar => {
    calendar.tags.forEach(tag => manifestTags.add(tag));
  });
  manifest.tags = Array.from(manifestTags).sort();

  await writeFile("output/manifest.json", JSON.stringify(manifest, null, 2));

  // Generate events index for full-text event search
  const EVENTS_INDEX_SIZE_WARNING_KB = 500;
  const eventsIndex: Array<{
    icsUrl: string;
    summary: string;
    description?: string;
    location?: string;
    date: string;
    endDate?: string;
    url?: string;
    lat?: number;
    lng?: number;
    osmType?: 'node' | 'way' | 'relation';
    osmId?: number;
    geocodeSource?: 'ripper' | 'cached' | 'none';
  }> = [];

  for (const calendar of allCalendars) {
    const icsUrl = calendar.parent
      ? `${calendar.parent.name}-${calendar.name}.ics`
      : `recurring-${calendar.name}.ics`;

    // Skip calendars excluded from manifest (no future events)
    if (!calendarsWithFutureEvents.has(icsUrl)) continue;

    const sourceName = calendar.parent?.name ?? calendar.name;

    for (const event of calendar.events) {
      let lat: number | undefined;
      let lng: number | undefined;
      let osmType: 'node' | 'way' | 'relation' | undefined;
      let osmId: number | undefined;
      let geocodeSource: 'ripper' | 'cached' | 'none' | undefined;

      // Resolve geo: calendar-level config wins over ripper-level.
      // `geo` is now required-nullable at the ripper level; a ripper with
      // `geo: null` plus per-calendar overrides is how multi-branch
      // sources like SPL opt in to branch-level coords.
      const calendarCfg = calendar.parent?.calendars.find(c => c.name === calendar.name);
      const resolvedGeo = calendarCfg?.geo !== undefined
        ? calendarCfg.geo
        : (calendar.parent?.geo ?? null);

      if (resolvedGeo) {
        // Use declared coords — no geocoding needed
        lat = resolvedGeo.lat;
        lng = resolvedGeo.lng;
        osmType = resolvedGeo.osmType;
        osmId = resolvedGeo.osmId;
        geocodeSource = 'ripper';
      } else {
        const result = await resolveEventCoords(geoCache, event.location, sourceName);
        geoCache = result.cache;
        if (result.coords) {
          lat = result.coords.lat;
          lng = result.coords.lng;
          osmType = result.coords.osmType;
          osmId = result.coords.osmId;
        }
        geocodeSource = result.geocodeSource;
        if (result.error) geocodeErrors.push(result.error);
      }

      eventsIndex.push({
        icsUrl,
        summary: event.summary,
        description: event.description?.slice(0, 200),
        location: event.location,
        date: event.date.toString(),
        endDate: event.date.plus(event.duration).toString(),
        url: event.url,
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
        ...(osmType !== undefined && osmId !== undefined ? { osmType, osmId } : {}),
        ...(geocodeSource !== undefined ? { geocodeSource } : {}),
      });
    }
  }

  // Index external calendar events using cached ICS data
  for (const calendar of activeExternalCalendars) {
    const icsUrl = `external-${calendar.name}.ics`;

    // Skip calendars excluded from manifest (no future events)
    if (!calendarsWithFutureEvents.has(icsUrl)) continue;

    const cachedIcs = externalIcsCache.get(calendar.icsUrl);
    if (cachedIcs) {
      try {
        const externalEvents = parseExternalCalendarEvents(cachedIcs);
        for (const event of externalEvents) {
          const result = await resolveEventCoords(geoCache, event.location, `external-${calendar.name}`);
          geoCache = result.cache;

          let lat: number | undefined;
          let lng: number | undefined;
          let osmType: 'node' | 'way' | 'relation' | undefined;
          let osmId: number | undefined;
          if (result.coords) {
            lat = result.coords.lat;
            lng = result.coords.lng;
            osmType = result.coords.osmType;
            osmId = result.coords.osmId;
          }
          if (result.error) geocodeErrors.push(result.error);

          eventsIndex.push({
            icsUrl,
            summary: event.summary,
            description: event.description?.slice(0, 200),
            location: event.location,
            date: event.date.toString(),
            endDate: event.date.plus(event.duration).toString(),
            url: event.url,
            ...(lat !== undefined ? { lat } : {}),
            ...(lng !== undefined ? { lng } : {}),
            ...(osmType !== undefined && osmId !== undefined ? { osmType, osmId } : {}),
            ...(result.geocodeSource !== undefined ? { geocodeSource: result.geocodeSource } : {}),
          });
        }
      } catch (error) {
        console.error(`Failed to index external calendar ${calendar.friendlyname}: ${error}`);
      }
    }
  }

  // Save updated geo-cache
  await saveGeoCache(geoCache, 'geo-cache.json');

  // Persist the uncertainty cache (currently a no-op in the build itself
  // since rippers don't write to it — resolutions arrive via the
  // event-uncertainty-resolver skill — but we round-trip so a future
  // build-time writer wouldn't silently drop entries).
  await saveUncertaintyCache(uncertaintyCache, 'event-uncertainty-cache.json');

  const eventsIndexJson = JSON.stringify(eventsIndex);
  const eventsIndexSizeKB = (Buffer.byteLength(eventsIndexJson, "utf8") / 1024).toFixed(1);
  console.log(`Events index: ${eventsIndex.length} events, ${eventsIndexSizeKB} KB`);

  if (parseFloat(eventsIndexSizeKB) > EVENTS_INDEX_SIZE_WARNING_KB) {
    console.warn(
      `⚠️  Events index is ${eventsIndexSizeKB} KB (threshold: ${EVENTS_INDEX_SIZE_WARNING_KB} KB). ` +
      `Consider switching to a chunked search solution like Pagefind (https://pagefind.app).`
    );
  }

  await writeFile("output/events-index.json", eventsIndexJson);

  // Merge outofband error count from the report (loaded earlier).
  // Only count errors from calendars with hasFutureEvents: true — stale calendars
  // (no future events) are excluded from the manifest and their errors are not actionable.
  // Outofband external-fetch failures already show up in externalCalendarFailures
  // via the synthesized fetch result; don't double-count them here.
  let finalErrorCount = totalErrorCount;
  if (outofbandReport) {
    let activeOutofbandErrors = 0;
    for (const source of outofbandReport.sources) {
      for (const cal of source.calendars) {
        if (cal.hasFutureEvents) {
          activeOutofbandErrors += cal.errors.length;
        }
      }
    }
    if (activeOutofbandErrors > 0) {
      finalErrorCount += activeOutofbandErrors;
      console.log(`Merged ${activeOutofbandErrors} out-of-band error(s) into total (total: ${finalErrorCount})`);
    } else if (outofbandReport.totalErrors > 0) {
      console.log(`Skipped ${outofbandReport.totalErrors} out-of-band error(s) from calendars without future events`);
    }
  }

  // Check for new sources with expectEmpty=true that have never appeared in production.
  // If a source has 0 events + expectEmpty=true but is NOT in the production manifest,
  // it has never produced events and likely has a wrong URL or ripper type.
  // --- Detect new sources via deployed-site manifest check ---
  // 206.events is a Cloudflare Pages SPA that returns HTTP 200 with text/html for ANY
  // path — including non-existent ICS files. A plain HEAD + res.ok check therefore
  // marks every calendar as "already deployed", breaking new-source detection.
  //
  // Strategy: fetch the production manifest.json (a real data file, not an SPA route)
  // to get the set of currently-deployed calendar ICS URLs. Then, for any calendar not
  // in the manifest (e.g. a calendar that exists but has no future events right now),
  // fall back to a content-type HEAD check: actual ICS files are served as
  // "text/calendar"; the SPA catch-all always returns "text/html".
  const knownDeployed = new Set<string>();
  const productionUrl = process.env.PRODUCTION_URL || "https://206.events";
  const allCalendarNames = eventCounts.map(c => c.name);

  // Step 1: fetch production manifest.json to get all deployed ICS URLs
  const manifestDeployedIcsUrls = new Set<string>();
  try {
    const manifestRes = await fetch(`${productionUrl}/manifest.json`, { signal: AbortSignal.timeout(10000) });
    if (manifestRes.ok) {
      const manifest = await manifestRes.json() as {
        rippers?: Array<{ calendars: Array<{ icsUrl: string }> }>;
        recurringCalendars?: Array<{ icsUrl: string }>;
        externalCalendars?: Array<{ icsUrl: string }>;
      };
      for (const ripper of manifest.rippers ?? []) {
        for (const cal of ripper.calendars ?? []) {
          if (cal.icsUrl) manifestDeployedIcsUrls.add(cal.icsUrl.replace(/\.ics$/, ""));
        }
      }
      for (const cal of manifest.recurringCalendars ?? []) {
        if (cal.icsUrl) manifestDeployedIcsUrls.add(cal.icsUrl.replace(/\.ics$/, ""));
      }
      for (const cal of manifest.externalCalendars ?? []) {
        if (cal.icsUrl) manifestDeployedIcsUrls.add(cal.icsUrl.replace(/\.ics$/, ""));
      }
      console.log(`Fetched production manifest: ${manifestDeployedIcsUrls.size} deployed calendar(s) found`);
    } else {
      console.warn(`Could not fetch production manifest (HTTP ${manifestRes.status}) — falling back to content-type HEAD checks`);
    }
  } catch (err: any) {
    console.warn(`Could not fetch production manifest (${err?.message ?? err}) — falling back to content-type HEAD checks`);
  }

  // Step 2: mark manifest-listed calendars as known-deployed; for the rest, do a
  // content-type HEAD check to catch calendars that exist on production but have no
  // future events (and are thus omitted from the manifest).
  const calendarsNotInManifest = allCalendarNames.filter(name => !manifestDeployedIcsUrls.has(name));
  for (const name of allCalendarNames) {
    if (manifestDeployedIcsUrls.has(name)) {
      knownDeployed.add(name);
    }
  }

  console.log(`Checking ${allCalendarNames.length} calendars against deployed site for new-source detection...`);
  if (calendarsNotInManifest.length > 0) {
    console.log(`${calendarsNotInManifest.length} calendar(s) not in manifest — checking content-type via HEAD...`);
    await Promise.all(
      calendarsNotInManifest.map(async (name) => {
        try {
          const res = await fetch(`${productionUrl}/${name}.ics`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
          // SPA catch-all returns text/html for any path; real ICS files are text/calendar.
          // Only mark as deployed if the content-type confirms it's a real calendar file.
          if (res.ok && res.headers.get("content-type")?.includes("text/calendar")) {
            knownDeployed.add(name);
          }
        } catch {
          // Network error or timeout — treat as "not deployed" (conservative)
        }
      })
    );
  }
  console.log(`${knownDeployed.size} of ${allCalendarNames.length} calendars already deployed; ${allCalendarNames.length - knownDeployed.size} are new.`);

  // --- Check new sources for zero events and parse errors ---
  // A SOURCE is "new" only if NONE of its calendars are deployed to 206.events.
  // This prevents a new branch (e.g. a new SPL location) from making an existing
  // source appear "new" just because that one calendar ICS is missing.
  const knownDeployedSources = new Set<string>();
  for (const cal of eventCounts) {
    if (knownDeployed.has(cal.name)) {
      knownDeployedSources.add(cal.source);
    }
  }
  const newSources = new Set<string>();
  for (const cal of eventCounts) {
    if (!knownDeployedSources.has(cal.source) && cal.type !== "Aggregate") {
      newSources.add(cal.source);
    }
  }
  const newCalendarEntries = eventCounts.filter(c => newSources.has(c.source) && c.type !== "Aggregate");
  console.log(`${newSources.size} new source(s) detected (${knownDeployedSources.size} known-deployed source(s)).`);

  const newZeroEventSources: string[] = [];
  const newSourceParseErrors: Array<{ source: string; calendar: string; errorCount: number }> = [];

  // New source with 0 events → fail build (no proven data pipeline)
  const newZeroEvent = newCalendarEntries.filter(c => c.events === 0 && !c.expectEmpty);
  for (const cal of newZeroEvent) {
    console.log(`::error::New source "${cal.source}" calendar "${cal.name}" has 0 events and has never appeared in production. Fix the ripper URL/type, or set expectEmpty: true only if this source is legitimately seasonal and you have confirmed the pipeline works.`);
    newZeroEventSources.push(cal.name);
  }
  if (newZeroEventSources.length > 0) {
    console.log(`Found ${newZeroEventSources.length} new zero-event calendar(s) in this build`);
  }

  // New source with parse errors → fail build (can't merge half-parsed sources)
  for (const entry of buildErrors) {
    const calName = entry.type === "Recurring" ? `recurring-${entry.calendar}` : `${entry.source}-${entry.calendar}`;
    const calEntry = eventCounts.find(c => c.name === calName);
    if (calEntry && newSources.has(calEntry.source)) {
      const parseErrors = entry.errors.filter(e => e.type === "ParseError" || e.type === "InvalidDateError");
      if (parseErrors.length > 0) {
        console.log(`::error::New source "${entry.source}" calendar "${entry.calendar}" has ${parseErrors.length} parse error(s). Fix the ripper or external config before merging.`);
        newSourceParseErrors.push({ source: entry.source, calendar: entry.calendar, errorCount: parseErrors.length });
      }
    }
  }
  if (newSourceParseErrors.length > 0) {
    const totalNewParseErrors = newSourceParseErrors.reduce((a, e) => a + e.errorCount, 0);
    console.log(`Found ${newSourceParseErrors.length} new source(s) with parse errors (${totalNewParseErrors} total errors). These must be fixed before merging.`);
  }

  // Fatal error count: only errors that should fail CI.
  // Geocode errors are expected and should NOT fail the build.
  // Only new source parse errors and new zero-event sources are fatal.
  await writeFile("newZeroEventSources.txt", newZeroEventSources.join("\n"));
  await writeFile("newSourceParseErrors.txt", newSourceParseErrors.map(e => `${e.source}/${e.calendar}:${e.errorCount}`).join("\n"));

  const newSourceSummary: Array<{
    source: string;
    calendar: string;
    type: string;
    eventCount: number;
    sampleEvents: Array<{ summary: string; date: string; location: string }>;
  }> = [];

  // New-source summary: list calendars belonging to genuinely new sources
  if (newCalendarEntries.length > 0) {
    // Group events from eventsIndex by their calendar (icsUrl without .ics suffix = calendar key)
    const eventsByCalendar = new Map<string, Array<{ summary: string; date: string; location: string }>>();
    for (const evt of eventsIndex) {
      const calKey = evt.icsUrl.replace(/\.ics$/, "");
      if (!eventsByCalendar.has(calKey)) {
        eventsByCalendar.set(calKey, []);
      }
      eventsByCalendar.get(calKey)!.push({
        summary: evt.summary,
        date: evt.date,
        location: evt.location || "",
      });
    }
    // Sort events within each calendar by date
    for (const [, evts] of eventsByCalendar) {
      evts.sort((a, b) => a.date.localeCompare(b.date));
    }

    for (const cal of newCalendarEntries) {
      const sampleEvents = (eventsByCalendar.get(cal.name) || [])
        .slice(0, 5)
        .map(e => ({ summary: e.summary, date: e.date, location: e.location }));
      newSourceSummary.push({
        source: cal.source,
        calendar: cal.name,
        type: cal.type,
        eventCount: cal.events,
        sampleEvents,
      });
    }
  }
  await writeFile("output/new-source-summary.json", JSON.stringify(newSourceSummary, null, 2));

  await writeFile("errorCount.txt", finalErrorCount.toString());

  // Fatal error count: only errors that should fail CI.
  // Geocode errors are expected for new/existing sources and should NOT fail the build.
  // Only config errors, new source parse errors, and new zero-event sources are fatal.
  const fatalErrorCount = newZeroEventSources.length + newSourceParseErrors.length;
  await writeFile("fatalErrorCount.txt", fatalErrorCount.toString());

  // Print event count summary
  const zeroEventCalendars = eventCounts.filter(c => c.events === 0 && !c.expectEmpty);
  const expectedEmptyCalendars = eventCounts.filter(c => c.events === 0 && c.expectEmpty);
  const unexpectedNonEmptyCalendars = eventCounts.filter(c => c.events > 0 && c.expectEmpty);
  await writeFile("zeroEventCalendars.txt", zeroEventCalendars.map(c => c.name).join("\n"));

  totalErrorCount += geocodeErrors.length;

  // Calculate geo coverage stats from events index
  const eventsWithGeo = eventsIndex.filter(e => e.lat !== undefined && e.lng !== undefined).length;
  const eventsWithoutGeo = eventsIndex.filter(e => e.lat === undefined || e.lng === undefined).length;
  const geoStats = {
    totalEvents: eventsIndex.length,
    eventsWithGeo,
    eventsWithoutGeo,
    geocodeErrors: geocodeErrors.length,
  };

  // Enumerate venues whose declared `geo` has coords but no OSM feature id.
  // Surfaced in build-errors.json so the daily osm-resolver skill has a
  // deterministic work queue — see skills/osm-resolver/SKILL.md.
  const osmGaps = buildOsmGaps({
    configs: configs.map(r => r.config),
    externals: activeExternalCalendars,
    recurringEvents: recurringProcessor?.getEvents() ?? [],
  });

  // Flatten still-outstanding UncertaintyError entries from every
  // ripper's calendar into one list for the resolver skill to chew
  // through. Resolved/unresolvable entries have already been removed
  // by applyUncertaintyResolutions, so anything left here is a real
  // work item for the event-uncertainty-resolver.
  const uncertainEvents = buildErrors.flatMap(entry =>
    entry.errors
      .filter((e): e is UncertaintyError => e.type === "Uncertainty")
      .map(e => ({
        source: entry.source,
        calendar: entry.calendar,
        reason: e.reason,
        unknownFields: e.unknownFields,
        event: {
          id: e.event.id,
          summary: e.event.summary,
          date: e.event.date.toString(),
          url: e.event.url,
        },
        partialFingerprint: e.partialFingerprint,
      }))
  );

  // Write consolidated build errors JSON for programmatic access
  const buildErrorsReport = {
    buildTime: new Date().toISOString(),
    totalErrors: totalErrorCount,
    configErrors: configErrors.map(serializeRipperError),
    // Per-source errors are serialized so embedded events in
    // UncertaintyErrors don't blow up JSON.stringify on js-joda types.
    // `errorCount` stays as the grand total (uncertainty counts toward
    // it, per the design). `parseErrorCount` and `uncertaintyCount`
    // split it out so reporters can show the categories separately
    // without re-walking the errors array.
    sources: buildErrors.map(entry => {
      const uncertaintyCount = entry.errors.filter(e => e.type === "Uncertainty").length;
      return {
        source: entry.source,
        calendar: entry.calendar,
        type: entry.type,
        errorCount: entry.errorCount,
        parseErrorCount: entry.errorCount - uncertaintyCount,
        uncertaintyCount,
        errors: serializeRipperErrors(entry.errors),
      };
    }),
    externalCalendarFailures,
    geocodeErrors: geocodeErrors,
    geoStats,
    // Uncertainty system: the resolver skill (event-uncertainty-resolver)
    // reads `uncertainEvents` as its work queue. `uncertaintyStats`
    // summarizes the same numbers PR/main build comments display.
    uncertainEvents,
    uncertaintyStats: {
      resolvedFromCache: uncertaintyTotals.resolved,
      acknowledgedUnresolvable: uncertaintyTotals.acknowledgedUnresolvable,
      outstanding: uncertaintyTotals.outstanding,
    },
    zeroEventCalendars: zeroEventCalendars.map(c => c.name),
    expectedEmptyCalendars: expectedEmptyCalendars.map(c => c.name),
    newZeroEventSources,
    newSourceParseErrors,
    unexpectedNonEmptyCalendars: unexpectedNonEmptyCalendars.map(c => ({ name: c.name, events: c.events })),
    osmGaps,
    eventCounts: eventCounts.map(c => ({
      name: c.name,
      type: c.type,
      events: c.events,
      expectEmpty: c.expectEmpty || false,
      source: c.source,
    })),
  };
  await writeFile(
    "output/build-errors.json",
    JSON.stringify(buildErrorsReport, null, 2)
  );

  // -------------------------------------------------------------------------
  // Discovery API — HATEOAS-style data files under output/
  // See docs/design-discovery-api.md. Every href in these docs is relative
  // so PR previews, local dev, and production all Just Work.
  // -------------------------------------------------------------------------
  {
    const generated = new Date().toISOString();
    const siteUrl = SITE_BASE_URL.replace(/\/$/, "");

    const ripperConfigsForDiscovery = configs.map(r => r.config);
    const recurringEventsForDiscovery = recurringProcessor?.getEvents() ?? [];

    // index.json — entry point
    const indexDoc = buildIndexJson({ generated, site: siteUrl });
    await writeFile("output/index.json", JSON.stringify(indexDoc, null, 2));

    // tags.json — one entry per tag with counts + aggregate-feed hrefs
    const tagsDoc = buildTagsJson({
      manifest: {
        rippers: manifest.rippers.map(r => ({ calendars: r.calendars.map(c => ({ tags: c.tags })) })),
        recurringCalendars: manifest.recurringCalendars.map(c => ({ tags: c.tags })),
        externalCalendars: manifest.externalCalendars.map(c => ({ tags: c.tags })),
      },
      eventCounts: eventCounts.map(c => ({ name: c.name, type: c.type, events: c.events })),
      generated,
    });
    await writeFile("output/tags.json", JSON.stringify(tagsDoc, null, 2));

    // venues.json — one entry per source with a fixed physical geo
    const venuesDoc = buildVenuesJson({
      configs: ripperConfigsForDiscovery,
      externals: activeExternalCalendars,
      recurringEvents: recurringEventsForDiscovery,
      calendarsWithFutureEvents,
      generated,
    });
    await writeFile("output/venues.json", JSON.stringify(venuesDoc, null, 2));

    // geo-cache.json — copied into output/ so downstream consumers can
    // fetch it through the discovery API. The source of truth lives at
    // the repo root (S3-synced); the build output is a published mirror.
    try {
      const geoCacheRaw = await readFile("geo-cache.json", "utf8");
      await writeFile("output/geo-cache.json", geoCacheRaw);
    } catch (e) {
      console.warn(`Warning: could not mirror geo-cache.json into output/: ${(e as Error).message}`);
    }

    // llms.txt — static usage info for LLM crawlers (llmstxt.org convention)
    const llmsTxtPath = join(__dirname, "templates", "llms.txt");
    try {
      const llmsTxt = await readFile(llmsTxtPath, "utf8");
      await writeFile("output/llms.txt", llmsTxt);
    } catch (e) {
      console.warn(`Warning: could not read llms.txt template at ${llmsTxtPath}: ${(e as Error).message}`);
    }

    // sitemap.xml — point crawlers at the discovery entry points
    const sitemapUrls = [
      `${siteUrl}/`,
      `${siteUrl}/index.json`,
      `${siteUrl}/llms.txt`,
      `${siteUrl}/tags.json`,
      `${siteUrl}/venues.json`,
      `${siteUrl}/manifest.json`,
      `${siteUrl}/events-index.json`,
    ];
    const sitemapXml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      sitemapUrls
        .map(u => `  <url><loc>${u}</loc><lastmod>${generated.slice(0, 10)}</lastmod></url>`)
        .join("\n") +
      `\n</urlset>\n`;
    await writeFile("output/sitemap.xml", sitemapXml);

    console.log(
      `Discovery API: ${tagsDoc.tags.length} tags, ${venuesDoc.venues.length} venues → ` +
      `index.json, tags.json, venues.json, llms.txt, sitemap.xml`
    );
  }

  console.log("\n=== Event Count Summary ===");
  for (const entry of eventCounts) {
    console.log(`  ${entry.name}: ${entry.events} events (${entry.type})${entry.expectEmpty && entry.events === 0 ? " (expected empty)" : ""}`);
  }
  const totalEvents = eventCounts.reduce((sum, c) => sum + c.events, 0);
  console.log(`  Total: ${totalEvents} events across ${eventCounts.length} calendars`);
  if (zeroEventCalendars.length > 0) {
    console.log(`  ⚠ ${zeroEventCalendars.length} calendar(s) with 0 events: ${zeroEventCalendars.map(c => c.name).join(", ")}`);
  }
  if (expectedEmptyCalendars.length > 0) {
    console.log(`  ℹ ${expectedEmptyCalendars.length} calendar(s) with 0 events (expected): ${expectedEmptyCalendars.map(c => c.name).join(", ")}`);
  }
  if (unexpectedNonEmptyCalendars.length > 0) {
    console.log(`  ℹ ${unexpectedNonEmptyCalendars.length} calendar(s) marked expectEmpty but have events: ${unexpectedNonEmptyCalendars.map(c => `${c.name} (${c.events})`).join(", ")}`);
  }
  if (uncertaintyTotals.resolved + uncertaintyTotals.acknowledgedUnresolvable + uncertaintyTotals.outstanding > 0) {
    console.log(`  ❓ Uncertainty: ${uncertaintyTotals.outstanding} outstanding, ${uncertaintyTotals.resolved} resolved from cache, ${uncertaintyTotals.acknowledgedUnresolvable} unresolvable`);
  }
  console.log("===========================\n");

  // Write GitHub Actions step summary if running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summaryLines = [
      "## Calendar Event Counts\n",
      "| Calendar | Type | Events |",
      "|----------|------|--------|",
      ...eventCounts.map(c => `| ${c.name} | ${c.type} | ${c.events === 0 ? (c.expectEmpty ? "0 (expected)" : "⚠️ 0") : c.events} |`),
      "",
      `**Total:** ${totalEvents} events across ${eventCounts.length} calendars`,
    ];
    if (zeroEventCalendars.length > 0) {
      summaryLines.push("");
      summaryLines.push(`> ⚠️ **${zeroEventCalendars.length} calendar(s) with 0 events:** ${zeroEventCalendars.map(c => c.name).join(", ")}`);
    }
    if (expectedEmptyCalendars.length > 0) {
      summaryLines.push("");
      summaryLines.push(`> ℹ️ **${expectedEmptyCalendars.length} calendar(s) with 0 events (expected):** ${expectedEmptyCalendars.map(c => c.name).join(", ")}`);
    }
    if (unexpectedNonEmptyCalendars.length > 0) {
      summaryLines.push("");
      summaryLines.push(`> ℹ️ **${unexpectedNonEmptyCalendars.length} calendar(s) marked expectEmpty but have events:** ${unexpectedNonEmptyCalendars.map(c => `${c.name} (${c.events})`).join(", ")}`);
    }
    if (uncertaintyTotals.outstanding + uncertaintyTotals.resolved + uncertaintyTotals.acknowledgedUnresolvable > 0) {
      summaryLines.push("");
      summaryLines.push(`> ❓ **Uncertain events:** ${uncertaintyTotals.outstanding} outstanding — agent investigation pending. ${uncertaintyTotals.resolved} resolved from cache this build; ${uncertaintyTotals.acknowledgedUnresolvable} marked unresolvable.`);
    }
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n") + "\n");
  }
};
