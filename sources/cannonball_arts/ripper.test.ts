import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities, stripHtml, parseDatesFromText } from './ripper.js';

describe('decodeHtmlEntities', () => {
    it('decodes numeric entities', () => {
        expect(decodeHtmlEntities('Muckleshoot Cultural Arts &#038; Heritage Day')).toBe('Muckleshoot Cultural Arts & Heritage Day');
    });

    it('decodes named entities', () => {
        expect(decodeHtmlEntities('foo &amp; bar')).toBe('foo & bar');
        expect(decodeHtmlEntities('&lt;tag&gt;')).toBe('<tag>');
        expect(decodeHtmlEntities('&quot;quoted&quot;')).toBe('"quoted"');
    });

    it('decodes right single quote (&#8217;)', () => {
        expect(decodeHtmlEntities('it&#8217;s')).toBe("it\u2019s");
    });

    it('passes through plain text unchanged', () => {
        expect(decodeHtmlEntities('Hello World')).toBe('Hello World');
    });
});

describe('stripHtml', () => {
    it('removes HTML tags', () => {
        const html = '<p><strong>March 13 from 12–3 PM</strong> for an afternoon</p>';
        expect(stripHtml(html)).toBe('March 13 from 12–3 PM for an afternoon');
    });

    it('decodes &amp; entities', () => {
        expect(stripHtml('<p>Art &amp; Culture</p>')).toBe('Art & Culture');
    });

    it('replaces &nbsp; with space', () => {
        expect(stripHtml('A&nbsp;B')).toBe('A B');
    });

    it('collapses whitespace', () => {
        expect(stripHtml('<p>Hello</p>\n<p>World</p>')).toBe('Hello World');
    });

    it('decodes numeric entities in text', () => {
        // &#8217; = right single quote, &#8211; = en-dash
        const html = '<p>Art Zowie&#8217;s roaming art caf\u00e9 lands at Cannonball Arts for two exclusive weekends: May 2-3 &amp; 23-24!</p>';
        const result = stripHtml(html);
        expect(result).toContain('May 2-3');
        expect(result).toContain('23-24!');
        expect(result).toContain('&');
    });
});

describe('parseDatesFromText', () => {
    it('parses "Month D from H–H PM" with en-dash', () => {
        const text = 'Join us on March 13 from 12–3 PM for an afternoon of workshops.';
        const dates = parseDatesFromText(text);
        expect(dates).toHaveLength(1);
        expect(dates[0].month).toBe(3);
        expect(dates[0].day).toBe(13);
        expect(dates[0].hour).toBe(12); // noon
        expect(dates[0].minute).toBe(0);
        expect(dates[0].durationMinutes).toBe(180); // 3 hours
    });

    it('parses "from H-H PM" with ASCII hyphen', () => {
        const text = 'Join us May 5 from 2-5PM for a fun event.';
        const dates = parseDatesFromText(text);
        expect(dates).toHaveLength(1);
        expect(dates[0].month).toBe(5);
        expect(dates[0].day).toBe(5);
        expect(dates[0].hour).toBe(14); // 2pm
        expect(dates[0].durationMinutes).toBe(180);
    });

    it('parses multi-day "Month D1-D2 & D3-D4" range', () => {
        const text = "Art Zowie's roaming art café lands at Cannonball Arts for two exclusive weekends: May 2-3 & 23-24! Browse our Creativity Menu.";
        const dates = parseDatesFromText(text);
        expect(dates).toHaveLength(4);
        const days = dates.map(d => d.day);
        expect(days).toContain(2);
        expect(days).toContain(3);
        expect(days).toContain(23);
        expect(days).toContain(24);
        expect(dates.every(d => d.month === 5)).toBe(true);
    });

    it('parses simple "Month D1-D2" range', () => {
        const text = 'Join us June 10-12 for the weekend festival.';
        const dates = parseDatesFromText(text);
        expect(dates).toHaveLength(3);
        expect(dates.map(d => d.day)).toEqual([10, 11, 12]);
        expect(dates.every(d => d.month === 6)).toBe(true);
    });

    it('returns empty array when no date found in vague recurring text', () => {
        const text = 'Select Saturdays we feature a camp counselor in session. Meet an expert in singalongs and knot tying at the firepit from 2-5PM.';
        // "from 2-5PM" has no month/day, so no date is parseable
        const dates = parseDatesFromText(text);
        expect(dates).toHaveLength(0);
    });

    it('returns empty array for "@5pm" with relative day reference ("this Friday")', () => {
        const text = 'Montlake Elementary Choir to Perform at Cannonball Arts @5pm The Montlake Elementary Choir will take the stage on Level 2 at Cannonball Arts this Friday evening.';
        const dates = parseDatesFromText(text);
        expect(dates).toHaveLength(0);
    });

    it('returns empty array for text with no date at all', () => {
        const text = 'A SEXUAL HISTORY OF THE INTERNET is a project in two parts: (1) a participatory lecture performance and (2) an artist book.';
        const dates = parseDatesFromText(text);
        expect(dates).toHaveLength(0);
    });

    it('uses default start hour (18) when no time is specified in multi-day range', () => {
        const text = 'Come see us May 2-3 for our weekend event!';
        const dates = parseDatesFromText(text);
        expect(dates[0].hour).toBe(18); // DEFAULT_START_HOUR
    });

    it('correctly handles 12pm (noon) as start of a range', () => {
        // "12–3 PM": startH=12, endH=3 → after adjustment endH=15
        // startH stays 12 (not < 12, so no PM adjustment needed)
        const text = 'April 1 from 12–3 PM';
        const dates = parseDatesFromText(text);
        expect(dates[0].hour).toBe(12);
        expect(dates[0].durationMinutes).toBe(180);
    });

    it('parses time range with H:MM format', () => {
        const text = 'Join us March 15 from 1:30-3:00pm for the workshop.';
        const dates = parseDatesFromText(text);
        expect(dates).toHaveLength(1);
        expect(dates[0].hour).toBe(13); // 1:30pm
        expect(dates[0].minute).toBe(30);
        expect(dates[0].durationMinutes).toBe(90);
    });
});
