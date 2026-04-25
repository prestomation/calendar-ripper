/**
 * Apply OSM IDs (or rejections) from a saved backfill report into the
 * source YAMLs.
 *
 * Reads a report produced by `backfill-osm-ids.ts --report`. Two modes:
 *
 *   --accept <csv>   Write `osmType`/`osmId` for the accepted entries.
 *   --reject <csv>   Write a dated `osmChecked` marker so the venue is
 *                    silenced from `osmGaps` for the cooldown window.
 *
 * Both flags can be combined in one invocation.
 *
 * Usage:
 *   node --loader ts-node/esm scripts/apply-osm-ids.ts \
 *     --report /tmp/osm-backfill-merged.json \
 *     --accept 1,3,5-7 \
 *     --reject 4,9,11
 *
 * This is intentionally separate from backfill-osm-ids.ts so the
 * decision (which matches to accept/reject) can be made non-interactively
 * after a human has reviewed the report.
 */

import { readFile, writeFile } from "fs/promises";
import YAML from "yaml";

interface ReportEntry {
  index: number;
  label: string;
  file: string;
  lat: number;
  lng: number;
  existingLabel?: string | null;
  result?: {
    osmType?: "node" | "way" | "relation" | null;
    osmId?: number | null;
    class?: string | null;
    type?: string | null;
    display_name?: string | null;
    distanceM?: number | null;
  } | null;
}

function parseAcceptList(arg: string): Set<number> {
  const out = new Set<number>();
  for (const tok of arg.split(",")) {
    const trimmed = tok.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      for (let i = a; i <= b; i++) out.add(i);
    } else {
      out.add(parseInt(trimmed, 10));
    }
  }
  return out;
}

/**
 * Walk a YAML document and find the map whose `name` matches the given
 * label. The label from the report looks like:
 *   "ripper: <name>"
 *   "ripper: <name> / calendar: <calname>"
 *   "external: <name>"
 *   "recurring: <name>"
 *
 * Returns the geo map node to mutate, or null.
 */
function findGeoNode(doc: YAML.Document.Parsed, label: string): YAML.YAMLMap | null {
  if (label.startsWith("ripper: ")) {
    const tail = label.slice("ripper: ".length);
    const parts = tail.split(" / calendar: ");
    if (parts.length === 1) {
      const geo = doc.get("geo");
      return YAML.isMap(geo) ? geo : null;
    }
    const calName = parts[1];
    const calendars = doc.get("calendars");
    if (!YAML.isSeq(calendars)) return null;
    for (const cal of calendars.items) {
      if (!YAML.isMap(cal)) continue;
      if (String(cal.get("name")) === calName) {
        const geo = cal.get("geo");
        return YAML.isMap(geo) ? geo : null;
      }
    }
    return null;
  }
  if (label.startsWith("external: ")) {
    const name = label.slice("external: ".length);
    if (!YAML.isSeq(doc.contents)) return null;
    for (const item of doc.contents.items) {
      if (!YAML.isMap(item)) continue;
      if (String(item.get("name")) === name) {
        const geo = item.get("geo");
        return YAML.isMap(geo) ? geo : null;
      }
    }
    return null;
  }
  if (label.startsWith("recurring: ")) {
    const name = label.slice("recurring: ".length);
    const events = doc.get("events");
    if (!YAML.isSeq(events)) return null;
    for (const item of events.items) {
      if (!YAML.isMap(item)) continue;
      if (String(item.get("name")) === name) {
        const geo = item.get("geo");
        return YAML.isMap(geo) ? geo : null;
      }
    }
    return null;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const reportIdx = args.indexOf("--report");
  const acceptIdx = args.indexOf("--accept");
  const rejectIdx = args.indexOf("--reject");
  if (reportIdx < 0 || (acceptIdx < 0 && rejectIdx < 0)) {
    console.error(
      "Usage: apply-osm-ids.ts --report <file> [--accept <csv>] [--reject <csv>]",
    );
    process.exit(2);
  }
  const reportPath = args[reportIdx + 1];
  const acceptSet = acceptIdx >= 0 ? parseAcceptList(args[acceptIdx + 1]) : new Set<number>();
  const rejectSet = rejectIdx >= 0 ? parseAcceptList(args[rejectIdx + 1]) : new Set<number>();

  // Reject set must not overlap accept set — would leave the YAML in a
  // contradictory state (both osmId and osmChecked) that the schema
  // doesn't forbid but represents nonsense.
  const overlap = [...acceptSet].filter(i => rejectSet.has(i));
  if (overlap.length > 0) {
    console.error(`--accept and --reject overlap on indices: ${overlap.join(",")}`);
    process.exit(2);
  }

  const report = JSON.parse(await readFile(reportPath, "utf8")) as ReportEntry[];
  const today = new Date().toISOString().slice(0, 10);

  // Group entries by file so we only re-parse/write each file once.
  type Action = { entry: ReportEntry; kind: "accept" | "reject" };
  const byFile = new Map<string, Action[]>();
  for (const entry of report) {
    let kind: "accept" | "reject" | null = null;
    if (acceptSet.has(entry.index)) kind = "accept";
    else if (rejectSet.has(entry.index)) kind = "reject";
    if (!kind) continue;

    if (kind === "accept" && (!entry.result || !entry.result.osmId || !entry.result.osmType)) {
      console.warn(`  skip [${entry.index}] ${entry.label} — no OSM result to accept`);
      continue;
    }
    const list = byFile.get(entry.file) ?? [];
    list.push({ entry, kind });
    byFile.set(entry.file, list);
  }

  let accepted = 0;
  let rejected = 0;
  for (const [file, actions] of byFile) {
    const raw = await readFile(file, "utf8");
    const doc = YAML.parseDocument(raw);
    for (const { entry, kind } of actions) {
      const geoNode = findGeoNode(doc, entry.label);
      if (!geoNode) {
        console.warn(`  ✗ [${entry.index}] ${entry.label} — no geo block found`);
        continue;
      }
      if (kind === "accept") {
        if (geoNode.has("osmId") || geoNode.has("osmType")) {
          console.warn(`  ⊙ [${entry.index}] ${entry.label} — already has OSM id, skipping`);
          continue;
        }
        geoNode.set("osmType", entry.result!.osmType);
        geoNode.set("osmId", entry.result!.osmId);
        console.log(`  ✓ [${entry.index}] ${entry.label} → ${entry.result!.osmType}/${entry.result!.osmId}`);
        accepted++;
      } else {
        // reject: write/refresh osmChecked. Don't clobber an existing
        // osmId — if a venue is already resolved, it shouldn't be in the
        // reject list at all, and silently overwriting would lose data.
        if (geoNode.has("osmId") || geoNode.has("osmType")) {
          console.warn(`  ⊙ [${entry.index}] ${entry.label} — already has OSM id; refusing to mark rejected`);
          continue;
        }
        geoNode.set("osmChecked", today);
        console.log(`  ✗ [${entry.index}] ${entry.label} → osmChecked=${today}`);
        rejected++;
      }
    }
    await writeFile(file, doc.toString({ flowCollectionPadding: false }), "utf8");
  }

  console.log(`\nWrote ${accepted} OSM IDs and ${rejected} rejection marker(s) across ${byFile.size} file(s).`);
}

main().catch(err => {
  console.error("apply-osm-ids crashed:", err);
  process.exit(1);
});
