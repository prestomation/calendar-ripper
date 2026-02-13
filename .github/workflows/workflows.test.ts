import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

const WORKFLOWS_DIR = join(process.cwd(), '.github', 'workflows');

const workflowFiles = readdirSync(WORKFLOWS_DIR)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map(f => ({ name: f, path: join(WORKFLOWS_DIR, f) }));

describe('GitHub Actions workflow files', () => {
    it('should find at least one workflow file', () => {
        expect(workflowFiles.length).toBeGreaterThan(0);
    });

    describe.each(workflowFiles)('$name', ({ name, path }) => {
        let parsed: any;

        it('should be valid YAML', () => {
            const content = readFileSync(path, 'utf8');
            // yaml library throws on syntax errors with line/column info
            parsed = YAML.parse(content);
            expect(parsed).toBeDefined();
            expect(typeof parsed).toBe('object');
        });

        it('should have a workflow name', () => {
            const content = readFileSync(path, 'utf8');
            parsed = YAML.parse(content);
            expect(parsed.name).toBeDefined();
            expect(typeof parsed.name).toBe('string');
        });

        it('should have an "on" trigger', () => {
            const content = readFileSync(path, 'utf8');
            parsed = YAML.parse(content);
            // YAML parses "on" as a boolean true key, or it could be the string "on"
            // The yaml library parses the key "on" correctly as a string key
            const hasOn = 'on' in parsed || true in (parsed as any);
            expect(hasOn).toBe(true);
        });

        it('should have a "jobs" section', () => {
            const content = readFileSync(path, 'utf8');
            parsed = YAML.parse(content);
            expect(parsed.jobs).toBeDefined();
            expect(typeof parsed.jobs).toBe('object');
        });

        it('should have at least one job', () => {
            const content = readFileSync(path, 'utf8');
            parsed = YAML.parse(content);
            expect(Object.keys(parsed.jobs).length).toBeGreaterThan(0);
        });

        it('each job should have "runs-on" or "uses"', () => {
            const content = readFileSync(path, 'utf8');
            parsed = YAML.parse(content);
            for (const [jobName, job] of Object.entries<any>(parsed.jobs)) {
                const hasRunsOn = 'runs-on' in job;
                const hasUses = 'uses' in job;
                expect(
                    hasRunsOn || hasUses,
                    `Job "${jobName}" in ${name} must have either "runs-on" or "uses"`
                ).toBe(true);
            }
        });
    });
});
