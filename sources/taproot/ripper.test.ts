import { describe, expect, test } from "vitest";
import TaprootRipper from "./ripper.js";
import { RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, "sample-data.json");
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

describe("TaprootRipper", () => {
    test("parses all performances from sample data", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(loadSampleData());
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(5);
    });

    test("uses productionName as summary", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(loadSampleData());
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const tillFaces = valid.find(e => e.id === "11740148")!;
        expect(tillFaces.summary).toBe("Till We Have Faces");

        const aintMisbehavin = valid.find(e => e.id === "11751919")!;
        expect(aintMisbehavin.summary).toBe("Ain't Misbehavin'");
    });

    test("parses date and time in Pacific timezone", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(loadSampleData());
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const perf = valid.find(e => e.id === "11740148")!;
        expect(perf.date.year()).toBe(2026);
        expect(perf.date.monthValue()).toBe(2);
        expect(perf.date.dayOfMonth()).toBe(19);
        expect(perf.date.hour()).toBe(19);
        expect(perf.date.minute()).toBe(30);

        const matinee = valid.find(e => e.id === "11751919")!;
        expect(matinee.date.monthValue()).toBe(3);
        expect(matinee.date.dayOfMonth()).toBe(18);
        expect(matinee.date.hour()).toBe(19);
        expect(matinee.date.minute()).toBe(30);
    });

    test("sets duration to 150 minutes", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(loadSampleData());
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        expect(valid[0].duration.toMinutes()).toBe(150);
    });

    test("sets location to Taproot Theatre address", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(loadSampleData());
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        expect(valid[0].location).toBe("Taproot Theatre, 204 N 85th St, Seattle, WA 98103");
    });

    test("generates correct ticket URL", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(loadSampleData());
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const perf = valid.find(e => e.id === "11740148")!;
        expect(perf.url).toBe("https://web.ovationtix.com/trs/pe.c/37019/11740148");
    });

    test("strips HTML from productionDescription", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(loadSampleData());
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const perf = valid.find(e => e.id === "11740148")!;
        expect(perf.description).toBeDefined();
        expect(perf.description).not.toContain("<");
        expect(perf.description).not.toContain(">");
        expect(perf.description).toContain("Cupid and Psyche");
    });

    test("sets image from productionLogoLink", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(loadSampleData());
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        const perf = valid.find(e => e.id === "11740148")!;
        expect(perf.image).toContain("ovationtix.com");
    });

    test("deduplicates performances with the same performanceId", () => {
        const ripper = new TaprootRipper();
        const data = loadSampleData();
        // Duplicate the first performance
        const doubled = {
            ...data,
            performances: [...data.performances, ...data.performances],
        };

        const events = ripper.parseEvents(doubled);
        const valid = events.filter(e => "date" in e) as RipperCalendarEvent[];

        // Should still only have 5 unique performances
        expect(valid).toHaveLength(5);
    });

    test("returns error for invalid JSON structure", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents({ error: "unexpected" });
        const errors = events.filter(e => "type" in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe("ParseError");
        expect(errors[0].reason).toContain("Invalid API response");
    });

    test("returns error for null input", () => {
        const ripper = new TaprootRipper();
        const events = ripper.parseEvents(null);
        const errors = events.filter(e => "type" in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe("ParseError");
    });

    test("returns parse error for malformed date", () => {
        const ripper = new TaprootRipper();
        const data = {
            performances: [{
                performanceId: 99999,
                productionName: "Bad Date Show",
                performanceDate: "not-a-date",
                performanceTime24: "19:30:00",
                productionDescription: null,
                productionLogoLink: null,
            }],
        };

        const events = ripper.parseEvents(data);
        const errors = events.filter(e => "type" in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe("ParseError");
        expect(errors[0].reason).toContain("Could not parse date/time");
    });

    test("skips entries missing required fields", () => {
        const ripper = new TaprootRipper();
        const data = {
            performances: [
                { performanceId: 1 },
                { productionName: "No ID" },
                { performanceId: 2, productionName: "No Date" },
                { performanceId: 3, productionName: "No Time", performanceDate: "02/19/2026" },
            ],
        };

        const events = ripper.parseEvents(data);
        expect(events).toHaveLength(0);
    });
});
