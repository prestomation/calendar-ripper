import { main } from "./lib/calendar_ripper.js";
import { writeFile, mkdir } from "fs/promises";

try {
  await main();
} catch (error) {
  console.error("Fatal error during calendar generation:", error);

  // Write fallback output files so CI can still report the failure cleanly
  // rather than crashing before these files exist
  try {
    await writeFile("errorCount.txt", "1");
    await writeFile("zeroEventCalendars.txt", "");
    const fallbackErrors = {
      buildTime: new Date().toISOString(),
      totalErrors: 1,
      configErrors: [],
      sources: [],
      externalCalendarFailures: [],
      fatal: String(error),
    };
    await mkdir("output").catch(() => {});
    await writeFile("output/build-errors.json", JSON.stringify(fallbackErrors, null, 2));
  } catch {
    // best-effort — output dir may not exist yet
  }

  process.exitCode = 1;
}