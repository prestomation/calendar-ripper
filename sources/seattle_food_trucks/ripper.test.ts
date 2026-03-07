import { describe, it, expect } from 'vitest';
import SeattleFoodTruckRipper from './ripper.js';
import { LocalDate, ZoneRegion, ChronoUnit, Duration } from '@js-joda/core';
import '@js-joda/timezone';
import sampleData from './sample-data.json';

const timezone = ZoneRegion.of('America/Los_Angeles');
const ripper = new SeattleFoodTruckRipper();

// Build a future timestamp (N days from now) in Seattle winter time (-08:00)
function futureTimestamp(daysFromNow: number, hour: number, minutes = 0): string {
    const date = LocalDate.now().plusDays(daysFromNow);
    const h = String(hour).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    return `${date}T${h}:${m}:00.000-08:00`;
}

// --- Unit tests for date-parsing helpers ---

describe('SeattleFoodTruckRipper.parseLocalDate', () => {
    it('extracts the date part from an SFT timestamp', () => {
        const result = ripper.parseLocalDate('2026-03-06T11:00:00.000-08:00');
        expect(result).not.toBeNull();
        expect(result!.toString()).toBe('2026-03-06');
    });

    it('returns null for an empty string', () => {
        expect(ripper.parseLocalDate('')).toBeNull();
    });
});

describe('SeattleFoodTruckRipper.parseZonedDateTime', () => {
    it('parses an SFT timestamp and converts to Pacific time', () => {
        // 11:00 PST (-08:00) → 11:00 America/Los_Angeles
        const result = ripper.parseZonedDateTime('2026-03-06T11:00:00.000-08:00', timezone);
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(11);
        expect(result!.minute()).toBe(0);
    });

    it('handles PDT offset (-07:00) correctly', () => {
        // 11:00 PDT (-07:00) → 11:00 America/Los_Angeles
        const result = ripper.parseZonedDateTime('2026-04-01T11:00:00.000-07:00', timezone);
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(11);
    });

    it('returns null for an empty string', () => {
        expect(ripper.parseZonedDateTime('', timezone)).toBeNull();
    });
});

// --- Integration-style tests using synthetic API responses ---

// Minimal pod objects matching the real API structure
function makePod(name: string, slug: string, locId: number, neighborhood: string | null) {
    return {
        name,
        id: slug,
        uid: locId,
        location: {
            id: locId,
            slug,
            name,
            ...(neighborhood ? { neighborhood: { name: neighborhood, id: 1, slug: neighborhood.toLowerCase() } } : {}),
        },
    };
}

function makeBooking(id: number, displayName: string, daysFromNow: number, startHour = 11, endHour = 14): any {
    return {
        id,
        name: '',
        description: '',
        start_time: futureTimestamp(daysFromNow, startHour),
        end_time: futureTimestamp(daysFromNow, endHour),
        event_id: id * 100,
        shift: 'Lunch',
        display_name: displayName,
        title: '',
    };
}

describe('SeattleFoodTruckRipper neighborhood filtering', () => {
    it('includes pods in Seattle neighborhoods', () => {
        const seattlePod = makePod('Westlake Park', 'westlake-park', 38, 'Downtown');
        const suburbanPod = makePod('Bellefield Office Park', 'bellefield', 999, 'Bellevue');

        // Simulate building the podByName map the same way the ripper does
        const SEATTLE_NEIGHBORHOODS = new Set([
            'Ballard', 'Beacon Hill', 'Belltown', 'Breweries', 'Capitol Hill',
            'Central District', 'Downtown', 'Eastlake', 'Fremont', 'Georgetown',
            'Northgate', 'Pioneer Square', 'Queen Anne', 'SoDo', 'South Lake Union',
            'University Of Washington', 'West Seattle',
        ]);

        const allPods = [seattlePod, suburbanPod];
        const seattlePods = allPods.filter(p => {
            const nbName = (p.location as any)?.neighborhood?.name;
            if (!nbName) return true;
            return SEATTLE_NEIGHBORHOODS.has(nbName);
        });

        expect(seattlePods).toHaveLength(1);
        expect(seattlePods[0].name).toBe('Westlake Park');
    });
});

describe('SeattleFoodTruckRipper date parsing', () => {
    it('parses a standard SFT booking timestamp correctly', () => {
        const ts = futureTimestamp(1, 11, 0);
        const dt = ripper.parseZonedDateTime(ts, timezone);
        expect(dt).not.toBeNull();
        // The date part should always match regardless of DST offset
        expect(dt!.toLocalDate().toString()).toBe(LocalDate.now().plusDays(1).toString());
    });

    it('calculates duration correctly for a 3-hour lunch window', () => {
        const start = ripper.parseZonedDateTime(futureTimestamp(1, 11), timezone)!;
        const end = ripper.parseZonedDateTime(futureTimestamp(1, 14), timezone)!;
        expect(start).not.toBeNull();
        expect(end).not.toBeNull();

        const minutes = start.until(end, ChronoUnit.MINUTES);
        const duration = Duration.ofMinutes(minutes);
        expect(duration.toHours()).toBe(3);
    });
});

describe('SeattleFoodTruckRipper sample data', () => {
    it('sample data contains pod records', () => {
        const pods = sampleData.pods_response.pods;
        expect(pods.length).toBeGreaterThan(0);
        expect(pods.some((p: any) => p.name === 'Westlake Park')).toBe(true);
    });

    it('sample events include known Seattle pod locations', () => {
        const events1 = sampleData.events_page1.events;
        const events2 = sampleData.events_page2.events;
        const allEvents = [...events1, ...events2];

        const podNames = new Set(
            sampleData.pods_response.pods.map((p: any) => p.name.toLowerCase())
        );

        const podEvents = allEvents.filter((ev: any) =>
            podNames.has((ev.display_name || '').toLowerCase())
        );
        // Starbucks Center, Westlake Center, Broadview Tap House, etc.
        expect(podEvents.length).toBeGreaterThan(0);
    });

    it('sample data does not include private corporate events in pod list', () => {
        const podNamesSet = new Set(sampleData.pods_response.pods.map((p: any) => p.name.toLowerCase()));
        // "Corporate event" and "Blue Origin - Kent" are not pods
        expect(podNamesSet.has('corporate event')).toBe(false);
        expect(podNamesSet.has('blue origin - kent')).toBe(false);
    });

    it('Starbucks Center is in the pod list (SoDo - Seattle proper)', () => {
        const starbucks = sampleData.pods_response.pods.find((p: any) => p.name === 'Starbucks Center') as any;
        expect(starbucks).toBeDefined();
        expect(starbucks.location.neighborhood.name).toBe('SoDo');
    });

    it('Bellevue pods exist in the full pod list but should be filtered out', () => {
        const bellevuePods = sampleData.pods_response.pods.filter((p: any) => p.location?.neighborhood?.name === 'Bellevue');
        expect(bellevuePods.length).toBeGreaterThan(0);
    });
});
