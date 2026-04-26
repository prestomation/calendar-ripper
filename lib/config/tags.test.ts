import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import { VALID_TAGS } from './tags.js';
import { configSchema, externalConfigSchema } from './schema.js';

const SOURCES_DIR = join(process.cwd(), 'sources');
const EXTERNAL_YAML = join(SOURCES_DIR, 'external.yaml');

describe('Source tag validation', () => {
    const validTagSet = new Set(VALID_TAGS as string[]);

    describe('external.yaml sources', () => {
        const externalContent = readFileSync(EXTERNAL_YAML, 'utf8');
        const externalSources = externalConfigSchema.parse(YAML.parse(externalContent));

        it('should have at least one external source', () => {
            expect(externalSources.length).toBeGreaterThan(0);
        });

        it.each(externalSources.filter(s => s.tags))('$name has valid tags', (source) => {
            const invalidTags = source.tags!.filter(tag => !validTagSet.has(tag));
            expect(invalidTags, `Invalid tags: ${invalidTags.join(', ')}`).toHaveLength(0);
        });
    });

    describe('ripper.yaml sources', () => {
        const sourceDirs = readdirSync(SOURCES_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => ({ name: d.name, path: join(SOURCES_DIR, d.name) }));

        const configs: { name: string; config: any }[] = [];

        for (const dir of sourceDirs) {
            const ripperPath = join(dir.path, 'ripper.yaml');
            try {
                const content = readFileSync(ripperPath, 'utf8');
                const parsed = configSchema.parse(YAML.parse(content));
                configs.push({ name: dir.name, config: parsed });
            } catch {
                // Skip directories without ripper.yaml
            }
        }

        it('should have at least one ripper config', () => {
            expect(configs.length).toBeGreaterThan(0);
        });

        it.each(configs.filter(c => c.config.tags))('$name ripper has valid tags', ({ name, config }) => {
            const invalidTags = config.tags!.filter((tag: string) => !validTagSet.has(tag));
            expect(invalidTags, `Invalid tags: ${invalidTags.join(', ')}`).toHaveLength(0);
        });

        it.each(configs.flatMap(({ name, config }) =>
            (config.calendars || [])
                .filter((c: any) => c.tags)
                .map((calendar: any) => ({ name: `${name}/${calendar.name}`, tags: calendar.tags }))
        ))('$name calendar has valid tags', ({ name, tags }) => {
            const invalidTags = tags.filter((tag: string) => !validTagSet.has(tag));
            expect(invalidTags, `Invalid tags: ${invalidTags.join(', ')}`).toHaveLength(0);
        });
    });
});
