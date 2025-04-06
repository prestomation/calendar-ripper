import { describe, expect, test } from 'vitest';
import { RipperLoader } from './loader.js';
import { FileParseError } from './schema.js';

describe('Config Load', () => {
    test('Only expect error case', async () => {
            const loader = new RipperLoader("sources/");
            const [configs, errors] = await loader.loadConfigs();

            // We'll learn if our error shows up as expected
            expect(errors.length).toBe(1);
            expect(errors[0].type).toBe("FileParseError");
            const e = errors[0] as FileParseError
            expect(e.reason).toBe("Skipping sources/nothing/ripper.yaml as it does not exist");
            expect(e.path).toBe("sources/nothing/ripper.yaml");

            // We trust our Zod parsing in general, just check a few things as a sanity check, and to see our SIFF
            // example imported     
            const siff = configs.filter(c => c.config.name == "siff")[0];
            expect(siff.config.url.toString()).toEqual("https://www.siff.net/calendar?view=grid&date={yyyy-MM-dd}")
    });
});
