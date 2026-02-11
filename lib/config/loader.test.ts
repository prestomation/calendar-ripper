import { describe, expect, test } from 'vitest';
import { RipperLoader, loadRipper } from './loader.js';
import { FileParseError } from './schema.js';
import { SquarespaceRipper } from './squarespace.js';

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

    test('loads squarespace sources via type field without ripper.ts', async () => {
            const loader = new RipperLoader("sources/");
            const [configs, _errors] = await loader.loadConfigs();

            const jcccw = configs.find(c => c.config.name === "jcccw");
            expect(jcccw).toBeDefined();
            expect(jcccw!.config.type).toBe("squarespace");
            expect(jcccw!.ripperImpl).toBeInstanceOf(SquarespaceRipper);

            const naam = configs.find(c => c.config.name === "naam");
            expect(naam).toBeDefined();
            expect(naam!.config.type).toBe("squarespace");
            expect(naam!.ripperImpl).toBeInstanceOf(SquarespaceRipper);

            const wingLuke = configs.find(c => c.config.name === "wing-luke");
            expect(wingLuke).toBeDefined();
            expect(wingLuke!.config.type).toBe("squarespace");
            expect(wingLuke!.ripperImpl).toBeInstanceOf(SquarespaceRipper);
    });
});
