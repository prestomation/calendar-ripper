
import { describe, expect, test } from '@jest/globals';
import { readFile } from 'fs/promises';

import SIFFRipper from './ripper.js';
import { parse } from 'node-html-parser';
import { Instant, ZoneRegion, ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';

const calendars = [{
    config: {
        name: "SIFF Cinema Downtown",
        cssSelector: ".Downtown"
    },
    events: [{ "description": "", "summary": "[SIFF Cinema Downtown] M&#250;sica!", "location": "SIFF Cinema Downtown", "date": "2024-05-10T13:15-07:00[US/Pacific]", "duration": "PT1H12M" },
    { "description": "", "summary": "[SIFF Cinema Downtown] Songs of Earth", "location": "SIFF Cinema Downtown", "date": "2024-05-10T15:30-07:00[US/Pacific]", "duration": "PT1H31M" },
    { "description": "", "summary": "[SIFF Cinema Downtown] Janet Planet", "location": "SIFF Cinema Downtown", "date": "2024-05-10T18:00-07:00[US/Pacific]", "duration": "PT1H53M" },
    { "description": "", "summary": "[SIFF Cinema Downtown] Scorched Earth", "location": "SIFF Cinema Downtown", "date": "2024-05-10T20:45-07:00[US/Pacific]", "duration": "PT1H41M" }
    ]
}, {
    config: {
        name: "SIFF Cinema Uptown",
        cssSelector: ".Uptown",
    },
    events: [
        { "description": "", "summary": "[SIFF Cinema Uptown] Woodland", "location": "SIFF Cinema Uptown", "date": "2024-05-10T12:30-07:00[US/Pacific]", "duration": "PT1H40M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] Agent of Happiness", "location": "SIFF Cinema Uptown", "date": "2024-05-10T15:30-07:00[US/Pacific]", "duration": "PT1H33M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] So This Is Christmas", "location": "SIFF Cinema Uptown", "date": "2024-05-10T18:00-07:00[US/Pacific]", "duration": "PT1H30M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] The Queen of My Dreams", "location": "SIFF Cinema Uptown", "date": "2024-05-10T20:30-07:00[US/Pacific]", "duration": "PT1H37M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] Hajjan", "location": "SIFF Cinema Uptown", "date": "2024-05-10T13:00-07:00[US/Pacific]", "duration": "PT2H2M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] Dancing on the Edge of a Volcano", "location": "SIFF Cinema Uptown", "date": "2024-05-10T16:00-07:00[US/Pacific]", "duration": "PT1H24M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] Terrestrial Verses", "location": "SIFF Cinema Uptown", "date": "2024-05-10T18:30-07:00[US/Pacific]", "duration": "PT1H17M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] Black Box Diaries", "location": "SIFF Cinema Uptown", "date": "2024-05-10T21:00-07:00[US/Pacific]", "duration": "PT1H44M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] A Journey in Spring", "location": "SIFF Cinema Uptown", "date": "2024-05-10T13:30-07:00[US/Pacific]", "duration": "PT1H30M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] &#192;ma Gloria", "location": "SIFF Cinema Uptown", "date": "2024-05-10T16:30-07:00[US/Pacific]", "duration": "PT1H24M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] ShortsFest Opening Night", "location": "SIFF Cinema Uptown", "date": "2024-05-10T19:00-07:00[US/Pacific]", "duration": "PT1H24M" },
        { "description": "", "summary": "[SIFF Cinema Uptown] Tim Travers and the Time Traveler’s Paradox", "location": "SIFF Cinema Uptown", "date": "2024-05-10T21:30-07:00[US/Pacific]", "duration": "PT1H43M" }
    ]
}, {
    config: {
        name: "SIFF Cinema Egyptian",
        cssSelector: ".Egyptian"
    },
    events: [{ "description": "", "summary": "[SIFF Cinema Egyptian] I Told You So", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T13:30-07:00[US/Pacific]", "duration": "PT1H40M" },
    { "description": "", "summary": "[SIFF Cinema Egyptian] Tony, Shelly and The Magic Light", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T16:15-07:00[US/Pacific]", "duration": "PT1H22M" },
    { "description": "", "summary": "[SIFF Cinema Egyptian] Luther: Never Too Much", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T18:30-07:00[US/Pacific]", "duration": "PT1H41M" },
    { "description": "", "summary": "[SIFF Cinema Egyptian] I Saw the TV Glow", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T21:15-07:00[US/Pacific]", "duration": "PT1H40M" },
    { "description": "", "summary": "[SIFF Cinema Egyptian] The Primevals", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T23:59-07:00[US/Pacific]", "duration": "PT1H30M" }
    ]
}];

describe('SIFF', () => {
    test('Read a static test HTML file and ensure the events we get back are as expected', async () => {
        const exampleData = await readFile("sources/siff/siff-2024-05-10.html");
        const exampleHTML = parse(exampleData.toString());
        const siffRipper = new SIFFRipper();
        for (const calendar of calendars) {

            const events: RipperEvent[] = await siffRipper.parseEvents(exampleHTML, ZonedDateTime.ofInstant(Instant.ofEpochMilli(1715324400000), ZoneRegion.of("US/Pacific")), calendar.config);
            const rippedRemoved: RipperCalendarEvent[] = events.filter(e => "ripped" in e).map(e => {
                delete (e as any).ripped;
                return e as RipperCalendarEvent;
            });
            expect(JSON.parse(JSON.stringify(rippedRemoved))).toEqual(calendar.events);

        }
    });
});