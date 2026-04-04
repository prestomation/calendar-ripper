import { describe, it, expect } from "vitest";
import { ZoneRegion } from "@js-joda/core";
import '@js-joda/timezone';
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import CandlelightRipper from "./ripper.js";
import { RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("CandlelightRipper", () => {
    const ripper = new CandlelightRipper();
    const timezone = ZoneRegion.of("America/Los_Angeles");
    const sampleHtml = readFileSync(join(__dirname, "sample-data.html"), "utf-8");

    it("should extract events from sample data", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        expect(calendarEvents.length).toBeGreaterThan(20);
    });

    it("should extract event titles", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const titles = calendarEvents.map(e => e.summary);
        expect(titles.some(t => t.includes("Candlelight:"))).toBe(true);
    });

    it("should extract venue names", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const locations = calendarEvents.map(e => e.location).filter(Boolean);
        expect(locations.length).toBeGreaterThan(0);

        // Known venues from the data
        const allLocations = locations.join(', ');
        expect(allLocations).toContain("Arctic Club Hotel");
    });

    it("should generate correct event URLs", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        for (const event of calendarEvents) {
            expect(event.url).toMatch(/^https:\/\/feverup\.com\/m\/\d+$/);
        }
    });

    it("should set duration to 65 minutes", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        for (const event of calendarEvents) {
            expect(event.duration.toMinutes()).toBe(65);
        }
    });

    it("should parse times correctly", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        // Events with times should be in the evening (typically 6-9 PM)
        const eveningEvents = calendarEvents.filter(e => e.date.hour() >= 18 && e.date.hour() <= 21);
        expect(eveningEvents.length).toBeGreaterThan(10);
    });

    it("should not produce duplicate events", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const ids = calendarEvents.map(e => e.id);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
    });

    it("should produce few or no errors", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const errors = events.filter(e => "type" in e) as RipperError[];

        // Allow some errors but not many
        expect(errors.length).toBeLessThan(5);
    });

    it("should decode HTML entities in titles", () => {
        const events = ripper.parseEventsFromHtml(sampleHtml, timezone);
        const calendarEvents = events.filter(e => "date" in e) as RipperCalendarEvent[];

        for (const event of calendarEvents) {
            expect(event.summary).not.toContain("&amp;");
            expect(event.summary).not.toContain("&#");
        }
    });
});
