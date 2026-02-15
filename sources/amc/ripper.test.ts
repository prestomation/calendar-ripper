import { describe, it, expect } from 'vitest';
import AMCRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

describe('AMCRipper', () => {
    it('flattens GraphQL response into showtime list', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;

        const flat = ripper.flattenShowtimes(theatre);
        expect(flat.length).toBeGreaterThan(0);
        expect(flat[0]).toHaveProperty('movie');
        expect(flat[0]).toHaveProperty('showtime');
        expect(flat[0].movie).toHaveProperty('name');
        expect(flat[0].showtime).toHaveProperty('showtimeId');
    });

    it('parses all showtimes from sample data', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const location = `${theatre.name}, ${theatre.addressLine1}, ${theatre.city}, ${theatre.state} ${theatre.postalCode}`;
        const events = ripper.parseEvents(flat, location, theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid.length).toBe(41);
    });

    it('parses movie title with MPAA rating', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const location = `${theatre.name}, ${theatre.addressLine1}`;
        const events = ripper.parseEvents(flat, location, theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const avatar = valid.find(e => e.summary.includes('Avatar'));
        expect(avatar).toBeDefined();
        expect(avatar!.summary).toBe('Avatar: Fire and Ash (PG13)');
    });

    it('parses UTC date and converts to Pacific time', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const location = `${theatre.name}, ${theatre.addressLine1}`;
        const events = ripper.parseEvents(flat, location, theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // "2026-02-14T23:15:00.000Z" = 3:15 PM PST on Feb 14
        const avatar = valid.find(e => e.id === 'amc-140563845')!;
        expect(avatar).toBeDefined();
        expect(avatar.date.year()).toBe(2026);
        expect(avatar.date.monthValue()).toBe(2);
        expect(avatar.date.dayOfMonth()).toBe(14);
        expect(avatar.date.hour()).toBe(15);
        expect(avatar.date.minute()).toBe(15);
    });

    it('sets duration from movie runtime', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const location = `${theatre.name}, ${theatre.addressLine1}`;
        const events = ripper.parseEvents(flat, location, theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Avatar: Fire and Ash is 195 minutes
        const avatar = valid.find(e => e.summary.includes('Avatar'))!;
        expect(avatar.duration.toMinutes()).toBe(195);

        // Goat is 99 minutes
        const goat = valid.find(e => e.summary.includes('Goat'))!;
        expect(goat.duration.toMinutes()).toBe(99);
    });

    it('sets location from theatre data', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const location = `AMC Pacific Place 11, 600 Pine Street, Seattle, Washington 98101-3709`;
        const events = ripper.parseEvents(flat, location, theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid[0].location).toBe('AMC Pacific Place 11, 600 Pine Street, Seattle, Washington 98101-3709');
    });

    it('generates AMC movie URL', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const events = ripper.parseEvents(flat, 'Test', theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const avatar = valid.find(e => e.summary.includes('Avatar'))!;
        expect(avatar.url).toContain('amctheatres.com/movies/');
    });

    it('prefixes event IDs with amc-', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const events = ripper.parseEvents(flat, 'Test', theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of valid) {
            expect(event.id).toMatch(/^amc-/);
        }
    });

    it('deduplicates showtimes by ID', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        // Double the entries
        const duplicated = [...flat, ...flat];
        const events = ripper.parseEvents(duplicated, 'Test', theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid.length).toBe(41);
    });

    it('includes genre in description', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const events = ripper.parseEvents(flat, 'Test', theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const avatar = valid.find(e => e.summary.includes('Avatar'))!;
        expect(avatar.description).toBe('Action');
    });

    it('handles movies with no MPAA rating', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const events = ripper.parseEvents(flat, 'Test', theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Stray Kids has no rating (null)
        const strayKids = valid.find(e => e.summary.includes('Stray Kids'))!;
        expect(strayKids).toBeDefined();
        expect(strayKids.summary).not.toContain('(null)');
    });

    it('returns no errors for valid sample data', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const events = ripper.parseEvents(flat, 'Test', theatre.slug);
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(0);
    });

    it('includes multiple distinct movies', () => {
        const ripper = new AMCRipper();
        const data = loadSampleData();
        const theatre = data.data.viewer.theatre;
        const flat = ripper.flattenShowtimes(theatre);

        const events = ripper.parseEvents(flat, 'Test', theatre.slug);
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const titles = new Set(valid.map(e => e.summary));
        expect(titles.size).toBeGreaterThanOrEqual(10);
    });

    it('handles empty movie list gracefully', () => {
        const ripper = new AMCRipper();
        const flat = ripper.flattenShowtimes({ movies: { edges: [] } });
        expect(flat).toHaveLength(0);

        const events = ripper.parseEvents(flat, 'Test', 'test-slug');
        expect(events).toHaveLength(0);
    });

    it('handles malformed date gracefully', () => {
        const ripper = new AMCRipper();
        const flat = [{
            movie: {
                name: "Test Movie",
                runTime: 120,
                mpaaRating: "R",
                genre: "Drama",
                movieId: 99999,
                slug: "test-movie"
            },
            showtime: {
                showtimeId: 999999,
                showDateTimeUtc: "not-a-date",
                auditorium: 1,
                status: "Sellable"
            }
        }];

        const events = ripper.parseEvents(flat, 'Test', 'test-slug');
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors).toHaveLength(1);
        expect(errors[0].reason).toContain('Could not parse date');
    });
});
