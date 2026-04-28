import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { configSchema } from '../../lib/config/schema.js';
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Unexpected Productions ripper config', () => {
    const raw = readFileSync(join(__dirname, 'ripper.yaml'), 'utf-8');
    const config = configSchema.parse(YAML.parse(raw));

    it('parses ripper.yaml without errors', () => {
        expect(config).toBeDefined();
    });

    it('is an Eventbrite built-in ripper', () => {
        expect(config.type).toBe('eventbrite');
    });

    it('has the correct name', () => {
        expect(config.name).toBe('unexpected-productions');
    });

    it('has the expected tags', () => {
        expect(config.tags).toContain('Comedy');
        expect(config.tags).toContain('Pike Place');
    });

    it('has a valid geo with OSM fields', () => {
        expect(config.geo).not.toBeNull();
        expect(config.geo!.lat).toBeCloseTo(47.6097, 3);
        expect(config.geo!.lng).toBeCloseTo(-122.3403, 3);
        expect(config.geo!.osmType).toBe('way');
        expect(config.geo!.osmId).toBe(23797943);
    });

    it('has one calendar named all-events', () => {
        expect(config.calendars).toHaveLength(1);
        expect(config.calendars[0].name).toBe('all-events');
        expect(config.calendars[0].friendlyname).toBe('Unexpected Productions');
    });

    it('has the correct organizerId in the calendar config', () => {
        const calConfig = config.calendars[0].config as Record<string, unknown>;
        expect(calConfig?.organizerId).toBe('6607284485');
    });

    it('has the correct defaultLocation', () => {
        const calConfig = config.calendars[0].config as Record<string, unknown>;
        expect(calConfig?.defaultLocation).toBe('1428 Post Alley, Seattle, WA 98101');
    });
});
