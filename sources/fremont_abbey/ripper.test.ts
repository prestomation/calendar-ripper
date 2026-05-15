import { describe, it, expect } from "vitest";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractHumanitixEvents, parseAbbeyArtsEvents, stripDatePrefix } from "./ripper.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return readFileSync(join(__dirname, "sample-data.html"), "utf-8");
}

const timezone = ZoneId.of("America/Los_Angeles");
const now = ZonedDateTime.parse("2026-01-01T00:00:00-08:00");

describe("FremontAbbeyRipper", () => {
    describe("stripDatePrefix", () => {
        it("strips leading date prefixes from titles", () => {
            expect(stripDatePrefix("5/15 The Moth StorySLAM")).toBe("The Moth StorySLAM");
            expect(stripDatePrefix("6/4 The Moth StorySLAM @ FREMONT ABBEY Seattle")).toBe("The Moth StorySLAM @ FREMONT ABBEY Seattle");
            expect(stripDatePrefix("4/14, 5/5, 6/9 Realization Process Workshop")).toBe("Realization Process Workshop");
        });

        it("leaves titles without date prefix unchanged", () => {
            expect(stripDatePrefix("Anjimile, Townsend's Solitaire @ BALLARD HOMESTEAD")).toBe("Anjimile, Townsend's Solitaire @ BALLARD HOMESTEAD");
            expect(stripDatePrefix("Diana Hong, Ricci Armani @ FREMONT ABBEY")).toBe("Diana Hong, Ricci Armani @ FREMONT ABBEY");
        });
    });

    describe("extractHumanitixEvents", () => {
        it("extracts events from JSON-LD ItemList", () => {
            const html = loadSampleHtml();
            const { events, parseError } = extractHumanitixEvents(html);
            expect(parseError).toBeUndefined();
            expect(events.length).toBeGreaterThan(0);
        });

        it("returns error when no ItemList JSON-LD found", () => {
            const { events, parseError } = extractHumanitixEvents("<html><body>no events</body></html>");
            expect(events).toHaveLength(0);
            expect(parseError).toBeDefined();
            expect(parseError?.type).toBe("ParseError");
        });

        it("extracts 12 events from sample data", () => {
            const html = loadSampleHtml();
            const { events } = extractHumanitixEvents(html);
            expect(events).toHaveLength(12);
        });
    });

    describe("parseAbbeyArtsEvents", () => {
        it("parses future events from sample data", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractHumanitixEvents(html);
            const { events, errors } = parseAbbeyArtsEvents(raw, now, timezone);
            expect(errors).toHaveLength(0);
            expect(events.length).toBeGreaterThan(0);
        });

        it("skips volunteer/meta events with 'Varies' location", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractHumanitixEvents(html);
            const { events } = parseAbbeyArtsEvents(raw, now, timezone);
            for (const e of events) {
                expect(e.location).not.toContain("Varies");
            }
        });

        it("excludes past events", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractHumanitixEvents(html);
            const futureNow = ZonedDateTime.parse("2030-01-01T00:00:00-08:00");
            const { events } = parseAbbeyArtsEvents(raw, futureNow, timezone);
            expect(events).toHaveLength(0);
        });

        it("sets correct event properties", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractHumanitixEvents(html);
            const { events } = parseAbbeyArtsEvents(raw, now, timezone);
            const first = events[0];
            expect(first.summary).toBeTruthy();
            expect(first.date).toBeDefined();
            expect(first.duration).toBeDefined();
            expect(first.url).toMatch(/humanitix\.com/);
            expect(first.id).toMatch(/^fremont-abbey-/);
        });

        it("formats location as venue plus address", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractHumanitixEvents(html);
            const { events } = parseAbbeyArtsEvents(raw, now, timezone);
            for (const e of events) {
                expect(e.location).toBeTruthy();
                // Location should contain a Seattle address
                expect(e.location).toMatch(/Seattle/);
            }
        });

        it("strips date prefixes from event titles", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractHumanitixEvents(html);
            const { events } = parseAbbeyArtsEvents(raw, now, timezone);
            for (const e of events) {
                // Titles should not start with a date like "5/15 "
                expect(e.summary).not.toMatch(/^\d+\/\d+/);
            }
        });

        it("deduplicates events by URL", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractHumanitixEvents(html);
            const { events } = parseAbbeyArtsEvents(raw, now, timezone);
            const urls = events.map(e => e.url);
            const uniqueUrls = new Set(urls);
            expect(urls.length).toBe(uniqueUrls.size);
        });

        it("converts dates to America/Los_Angeles timezone", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractHumanitixEvents(html);
            const { events } = parseAbbeyArtsEvents(raw, now, timezone);
            for (const e of events) {
                expect(e.date.zone().id()).toBe("America/Los_Angeles");
            }
        });
    });
});
