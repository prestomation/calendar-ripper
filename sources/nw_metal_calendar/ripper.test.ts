
import { describe, expect, test } from 'vitest';
import { readFile } from 'fs/promises';
import { parse } from 'node-html-parser';
import { Instant, ZoneRegion, ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';
import NWMetalRipper from './ripper.js';


// The test passes Instant.ofEpochMilli(1715324400000) → ~2024-05-10 US/Pacific.
// Events JUN-NOV fall after that date, so they are assigned year 2024.
const FIXTURE_YEAR = 2024;

const expectedEvents = [
    {
        "summary": "[NWMetal] 3 Inches of Blood, Toxic Holocaust, Xoth",
        "date": `${FIXTURE_YEAR}-06-07T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Internal Realm (album release)",
        "date": `${FIXTURE_YEAR}-06-08T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Spiter, Desolus, Snakebite Kiss, Vaulderie",
        "date": `${FIXTURE_YEAR}-06-10T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Belltown Yacht Club"
    },
    {
        "summary": "[NWMetal] As I Lay Dying, Chelsea Grin, Entheos",
        "date": `${FIXTURE_YEAR}-07-13T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Temple Theatre (Tacoma)"
    },
    {
        "summary": "[NWMetal] Headless Bastard, Maxx Shredroom, Laserbeans",
        "date": `${FIXTURE_YEAR}-06-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "the Kraken Bar"
    },
    {
        "summary": "[NWMetal] BOTCH, Mortiferum, Caustic Wound",
        "date": `${FIXTURE_YEAR}-06-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Glyph, Empress, Tower Hill, Rope",
        "date": `${FIXTURE_YEAR}-06-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] BOTCH, Helms Alee, Great Falls",
        "date": `${FIXTURE_YEAR}-06-15T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Death To All, Cryptopsy",
        "date": `${FIXTURE_YEAR}-06-15T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "The Crocodile"
    },
    {
        "summary": "[NWMetal] Death To All, Cryptopsy",
        "date": `${FIXTURE_YEAR}-06-16T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "The Crocodile"
    },
    {
        "summary": "[NWMetal] Exhumed, Skeletal Remains, Morbikon",
        "date": `${FIXTURE_YEAR}-06-16T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Madame Lou’s"
    },
    {
        "summary": "[NWMetal] Abrams, Goya, Sorcia",
        "date": `${FIXTURE_YEAR}-06-18T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Clock-Out Lounge"
    },
    {
        "summary": "[NWMetal] REZN, Mute Duo",
        "date": `${FIXTURE_YEAR}-06-19T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Sumac, White Boy Scream, Grave Infestation",
        "date": `${FIXTURE_YEAR}-06-22T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Clock-Out Lounge"
    },
    {
        "summary": "[NWMetal] A Skylit Drive, Silent Theory, What’s Wrong",
        "date": `${FIXTURE_YEAR}-06-22T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Funhouse"
    },
    {
        "summary": "[NWMetal] Gorgatron, Casket Robbery, Voraath",
        "date": `${FIXTURE_YEAR}-06-23T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Funhouse"
    },
    {
        "summary": "[NWMetal] Eternal, Skelm, Impertinence, Baptation",
        "date": `${FIXTURE_YEAR}-06-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Overkill Lounge (Tacoma)"
    },
    {
        "summary": "[NWMetal] Eternal, SerpentSpeech, Void Dancer, Resin Cough",
        "date": `${FIXTURE_YEAR}-06-26T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Jules Maes Saloon"
    },
    {
        "summary": "[NWMetal] Phrenelith, Witch Vomit, Noroth",
        "date": `${FIXTURE_YEAR}-06-27T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "High Water Mark (Portland)"
    },
    {
        "summary": "[NWMetal] Phrenelith, Excarnated Entity, Noroth, Degraved",
        "date": `${FIXTURE_YEAR}-06-28T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Jules Maes"
    },
    {
        "summary": "[NWMetal] Archspire, Aborted, Carcosa, Alluvial",
        "date": `${FIXTURE_YEAR}-06-29T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Mizmor, Tithe",
        "date": `${FIXTURE_YEAR}-07-06T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Eight Bells, Serpentent, Izthmi",
        "date": `${FIXTURE_YEAR}-07-06T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Belltown Yacht Club"
    },
    {
        "summary": "[NWMetal] Red Fang, Spoon Benders",
        "date": `${FIXTURE_YEAR}-07-11T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Yob, Sandrider",
        "date": `${FIXTURE_YEAR}-07-12T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Arkaik, Cyborg Octopus, Dessiderium",
        "date": `${FIXTURE_YEAR}-07-12T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Funhouse"
    },
    {
        "summary": "[NWMetal] Necrot, Phobophilic, Street Tombs, Witch Vomit",
        "date": `${FIXTURE_YEAR}-07-12T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Clock-Out Lounge"
    },
    {
        "summary": "[NWMetal] A Day To Remember, The Story So Far, Four Year Strong, Scowl",
        "date": `${FIXTURE_YEAR}-07-15T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "WAMU Theater"
    },
    {
        "summary": "[NWMetal] Fallujah, Persefone, Vulvodynia, Dawn of Ouroboros",
        "date": `${FIXTURE_YEAR}-07-19T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Pallbearer, Inter Arma, The Keening",
        "date": `${FIXTURE_YEAR}-07-19T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Toxic Reign, Schmutzhund, Distest",
        "date": `${FIXTURE_YEAR}-07-20T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "the Kraken Bar"
    },
    {
        "summary": "[NWMetal] Primus, Coheed and Cambria, Guerilla Toss",
        "date": `${FIXTURE_YEAR}-07-20T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Spokane Pavilion"
    },
    {
        "summary": "[NWMetal] Ragana, Agriculture",
        "date": `${FIXTURE_YEAR}-07-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Madame Lou’s"
    },
    {
        "summary": "[NWMetal] Tithe, Vulnere, Vile Rites, Villainous Temple",
        "date": `${FIXTURE_YEAR}-07-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "High Water Mark (Portland)"
    },
    {
        "summary": "[NWMetal] Cloud Rat, Mem//Brane, Baring Teeth, Flesh Produce",
        "date": `${FIXTURE_YEAR}-07-27T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Black Lodge"
    },
    {
        "summary": "[NWMetal] Tithe, Vulnere, Vile Rites, Baptation",
        "date": `${FIXTURE_YEAR}-07-28T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Overkill Lounge (Tacoma)"
    },
    {
        "summary": "[NWMetal] King Buzzo, Trevor Dunn, JD Pinkus",
        "date": `${FIXTURE_YEAR}-08-10T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Neumos"
    },
    {
        "summary": "[NWMetal] Megadeth, Mudvayne, All That Remains",
        "date": `${FIXTURE_YEAR}-08-12T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "White River Ampitheatre (Auburn)"
    },
    {
        "summary": "[NWMetal] Skinlab, Short Fuse, Another Demon",
        "date": `${FIXTURE_YEAR}-08-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Anvil, Serpent Rider, Pulsifier, more",
        "date": `${FIXTURE_YEAR}-08-15T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Lamb of God, Mastodon, Kerry King, Malevolence",
        "date": `${FIXTURE_YEAR}-08-17T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showare Center"
    },
    {
        "summary": "[NWMetal]  Mastodon, Lamb of God, Kerry King, Malevolence",
        "date": `${FIXTURE_YEAR}-08-18T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Theater of the Clouds, Moda Center (Portland)"
    },
    {
        "summary": "[NWMetal] Haunt, Savage Master, Vanishment",
        "date": `${FIXTURE_YEAR}-08-23T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Red Mesa, Sorcia",
        "date": `${FIXTURE_YEAR}-08-24T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] In This Moment, Avatar, TX2",
        "date": `${FIXTURE_YEAR}-08-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "The Moore Theatre"
    },
    {
        "summary": "[NWMetal] Goatwhore, Vitriol, Thantifaxath",
        "date": `${FIXTURE_YEAR}-08-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Dante’s (Portland)"
    },
    {
        "summary": "[NWMetal] Goatwhore, Vitriol, Thantifaxath",
        "date": `${FIXTURE_YEAR}-08-27T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal]  Metallica, Pantera, Mammoth WVH",
        "date": `${FIXTURE_YEAR}-08-30T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Lumen Field"
    },
    {
        "summary": "[NWMetal]  Metallica, Five Finger Death Punch, Ice Nine Kills",
        "date": `${FIXTURE_YEAR}-09-01T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Lumen Field"
    },
    {
        "summary": "[NWMetal] Have A Nice Life, Mamaleek, Jenny Haniver",
        "date": `${FIXTURE_YEAR}-09-01T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Molder, Dripping Decay, Decaying Crypt",
        "date": `${FIXTURE_YEAR}-09-03T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Belltown Yacht Club"
    },
    {
        "summary": "[NWMetal] Signs of the Swarm, Cane Hill, Ov Sulfur, 156/Silence, A Wake In Providence",
        "date": `${FIXTURE_YEAR}-09-11T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Testament, Kreator, Possessed",
        "date": `${FIXTURE_YEAR}-09-16T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox SoDo"
    },
    {
        "summary": "[NWMetal] Mortiis, Sombre Arcane, Malfet",
        "date": `${FIXTURE_YEAR}-09-17T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Amorphis, Dark Tranquillity, Fires In The Distance",
        "date": `${FIXTURE_YEAR}-09-22T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Boris, Starcrawler",
        "date": `${FIXTURE_YEAR}-10-02T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Korn, Gojira, Spiritbox",
        "date": `${FIXTURE_YEAR}-10-08T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "MODA Center (Portland)"
    },
    {
        "summary": "[NWMetal] Carnifex, Mental Cruelty, Organectomy, Heavy Hitter",
        "date": `${FIXTURE_YEAR}-10-09T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Korn, Gojira, Spiritbox",
        "date": `${FIXTURE_YEAR}-10-10T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Tacoma Dome (Tacoma)"
    },
    {
        "summary": "[NWMetal] Miss May I, In Hearts Wake, Traitors, Bloom",
        "date": `${FIXTURE_YEAR}-10-11T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Iron Maiden, The Hu",
        "date": `${FIXTURE_YEAR}-10-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "MODA Center (Portland)"
    },
    {
        "summary": "[NWMetal] Iron Maiden, The Hu",
        "date": `${FIXTURE_YEAR}-10-16T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Tacoma Dome (Tacoma)"
    },
    {
        "summary": "[NWMetal] Hatebreed, Carcass, Harms Way, Crypta",
        "date": `${FIXTURE_YEAR}-10-20T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox SoDo"
    },
    {
        "summary": "[NWMetal] Death Angel, W.A.S.P., Unto Others",
        "date": `${FIXTURE_YEAR}-10-29T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Moore Theatre"
    },
    {
        "summary": "[NWMetal] Animals As Leaders, Plini",
        "date": `${FIXTURE_YEAR}-10-31T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Morbid Angel, Suffocation, Uada, Mortiferum, Fulci, Knoll",
        "date": `${FIXTURE_YEAR}-11-30T19:00-08:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon"
    }
]

describe('SAF', () => {
    test('Read a static test HTML file and ensure the events we get back are as expected', async () => {
        const exampleData = await readFile("sources/nw_metal_calendar/nwmetal-2024-06-10.html");
        const exampleHTML = parse(exampleData.toString());
        const safRipper = new NWMetalRipper();
        const events: RipperEvent[] = await safRipper.parseEvents(exampleHTML, ZonedDateTime.ofInstant(Instant.ofEpochMilli(1715324400000), ZoneRegion.of("US/Pacific")), {});
        const rippedRemoved: RipperCalendarEvent[] = events.filter(e => "ripped" in e).map(e => {
            delete (e as any).ripped;
            return e as RipperCalendarEvent;
        });
        expect(JSON.parse(JSON.stringify(rippedRemoved))).toEqual(expectedEvents);
    })
});