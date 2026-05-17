import { describe, expect, test } from "vitest";
import SeattleArtBookFairRipper from "./ripper.js";
import { ZonedDateTime } from "@js-joda/core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "node-html-parser";
import { RipperCalendarEvent } from "../../lib/config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    return parse(fs.readFileSync(path.join(__dirname, "sample-data.html"), "utf8"));
}

const testDate = ZonedDateTime.parse(
    "2026-05-01T00:00:00-07:00[America/Los_Angeles]",
);

describe("Seattle Art Book Fair Ripper", () => {
    test("extracts both fair days and the prepress launch party", async () => {
        const ripper = new SeattleArtBookFairRipper();
        const events = await ripper.parseEvents(loadSampleHtml(), testDate, {});
        const calEvents = events.filter(
            (e): e is RipperCalendarEvent => "summary" in e,
        );

        const summaries = calEvents.map((e) => e.summary).sort();
        expect(summaries).toEqual([
            "Seattle Art Book Fair",
            "Seattle Art Book Fair",
            "Seattle Art Book Fair: Prepress Launch Party",
        ]);
    });

    test("fair days have correct dates and Washington Hall location", async () => {
        const ripper = new SeattleArtBookFairRipper();
        const events = await ripper.parseEvents(loadSampleHtml(), testDate, {});
        const fairs = (events.filter(
            (e): e is RipperCalendarEvent => "summary" in e,
        ) as RipperCalendarEvent[]).filter(
            (e) => e.summary === "Seattle Art Book Fair",
        );

        expect(fairs).toHaveLength(2);
        const days = fairs.map((e) => e.date.dayOfMonth()).sort((a, b) => a - b);
        expect(days).toEqual([9, 10]);
        for (const e of fairs) {
            expect(e.date.year()).toBe(2026);
            expect(e.date.monthValue()).toBe(5);
            expect(e.location).toContain("Washington Hall");
            expect(e.url).toBe("https://www.seattleartbookfair.org/");
        }
    });

    test("prepress launch is on May 8, 2026 at 6pm for 3 hours", async () => {
        const ripper = new SeattleArtBookFairRipper();
        const events = await ripper.parseEvents(loadSampleHtml(), testDate, {});
        const launch = (events.filter(
            (e): e is RipperCalendarEvent => "summary" in e,
        ) as RipperCalendarEvent[]).find((e) =>
            e.summary.includes("Prepress Launch Party"),
        );

        expect(launch).toBeDefined();
        expect(launch!.date.year()).toBe(2026);
        expect(launch!.date.monthValue()).toBe(5);
        expect(launch!.date.dayOfMonth()).toBe(8);
        expect(launch!.date.hour()).toBe(18);
        expect(launch!.duration.toHours()).toBe(3);
    });

    test("returns no events when no date range is present (fair not yet announced)", async () => {
        const ripper = new SeattleArtBookFairRipper();
        const html = parse("<html><body><p>Coming soon!</p></body></html>");
        const events = await ripper.parseEvents(html, testDate, {});
        expect(events).toHaveLength(0);
    });

    test("treats 12am as midnight (hour 0), not noon", async () => {
        const ripper = new SeattleArtBookFairRipper();
        const html = parse(
            "<html><body><div>The Seattle Art Book Fair is FREE. May 9-10, 2026. Prepress Launch Party May 8, 2026 12-3am</div></body></html>",
        );
        const events = await ripper.parseEvents(html, testDate, {});
        const launch = (events.filter(
            (e): e is RipperCalendarEvent => "summary" in e,
        ) as RipperCalendarEvent[]).find((e) =>
            e.summary.includes("Prepress Launch Party"),
        );
        expect(launch).toBeDefined();
        expect(launch!.date.hour()).toBe(0);
        expect(launch!.duration.toHours()).toBe(3);
    });

    test("treats 12pm as noon (hour 12)", async () => {
        const ripper = new SeattleArtBookFairRipper();
        const html = parse(
            "<html><body><div>The Seattle Art Book Fair is FREE. May 9-10, 2026. Prepress Launch Party May 8, 2026 12-2pm</div></body></html>",
        );
        const events = await ripper.parseEvents(html, testDate, {});
        const launch = (events.filter(
            (e): e is RipperCalendarEvent => "summary" in e,
        ) as RipperCalendarEvent[]).find((e) =>
            e.summary.includes("Prepress Launch Party"),
        );
        expect(launch).toBeDefined();
        expect(launch!.date.hour()).toBe(12);
        expect(launch!.duration.toHours()).toBe(2);
    });

    test("parses dates given different dash characters", async () => {
        const ripper = new SeattleArtBookFairRipper();
        const html = parse(
            "<html><body><div>The Seattle Art Book Fair is FREE. June 6-7, 2027</div></body></html>",
        );
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(
            (e): e is RipperCalendarEvent => "summary" in e,
        );
        expect(calEvents).toHaveLength(2);
        expect(calEvents[0].date.year()).toBe(2027);
        expect(calEvents[0].date.monthValue()).toBe(6);
    });
});
