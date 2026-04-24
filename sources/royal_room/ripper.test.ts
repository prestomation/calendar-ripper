import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseRSSFeed, parseEventPage } from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleFeed(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-feed.xml'), 'utf8');
}

function loadSampleEvent(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-event.html'), 'utf8');
}

describe('parseRSSFeed', () => {
    it('extracts event links from RSS feed', () => {
        const links = parseRSSFeed(loadSampleFeed());
        expect(links.length).toBeGreaterThan(10);
    });

    it('decodes HTML entities in titles', () => {
        const links = parseRSSFeed(loadSampleFeed());
        const shma = links.find(l => l.title.includes('Sh'));
        expect(shma).toBeDefined();
        expect(shma!.title).not.toContain('&#');
        expect(shma!.title).not.toContain('&amp;');
    });

    it('includes event page URLs', () => {
        const links = parseRSSFeed(loadSampleFeed());
        expect(links[0].url).toContain('theroyalroomseattle.com/event/');
    });

    it('returns empty array for empty XML', () => {
        expect(parseRSSFeed('')).toEqual([]);
    });
});

describe('parseEventPage', () => {
    it('extracts startDate from JSON-LD', () => {
        const data = parseEventPage(loadSampleEvent());
        expect(data).not.toBeNull();
        expect(data!.startDate).toBe('2026-05-10 19:30:00');
    });

    it('extracts event name and decodes entities', () => {
        const data = parseEventPage(loadSampleEvent());
        expect(data!.name).toContain('Sh');
        expect(data!.name).not.toContain('&#8217;');
    });

    it('returns eventStatus', () => {
        const data = parseEventPage(loadSampleEvent());
        expect(data!.eventStatus).toBe('EventScheduled');
    });

    it('returns null for non-event JSON-LD', () => {
        const html = '<script type="application/ld+json">{"@type":"Organization","name":"Test"}</script>';
        expect(parseEventPage(html)).toBeNull();
    });

    it('returns ParseError when no JSON-LD present', () => {
        const result = parseEventPage('<html><body>No structured data</body></html>');
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('type', 'ParseError');
        expect((result as any).reason).toContain('No JSON-LD');
    });

    it('returns ParseError for malformed JSON', () => {
        const html = '<script type="application/ld+json">{bad json}</script>';
        const result = parseEventPage(html);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('type', 'ParseError');
        expect((result as any).reason).toContain('Failed to parse JSON-LD');
    });
});
