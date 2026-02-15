/**
 * Check for missing calendar URLs between deployed site and new build.
 * This ensures backwards compatibility - calendar URLs people depend on shouldn't disappear.
 *
 * Usage: node --loader ts-node/esm scripts/check-missing-urls.ts <deployed-site-url>
 * Example: node --loader ts-node/esm scripts/check-missing-urls.ts https://example.github.io/calendar-ripper
 */

import { readFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import { resolve, normalize } from "path";

interface Calendar {
  name: string;
  icsUrl: string;
}

interface Ripper {
  name: string;
  calendars?: Calendar[];
}

interface Manifest {
  rippers?: Ripper[];
  recurringCalendars?: Calendar[];
  externalCalendars?: Calendar[];
  tags?: string[];
}

/**
 * Sanitizes a tag name to match the filename format used by tag_aggregator.ts
 * e.g., "Beacon Hill" -> "beacon-hill"
 */
function sanitizeTagName(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

/**
 * Validates that an icsUrl is safe to use as a filename (no path traversal)
 * Returns true if the URL is safe, false otherwise
 */
function isValidIcsUrl(icsUrl: string): boolean {
  // Must end with .ics
  if (!icsUrl.endsWith(".ics")) {
    return false;
  }
  // Must not contain path traversal sequences
  if (icsUrl.includes("..") || icsUrl.includes("/") || icsUrl.includes("\\")) {
    return false;
  }
  // Must only contain safe characters (alphanumeric, dash, underscore, dot)
  if (!/^[a-zA-Z0-9_.-]+$/.test(icsUrl)) {
    return false;
  }
  return true;
}

/**
 * Validates that a file path is within the expected output directory
 */
function isPathWithinOutput(filePath: string, outputDir: string): boolean {
  const resolvedPath = resolve(outputDir, filePath);
  const resolvedOutput = resolve(outputDir);
  return normalize(resolvedPath).startsWith(normalize(resolvedOutput));
}

function extractIcsUrls(manifest: Manifest): Set<string> {
  const urls = new Set<string>();

  // Ripper calendars
  if (manifest.rippers) {
    for (const ripper of manifest.rippers) {
      if (ripper.calendars) {
        for (const calendar of ripper.calendars) {
          if (calendar.icsUrl && isValidIcsUrl(calendar.icsUrl)) {
            urls.add(calendar.icsUrl);
          }
        }
      }
    }
  }

  // Recurring calendars
  if (manifest.recurringCalendars) {
    for (const calendar of manifest.recurringCalendars) {
      if (calendar.icsUrl && isValidIcsUrl(calendar.icsUrl)) {
        urls.add(calendar.icsUrl);
      }
    }
  }

  // External calendars
  if (manifest.externalCalendars) {
    for (const calendar of manifest.externalCalendars) {
      if (calendar.icsUrl && isValidIcsUrl(calendar.icsUrl)) {
        urls.add(calendar.icsUrl);
      }
    }
  }

  // Tag aggregation calendars (names are sanitized in tag_aggregator.ts)
  if (manifest.tags) {
    for (const tag of manifest.tags) {
      const tagUrl = `tag-${sanitizeTagName(tag)}.ics`;
      if (isValidIcsUrl(tagUrl)) {
        urls.add(tagUrl);
      }
    }
  }

  return urls;
}

/**
 * Loads the allowed-removals.txt file, returning a set of ICS filenames
 * that are intentionally being removed and should not trigger a failure.
 * Lines starting with # and blank lines are ignored.
 */
async function loadAllowedRemovals(): Promise<Set<string>> {
  const allowed = new Set<string>();
  try {
    const content = await readFile("allowed-removals.txt", "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        allowed.add(trimmed);
      }
    }
  } catch {
    // File doesn't exist — no removals are pre-approved
  }
  return allowed;
}

async function main() {
  const deployedSiteUrl = process.argv[2];

  if (!deployedSiteUrl) {
    console.log("No deployed site URL provided, skipping backwards compatibility check.");
    console.log("Usage: node --loader ts-node/esm scripts/check-missing-urls.ts <deployed-site-url>");
    process.exit(0);
  }

  const manifestUrl = `${deployedSiteUrl.replace(/\/$/, "")}/manifest.json`;
  console.log(`Fetching deployed manifest from: ${manifestUrl}`);

  // Fetch the currently deployed manifest
  let deployedManifest: Manifest;
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      if (response.status === 404) {
        console.log("No deployed manifest found (404). This might be a first deployment, skipping check.");
        process.exit(0);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const jsonText = await response.text();
    try {
      deployedManifest = JSON.parse(jsonText) as Manifest;
    } catch (parseError) {
      console.error(`Failed to parse deployed manifest JSON: ${parseError}`);
      console.log("Skipping backwards compatibility check due to malformed manifest.");
      process.exit(0);
    }
  } catch (error) {
    console.error(`Failed to fetch deployed manifest: ${error}`);
    console.log("Skipping backwards compatibility check due to fetch error.");
    process.exit(0);
  }

  // Scan the output directory for .ics files on disk.
  // This is more reliable than reading the manifest because the manifest may
  // intentionally exclude calendars with no future events while still
  // generating the ICS files for existing subscribers.
  const outputDir = "output";
  if (!existsSync(outputDir)) {
    console.error(`Output directory not found at ${outputDir}. Run the build first.`);
    process.exit(1);
  }

  const newUrls = new Set<string>();
  for (const file of readdirSync(outputDir)) {
    if (file.endsWith(".ics") && isValidIcsUrl(file)) {
      newUrls.add(file);
    }
  }

  // Extract ICS URLs from deployed manifest
  const deployedUrls = extractIcsUrls(deployedManifest);

  console.log(`Deployed calendars: ${deployedUrls.size}`);
  console.log(`New build calendars (on disk): ${newUrls.size}`);

  // Find missing URLs, excluding intentional removals
  const allowedRemovals = await loadAllowedRemovals();
  const missingUrls: string[] = [];
  const approvedRemovals: string[] = [];
  for (const url of deployedUrls) {
    if (!newUrls.has(url)) {
      if (allowedRemovals.has(url)) {
        approvedRemovals.push(url);
      } else {
        missingUrls.push(url);
      }
    }
  }

  if (approvedRemovals.length > 0) {
    console.log("\n✓ Intentional removals (listed in allowed-removals.txt):");
    for (const url of approvedRemovals.sort()) {
      console.log(`  ~ ${url}`);
    }
  }

  // Report results
  let hasErrors = false;

  if (missingUrls.length > 0) {
    console.error("\n❌ BREAKING CHANGE: The following calendar URLs would be removed:");
    for (const url of missingUrls.sort()) {
      console.error(`  - ${url}`);
    }
    console.error("\nThese URLs may be in use by subscribers. If removal is intentional,");
    console.error("consider keeping the calendar with a deprecation notice or redirect.");
    hasErrors = true;
  }

  if (hasErrors) {
    process.exit(1);
  }

  // Report new calendars (informational)
  const addedUrls: string[] = [];
  for (const url of newUrls) {
    if (!deployedUrls.has(url)) {
      addedUrls.push(url);
    }
  }

  if (addedUrls.length > 0) {
    console.log("\n✓ New calendars being added:");
    for (const url of addedUrls.sort()) {
      console.log(`  + ${url}`);
    }
  }

  console.log("\n✓ Backwards compatibility check passed. No calendar URLs removed.");
  process.exit(0);
}

main();
