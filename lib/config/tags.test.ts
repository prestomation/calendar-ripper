import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import { detectTagDuplicates } from './tags.js';
import { configSchema, externalConfigSchema } from './schema.js';

const SOURCES_DIR = join(process.cwd(), 'sources');
const EXTERNAL_DIR = join(SOURCES_DIR, 'external');
const RECURRING_DIR = join(SOURCES_DIR, 'recurring');
const RESERVED_DIRS = new Set(['external', 'recurring']);

function loadYamlDirEntries(dir: string): unknown[] {
    const files = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
    return files.map(f => YAML.parse(readFileSync(join(dir, f), 'utf8')));
}

describe('Source tag consistency', () => {
    // Collect every tag used by every source. With the central allow-list
    // gone the only thing worth checking is that two sources don't spell
    // the same concept differently.
    const allTags = new Set<string>();

    // External calendars (one yaml per entry)
    const externalSources = externalConfigSchema.parse(loadYamlDirEntries(EXTERNAL_DIR));
    for (const s of externalSources) {
        for (const t of s.tags ?? []) allTags.add(t);
    }

    // Ripper configs (one directory per source)
    const sourceDirs = readdirSync(SOURCES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !RESERVED_DIRS.has(d.name))
        .map(d => ({ name: d.name, path: join(SOURCES_DIR, d.name) }));

    for (const dir of sourceDirs) {
        const ripperPath = join(dir.path, 'ripper.yaml');
        try {
            const parsed = configSchema.parse(YAML.parse(readFileSync(ripperPath, 'utf8')));
            for (const t of parsed.tags ?? []) allTags.add(t);
            for (const cal of parsed.calendars) {
                for (const t of cal.tags ?? []) allTags.add(t);
            }
        } catch {
            // Directories without a ripper.yaml are not rippers; skip.
        }
    }

    it('has at least one external source', () => {
        expect(externalSources.length).toBeGreaterThan(0);
    });

    it('has no duplicate tags differing only in case or whitespace', () => {
        const dups = detectTagDuplicates(allTags);
        const message = dups.length === 0
            ? ''
            : 'Found near-duplicate tag spellings — pick one and update the source(s):\n' +
                dups.map(d => `  ${d.spellings.join(' / ')}`).join('\n');
        expect(dups, message).toEqual([]);
    });
});
