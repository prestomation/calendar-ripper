
import { describe, expect, test } from '@jest/globals';
import { readFile } from 'fs/promises';
import SAFRipper from './ripper.js';
import { parse } from 'node-html-parser';
import { Instant, ZoneRegion, ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';



const expectedEvents = [
    {
        "id": "148059047",
        "summary": "[SAF] 2024 Family Workshops",
        "date": "2024-02-02T10:00-08:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/148059047/2024-family-workshops"
    },
    {
        "id": "151911832",
        "summary": "[SAF] Columbia City: Expect Random Encounters",
        "date": "2024-06-01T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911832/columbia-city-expect-random-encounters"
    },
    {
        "id": "151912082",
        "summary": "[SAF] Federal Avenue: Understated Elegance on the Park",
        "date": "2024-06-01T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912082/federal-avenue-understated-elegance-on-the-park"
    },
    {
        "id": "151911627",
        "summary": "[SAF] Mt. Baker: More Than a View",
        "date": "2024-06-01T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911627/mt-baker-more-than-a-view"
    },
    {
        "id": "148056219",
        "summary": "[SAF] Piers ⎮ Family Workshop",
        "date": "2024-06-01T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/148056219/piers-family-workshop"
    },
    {
        "id": "151912280",
        "summary": "[SAF] Ballard Landmark District",
        "date": "2024-06-07T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912280/ballard-landmark-district"
    },
    {
        "id": "151912328",
        "summary": "[SAF] From Stone to Steel: Seattle Style from Then ‘til Now",
        "date": "2024-06-08T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912328/from-stone-to-steel-seattle-style-from-then-til-now"
    },
    {
        "id": "151912680",
        "summary": "[SAF] Diamonds & Gold: The Art Deco Skyscraper Northwest Style",
        "date": "2024-06-08T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912680/diamonds-gold-the-art-deco-skyscraper-northwest-style"
    },
    {
        "id": "151912822",
        "summary": "[SAF] Harvard Belmont District: The Rich Life on Capitol Hill",
        "date": "2024-06-08T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912822/harvard-belmont-district-the-rich-life-on-capitol-hill"
    },
    {
        "id": "151913006",
        "summary": "[SAF] Queen Anne: Evolution of an Urban Neighborhood",
        "date": "2024-06-15T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913006/queen-anne-evolution-of-an-urban-neighborhood"
    },
    {
        "id": "151913299",
        "summary": "[SAF] South Lake Union: Then & Now",
        "date": "2024-06-15T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913299/south-lake-union-then-now"
    },
    {
        "id": "152057297",
        "summary": "[SAF] Seattle Skyline: History, Context & Culture",
        "date": "2024-06-22T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/152057297/seattle-skyline-history-context-culture"
    },
    {
        "id": "151913438",
        "summary": "[SAF] Through the Looking Glass",
        "date": "2024-06-22T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913438/through-the-looking-glass"
    },
    {
        "id": "152763162",
        "summary": "[SAF] Hidden Spaces/Public Places",
        "date": "2024-06-28T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/152763162/hidden-spaces-public-places"
    },
    {
        "id": "151829264",
        "summary": "[SAF] Purple & Gold: From Gothic to Modern at the UW Core",
        "date": "2024-06-28T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151829264/purple-gold-from-gothic-to-modern-at-the-uw-core"
    },
    {
        "id": "151911848",
        "summary": "[SAF] Columbia City: Expect Random Encounters",
        "date": "2024-07-06T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911848/columbia-city-expect-random-encounters"
    },
    {
        "id": "151912663",
        "summary": "[SAF] Diamonds & Gold: The Art Deco Skyscraper Northwest Style",
        "date": "2024-07-06T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912663/diamonds-gold-the-art-deco-skyscraper-northwest-style"
    },
    {
        "id": "151912999",
        "summary": "[SAF] Queen Anne: Evolution of an Urban Neighborhood",
        "date": "2024-07-06T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912999/queen-anne-evolution-of-an-urban-neighborhood"
    },
    {
        "id": "151912575",
        "summary": "[SAF] Ballard Landmark District",
        "date": "2024-07-12T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912575/ballard-landmark-district"
    },
    {
        "id": "151912369",
        "summary": "[SAF] From Stone to Steel: Seattle Style from Then ‘til Now",
        "date": "2024-07-13T10:00-07:00[America/Los_Angeles]",
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912369/from-stone-to-steel-seattle-style-from-then-til-now"
    }
]

describe('SAF', () => {
    test('Read a static test HTML file and ensure the events we get back are as expected', async () => {
        const exampleData = await readFile("sources/seattlearchitecture/saf-2024-05-29.html");
        const exampleHTML = parse(exampleData.toString());
        const safRipper = new SAFRipper();
        const events: RipperEvent[] = await safRipper.parseEvents(exampleHTML, ZonedDateTime.ofInstant(Instant.ofEpochMilli(1715324400000), ZoneRegion.of("US/Pacific")), {});
        const rippedRemoved: RipperCalendarEvent[] = events.filter(e => "ripped" in e).map(e => {
            delete (e as any).ripped;
            return e as RipperCalendarEvent;
        });
        expect(JSON.parse(JSON.stringify(rippedRemoved))).toEqual(expectedEvents);
    })
});