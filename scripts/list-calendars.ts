import * as path from "path";
import { fileURLToPath } from "url";
import { loadCalendarInventory, searchInventory, CalendarInventory } from "../lib/calendar-inventory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcesDir = path.join(__dirname, "..", "sources");

const args = process.argv.slice(2);

const searchIdx = args.indexOf("--search");
const searchTerm = searchIdx !== -1 ? args[searchIdx + 1] : undefined;

const typeIdx = args.indexOf("--type");
const typeFilter = typeIdx !== -1 ? args[typeIdx + 1] as keyof CalendarInventory : undefined;

const useText = args.includes("--text");

const inventory = await loadCalendarInventory(sourcesDir);

if (searchTerm) {
    const results = searchInventory(inventory, searchTerm);
    if (useText) {
        for (const entry of results) {
            console.log([entry.sourceType, entry.name, entry.friendlyname, entry.tags.join(","), entry.url ?? "", entry.disabled ? "disabled" : "enabled"].join("\t"));
        }
    } else {
        console.log(JSON.stringify(results, null, 2));
    }
} else if (typeFilter) {
    const results = inventory[typeFilter] ?? [];
    if (useText) {
        for (const entry of results) {
            console.log([entry.sourceType, entry.name, entry.friendlyname, entry.tags.join(","), entry.url ?? "", entry.disabled ? "disabled" : "enabled"].join("\t"));
        }
    } else {
        console.log(JSON.stringify(results, null, 2));
    }
} else {
    if (useText) {
        const all = [...inventory.rippers, ...inventory.external, ...inventory.recurring];
        for (const entry of all) {
            console.log([entry.sourceType, entry.name, entry.friendlyname, entry.tags.join(","), entry.url ?? "", entry.disabled ? "disabled" : "enabled"].join("\t"));
        }
    } else {
        console.log(JSON.stringify(inventory, null, 2));
    }
}
