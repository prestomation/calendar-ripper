/**
 * Backfill OpenStreetMap IDs into declared `geo` blocks.
 *
 * Walks every ripper/external/recurring source that has a `geo: {lat, lng}`
 * block without `osmId`/`osmType`, reverse-geocodes the coords against
 * Nominatim, and writes the returned OSM feature back into the YAML.
 *
 * Nominatim often picks the nearest building rather than the venue itself,
 * so this is interactive by default — each candidate is presented and must
 * be confirmed before being written. The usual workflow is a spot-check run
 * against one source before a wider sweep.
 *
 * Usage:
 *   node --loader ts-node/esm scripts/backfill-osm-ids.ts [--source <name>] [--dry-run] [--yes]
 *
 * Flags:
 *   --source <name>  Only process the matching ripper / external / recurring entry
 *   --dry-run        Print what would change but do not write
 *   --yes            Accept every candidate without prompting (use with care)
 */

import { readFile, writeFile, readdir } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import YAML from "yaml";

type OsmType = "node" | "way" | "relation";

interface Candidate {
  file: string;
  label: string;              // human-readable description of the geo block
  lat: number;
  lng: number;
  mutate: (osm: { osmType: OsmType; osmId: number }) => void;
  existingLabel?: string;
}

interface NominatimReverseResult {
  osm_id?: number;
  osm_type?: string;
  display_name?: string;
  class?: string;
  type?: string;
}

const NOMINATIM_USER_AGENT = "206.events/1.0 (https://206.events)";

let lastNominatimCallTime = 0;

async function nominatimReverse(lat: number, lng: number): Promise<NominatimReverseResult | null> {
  // Respect Nominatim's 1 req/sec usage policy.
  const now = Date.now();
  const elapsed = now - lastNominatimCallTime;
  const delay = lastNominatimCallTime > 0 ? Math.max(0, 1100 - elapsed) : 0;
  lastNominatimCallTime = now + delay;
  if (delay > 0) await new Promise(r => setTimeout(r, delay));

  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
    `&format=json&zoom=18&addressdetails=0`;

  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
  });
  if (!res.ok) return null;
  return (await res.json()) as NominatimReverseResult;
}

function normalizeOsmType(value: unknown): OsmType | null {
  if (value === "node" || value === "way" || value === "relation") return value;
  return null;
}

function collectGeoCandidate(
  doc: YAML.Document.Parsed,
  geoNode: unknown,
  label: string,
  file: string,
): Candidate | null {
  if (!YAML.isMap(geoNode)) return null;
  const lat = geoNode.get("lat");
  const lng = geoNode.get("lng");
  const existingLabel = geoNode.get("label");
  const existingOsmId = geoNode.get("osmId");
  const existingOsmType = geoNode.get("osmType");

  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (existingOsmId !== undefined || existingOsmType !== undefined) return null;

  return {
    file,
    label,
    lat,
    lng,
    existingLabel: typeof existingLabel === "string" ? existingLabel : undefined,
    mutate: ({ osmType, osmId }) => {
      // Insert osmType/osmId after lat/lng/label so the YAML stays readable.
      geoNode.set("osmType", osmType);
      geoNode.set("osmId", osmId);
    },
  };
}

async function loadRipperYaml(sourcesDir: string): Promise<Array<{ file: string; doc: YAML.Document.Parsed; name: string }>> {
  const entries = await readdir(sourcesDir, { withFileTypes: true });
  const results: Array<{ file: string; doc: YAML.Document.Parsed; name: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(sourcesDir, entry.name, "ripper.yaml");
    try {
      const raw = await readFile(file, "utf8");
      const doc = YAML.parseDocument(raw);
      const name = String(doc.get("name") ?? entry.name);
      results.push({ file, doc, name });
    } catch {
      // No ripper.yaml in this directory (e.g., shared helper folders).
    }
  }
  return results;
}

async function collectCandidates(sourceFilter: string | null): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const repoRoot = process.cwd();
  const sourcesDir = join(repoRoot, "sources");

  // Rippers
  for (const { file, doc, name } of await loadRipperYaml(sourcesDir)) {
    if (sourceFilter && name !== sourceFilter) continue;
    const geo = doc.get("geo");
    const cand = collectGeoCandidate(doc, geo, `ripper: ${name}`, file);
    if (cand) candidates.push({ ...cand, mutate: (o) => { cand.mutate(o); writeBack(file, doc); } });

    // Per-calendar geo overrides.
    const calendars = doc.get("calendars");
    if (YAML.isSeq(calendars)) {
      for (const cal of calendars.items) {
        if (!YAML.isMap(cal)) continue;
        const calName = String(cal.get("name") ?? "?");
        const calGeo = cal.get("geo");
        const calCand = collectGeoCandidate(doc, calGeo, `ripper: ${name} / calendar: ${calName}`, file);
        if (calCand) candidates.push({ ...calCand, mutate: (o) => { calCand.mutate(o); writeBack(file, doc); } });
      }
    }
  }

  // External calendars (single file, array of entries)
  const externalFile = join(sourcesDir, "external.yaml");
  try {
    const raw = await readFile(externalFile, "utf8");
    const doc = YAML.parseDocument(raw);
    if (YAML.isSeq(doc.contents)) {
      for (const item of doc.contents.items) {
        if (!YAML.isMap(item)) continue;
        const name = String(item.get("name") ?? "?");
        if (sourceFilter && name !== sourceFilter) continue;
        const geo = item.get("geo");
        const cand = collectGeoCandidate(doc, geo, `external: ${name}`, externalFile);
        if (cand) candidates.push({ ...cand, mutate: (o) => { cand.mutate(o); writeBack(externalFile, doc); } });
      }
    }
  } catch (e) {
    console.warn(`Could not load ${externalFile}:`, (e as Error).message);
  }

  // Recurring events (events: [...] under a top-level map)
  const recurringFile = join(sourcesDir, "recurring.yaml");
  try {
    const raw = await readFile(recurringFile, "utf8");
    const doc = YAML.parseDocument(raw);
    const events = doc.get("events");
    if (YAML.isSeq(events)) {
      for (const item of events.items) {
        if (!YAML.isMap(item)) continue;
        const name = String(item.get("name") ?? "?");
        if (sourceFilter && name !== sourceFilter) continue;
        const geo = item.get("geo");
        const cand = collectGeoCandidate(doc, geo, `recurring: ${name}`, recurringFile);
        if (cand) candidates.push({ ...cand, mutate: (o) => { cand.mutate(o); writeBack(recurringFile, doc); } });
      }
    }
  } catch (e) {
    console.warn(`Could not load ${recurringFile}:`, (e as Error).message);
  }

  return candidates;
}

async function writeBack(file: string, doc: YAML.Document.Parsed): Promise<void> {
  const out = String(doc);
  await writeFile(file, out, "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const sourceFilter = sourceIdx >= 0 ? args[sourceIdx + 1] ?? null : null;
  const dryRun = args.includes("--dry-run");
  const autoYes = args.includes("--yes");

  const candidates = await collectCandidates(sourceFilter);
  if (candidates.length === 0) {
    console.log("No eligible geo blocks found (already have osmId, or no lat/lng).");
    return;
  }

  console.log(`Found ${candidates.length} geo block(s) to look up.`);
  if (dryRun) {
    for (const c of candidates) {
      console.log(`  ${c.label}  (${c.lat}, ${c.lng})  [${c.file}]`);
    }
    return;
  }

  const rl = autoYes ? null : createInterface({ input, output });

  let accepted = 0;
  let skipped = 0;
  try {
    for (const c of candidates) {
      console.log(`\n→ ${c.label}`);
      console.log(`  file: ${c.file}`);
      console.log(`  coords: ${c.lat}, ${c.lng}`);
      if (c.existingLabel) console.log(`  label: ${c.existingLabel}`);

      let result: NominatimReverseResult | null = null;
      try {
        result = await nominatimReverse(c.lat, c.lng);
      } catch (e) {
        console.log(`  ✗ reverse geocode failed: ${(e as Error).message}`);
        skipped++;
        continue;
      }

      if (!result || !result.osm_id || !result.osm_type) {
        console.log(`  ✗ no OSM feature returned`);
        skipped++;
        continue;
      }

      const osmType = normalizeOsmType(result.osm_type);
      if (!osmType) {
        console.log(`  ✗ unexpected osm_type: ${result.osm_type}`);
        skipped++;
        continue;
      }

      console.log(`  candidate: ${osmType}/${result.osm_id}  (${result.class ?? "?"}/${result.type ?? "?"})`);
      console.log(`  display:   ${result.display_name ?? "(none)"}`);
      console.log(`  verify:    https://www.openstreetmap.org/${osmType}/${result.osm_id}`);

      let accept = autoYes;
      if (!autoYes && rl) {
        const answer = (await rl.question("  accept? [y/N/q] ")).trim().toLowerCase();
        if (answer === "q") break;
        accept = answer === "y" || answer === "yes";
      }

      if (!accept) {
        console.log("  skipped");
        skipped++;
        continue;
      }

      c.mutate({ osmType, osmId: result.osm_id });
      console.log("  ✓ written");
      accepted++;
    }
  } finally {
    rl?.close();
  }

  console.log(`\nDone. Accepted ${accepted}, skipped ${skipped}.`);
}

main().catch(err => {
  console.error("backfill-osm-ids crashed:", err);
  process.exit(1);
});
