import { readdir } from 'fs/promises'
import * as path from 'path';
import { accessSync, Dirent, readFileSync } from 'fs';
import YAML from 'yaml';
import { configSchema, ImportError, FileParseError, Ripper, RipperError } from './schema.js';

// Given a directory, assume each subdirectory is a calendar package
// A calendar package requires a ripper.yaml and (for now) a ripper.ts that exports a default implementation of IRipper
export class RipperLoader {
    constructor(private readonly sourcesDir: string) {
    }

    public async loadConfigs(): Promise<[Ripper[], RipperError[]]> {
        const sourceDirectories = await (await readdir(this.sourcesDir, { withFileTypes: true })).filter(c => c.isDirectory());
        let errors: RipperError[] = []
        let rippers: Ripper[] = [];

        const validSourceDirectories: Dirent[] = sourceDirectories.filter(c => {
            const p = path.join(c.path, c.name, "ripper.yaml");
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
                const { config, ripperImpl } = await loadRipper(sourceDirectory);
                rippers.push({ config, ripperImpl });
            }
            catch (e: any) {
                console.error(e);
                const err: ImportError = {
                    type: "ImportError",
                    reason: `Error importing due to ${e}`,
                    error: e,
                    path: sourceDirectory.path
                };
                errors.push(err);

            };
        }
        return [rippers, errors];
    }
}

export async function loadRipper(sourceDirectory: {path: string, name: string}) {
    const configFile = readFileSync(path.join(sourceDirectory.path, sourceDirectory.name, "ripper.yaml")).toString();
    const configJson = YAML.parse(configFile);
    const config = configSchema.parse(configJson);
    const ripperPath = path.join(process.cwd(), sourceDirectory.path, sourceDirectory.name, "ripper.ts");

    const module = await import(ripperPath);
    const ripperClass = new (module).default;
    return { config, ripperImpl: ripperClass };
}

