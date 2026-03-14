/**
 * download-outofband.ts
 *
 * Downloads pre-built out-of-band calendar files from S3 into output/.
 * Merges outofband-report.json error count into errorCount.txt.
 *
 * Graceful: if the bucket is empty, unreachable, or credentials aren't
 * configured, it logs a warning and exits 0.
 *
 * Run via: npm run download-outofband
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { Readable } from "stream";

const BUCKET = process.env.OUTOFBAND_BUCKET ?? "calendar-ripper-outofband-220483515252";
const REGION = "us-west-2";
const PREFIX = "latest/";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function main() {
    const s3 = new S3Client({ region: REGION });

    // List objects in the prefix
    let objects: Array<{ Key?: string }> = [];
    try {
        const listResp = await s3.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: PREFIX,
        }));
        objects = listResp.Contents ?? [];
    } catch (err: any) {
        console.warn(`[download-outofband] Warning: could not list S3 bucket: ${err.message ?? err}`);
        console.warn("[download-outofband] Continuing without out-of-band calendars.");
        process.exit(0);
    }

    if (objects.length === 0) {
        console.warn("[download-outofband] Warning: no out-of-band files found in S3 bucket. Continuing without them.");
        process.exit(0);
    }

    console.log(`[download-outofband] Found ${objects.length} file(s) in s3://${BUCKET}/${PREFIX}`);

    await mkdir("output", { recursive: true });

    let reportJson: any = null;

    for (const obj of objects) {
        if (!obj.Key) continue;
        // Strip the prefix to get the local filename
        const filename = obj.Key.slice(PREFIX.length);
        if (!filename) continue; // skip the "directory" pseudo-key

        try {
            const getResp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
            const body = await streamToBuffer(getResp.Body as Readable);

            if (filename === "outofband-report.json") {
                reportJson = JSON.parse(body.toString("utf-8"));
                console.log(`[download-outofband] Downloaded report (${reportJson.sources?.length ?? 0} source(s))`);
            } else {
                const localPath = join("output", filename);
                await writeFile(localPath, body);
                console.log(`[download-outofband] Downloaded ${filename}`);
            }
        } catch (err: any) {
            console.warn(`[download-outofband] Warning: failed to download ${obj.Key}: ${err.message ?? err}`);
        }
    }

    // Merge outofband error count into errorCount.txt
    if (reportJson && typeof reportJson.totalErrors === "number" && reportJson.totalErrors > 0) {
        let existingCount = 0;
        try {
            const existing = await readFile("errorCount.txt", "utf-8");
            existingCount = parseInt(existing.trim(), 10) || 0;
        } catch {
            // file doesn't exist yet — fine
        }
        const newCount = existingCount + reportJson.totalErrors;
        await writeFile("errorCount.txt", String(newCount));
        console.log(`[download-outofband] Merged ${reportJson.totalErrors} outofband error(s) into errorCount.txt (total: ${newCount})`);
    }

    console.log("[download-outofband] Done.");
}

main().catch(err => {
    // Graceful — any unexpected error is a warning, not a failure
    console.warn(`[download-outofband] Warning: unexpected error: ${err?.message ?? err}`);
    process.exit(0);
});
