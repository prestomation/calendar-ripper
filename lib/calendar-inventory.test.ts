import { describe, it, expect } from "vitest";
import * as path from "path";
import { fileURLToPath } from "url";
import { searchInventory, loadCalendarInventory, CalendarInventoryEntry, CalendarInventory } from "./calendar-inventory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeEntry(overrides: Partial<CalendarInventoryEntry>): CalendarInventoryEntry {
    return {
        name: "test-source",
        friendlyname: "Test Source",
        tags: [],
        disabled: false,
        sourceType: "ripper",
        ...overrides,
    };
}

const mockInventory: CalendarInventory = {
    rippers: [
        makeEntry({ name: "ballard-brewery", friendlyname: "Ballard Brewery", tags: ["Beer", "Ballard"] }),
        makeEntry({ name: "jazz-club", friendlyname: "Seattle Jazz Club", tags: ["Music", "Downtown"] }),
    ],
    external: [
        makeEntry({
            name: "uw-events",
            friendlyname: "UW Events Calendar",
            sourceType: "external",
            description: "University of Washington events",
            tags: ["Community"],
        }),
    ],
    recurring: [
        makeEntry({
            name: "farmers-market",
            friendlyname: "Capitol Hill Farmers Market",
            sourceType: "recurring",
            schedule: "every Sunday",
            tags: ["FarmersMarket", "Capitol Hill"],
        }),
    ],
};

describe("searchInventory", () => {
    it("matches by name", () => {
        const results = searchInventory(mockInventory, "ballard");
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("ballard-brewery");
    });

    it("matches by friendlyname", () => {
        const results = searchInventory(mockInventory, "jazz");
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("jazz-club");
    });

    it("matches by tag (case-insensitive)", () => {
        const results = searchInventory(mockInventory, "music");
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("jazz-club");
    });

    it("matches by description", () => {
        const results = searchInventory(mockInventory, "university of washington");
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("uw-events");
    });

    it("matches across all source types", () => {
        const results = searchInventory(mockInventory, "capitol hill");
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("farmers-market");
    });

    it("returns empty array when no matches", () => {
        const results = searchInventory(mockInventory, "zzznomatch");
        expect(results).toHaveLength(0);
    });

    it("returns multiple matches across source types", () => {
        const results = searchInventory(mockInventory, "event");
        // "UW Events Calendar" friendlyname contains "Event"
        // "farmers-market" doesn't match
        expect(results.some(r => r.name === "uw-events")).toBe(true);
    });

    it("is case-insensitive", () => {
        const lowerResults = searchInventory(mockInventory, "ballard");
        const upperResults = searchInventory(mockInventory, "BALLARD");
        expect(lowerResults).toHaveLength(upperResults.length);
        expect(lowerResults[0].name).toBe(upperResults[0].name);
    });
});

describe("loadCalendarInventory integration", () => {
    const sourcesDir = path.join(__dirname, "..", "sources");

    it("loads rippers from the actual sources directory", async () => {
        const inventory = await loadCalendarInventory(sourcesDir);
        expect(inventory.rippers.length).toBeGreaterThan(0);
    });

    it("loads external calendars from sources/external.yaml", async () => {
        const inventory = await loadCalendarInventory(sourcesDir);
        expect(inventory.external.length).toBeGreaterThan(0);
    });

    it("loads recurring events from sources/recurring.yaml", async () => {
        const inventory = await loadCalendarInventory(sourcesDir);
        expect(inventory.recurring.length).toBeGreaterThan(0);
    });

    it("every ripper entry has required fields", async () => {
        const inventory = await loadCalendarInventory(sourcesDir);
        for (const entry of inventory.rippers) {
            expect(typeof entry.name).toBe("string");
            expect(entry.name.length).toBeGreaterThan(0);
            expect(typeof entry.friendlyname).toBe("string");
            expect(Array.isArray(entry.tags)).toBe(true);
            expect(entry.sourceType).toBe("ripper");
        }
    });

    it("external entries have icsUrl as url", async () => {
        const inventory = await loadCalendarInventory(sourcesDir);
        for (const entry of inventory.external) {
            if (entry.url) {
                expect(entry.url).toMatch(/^https?:\/\//);
            }
        }
    });

    it("recurring entries have schedule field", async () => {
        const inventory = await loadCalendarInventory(sourcesDir);
        for (const entry of inventory.recurring) {
            expect(typeof entry.schedule).toBe("string");
            expect(entry.disabled).toBe(false);
        }
    });

    it("couth-buzzard ripper is included with styledcalendar type", async () => {
        const inventory = await loadCalendarInventory(sourcesDir);
        const couthBuzzard = inventory.rippers.find(r => r.name === "couth-buzzard");
        expect(couthBuzzard).toBeDefined();
        expect(couthBuzzard?.ripperType).toBe("styledcalendar");
    });

    it("includes sub-calendars from multi-calendar sources", async () => {
        const inventory = await loadCalendarInventory(sourcesDir);
        // Seattle showlists has sub-calendars; they should appear as separate entries
        const showlistsSubs = inventory.rippers.filter(r => r.parentSource === "seattle-showlists");
        expect(showlistsSubs.length).toBeGreaterThan(0);
        // Each sub-calendar should have a name, friendlyname, and parentSource
        for (const sub of showlistsSubs) {
            expect(typeof sub.name).toBe("string");
            expect(typeof sub.friendlyname).toBe("string");
            expect(sub.parentSource).toBe("seattle-showlists");
            expect(sub.sourceType).toBe("ripper");
        }
    });
});
