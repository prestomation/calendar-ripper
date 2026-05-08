import { readdir, readFile } from "fs/promises";
import * as path from "path";
import YAML from "yaml";
import { configSchema, externalConfigSchema } from "./config/schema.js";
import { RecurringEventProcessor } from "./config/recurring.js";
import { loadYamlDir } from "./config/dir-loader.js";

export interface CalendarInventoryEntry {
    name: string;
    friendlyname: string;
    description?: string;
    tags: string[];
    url?: string;
    disabled: boolean;
    sourceType: "ripper" | "external" | "recurring";
    ripperType?: string;
    proxy?: string | false;
    schedule?: string;
    /** Parent source name (e.g., "seattle-showlists") for sub-calendars. */
    parentSource?: string;
}

export interface CalendarInventory {
    rippers: CalendarInventoryEntry[];
    external: CalendarInventoryEntry[];
    recurring: CalendarInventoryEntry[];
}

export async function loadCalendarInventory(sourcesDir: string): Promise<CalendarInventory> {
    // Load rippers from sources/*/ripper.yaml. Reserved subdirectories
    // (external/, recurring/) hold per-entry yaml for non-ripper sources;
    // those are loaded separately below.
    const RESERVED_DIRS = new Set(["external", "recurring"]);
    const rippers: CalendarInventoryEntry[] = [];
    const dirs = await readdir(sourcesDir, { withFileTypes: true });

    for (const dir of dirs.filter(d => d.isDirectory() && !RESERVED_DIRS.has(d.name))) {
        const ripperYamlPath = path.join(dir.parentPath, dir.name, "ripper.yaml");
        try {
            const content = await readFile(ripperYamlPath, "utf8");
            const raw = YAML.parse(content);
            const config = configSchema.parse(raw);
            // Add one entry for the source itself
            rippers.push({
                name: config.name,
                friendlyname: config.friendlyname ?? config.name,
                description: config.description,
                tags: config.tags ?? [],
                url: config.url.toString(),
                disabled: config.disabled,
                sourceType: "ripper",
                ripperType: config.type,
                proxy: config.proxy,
            });
            // Add one entry per sub-calendar (for multi-calendar sources like seattle-showlists)
            for (const cal of config.calendars) {
                // Skip sub-calendars that are the same as the source (single-calendar rippers)
                if (cal.name === config.name && !config.disabled) continue;
                rippers.push({
                    name: cal.name,
                    friendlyname: cal.friendlyname,
                    description: config.description,
                    tags: cal.tags ?? config.tags ?? [],
                    url: config.url.toString(),
                    disabled: config.disabled,
                    sourceType: "ripper",
                    ripperType: config.type,
                    proxy: config.proxy,
                    parentSource: config.name,
                });
            }
        } catch (e: unknown) {
            const nodeErr = e as NodeJS.ErrnoException;
            if (nodeErr.code === "ENOENT") {
                continue; // No ripper.yaml in this directory, skip silently
            }
            console.error(`Failed to load ripper config for ${dir.name}:`, e);
        }
    }

    // Load external calendars from sources/external/<name>.yaml
    const externalDir = path.join(sourcesDir, "external");
    const externalRaw = await loadYamlDir(externalDir);
    const externalConfig = externalConfigSchema.parse(externalRaw);
    const external: CalendarInventoryEntry[] = externalConfig.map(entry => ({
        name: entry.name,
        friendlyname: entry.friendlyname,
        description: entry.description,
        tags: entry.tags ?? [],
        url: entry.icsUrl,
        disabled: entry.disabled,
        sourceType: "external" as const,
    }));

    // Load recurring events from sources/recurring/<name>.yaml
    const recurringDir = path.join(sourcesDir, "recurring");
    const processor = new RecurringEventProcessor(recurringDir);
    const events = processor.getEvents();
    const recurring: CalendarInventoryEntry[] = events.map(event => ({
        name: event.name,
        friendlyname: event.friendlyname,
        description: event.description,
        tags: event.tags,
        url: event.url,
        disabled: false,
        sourceType: "recurring" as const,
        schedule: event.schedule,
    }));

    return { rippers, external, recurring };
}

export function searchInventory(inventory: CalendarInventory, query: string): CalendarInventoryEntry[] {
    const q = query.toLowerCase();
    const all = [...inventory.rippers, ...inventory.external, ...inventory.recurring];
    return all.filter(entry =>
        entry.name.toLowerCase().includes(q) ||
        entry.friendlyname.toLowerCase().includes(q) ||
        (entry.description?.toLowerCase().includes(q) ?? false) ||
        entry.tags.some(tag => tag.toLowerCase().includes(q))
    );
}
