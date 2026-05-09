import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { processData, LOCATION, TICKETS_URL, SpektrixEvent, SpektrixInstance } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

function loadSampleData(): { events: SpektrixEvent[]; instances: SpektrixInstance[] } {
    const raw = fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8');
    return JSON.parse(raw);
}

// Fixed "now" so tests don't depend on the actual current time:
// May 9 2026 noon PT — before INST_1 (May 10), after INST_3 (Mar 19).
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 9, 12, 0), PACIFIC);

describe('processData', () => {
    const sample = loadSampleData();

    it('returns upcoming main-show events', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        expect(events.length).toBeGreaterThan(0);
    });

    it('filters out tier-variant events (duration === 0)', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        const celebrationEvents = events.filter(e => e.summary.includes('Celebration'));
        expect(celebrationEvents).toHaveLength(0);
    });

    it('filters out past events', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        for (const event of events) {
            expect(event.date.isAfter(NOW)).toBe(true);
        }
    });

    it('filters out cancelled instances', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        // INST_4 (May 15, cancelled) should not appear
        const mayFifteenth = events.filter(e =>
            e.date.monthValue() === 5 && e.date.dayOfMonth() === 15
        );
        expect(mayFifteenth).toHaveLength(0);
    });

    it('deduplicates same event at same time across ticket tiers', () => {
        const dupeInstances: SpektrixInstance[] = [
            ...sample.instances,
            { ...sample.instances[0], id: 'INST_DUPE' }, // same event + time, different id
        ];
        const { events } = processData(sample.events, dupeInstances, NOW, PACIFIC);

        // May 10 carnival show should appear exactly once
        const mayTenCarnival = events.filter(e =>
            e.summary === '2026 Carnival' &&
            e.date.monthValue() === 5 &&
            e.date.dayOfMonth() === 10
        );
        expect(mayTenCarnival).toHaveLength(1);
    });

    it('sets correct 90-minute duration from event metadata', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);

        const carnivalEvent = events.find(e => e.summary === '2026 Carnival');
        expect(carnivalEvent).toBeDefined();
        expect(carnivalEvent!.duration.toMinutes()).toBe(90);

        const lolaEvent = events.find(e => e.summary === '2026 Lola');
        expect(lolaEvent).toBeDefined();
        expect(lolaEvent!.duration.toMinutes()).toBe(90);
    });

    it('uses the correct location and ticket URL', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        for (const event of events) {
            expect(event.location).toBe(LOCATION);
            expect(event.url).toBe(TICKETS_URL);
        }
    });

    it('reports a ParseError for malformed datetime strings', () => {
        const badInstances: SpektrixInstance[] = [{
            id: 'BAD_INST',
            event: { id: 'CARNIVAL_ID' },
            start: 'not-a-date',
            startUtc: '',
            cancelled: false,
            isOnSale: true,
        }];
        const { errors } = processData(sample.events, badInstances, NOW, PACIFIC);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('returns both Carnival and Lola events', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        const summaries = new Set(events.map(e => e.summary));
        expect(summaries.has('2026 Carnival')).toBe(true);
        expect(summaries.has('2026 Lola')).toBe(true);
    });
});
