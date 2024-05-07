import { RipperLoader } from "./config/loader.js";
import * as icsOriginal from 'ics'
import { writeFile, mkdir } from 'fs/promises'
import { promisify } from 'util';
import { toICS } from "./config/schema.js";
const createEvents = promisify(icsOriginal.createEvents);

export const main = async () => {


    const loader = new RipperLoader("sources/");
    const [configs, errors] = await loader.loadConfigs();
    try {
        // Create the output directory
        // If it exists, just ignore the failure. that's fine.
        await mkdir("output");
    }
    catch (e) { }

    for (const config of configs) {
        const calendars = await config.ripperImpl.rip(config);

        for (const calendar of calendars) {
            const icsString = await toICS(calendar);
            const path = `output/${calendar.name}.ics`;
            console.log(`Writing ${path}`);
            await writeFile(path, icsString);
        }
    };
}