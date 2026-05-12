import { describe, it, expect } from "vitest";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractTixrEvents, parseNectarEvents } from "./ripper.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    const events = JSON.parse(readFileSync(join(__dirname, "sample-data.json"), "utf-8"));
    return `<script type="application/ld+json">${JSON.stringify(events)}</script>`;
}

const timezone = ZoneId.of("America/Los_Angeles");
const now = ZonedDateTime.parse("2026-01-01T00:00:00-08:00");

describe("NectarLoungeRipper", () => {
    describe("extractTixrEvents", () => {
        it("extracts events from JSON-LD script", () => {
            const html = loadSampleHtml();
            const { tixrEvents, parseError } = extractTixrEvents(html);
            expect(parseError).toBeUndefined();
            expect(tixrEvents.length).toBeGreaterThan(0);
        });

        it("returns error when no JSON-LD found", () => {
            const { tixrEvents, parseError } = extractTixrEvents("<html><body>no events</body></html>");
            expect(tixrEvents).toHaveLength(0);
            expect(parseError).toBeDefined();
            expect(parseError?.type).toBe("ParseError");
        });
    });

    describe("parseNectarEvents", () => {
        it("parses Nectar Lounge events from sample data", () => {
            const html = loadSampleHtml();
            const { tixrEvents } = extractTixrEvents(html);
            const { events, errors } = parseNectarEvents(tixrEvents, now, timezone);
            expect(errors).toHaveLength(0);
            expect(events.length).toBeGreaterThan(10);
        });

        it("excludes Hidden Hall events", () => {
            const html = loadSampleHtml();
            const { tixrEvents } = extractTixrEvents(html);
            const { events } = parseNectarEvents(tixrEvents, now, timezone);
            for (const e of events) {
                expect(e.location).toBe("Nectar Lounge, 412 N 36th St, Seattle, WA 98103");
            }
        });

        it("sets correct event properties", () => {
            const html = loadSampleHtml();
            const { tixrEvents } = extractTixrEvents(html);
            const { events } = parseNectarEvents(tixrEvents, now, timezone);
            const first = events[0];
            expect(first.summary).toBeTruthy();
            expect(first.date).toBeDefined();
            expect(first.duration).toBeDefined();
            expect(first.url).toMatch(/tixr\.com/);
            expect(first.id).toMatch(/^nectar-lounge-/);
        });

        it("converts UTC dates to local time", () => {
            const html = loadSampleHtml();
            const { tixrEvents } = extractTixrEvents(html);
            const { events } = parseNectarEvents(tixrEvents, now, timezone);
            // All events should be in America/Los_Angeles zone
            for (const e of events) {
                const zoneId = e.date.zone().id();
                expect(zoneId).toBe("America/Los_Angeles");
            }
        });

        it("deduplicates events by URL", () => {
            const html = loadSampleHtml();
            const { tixrEvents } = extractTixrEvents(html);
            const { events } = parseNectarEvents(tixrEvents, now, timezone);
            const urls = events.map(e => e.url);
            const uniqueUrls = new Set(urls);
            expect(urls.length).toBe(uniqueUrls.size);
        });

        it("excludes past events", () => {
            const html = loadSampleHtml();
            const { tixrEvents } = extractTixrEvents(html);
            const futureNow = ZonedDateTime.parse("2030-01-01T00:00:00-08:00");
            const { events } = parseNectarEvents(tixrEvents, futureNow, timezone);
            expect(events).toHaveLength(0);
        });
    });
});
