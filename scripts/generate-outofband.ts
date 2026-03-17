/**
 * generate-outofband.ts
 *
 * Runs rippers for sources marked `proxy: "outofband"` — those that 403 from
 * GitHub Actions IPs but work fine from a residential/home IP.
 *
 * Output:
 *   output/<source>-<calendar>.ics  — calendar files
 *   outofband-report.json            — per-source counts/errors
 *
 * Then uploads everything to s3://calendar-ripper-outofband-220483515252/latest/
 * using ambient AWS credentials (default profile).
 *
 * Run via: npm run generate-outofband
 */

import { RipperLoader } from "../lib/config/loader.js";
import { toICS } from "../lib/config/schema.js";
import { hasFutureEventsInICS } from "../lib/calendar_ripper.js";
import { nodriverFetch } from "../lib/config/proxy-fetch.js";
import { mkdir, writeFile, readFile } from "fs/promises";
import { createReadStream } from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { join } from "path";

const BUCKET = process.env.OUTOFBAND_BUCKET ?? "calendar-ripper-outofband-220483515252";
const REGION = "us-west-2";
const PREFIX = "latest/";

async function main() {
    const loader = new RipperLoader("sources/");
    const [configs, loadErrors] = await loader.loadConfigs();

    const outofbandConfigs = configs.filter(c => !c.config.disabled && c.config.proxy === "outofband");
    console.log(`Found ${outofbandConfigs.length} outofband sources`);

    if (outofbandConfigs.length === 0) {
        console.log("Nothing to do.");
        process.exit(0);
    }

    await mkdir("output", { recursive: true });

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

    const report: {
        buildTime: string;
        sources: SourceReport[];
        totalErrors: number;
    } = {
        buildTime: new Date().toISOString(),
        sources: [],
        totalErrors: 0,
    };

    const writtenFiles: string[] = [];

    // Set NODRIVER_PROXY_URL=http://localhost:9222 before running to enable
    // browser fetching for needsBrowser sources.
    const nodriverUrl = process.env.NODRIVER_PROXY_URL;
    if (nodriverUrl) {
        console.log(`Nodriver proxy enabled at ${nodriverUrl}`);
    }

    for (const config of outofbandConfigs) {
        console.log(`Ripping ${config.config.name}...`);

        // For needsBrowser sources, temporarily override global fetch so that
        // rippers (including built-in ones like AXS) route through the
        // headless-Chrome nodriver proxy sidecar.
        const useNodriver = config.config.needsBrowser && nodriverUrl;
        const originalFetch = globalThis.fetch;
        if (useNodriver) {
            console.log(`  Using nodriver proxy for ${config.config.name}`);
            globalThis.fetch = nodriverFetch as typeof globalThis.fetch;
        }

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
        } finally {
            if (useNodriver) {
                globalThis.fetch = originalFetch;
            }
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

    // Write report locally
    const reportPath = "outofband-report.json";
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${reportPath}`);

    // Upload to S3
    console.log(`\nUploading to s3://${BUCKET}/${PREFIX}...`);
    const s3 = new S3Client({ region: REGION });

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

    console.log(`\nDone. ${writtenFiles.length} calendar(s) uploaded. ${report.totalErrors} total error(s).`);

    if (report.totalErrors > 0) {
        console.warn(`Warning: ${report.totalErrors} error(s) occurred during ripping.`);
    }
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
});
