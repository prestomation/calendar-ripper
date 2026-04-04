import { describe, it, expect } from "vitest";
import { ZoneId } from "@js-joda/core";
import '@js-joda/timezone';
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import CandlelightRipper from "./ripper.js";
import { RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("CandlelightRipper", () => {
    const ripper = new CandlelightRipper();
    const timezone = ZoneId.of("America/Los_Angeles");
    const sampleData = JSON.parse(readFileSync(join(__dirname, "sample-data.json"), "utf-8"));
    const hits = sampleData.hits;

    it("should extract events from sample data", () => {
        const events = ripper.parseEvents(hits, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        expect(calendarEvents.length).toBeGreaterThan(10);
    });

    it("should filter out gift cards", () => {
        const events = ripper.parseEvents(hits, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        // Gift card entries should be excluded; real events have URLs like feverup.com/m/{id}
        for (const event of calendarEvents) {
            expect(event.url).toMatch(/^https:\/\/feverup\.com\/m\/\d+$/);
        }
    });

    it("should extract event titles containing Candlelight", () => {
        const events = ripper.parseEvents(hits, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const titles = calendarEvents.map(e => e.summary);
        expect(titles.some(t => t.includes("Candlelight:"))).toBe(true);
    });

    it("should include known Seattle venues", () => {
        const events = ripper.parseEvents(hits, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const locations = calendarEvents.map(e => e.location).filter(Boolean);
        expect(locations.length).toBeGreaterThan(0);

        const allLocations = locations.join(", ");
        expect(allLocations).toContain("Arctic Club Hotel");
    });

    it("should include venue coordinates", () => {
        const events = ripper.parseEvents(hits, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const withCoords = calendarEvents.filter(e => e.lat !== undefined && e.lng !== undefined);
        expect(withCoords.length).toBeGreaterThan(0);

        // Arctic Club Hotel is roughly at 47.6°N, 122.3°W
        const arctic = calendarEvents.find(e => e.location === "Arctic Club Hotel");
        expect(arctic).toBeDefined();
        expect(arctic!.lat).toBeCloseTo(47.6, 0);
        expect(arctic!.lng).toBeCloseTo(-122.3, 0);
    });

    it("should set duration to 65 minutes", () => {
        const events = ripper.parseEvents(hits, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        for (const event of calendarEvents) {
            expect(event.duration.toMinutes()).toBe(65);
        }
    });

    it("should convert UTC timestamps to Pacific time", () => {
        const events = ripper.parseEvents(hits, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        // All events should be in America/Los_Angeles
        for (const event of calendarEvents) {
            expect(event.date.zone().id()).toBe("America/Los_Angeles");
        }

        // Events should be in the evening (typically 11 AM - 11 PM Pacific)
        const eveningEvents = calendarEvents.filter(e => e.date.hour() >= 11 && e.date.hour() <= 23);
        expect(eveningEvents.length).toBeGreaterThan(5);
    });

    it("should not produce duplicate events", () => {
        const events = ripper.parseEvents(hits, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const ids = calendarEvents.map(e => e.id);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
    });

    it("should produce no errors on valid sample data", () => {
        const events = ripper.parseEvents(hits, timezone);
        const errors = events.filter(e => "type" in e) as RipperError[];

        expect(errors.length).toBe(0);
    });

    it("should deduplicate sessions with same startDateStr across calls", () => {
        // Calling parseEvents twice should not matter since deduplication is per-call
        const events1 = ripper.parseEvents(hits, timezone);
        const events2 = ripper.parseEvents(hits, timezone);

        const count1 = events1.filter(e => "date" in e).length;
        const count2 = events2.filter(e => "date" in e).length;
        expect(count1).toBe(count2);
    });
});
