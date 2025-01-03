
import { describe, expect, test } from '@jest/globals';
import { readFile } from 'fs/promises';
import SAFRipper from './ripper.js';
import { parse } from 'node-html-parser';
import { Instant, ZoneRegion, ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';


const currentYear = new Date().getFullYear();  

const expectedEvents = [
    {
        "id": "148059047",
        "summary": "[SAF] 2024 Family Workshops",
        "date": `${currentYear}-02-02T10:00-08:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/148059047/2024-family-workshops"
    },
    {
        "id": "151911832",
        "summary": "[SAF] Columbia City: Expect Random Encounters",
        "date": `${currentYear}-06-01T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911832/columbia-city-expect-random-encounters"
    },
    {
        "id": "151912082",
        "summary": "[SAF] Federal Avenue: Understated Elegance on the Park",
        "date": `${currentYear}-06-01T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912082/federal-avenue-understated-elegance-on-the-park"
    },
    {
        "id": "151911627",
        "summary": "[SAF] Mt. Baker: More Than a View",
        "date": `${currentYear}-06-01T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911627/mt-baker-more-than-a-view"
    },
    {
        "id": "148056219",
        "summary": "[SAF] Piers ⎮ Family Workshop",
        "date": `${currentYear}-06-01T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/148056219/piers-family-workshop"
    },
    {
        "id": "151912280",
        "summary": "[SAF] Ballard Landmark District",
        "date": `${currentYear}-06-07T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912280/ballard-landmark-district"
    },
    {
        "id": "151912328",
        "summary": "[SAF] From Stone to Steel: Seattle Style from Then ‘til Now",
        "date": `${currentYear}-06-08T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912328/from-stone-to-steel-seattle-style-from-then-til-now"
    },
    {
        "id": "151912680",
        "summary": "[SAF] Diamonds & Gold: The Art Deco Skyscraper Northwest Style",
        "date": `${currentYear}-06-08T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912680/diamonds-gold-the-art-deco-skyscraper-northwest-style"
    },
    {
        "id": "151912822",
        "summary": "[SAF] Harvard Belmont District: The Rich Life on Capitol Hill",
        "date": `${currentYear}-06-08T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912822/harvard-belmont-district-the-rich-life-on-capitol-hill"
    },
    {
        "id": "151913006",
        "summary": "[SAF] Queen Anne: Evolution of an Urban Neighborhood",
        "date": `${currentYear}-06-15T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913006/queen-anne-evolution-of-an-urban-neighborhood"
    },
    {
        "id": "151913299",
        "summary": "[SAF] South Lake Union: Then & Now",
        "date": `${currentYear}-06-15T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913299/south-lake-union-then-now"
    },
    {
        "id": "152057297",
        "summary": "[SAF] Seattle Skyline: History, Context & Culture",
        "date": `${currentYear}-06-22T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/152057297/seattle-skyline-history-context-culture"
    },
    {
        "id": "151913438",
        "summary": "[SAF] Through the Looking Glass",
        "date": `${currentYear}-06-22T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913438/through-the-looking-glass"
    },
    {
        "id": "152763162",
        "summary": "[SAF] Hidden Spaces/Public Places",
        "date": `${currentYear}-06-28T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/152763162/hidden-spaces-public-places"
    },
    {
        "id": "151829264",
        "summary": "[SAF] Purple & Gold: From Gothic to Modern at the UW Core",
        "date": `${currentYear}-06-28T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151829264/purple-gold-from-gothic-to-modern-at-the-uw-core"
    },
    {
        "id": "151911848",
        "summary": "[SAF] Columbia City: Expect Random Encounters",
        "date": `${currentYear}-07-06T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911848/columbia-city-expect-random-encounters"
    },
    {
        "id": "151912663",
        "summary": "[SAF] Diamonds & Gold: The Art Deco Skyscraper Northwest Style",
        "date": `${currentYear}-07-06T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912663/diamonds-gold-the-art-deco-skyscraper-northwest-style"
    },
    {
        "id": "151912999",
        "summary": "[SAF] Queen Anne: Evolution of an Urban Neighborhood",
        "date": `${currentYear}-07-06T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912999/queen-anne-evolution-of-an-urban-neighborhood"
    },
    {
        "id": "151912575",
        "summary": "[SAF] Ballard Landmark District",
        "date": `${currentYear}-07-12T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912575/ballard-landmark-district"
    },
    {
        "id": "151912369",
        "summary": "[SAF] From Stone to Steel: Seattle Style from Then ‘til Now",
        "date": `${currentYear}-07-13T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912369/from-stone-to-steel-seattle-style-from-then-til-now"
    }
]

const expectedEvents2 = 
    [
        {
            "id": "161155809",
            "summary": "[SAF] Seattle Skyline: History, Context & Culture",
            "date": "2025-01-18T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161155809/seattle-skyline-history-context-culture"
        },
        {
            "id": "161931449",
            "summary": "[SAF] Design in Depth: New Housing Models for a Changing PNW",
            "date": "2025-01-22T17:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161931449/design-in-depth-new-housing-models-for-a-changing-pnw"
        },
        {
            "id": "161155867",
            "summary": "[SAF] Madrona Neighborhood: Streetcar Suburb; Model for Neighborhood Involvement",
            "date": "2025-01-25T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161155867/madrona-neighborhood-streetcar-suburb-model-for-neighborhood-involvement"
        },
        {
            "id": "160370316",
            "summary": "[SAF] Design Your School ⎮ Family Workshop",
            "date": "2025-02-01T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/160370316/design-your-school-family-workshop"
        },
        {
            "id": "161155912",
            "summary": "[SAF] Diamonds & Gold: The Art Deco Skyscraper Northwest Style",
            "date": "2025-02-01T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161155912/diamonds-gold-the-art-deco-skyscraper-northwest-style"
        },
        {
            "id": "161156023",
            "summary": "[SAF] From Stone to Steel: Seattle Style from Then ‘til Now",
            "date": "2025-02-08T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161156023/from-stone-to-steel-seattle-style-from-then-til-now"
        },
        {
            "id": "161155959",
            "summary": "[SAF] Queen Anne: Evolution of an Urban Neighborhood",
            "date": "2025-02-08T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161155959/queen-anne-evolution-of-an-urban-neighborhood"
        },
        {
            "id": "161156079",
            "summary": "[SAF] Mt. Baker: More Than a View",
            "date": "2025-02-15T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161156079/mt-baker-more-than-a-view"
        },
        {
            "id": "161156128",
            "summary": "[SAF] Harvard Belmont District Tour: The Rich Life on Capitol Hill",
            "date": "2025-02-22T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161156128/harvard-belmont-district-tour-the-rich-life-on-capitol-hill"
        },
        {
            "id": "161156198",
            "summary": "[SAF] South Lake Union: Then & Now",
            "date": "2025-02-22T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/161156198/south-lake-union-then-now"
        },
        {
            "id": "160370699",
            "summary": "[SAF] Skyscrapers ⎮ Family Workshop",
            "date": "2025-03-01T10:00-08:00[America/Los_Angeles]",
            "duration": "PT2H",
            "url": "https://seattlearchitecture.strangertickets.com/events/160370699/skyscrapers-family-workshop"
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

    test('Read a second static test HTML file and ensure the events we get back are as expected', async () => {
        const exampleData = await readFile("sources/seattlearchitecture/saf-2025-01-02.html");
        const exampleHTML = parse(exampleData.toString());
        const safRipper = new SAFRipper();
        const events: RipperEvent[] = await safRipper.parseEvents(exampleHTML, ZonedDateTime.ofInstant(Instant.ofEpochMilli(1715324400000), ZoneRegion.of("US/Pacific")), {});
        const rippedRemoved: RipperCalendarEvent[] = events.filter(e => "ripped" in e).map(e => {
            delete (e as any).ripped;
            return e as RipperCalendarEvent;
        });
        console.log(JSON.stringify(rippedRemoved))
        // expect(JSON.parse(JSON.stringify(rippedRemoved))).toEqual(expectedEvents);
    })
});