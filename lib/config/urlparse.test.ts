
import { describe, expect, test } from '@jest/globals';
import { URLParser } from './urlparse.js';
// Used so America/Los_Angeles works
import '@js-joda/timezone'




describe('URL Parser isValid', () => {
    test('isValid', () => {
        const parser = new URLParser(new URL("https://www.siff.net/calendar?view=grid&date={yyyy-MM-dd}"));
        expect(parser.isValid()).toBe(true)
        // expect(URLParser.isValid("https://www.siff.net/calendar?view=grid&date={mmmmmmmmm}")).toBe(false)
        const url = parser.getTemplate();

        const parse = new URLParser(new URL("https://www.siff.net/calendar?view=grid&date={yyy-MM-dd}"));
        expect(parse.isValid()).toBe(false)
    });

    test('SIFF', async () => {

        // const url = "https://www.siff.net/calendar?view=grid&date=2024-04-21";

        // const res = await fetch(url);
        // if (!res.ok) {
        //     throw Error(`${res.status} ${res.statusText}`)
        // }

        // const date = ZonedDateTime.now(ZoneRegion.of("America/Los_Angeles")).withDayOfMonth(21).withMinute(0).withSecond(0).withNano(0);
        // const ripper = new SIFFRipper();
        // const htmlString = await res.text();
        // const html = parse(htmlString);
        // const r = ripper.parseEvents(html, date)
    });

})
