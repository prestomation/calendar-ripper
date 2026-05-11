/**
 * generate-outofband.ts
 *
 * Runs rippers for sources marked `proxy: "outofband"` — those that 403 from
 * GitHub Actions IPs but work fine from a residential/home IP. Also fetches
 * external ICS calendars marked `proxy: "outofband"` for the same reason.
 *
 * Output:
 *   output/<source>-<calendar>.ics  — ripper calendar files
 *   output/external-<name>.ics       — external ICS feeds fetched out-of-band
 *   outofband-report.json            — per-source counts/errors
 *
 * Then uploads everything to s3://calendar-ripper-outofband-220483515252/latest/
 * using ambient AWS credentials (default profile).
 *
 * Run via: npm run generate-outofband
 */

import { RipperLoader } from "../lib/config/loader.js";
import { toICS, externalConfigSchema, ExternalConfig } from "../lib/config/schema.js";
import { loadYamlDir } from "../lib/config/dir-loader.js";
import { hasFutureEventsInICS } from "../lib/calendar_ripper.js";
import { loadGeoCache, saveGeoCache, resolveEventCoords } from "../lib/geocoder.js";
import { mkdir, writeFile, readFile } from "fs/promises";
import { createReadStream } from "fs";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { join } from "path";

const BUCKET = process.env.OUTOFBAND_BUCKET ?? "calendar-ripper-outofband-220483515252";
const REGION = "us-west-2";
const PREFIX = "latest/";

async function main() {
    // Parse --sources flag for filtering (e.g. --sources neumos,barboza)
    const sourcesArgIdx = process.argv.indexOf("--sources");
    const sourceFilter = sourcesArgIdx !== -1 && process.argv[sourcesArgIdx + 1]
        ? new Set(process.argv[sourcesArgIdx + 1].split(",").map(s => s.trim()))
        : null;

    const loader = new RipperLoader("sources/");
    const [configs, loadErrors] = await loader.loadConfigs();

    let outofbandConfigs = configs.filter(c => !c.config.disabled && c.config.proxy === "outofband");

    // Load external calendars and filter to outofband-marked ones
    let externalCalendars: ExternalConfig = [];
    try {
        const entries = await loadYamlDir(join("sources", "external"));
        const result = externalConfigSchema.safeParse(entries);
        if (!result.success) {
            throw new Error(`Failed to parse sources/external/: ${result.error.message}`);
        }
        externalCalendars = result.data;
    } catch (error: any) {
        if (error?.code !== "ENOENT") throw error;
    }
    let outofbandExternals = externalCalendars.filter(c => !c.disabled && c.proxy === "outofband");

    if (sourceFilter) {
        outofbandConfigs = outofbandConfigs.filter(c => sourceFilter.has(c.config.name));
        outofbandExternals = outofbandExternals.filter(c => sourceFilter.has(c.name));
        console.log(`Filtered to sources: ${[...sourceFilter].join(", ")}`);
    }

    console.log(`Found ${outofbandConfigs.length} outofband ripper(s) and ${outofbandExternals.length} outofband external calendar(s)`);

    if (outofbandConfigs.length === 0 && outofbandExternals.length === 0) {
        console.log("Nothing to do.");
        process.exit(0);
    }

    await mkdir("output", { recursive: true });

    // Download the latest geo-cache from S3 before processing so we start with
    // the most up-to-date resolved locations (main build may have added entries
    // since the last outofband run).
    const s3 = new S3Client({ region: REGION });
    try {
        const response = await s3.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: `${PREFIX}geo-cache.json`,
        }));
        const body = await response.Body?.transformToString();
        if (body) {
            await writeFile("geo-cache.json", body, "utf-8");
            console.log("Downloaded geo-cache from S3");
        }
    } catch {
        console.log("S3 geo-cache not available, using local file");
    }

    // Load the shared geo-cache so outofband sources benefit from previously
    // resolved locations and contribute new lookups back to the cache.
    let geoCache = await loadGeoCache("geo-cache.json");
    console.log(`Loaded geo-cache with ${Object.keys(geoCache.entries).length} entries`);

    interface CalendarReport {
        name: string;
        friendlyName: string;
        icsFile: string;          // filename within latest/ prefix (e.g. "neumos-neumos.ics")
        events: number;
        hasFutureEvents: boolean;
        errors: string[];
        tags: string[];
    }

    interface SourceReport {
        source: string;
        friendlyName: string;
        description: string;
        friendlyLink: string;
        tags: string[];
        calendars: CalendarReport[];
    }

    interface ExternalCalendarReport {
        name: string;
        icsFile: string;          // e.g. "external-foo.ics"
        events: number;
        hasFutureEvents: boolean;
        fetchError?: string;
    }

    const report: {
        buildTime: string;
        sources: SourceReport[];
        externalCalendars: ExternalCalendarReport[];
        totalErrors: number;
    } = {
        buildTime: new Date().toISOString(),
        sources: [],
        externalCalendars: [],
        totalErrors: 0,
    };

    const writtenFiles: string[] = [];

    for (const config of outofbandConfigs) {
        console.log(`Ripping ${config.config.name}...`);

        let calendars;
        try {
            calendars = await config.ripperImpl.rip(config);
        } catch (err) {
            console.error(`Ripper ${config.config.name} threw:`, err);
            calendars = config.config.calendars.map(cal => ({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason: `Ripper crashed: ${err}`, context: "" }],
                tags: cal.tags || [],
            }));
        }

        const sourceReport: SourceReport = {
            source: config.config.name,
            friendlyName: config.config.friendlyname ?? config.config.name,
            description: config.config.description ?? "",
            friendlyLink: config.config.friendlyLink ?? "",
            tags: config.config.tags ?? [],
            calendars: [],
        };

        for (const calendar of calendars) {
            // Geocode events using the shared cache.
            // Outofband sources may have per-source geo coords (use those directly),
            // or per-event location strings (resolved via Nominatim + cache).
            const sourceGeo = config.config.geo;
            for (const event of calendar.events) {
                if (sourceGeo && event.lat === undefined) {
                    // Apply source-level geo to events missing coords
                    event.lat = sourceGeo.lat;
                    event.lng = sourceGeo.lng;
                } else if (event.location && event.lat === undefined) {
                    const result = await resolveEventCoords(geoCache, event.location, config.config.name);
                    geoCache = result.cache;
                    if (result.coords) {
                        event.lat = result.coords.lat;
                        event.lng = result.coords.lng;
                    }
                }
            }

            const filename = `${config.config.name}-${calendar.name}.ics`;
            const outPath = join("output", filename);
            const icsString = await toICS(calendar);
            await writeFile(outPath, icsString);
            writtenFiles.push(outPath);

            const errorMessages = calendar.errors.map(e => e.reason);

            // Check for future events by reading the written ICS file
            let hasFuture = false;
            try {
                const icsContent = await readFile(outPath, "utf-8");
                hasFuture = hasFutureEventsInICS(icsContent);
            } catch {
                // If we can't read it back, assume no future events
            }

            // Only count errors for calendars with future events — calendars
            // with no future events are already excluded from the manifest and
            // are expected to be intermittently empty.
            if (hasFuture) {
                report.totalErrors += calendar.errors.length;
            }

            const calConfig = config.config.calendars.find(c => c.name === calendar.name);
            const calTags = [...new Set([...(config.config.tags ?? []), ...(calConfig?.tags ?? [])])];

            sourceReport.calendars.push({
                name: calendar.name,
                friendlyName: calConfig?.friendlyname ?? calendar.name,
                icsFile: filename,
                events: calendar.events.length,
                hasFutureEvents: hasFuture,
                errors: errorMessages,
                tags: calTags,
            });

            console.log(`  ${calendar.name}: ${calendar.events.length} events, ${calendar.errors.length} errors, hasFutureEvents=${hasFuture}`);
        }

        report.sources.push(sourceReport);
    }

    // Fetch outofband external ICS calendars from the residential IP
    for (const cal of outofbandExternals) {
        console.log(`Fetching external calendar: ${cal.friendlyname}`);
        const filename = `external-${cal.name}.ics`;
        const outPath = join("output", filename);
        try {
            const response = await fetch(cal.icsUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const icsContent = await response.text();
            await writeFile(outPath, icsContent);
            writtenFiles.push(outPath);
            const eventCount = (icsContent.match(/BEGIN:VEVENT/g) || []).length;
            const hasFuture = hasFutureEventsInICS(icsContent);
            report.externalCalendars.push({
                name: cal.name,
                icsFile: filename,
                events: eventCount,
                hasFutureEvents: hasFuture,
            });
            console.log(`  ${cal.name}: ${eventCount} events, hasFutureEvents=${hasFuture}`);
        } catch (err: any) {
            const message = err?.message ?? String(err);
            console.error(`  - Failed to fetch ${cal.friendlyname}: ${message}`);
            report.externalCalendars.push({
                name: cal.name,
                icsFile: filename,
                events: 0,
                hasFutureEvents: false,
                fetchError: message,
            });
            report.totalErrors += 1;
        }
    }

    // Persist updated geo-cache so new lookups survive to the next run
    await saveGeoCache(geoCache, "geo-cache.json");
    console.log(`\nGeo-cache saved (${Object.keys(geoCache.entries).length} entries)`);

    // Write report locally
    const reportPath = "outofband-report.json";
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${reportPath}`);

    // Upload to S3
    console.log(`\nUploading to s3://${BUCKET}/${PREFIX}...`);

    // Upload all .ics files
    for (const filePath of writtenFiles) {
        const key = PREFIX + filePath.replace(/^output\//, "");
        console.log(`  Uploading ${key}`);
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: createReadStream(filePath),
            ContentType: "text/calendar",
        }));
    }

    // Upload the report
    console.log(`  Uploading ${PREFIX}outofband-report.json`);
    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${PREFIX}outofband-report.json`,
        Body: JSON.stringify(report, null, 2),
        ContentType: "application/json",
    }));

    // Upload the updated geo-cache so the main GitHub Actions build can download
    // it as a complement to the GH Actions cache (which has a 7-day TTL).
    console.log(`  Uploading ${PREFIX}geo-cache.json`);
    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${PREFIX}geo-cache.json`,
        Body: JSON.stringify(geoCache, null, 2),
        ContentType: "application/json",
    }));

    console.log(`\nDone. ${writtenFiles.length} calendar(s) uploaded. ${report.totalErrors} total error(s).`);

    if (report.totalErrors > 0) {
        console.warn(`Warning: ${report.totalErrors} error(s) occurred during ripping.`);
    }
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
});
