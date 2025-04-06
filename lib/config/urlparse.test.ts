import { describe, expect, test } from 'vitest';
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
        // This test is empty in the original file
    });
})
