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
  lat?: string;
  lon?: string;
  distanceM?: number;
}

const NOMINATIM_USER_AGENT = "206.events/1.0 (https://206.events)";

let lastNominatimCallTime = 0;

// Nominatim's usage policy is 1 req/sec. Match `lib/geocoder.ts` exactly so
// when this script and the main build share the same Nominatim budget the
// pacing is consistent.
const NOMINATIM_INTERVAL_MS = 1000;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimCallTime;
  const delay = lastNominatimCallTime > 0 ? Math.max(0, NOMINATIM_INTERVAL_MS - elapsed) : 0;
  lastNominatimCallTime = now + delay;
  if (delay > 0) await new Promise(r => setTimeout(r, delay));
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function nominatimSearchOnce(query: string, declaredLat: number, declaredLng: number): Promise<NominatimReverseResult | null> {
  await rateLimit();
  const encoded = encodeURIComponent(query);
  // Use a generous PNW viewbox (matches lib/geocoder.ts) to bias toward
  // Seattle-area features when the venue name is ambiguous.
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encoded}` +
    `&format=json&limit=1&countrycodes=us&addressdetails=0` +
    `&viewbox=-122.6,47.3,-121.9,47.8`;
  const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT } });
  if (!res.ok) return null;
  const data = (await res.json()) as NominatimReverseResult[];
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  const rLat = parseFloat(first.lat ?? "");
  const rLng = parseFloat(first.lon ?? "");
  if (isNaN(rLat) || isNaN(rLng)) return null;
  const distance = haversineMeters(declaredLat, declaredLng, rLat, rLng);
  return { ...first, distanceM: Math.round(distance) };
}

/**
 * Forward-geocode the venue's label string. Nominatim's /search returns
 * the best-matching named feature (a venue, building, or address node)
 * rather than whatever happens to be nearest to a coordinate — much more
 * likely to hit the actual OSM feature we want than /reverse is.
 *
 * Tries three query shapes in order (stopping at the first non-null):
 *   1. The full label string as-is.
 *   2. Just the venue name (everything before the first comma) + ", Seattle, WA".
 *   3. Just the address (everything after the first comma).
 *
 * Mirrors the strategy in lib/geocoder.ts's `resolveEventCoords`.
 */
async function nominatimSearch(
  query: string,
  declaredLat: number,
  declaredLng: number,
): Promise<(NominatimReverseResult & { strategy: string }) | null> {
  const attempts: Array<{ q: string; strategy: string }> = [{ q: query, strategy: "full-label" }];
  const firstComma = query.indexOf(",");
  if (firstComma > 0) {
    const venueName = query.slice(0, firstComma).trim();
    const address = query.slice(firstComma + 1).trim();
    if (venueName) attempts.push({ q: `${venueName}, Seattle, WA`, strategy: "name-only" });
    if (address) attempts.push({ q: address, strategy: "address-only" });
  }
  for (const { q, strategy } of attempts) {
    const r = await nominatimSearchOnce(q, declaredLat, declaredLng);
    if (r && r.osm_id && r.osm_type) {
      return { ...r, strategy };
    }
  }
  return null;
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
  const out = doc.toString({ flowCollectionPadding: false });
  await writeFile(file, out, "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const sourceFilter = sourceIdx >= 0 ? args[sourceIdx + 1] ?? null : null;
  const dryRun = args.includes("--dry-run");
  const autoYes = args.includes("--yes");
  const reportIdx = args.indexOf("--report");
  const reportPath = reportIdx >= 0 ? args[reportIdx + 1] ?? "/tmp/osm-backfill-report.json" : null;

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

  if (reportPath) {
    const report: Array<Record<string, unknown>> = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      process.stdout.write(`[${i + 1}/${candidates.length}] ${c.label}... `);
      let result: NominatimReverseResult | null = null;
      let error: string | null = null;
      if (!c.existingLabel) {
        console.log("(no label — skipping forward-geocode)");
        report.push({
          index: i + 1,
          label: c.label,
          file: c.file,
          lat: c.lat,
          lng: c.lng,
          existingLabel: null,
          result: null,
          error: "no label",
        });
        continue;
      }
      try {
        result = await nominatimSearch(c.existingLabel, c.lat, c.lng);
      } catch (e) {
        error = (e as Error).message;
      }
      const osmType = result ? normalizeOsmType(result.osm_type) : null;
      const osmId = typeof result?.osm_id === "number" ? result.osm_id : null;
      report.push({
        index: i + 1,
        label: c.label,
        file: c.file,
        lat: c.lat,
        lng: c.lng,
        existingLabel: c.existingLabel,
        result: result
          ? {
              osmType,
              osmId,
              class: result.class ?? null,
              type: result.type ?? null,
              display_name: result.display_name ?? null,
              distanceM: result.distanceM ?? null,
              strategy: (result as { strategy?: string }).strategy ?? null,
            }
          : null,
        error,
      });
      if (error) {
        console.log(`ERROR: ${error}`);
      } else if (!result || !osmType || !osmId) {
        console.log(`(no result)`);
      } else {
        const dist = result.distanceM ?? "?";
        const strat = (result as { strategy?: string }).strategy ?? "?";
        console.log(`${osmType}/${osmId} (${result.class ?? "?"}/${result.type ?? "?"}) ${dist}m [${strat}]`);
      }
    }
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nReport written to ${reportPath}`);
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

      if (!c.existingLabel) {
        console.log("  ✗ no label to forward-geocode");
        skipped++;
        continue;
      }
      let result: NominatimReverseResult | null = null;
      try {
        result = await nominatimSearch(c.existingLabel, c.lat, c.lng);
      } catch (e) {
        console.log(`  ✗ forward geocode failed: ${(e as Error).message}`);
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

      const dist = result.distanceM ?? "?";
      console.log(`  candidate: ${osmType}/${result.osm_id}  (${result.class ?? "?"}/${result.type ?? "?"})  ${dist}m from declared`);
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
