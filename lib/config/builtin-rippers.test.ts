import { describe, it, expect, beforeEach } from 'vitest';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { Ripper, RipperConfig, BUILTIN_RIPPER_TYPES, IRipper } from './schema.js';
import { SquarespaceRipper } from './squarespace.js';
import { TicketmasterRipper } from './ticketmaster.js';
import { AXSRipper } from './axs.js';
import { EventbriteRipper } from './eventbrite.js';
import { DICERipper } from './dice.js';

const BUILTIN_RIPPERS: Record<string, new () => IRipper> = {
    squarespace: SquarespaceRipper,
    ticketmaster: TicketmasterRipper,
    axs: AXSRipper,
    eventbrite: EventbriteRipper,
    dice: DICERipper,
};

function makeMinimalRipper(type: string): Ripper {
    const config = {
        name: `test-${type}`,
        description: `Test ${type}`,
        url: new URL('https://example.com'),
        friendlyLink: 'https://example.com',
        disabled: false,
        proxy: false,
        type,
        calendars: [{
            name: `test-cal`,
            friendlyname: `Test Calendar`,
            timezone: ZoneId.of('America/Los_Angeles'),
            config: {},
        }],
    } as unknown as RipperConfig;

    return { config, ripperImpl: new BUILTIN_RIPPERS[type]() };
}

describe('built-in rippers: missing environment variables', () => {
    const ENV_VARS = ['DICE_API_KEY', 'EVENTBRITE_TOKEN', 'TICKETMASTER_API_KEY'];

    beforeEach(() => {
        for (const key of ENV_VARS) {
            delete process.env[key];
        }
    });

    for (const type of BUILTIN_RIPPER_TYPES) {
        it(`${type} ripper does not throw from rip() when env vars are missing`, async () => {
            const ripper = makeMinimalRipper(type);
            const calendars = await ripper.ripperImpl.rip(ripper);

            expect(calendars).toBeDefined();
            expect(Array.isArray(calendars)).toBe(true);
            expect(calendars.length).toBeGreaterThan(0);

            // Rippers that need env vars should report errors, not throw
            for (const cal of calendars) {
                expect(cal.name).toBeDefined();
                expect(Array.isArray(cal.events)).toBe(true);
                expect(Array.isArray(cal.errors)).toBe(true);
            }
        });
    }

    it('dice ripper returns error mentioning DICE_API_KEY', async () => {
        const ripper = makeMinimalRipper('dice');
        const calendars = await ripper.ripperImpl.rip(ripper);
        expect(calendars[0].errors.length).toBeGreaterThan(0);
        expect(calendars[0].errors[0].reason).toContain('DICE_API_KEY');
    });

    it('eventbrite ripper returns error mentioning EVENTBRITE_TOKEN', async () => {
        const ripper = makeMinimalRipper('eventbrite');
        const calendars = await ripper.ripperImpl.rip(ripper);
        expect(calendars[0].errors.length).toBeGreaterThan(0);
        expect(calendars[0].errors[0].reason).toContain('EVENTBRITE_TOKEN');
    });

    it('ticketmaster ripper returns error mentioning TICKETMASTER_API_KEY', async () => {
        const ripper = makeMinimalRipper('ticketmaster');
        const calendars = await ripper.ripperImpl.rip(ripper);
        expect(calendars[0].errors.length).toBeGreaterThan(0);
        expect(calendars[0].errors[0].reason).toContain('TICKETMASTER_API_KEY');
    });
});
