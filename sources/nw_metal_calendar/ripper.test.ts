
import { describe, expect, test } from '@jest/globals';
import { readFile } from 'fs/promises';
import SAFRipper from './ripper.js';
import { parse } from 'node-html-parser';
import { Instant, ZoneRegion, ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';
import NWMetalRipper from './ripper.js';



const expectedEvents = [
    {
        "summary": "[NWMetal] 3 Inches of Blood, Toxic Holocaust, Xoth",
        "date": "2024-06-07T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Internal Realm (album release)",
        "date": "2024-06-08T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Spiter, Desolus, Snakebite Kiss, Vaulderie",
        "date": "2024-06-10T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Belltown Yacht Club"
    },
    {
        "summary": "[NWMetal] As I Lay Dying, Chelsea Grin, Entheos",
        "date": "2024-07-13T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Temple Theatre (Tacoma)"
    },
    {
        "summary": "[NWMetal] Headless Bastard, Maxx Shredroom, Laserbeans",
        "date": "2024-06-14T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "the Kraken Bar"
    },
    {
        "summary": "[NWMetal] BOTCH, Mortiferum, Caustic Wound",
        "date": "2024-06-14T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Glyph, Empress, Tower Hill, Rope",
        "date": "2024-06-14T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] BOTCH, Helms Alee, Great Falls",
        "date": "2024-06-15T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Exhumed, Skeletal Remains, Morbikon",
        "date": "2024-06-16T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Madame Lou&#8217;s"
    },
    {
        "summary": "[NWMetal] Abrams, Goya, Sorcia",
        "date": "2024-06-18T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Clock-Out Lounge"
    },
    {
        "summary": "[NWMetal] REZN, Mute Duo",
        "date": "2024-06-19T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Sumac, White Boy Scream, Grave Infestation",
        "date": "2024-06-22T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Clock-Out Lounge"
    },
    {
        "summary": "[NWMetal] A Skylit Drive, Silent Theory, What&#8217;s Wrong",
        "date": "2024-06-22T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Funhouse"
    },
    {
        "summary": "[NWMetal] Gorgatron, Casket Robbery, Voraath",
        "date": "2024-06-23T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Funhouse"
    },
    {
        "summary": "[NWMetal] Eternal, Skelm, Impertinence, Baptation",
        "date": "2024-06-25T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Overkill Lounge (Tacoma)"
    },
    {
        "summary": "[NWMetal] Eternal, SerpentSpeech, Void Dancer, Resin Cough",
        "date": "2024-06-26T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Jules Maes Saloon"
    },
    {
        "summary": "[NWMetal] Phrenelith, Witch Vomit, Noroth",
        "date": "2024-06-27T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "High Water Mark (Portland)"
    },
    {
        "summary": "[NWMetal] Phrenelith, Excarnated Entity, Noroth, Degraved",
        "date": "2024-06-28T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Jules Maes"
    },
    {
        "summary": "[NWMetal] Archspire, Aborted, Carcosa, Alluvial",
        "date": "2024-06-29T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Mizmor, Tithe",
        "date": "2024-07-06T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Eight Bells, Serpentent, Izthmi",
        "date": "2024-07-06T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Belltown Yacht Club"
    },
    {
        "summary": "[NWMetal] Red Fang, Spoon Benders",
        "date": "2024-07-11T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Yob, Sandrider",
        "date": "2024-07-12T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Arkaik, Cyborg Octopus, Dessiderium",
        "date": "2024-07-12T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Funhouse"
    },
    {
        "summary": "[NWMetal] Necrot, Phobophilic, Street Tombs, Witch Vomit",
        "date": "2024-07-12T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Clock-Out Lounge"
    },
    {
        "summary": "[NWMetal] A Day To Remember, The Story So Far, Four Year Strong, Scowl",
        "date": "2024-07-15T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "WAMU Theater"
    },
    {
        "summary": "[NWMetal] Fallujah, Persefone, Vulvodynia, Dawn of Ouroboros",
        "date": "2024-07-19T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Pallbearer, Inter Arma, The Keening",
        "date": "2024-07-19T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Toxic Reign, Schmutzhund, Distest",
        "date": "2024-07-20T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "the Kraken Bar"
    },
    {
        "summary": "[NWMetal] Primus, Coheed and Cambria, Guerilla Toss",
        "date": "2024-07-20T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Spokane Pavilion"
    },
    {
        "summary": "[NWMetal] Ragana, Agriculture",
        "date": "2024-07-25T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Madame Lou&#8217;s"
    },
    {
        "summary": "[NWMetal] Tithe, Vulnere, Vile Rites, Villainous Temple",
        "date": "2024-07-25T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "High Water Mark (Portland)"
    },
    {
        "summary": "[NWMetal] Cloud Rat, Mem//Brane, Baring Teeth, Flesh Produce",
        "date": "2024-07-27T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Black Lodge"
    },
    {
        "summary": "[NWMetal] Tithe, Vulnere, Vile Rites, Baptation",
        "date": "2024-07-28T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Overkill Lounge (Tacoma)"
    },
    {
        "summary": "[NWMetal] King Buzzo, Trevor Dunn, JD Pinkus",
        "date": "2024-08-10T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Neumos"
    },
    {
        "summary": "[NWMetal] Megadeth, Mudvayne, All That Remains",
        "date": "2024-08-12T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "White River Ampitheatre (Auburn)"
    },
    {
        "summary": "[NWMetal] Skinlab, Short Fuse, Another Demon",
        "date": "2024-08-14T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Anvil, Serpent Rider, Pulsifier, more",
        "date": "2024-08-15T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] Lamb of God, Mastodon, Kerry King, Malevolence",
        "date": "2024-08-17T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showare Center"
    },
    {
        "summary": "[NWMetal]  Mastodon, Lamb of God, Kerry King, Malevolence",
        "date": "2024-08-18T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Theater of the Clouds, Moda Center (Portland)"
    },
    {
        "summary": "[NWMetal] Haunt, Savage Master, Vanishment",
        "date": "2024-08-23T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Red Mesa, Sorcia",
        "date": "2024-08-24T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal] In This Moment, Avatar, TX2",
        "date": "2024-08-25T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "The Moore Theatre"
    },
    {
        "summary": "[NWMetal] Goatwhore, Vitriol, Thantifaxath",
        "date": "2024-08-25T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Dante&#8217;s (Portland)"
    },
    {
        "summary": "[NWMetal] Goatwhore, Vitriol, Thantifaxath",
        "date": "2024-08-27T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Substation"
    },
    {
        "summary": "[NWMetal]  Metallica, Pantera, Mammoth WVH",
        "date": "2024-08-30T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Lumen Field"
    },
    {
        "summary": "[NWMetal]  Metallica, Five Finger Death Punch, Ice Nine Kills",
        "date": "2024-09-01T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Lumen Field"
    },
    {
        "summary": "[NWMetal] Have A Nice Life, Mamaleek, Jenny Haniver",
        "date": "2024-09-01T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Molder, Dripping Decay, Decaying Crypt",
        "date": "2024-09-03T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Belltown Yacht Club"
    },
    {
        "summary": "[NWMetal] Signs of the Swarm, Cane Hill, Ov Sulfur, 156/Silence, A Wake In Providence",
        "date": "2024-09-11T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Testament, Kreator, Possessed",
        "date": "2024-09-16T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox SoDo"
    },
    {
        "summary": "[NWMetal] Mortiis, Sombre Arcane, Malfet",
        "date": "2024-09-17T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Amorphis, Dark Tranquillity, Fires In The Distance",
        "date": "2024-09-22T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Boris, Starcrawler",
        "date": "2024-10-02T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Korn, Gojira, Spiritbox",
        "date": "2024-10-08T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "MODA Center (Portland)"
    },
    {
        "summary": "[NWMetal] Carnifex, Mental Cruelty, Organectomy, Heavy Hitter",
        "date": "2024-10-09T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Korn, Gojira, Spiritbox",
        "date": "2024-10-10T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Tacoma Dome (Tacoma)"
    },
    {
        "summary": "[NWMetal] Miss May I, In Hearts Wake, Traitors, Bloom",
        "date": "2024-10-11T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "El Corazon"
    },
    {
        "summary": "[NWMetal] Iron Maiden, The Hu",
        "date": "2024-10-14T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "MODA Center (Portland)"
    },
    {
        "summary": "[NWMetal] Iron Maiden, The Hu",
        "date": "2024-10-16T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Tacoma Dome (Tacoma)"
    },
    {
        "summary": "[NWMetal] Hatebreed, Carcass, Harms Way, Crypta",
        "date": "2024-10-20T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox SoDo"
    },
    {
        "summary": "[NWMetal] Death Angel, W.A.S.P., Unto Others",
        "date": "2024-10-29T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Moore Theatre"
    },
    {
        "summary": "[NWMetal] Animals As Leaders, Plini",
        "date": "2024-10-31T19:00-07:00[America/Los_Angeles]",
        "duration": "PT4H",
        "location": "Showbox"
    },
    {
        "summary": "[NWMetal] Morbid Angel, Suffocation, Uada, Mortiferum, Fulci, Knoll",
        "date": "2024-11-30T19:00-08:00[America/Los_Angeles]",
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