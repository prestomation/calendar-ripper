import { RipperLoader } from "./config/loader.js";
import { writeFile, mkdir, readFile } from "fs/promises";
import {
  RipperConfig,
  toICS,
  externalConfigSchema,
  ExternalConfig,
  ExternalCalendar,
  RipperCalendar,
} from "./config/schema.js";
import { join, dirname } from "path";
import { parse } from "yaml";
import { fileURLToPath } from "url";
import {
  prepareTaggedCalendars,
  prepareTaggedExternalCalendars,
  createAggregateCalendars,
  TaggedCalendar,
  TaggedExternalCalendar,
} from "./tag_aggregator.js";

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CalendarOutput {
  friendlyName: string;
  icsPath: string;
  errorsPath: string;
  errorCount: number;
  tags: string[]
}

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

  try {
    // Create the output directory
    // If it exists, just ignore the failure. that's fine.
    await mkdir("output");
  } catch (e) {}

  let tableOfContents: string = "";
  let totalErrorCount = 0;

  // Collect all calendars and their tags
  const allCalendars: RipperCalendar[] = [];
  const ripperTags = new Map<string, string[]>();
  const calendarTags = new Map<string, string[]>();

  for (const config of configs) {
    console.log(`Processing ${config.config.name}`);
    if (config.config.disabled) {
      console.log(`Skipping disabled ripper: ${config.config.name}`);
      continue;
    }



    // Propogate ripper tags to their calendars
    for (const calConfig of config.config.calendars) {
        calConfig.tags = calConfig.tags || []
        calConfig.tags = calConfig.tags.concat(config.config.tags || [])
    }

    // Rip the calendars
    const calendars = await config.ripperImpl.rip(config);
    allCalendars.push(...calendars);

    const outputs: CalendarOutput[] = [];
    for (const calendar of calendars) {
      const icsPath = `${config.config.name}-${calendar.name}.ics`;
      const errorsPath = `${config.config.name}-${calendar.name}-errors.txt`;
      const errorCount = calendar.errors.length;
      totalErrorCount += errorCount;
      const icsString = await toICS(calendar);
      console.log(`${calendar.events.length} events for ${config.config.name}-${calendar.name}`);
      console.error(`${errorCount} errors for ${config.config.name}-${calendar.name}`);
      if (errorCount > 0) {
        console.error(calendar.errors);
      }
      await writeFile(`output/${icsPath}`, icsString);
      await writeFile(
        `output/${errorsPath}`,
        JSON.stringify(calendar.errors, null, 2)
      );
      outputs.push({
        errorCount,
        errorsPath,
        icsPath,
        friendlyName: calendar.friendlyname,
        tags: calendar.tags || [],
      });
    }
    tableOfContents += generateCalendarList(
      config.config,
      outputs,
      calendarTags
    );
  }

  // Add external calendars to the table of contents
  const activeExternalCalendars = externalCalendars.filter(
    (cal) => !cal.disabled
  );

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
    taggedExternalCalendars
  );

  // Add aggregate calendars to output
  if (aggregateCalendars.length > 0) {
    const aggregateOutputs: CalendarOutput[] = [];

    for (const calendar of aggregateCalendars) {
      const icsPath = `${calendar.name}.ics`;
      const errorsPath = `${calendar.name}-errors.txt`;
      const errorCount = calendar.errors.length;
      totalErrorCount += errorCount;
      const icsString = await toICS(calendar);

      await writeFile(`output/${icsPath}`, icsString);
      await writeFile(
        `output/${errorsPath}`,
        JSON.stringify(calendar.errors, null, 2)
      );

      aggregateOutputs.push({
        errorCount,
        errorsPath,
        icsPath,
        friendlyName: calendar.friendlyname,
        tags: calendar.tags || [],
      });
    }
  }

  console.log("generating JSON manifest");

  // Collect all unique tags
  const allTags = new Set<string>();
  configs.forEach(ripper => {
    if (ripper.config.tags) ripper.config.tags.forEach(tag => allTags.add(tag));
    ripper.config.calendars.forEach(calendar => {
      if (calendar.tags) calendar.tags.forEach(tag => allTags.add(tag));
    });
  });

  // Generate JSON manifest for React app
  const manifest = {
    lastUpdated: new Date().toISOString(),
    rippers: configs.map(ripper => ({
      name: ripper.config.name,
      description: ripper.config.description,
      friendlyLink: ripper.config.friendlyLink,
      calendars: ripper.config.calendars.map(calendar => ({
        name: calendar.name,
        friendlyName: calendar.friendlyname,
        icsUrl: `${ripper.config.name}-${calendar.name}.ics`,
        tags: [...(ripper.config.tags || []), ...(calendar.tags || [])]
      }))
    })),
    tags: Array.from(allTags).sort()
  };

  await writeFile("output/manifest.json", JSON.stringify(manifest, null, 2));
  await writeFile("errorCount.txt", totalErrorCount.toString());
};
