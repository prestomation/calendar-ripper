
import { describe, expect, test } from 'vitest';
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
    events: [{ "description": "", "summary": "[SIFF] Música!", "url": "https://www.siff.net/festival/musica", "location": "SIFF Cinema Downtown", "date": "2024-05-10T13:15-07:00[US/Pacific]", "duration": "PT1H12M" },
    { "description": "", "summary": "[SIFF] Songs of Earth", "url": "https://www.siff.net/festival/songs-of-earth",  "location": "SIFF Cinema Downtown", "date": "2024-05-10T15:30-07:00[US/Pacific]", "duration": "PT1H31M" },
    { "description": "", "summary": "[SIFF] Janet Planet", "url": "https://www.siff.net/festival/janet-planet", "location": "SIFF Cinema Downtown", "date": "2024-05-10T18:00-07:00[US/Pacific]", "duration": "PT1H53M" },
    { "description": "", "summary": "[SIFF] Scorched Earth", "url": "https://www.siff.net/festival/scorched-earth", "location": "SIFF Cinema Downtown", "date": "2024-05-10T20:45-07:00[US/Pacific]", "duration": "PT1H41M" }
    ]
}, {
    config: {
        name: "SIFF Cinema Uptown",
        cssSelector: ".Uptown",
    },
    events: [
        { "description": "", "summary": "[SIFF] Woodland", "url": "https://www.siff.net/festival/woodland","location": "SIFF Cinema Uptown", "date": "2024-05-10T12:30-07:00[US/Pacific]", "duration": "PT1H40M" },
        { "description": "", "summary": "[SIFF] Agent of Happiness", "url": "https://www.siff.net/festival/agent-of-happiness", "location": "SIFF Cinema Uptown", "date": "2024-05-10T15:30-07:00[US/Pacific]", "duration": "PT1H33M" },
        { "description": "", "summary": "[SIFF] So This Is Christmas", "url": "https://www.siff.net/festival/so-this-is-christmas", "location": "SIFF Cinema Uptown", "date": "2024-05-10T18:00-07:00[US/Pacific]", "duration": "PT1H30M" },
        { "description": "", "summary": "[SIFF] The Queen of My Dreams", "url": "https://www.siff.net/festival/the-queen-of-my-dreams", "location": "SIFF Cinema Uptown", "date": "2024-05-10T20:30-07:00[US/Pacific]", "duration": "PT1H37M" },
        { "description": "", "summary": "[SIFF] Hajjan", "url": "https://www.siff.net/festival/hajjan", "location": "SIFF Cinema Uptown", "date": "2024-05-10T13:00-07:00[US/Pacific]", "duration": "PT2H2M" },
        { "description": "", "summary": "[SIFF] Dancing on the Edge of a Volcano", "url": "https://www.siff.net/festival/dancing-on-the-edge-of-a-volcano", "location": "SIFF Cinema Uptown", "date": "2024-05-10T16:00-07:00[US/Pacific]", "duration": "PT1H24M" },
        { "description": "", "summary": "[SIFF] Terrestrial Verses", "url": "https://www.siff.net/festival/terrestrial-verses", "location": "SIFF Cinema Uptown", "date": "2024-05-10T18:30-07:00[US/Pacific]", "duration": "PT1H17M" },
        { "description": "", "summary": "[SIFF] Black Box Diaries", "url": "https://www.siff.net/festival/black-box-diaries", "location": "SIFF Cinema Uptown", "date": "2024-05-10T21:00-07:00[US/Pacific]", "duration": "PT1H44M" },
        { "description": "", "summary": "[SIFF] A Journey in Spring", "url": "https://www.siff.net/festival/a-journey-in-spring", "location": "SIFF Cinema Uptown", "date": "2024-05-10T13:30-07:00[US/Pacific]", "duration": "PT1H30M" },
        { "description": "", "summary": "[SIFF] Àma Gloria", "url": "https://www.siff.net/festival/ama-gloria", "location": "SIFF Cinema Uptown", "date": "2024-05-10T16:30-07:00[US/Pacific]", "duration": "PT1H24M" },
        { "description": "", "summary": "[SIFF] ShortsFest Opening Night", "url": "https://www.siff.net/festival/shortsfest-opening-night-x37524", "location": "SIFF Cinema Uptown", "date": "2024-05-10T19:00-07:00[US/Pacific]", "duration": "PT1H24M" },
        { "description": "", "summary": "[SIFF] Tim Travers and the Time Traveler’s Paradox", "url": "https://www.siff.net/festival/tim-travers-and-the-time-travelers-paradox", "location": "SIFF Cinema Uptown", "date": "2024-05-10T21:30-07:00[US/Pacific]", "duration": "PT1H43M" }
    ]
}, {
    config: {
        name: "SIFF Cinema Egyptian",
        cssSelector: ".Egyptian"
    },
    events: [{ "description": "", "summary": "[SIFF] I Told You So", "url": "https://www.siff.net/festival/i-told-you-so", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T13:30-07:00[US/Pacific]", "duration": "PT1H40M" },
    { "description": "", "summary": "[SIFF] Tony, Shelly and The Magic Light", "url": "https://www.siff.net/festival/tony-shelly-and-the-magic-light", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T16:15-07:00[US/Pacific]", "duration": "PT1H22M" },
    { "description": "", "summary": "[SIFF] Luther: Never Too Much", "url": "https://www.siff.net/festival/luther-never-too-much", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T18:30-07:00[US/Pacific]", "duration": "PT1H41M" },
    { "description": "", "summary": "[SIFF] I Saw the TV Glow", "url": "https://www.siff.net/festival/i-saw-the-tv-glow", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T21:15-07:00[US/Pacific]", "duration": "PT1H40M" },
    { "description": "", "summary": "[SIFF] The Primevals", "url": "https://www.siff.net/festival/the-primevals", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T23:59-07:00[US/Pacific]", "duration": "PT1H30M" }
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