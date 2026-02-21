import { describe, expect, test } from 'vitest';
import { RipperLoader, loadRipper } from './loader.js';
import { SquarespaceRipper } from './squarespace.js';

describe('Config Load', () => {
    test('All configs load without errors', async () => {
            const loader = new RipperLoader("sources/");
            const [configs, errors] = await loader.loadConfigs();

            // All source directories should have valid ripper.yaml files
            expect(errors).toEqual([]);

            // Sanity check: verify a known config loads correctly
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
