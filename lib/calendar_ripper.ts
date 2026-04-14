import { RipperLoader } from "./config/loader.js";
import { writeFile, mkdir, readFile, appendFile, access } from "fs/promises";
import {
  RipperConfig,
  RipperError,
  GeocodeError,
  toICS,
  externalConfigSchema,
  ExternalConfig,
  ExternalCalendar,
  RipperCalendar,
} from "./config/schema.js";
import { loadGeoCache, saveGeoCache, resolveEventCoords } from "./geocoder.js";
import { toRSS } from "./config/rss.js";
import { join, dirname } from "path";
import { parse } from "yaml";
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
import { LocalDate } from "@js-joda/core";
import { validateTags, TAG_CATEGORIES } from "./config/tags.js";
import {
  buildIndexJson,
  buildTagsJson,
  buildVenuesJson,
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

  // Load external calendars directly
  let externalCalendars: ExternalConfig = [];
  try {
    const filePath = join("sources", "external.yaml");
    const fileContents = await readFile(filePath, "utf8");
    const parsed = parse(fileContents);

    const result = externalConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Failed to parse external.yaml: ${result.error.message}`);
    }
    externalCalendars = result.data;
  } catch (error) {
    if ((error as any).code !== "ENOENT") {
      // If the file doesn't exist, that's fine - just use empty array
      // Otherwise, fail the program
      console.error("Error loading external calendars:", error);
      throw error;
    }
  }

  // Load recurring events
  let recurringCalendars: RipperCalendar[] = [];
  let recurringProcessor: RecurringEventProcessor | null = null;
  try {
    const recurringPath = join("sources", "recurring.yaml");
    recurringProcessor = new RecurringEventProcessor(recurringPath);

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

  try {
    // Create the output directory
    // If it exists, just ignore the failure. that's fine.
    await mkdir("output");
  } catch (e) {}

  let tableOfContents: string = "";
  let totalErrorCount = 0;

  // Track event counts per calendar for summary
  const eventCounts: Array<{ name: string; type: string; events: number; expectEmpty: boolean }> = [];

  // Collect all errors for consolidated build-errors.json
  interface BuildErrorEntry {
    source: string;
    calendar: string;
    type: "Ripper" | "Recurring" | "Aggregate";
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
    eventCounts.push({ name: `recurring-${calendar.name}`, type: "Recurring", events: calendar.events.length, expectEmpty: false });
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
      JSON.stringify(calendar.errors, null, 2)
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

  // Filter active external calendars early so we can fetch them in parallel with rippers
  const activeExternalCalendars = externalCalendars.filter(
    (cal) => !cal.disabled
  );

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
    // Fetch all external calendars with bounded concurrency
    parallelMap(
      activeExternalCalendars,
      async (calendar): Promise<ExternalFetchResult> => {
        try {
          console.log(`Fetching external calendar: ${calendar.friendlyname}`);
          const response = await fetch(calendar.icsUrl);
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

  // Build ICS content cache from external fetch results
  const externalIcsCache = new Map<string, string>();
  for (const result of externalFetchResults) {
    if (result.icsContent) {
      externalIcsCache.set(result.calendar.icsUrl, result.icsContent);
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
      eventCounts.push({ name: `${config.config.name}-${calendar.name}`, type: "Ripper", events: calendar.events.length, expectEmpty: isExpectEmpty });
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
        JSON.stringify(calendar.errors, null, 2)
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
      const errorCount = calendar.errors.length;
      totalErrorCount += errorCount;
      const icsString = await toICS(calendar);
      const aggTag = calendar.tags[0];
      const isAggExpectEmpty = aggTag ? (tagExpectEmpty.get(aggTag) ?? false) : false;
      console.log(`${calendar.events.length} events for ${calendar.name}`);
      eventCounts.push({ name: calendar.name, type: "Aggregate", events: calendar.events.length, expectEmpty: isAggExpectEmpty });
      if (calendar.events.length === 0 && !isAggExpectEmpty) {
        console.log(`::warning::Aggregate calendar ${calendar.name} has 0 events — this may indicate a problem`);
      }
      if (errorCount > 0) {
        buildErrors.push({
          source: calendar.name,
          calendar: calendar.name,
          type: "Aggregate",
          errorCount,
          errors: calendar.errors,
        });
      }

      aggregateWritePromises.push(writeFile(`output/${icsPath}`, icsString));
      const rssPath = icsPath.replace('.ics', '.rss');
      aggregateWritePromises.push(writeFile(`output/${rssPath}`, toRSS(calendar, { baseUrl: SITE_BASE_URL })));
      aggregateWritePromises.push(writeFile(
        `output/${errorsPath}`,
        JSON.stringify(calendar.errors, null, 2)
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
      eventCounts.push({ name: `external-${calendar.name}`, type: "External", events: eventCount, expectEmpty: calendar.expectEmpty });
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

  const { invalid: invalidTags } = validateTags(Array.from(allTags));
  if (invalidTags.length > 0) {
    throw new Error(`Build failed: invalid tag(s) not in VALID_TAGS: ${invalidTags.join(', ')}. Add them to lib/config/tags.ts or fix the typo.`);
  }

  const categorizedTags = new Set<string>(Object.values(TAG_CATEGORIES).flat());
  const uncategorizedTags = Array.from(allTags).filter(tag => !categorizedTags.has(tag));
  if (uncategorizedTags.length > 0) {
    throw new Error(`Build failed: tag(s) are valid but not assigned to any display category: ${uncategorizedTags.join(', ')}. Add them to a category in TAG_CATEGORIES in lib/config/tags.ts.`);
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

  // --- Out-of-band calendars: read the report produced by generate-outofband.ts ---
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

  try {
    const reportRaw = await readFile("outofband-report.json", "utf-8");
    const outofbandReport = JSON.parse(reportRaw) as {
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
    };

    console.log(`[outofband] Report from ${outofbandReport.buildTime}: ${outofbandReport.sources.length} source(s), ${outofbandReport.totalErrors} error(s)`);

    for (const source of outofbandReport.sources) {
      const calendarEntries: OutOfBandManifestEntry["calendars"] = [];
      for (const cal of source.calendars) {
        allCalendarIcsUrls.push(cal.icsFile);
        if (cal.hasFutureEvents) {
          // Always add to the manifest so the calendar URL doesn't disappear
          // from the deployed site (which would trigger the breaking-URL check).
          calendarEntries.push({
            name: cal.name,
            friendlyName: cal.friendlyName,
            icsUrl: cal.icsFile,
            rssUrl: cal.icsFile.replace(".ics", ".rss"),
            tags: cal.tags,
          });

          // Only register in calendarsWithFutureEvents (used by venues.json) if
          // the ICS file actually landed in output/. If S3 had a stale report
          // (hasFutureEvents=true) but the file itself was missing or failed to
          // download, skipping it here prevents venues.json from referencing a
          // file that doesn't exist on disk.
          const icsPath = join("output", cal.icsFile);
          const icsExists = await access(icsPath).then(() => true).catch(() => false);
          if (icsExists) {
            calendarsWithFutureEvents.add(cal.icsFile);
            console.log(`[outofband] Registered ${cal.icsFile} (${cal.events} events)`);
          } else {
            console.warn(`[outofband] ${cal.icsFile} — report says hasFutureEvents but file not found in output/ (S3 download may have failed); excluded from venues.json`);
          }
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
  } catch (err: any) {
    // Report not present (e.g. S3 not configured, first run) — skip gracefully
    console.warn(`[outofband] Warning: could not read outofband-report.json: ${err?.message ?? err} — skipping out-of-band calendars`);
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
        geocodeSource = 'ripper';
      } else {
        const result = await resolveEventCoords(geoCache, event.location, sourceName);
        geoCache = result.cache;
        if (result.coords) {
          lat = result.coords.lat;
          lng = result.coords.lng;
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
          if (result.coords) {
            lat = result.coords.lat;
            lng = result.coords.lng;
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

  // Merge outofband error count from the report (read earlier during manifest generation)
  // Only count errors from calendars with hasFutureEvents: true — stale calendars
  // (no future events) are excluded from the manifest and their errors are not actionable.
  let finalErrorCount = totalErrorCount;
  try {
    const reportRaw = await readFile("outofband-report.json", "utf-8");
    const outofbandReport = JSON.parse(reportRaw) as {
      totalErrors: number;
      sources: Array<{
        calendars: Array<{
          hasFutureEvents: boolean;
          errors: string[];
        }>;
      }>;
    };
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
  } catch {
    // report not present — no outofband errors to merge
  }
  await writeFile("errorCount.txt", finalErrorCount.toString());

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

  // Write consolidated build errors JSON for programmatic access
  const buildErrorsReport = {
    buildTime: new Date().toISOString(),
    totalErrors: totalErrorCount,
    configErrors: configErrors.map(e => ({ ...e })),
    sources: buildErrors,
    externalCalendarFailures,
    geocodeErrors: geocodeErrors,
    geoStats,
    zeroEventCalendars: zeroEventCalendars.map(c => c.name),
    expectedEmptyCalendars: expectedEmptyCalendars.map(c => c.name),
    unexpectedNonEmptyCalendars: unexpectedNonEmptyCalendars.map(c => ({ name: c.name, events: c.events })),
    eventCounts: eventCounts.map(c => ({
      name: c.name,
      type: c.type,
      events: c.events,
      expectEmpty: c.expectEmpty || false,
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
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n") + "\n");
  }
};
