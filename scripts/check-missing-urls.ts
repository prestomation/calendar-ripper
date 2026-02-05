/**
 * Check for missing calendar URLs between deployed site and new build.
 * This ensures backwards compatibility - calendar URLs people depend on shouldn't disappear.
 *
 * Usage: node --loader ts-node/esm scripts/check-missing-urls.ts <deployed-site-url>
 * Example: node --loader ts-node/esm scripts/check-missing-urls.ts https://example.github.io/calendar-ripper
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";

interface Calendar {
  name: string;
  icsUrl: string;
}

interface Ripper {
  name: string;
  calendars: Calendar[];
}

interface Manifest {
  rippers: Ripper[];
  recurringCalendars: Calendar[];
  externalCalendars: Calendar[];
  tags: string[];
}

function extractIcsUrls(manifest: Manifest): Set<string> {
  const urls = new Set<string>();

  // Ripper calendars
  for (const ripper of manifest.rippers) {
    for (const calendar of ripper.calendars) {
      urls.add(calendar.icsUrl);
    }
  }

  // Recurring calendars
  for (const calendar of manifest.recurringCalendars) {
    urls.add(calendar.icsUrl);
  }

  // External calendars
  for (const calendar of manifest.externalCalendars) {
    urls.add(calendar.icsUrl);
  }

  // Tag aggregation calendars
  for (const tag of manifest.tags) {
    urls.add(`tag-${tag}.ics`);
  }

  return urls;
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
    deployedManifest = await response.json() as Manifest;
  } catch (error) {
    console.error(`Failed to fetch deployed manifest: ${error}`);
    console.log("Skipping backwards compatibility check due to fetch error.");
    process.exit(0);
  }

  // Read the new manifest
  const newManifestPath = "output/manifest.json";
  if (!existsSync(newManifestPath)) {
    console.error(`New manifest not found at ${newManifestPath}. Run the build first.`);
    process.exit(1);
  }

  const newManifest: Manifest = JSON.parse(await readFile(newManifestPath, "utf-8"));

  // Extract ICS URLs from both manifests
  const deployedUrls = extractIcsUrls(deployedManifest);
  const newUrls = extractIcsUrls(newManifest);

  console.log(`Deployed calendars: ${deployedUrls.size}`);
  console.log(`New build calendars: ${newUrls.size}`);

  // Find missing URLs
  const missingUrls: string[] = [];
  for (const url of deployedUrls) {
    if (!newUrls.has(url)) {
      missingUrls.push(url);
    }
  }

  // Also check that the actual .ics files exist in the output directory
  const missingFiles: string[] = [];
  for (const url of newUrls) {
    const filePath = `output/${url}`;
    if (!existsSync(filePath)) {
      missingFiles.push(url);
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

  if (missingFiles.length > 0) {
    console.error("\n❌ Missing files: The following calendars are in the manifest but files don't exist:");
    for (const url of missingFiles.sort()) {
      console.error(`  - ${url}`);
    }
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
