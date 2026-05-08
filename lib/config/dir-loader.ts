import { readdir, readFile } from "fs/promises";
import { join } from "path";
import YAML from "yaml";

/**
 * Load every `*.yaml` file from `dirPath` and return their parsed contents
 * as an array. Files are loaded in lexicographic order so the result is
 * deterministic. Non-yaml files are skipped.
 */
export async function loadYamlDir(dirPath: string): Promise<unknown[]> {
    let entries: string[];
    try {
        entries = await readdir(dirPath);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return [];
        throw err;
    }
    const yamlFiles = entries.filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
    const out: unknown[] = [];
    for (const f of yamlFiles) {
        const content = await readFile(join(dirPath, f), "utf8");
        out.push(YAML.parse(content));
    }
    return out;
}
