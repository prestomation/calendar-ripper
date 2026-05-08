import { readdir } from 'fs/promises'
import * as path from 'path';
import { accessSync, Dirent, readFileSync } from 'fs';
import YAML from 'yaml';
import { configSchema, ImportError, FileParseError, Ripper, RipperError, IRipper } from './schema.js';
import { SquarespaceRipper } from './squarespace.js';
import { TicketmasterRipper } from './ticketmaster.js';
import { AXSRipper } from './axs.js';
import { EventbriteRipper } from './eventbrite.js';
import { DICERipper } from './dice.js';
import { StyledCalendarRipper } from './styledcalendar.js';
import { SpotHopperRipper } from './spothopper.js';

const BUILTIN_RIPPERS: Record<string, new () => IRipper> = {
    squarespace: SquarespaceRipper,
    ticketmaster: TicketmasterRipper,
    axs: AXSRipper,
    eventbrite: EventbriteRipper,
    dice: DICERipper,
    styledcalendar: StyledCalendarRipper,
    spothopper: SpotHopperRipper,
};

// Given a directory, assume each subdirectory is a calendar package
// A calendar package requires a ripper.yaml and either a `type` field for built-in rippers or a ripper.ts with a custom implementation
export class RipperLoader {
    constructor(private readonly sourcesDir: string) {
    }

    public async loadConfigs(): Promise<[Ripper[], RipperError[]]> {
        const sourceDirectories = await (await readdir(this.sourcesDir, { withFileTypes: true })).filter(c => c.isDirectory());
        let errors: RipperError[] = []
        let rippers: Ripper[] = [];

        // Reserved subdirectories under sources/ that hold per-entry yaml
        // files for non-ripper sources (external ICS feeds, recurring events).
        // Skip them silently; they don't have a ripper.yaml.
        const RESERVED_DIRS = new Set(["external", "recurring"]);

        const validSourceDirectories: Dirent[] = sourceDirectories.filter(c => {
            if (RESERVED_DIRS.has(c.name)) return false;
            const p = path.join(c.parentPath, c.name, "ripper.yaml");
            try {
                accessSync(p);
                return true;
            } catch (e) {
                // Doesn't exist or similar, filter it out
                let msg = `Skipping ${p} as it does not exist`;
                const err: FileParseError = {
                    type: "FileParseError",
                    reason: msg, path: p
                };
                errors.push(err);
                return false;
            }
        });

        for (const sourceDirectory of validSourceDirectories) {
            try {
                console.log(`Loading config from ${sourceDirectory.name}`);
                const { config, ripperImpl } = await loadRipper(sourceDirectory);
                rippers.push({ config, ripperImpl });
            }
            catch (e: any) {
                console.error(e);
                const err: ImportError = {
                    type: "ImportError",
                    reason: `Error importing due to ${e}`,
                    error: e,
                    path: sourceDirectory.parentPath
                };
                errors.push(err);

            };
        }
        return [rippers, errors];
    }
}

export async function loadRipper(sourceDirectory: {parentPath: string, name: string}) {
    const configFile = readFileSync(path.join(sourceDirectory.parentPath, sourceDirectory.name, "ripper.yaml")).toString();
    const configJson = YAML.parse(configFile);
    const config = configSchema.parse(configJson);

    if (config.type) {
        const RipperClass = BUILTIN_RIPPERS[config.type];
        if (!RipperClass) {
            throw new Error(`Unknown built-in ripper type: ${config.type}`);
        }
        return { config, ripperImpl: new RipperClass() };
    }

    const ripperPath = path.join(process.cwd(), sourceDirectory.parentPath, sourceDirectory.name, "ripper.ts");
    const module = await import(ripperPath);
    const ripperClass = new (module).default;
    return { config, ripperImpl: ripperClass };
}
