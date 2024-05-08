import { RipperLoader } from "./config/loader.js";
import { writeFile, mkdir } from 'fs/promises'
import {RipperCalendar, RipperConfig, toICS } from "./config/schema.js";

const generateCalendarList = (ripper: RipperConfig, calendars: RipperCalendar[]) => {

    const toc = calendars.map(calendar => `<p><a href="${ripper.name}-${calendar.name}.ics">${calendar.friendlyname}</a></p>`).join("\n");
    return `<h2>${ripper.description}:</h2>\n ${toc}`;
}

export const main = async () => {


    const loader = new RipperLoader("sources/");
    const [configs, errors] = await loader.loadConfigs();
    try {
        // Create the output directory
        // If it exists, just ignore the failure. that's fine.
        await mkdir("output");
    }
    catch (e) { }

    let tableOfContents: string = "";

    for (const config of configs) {
        const calendars = await config.ripperImpl.rip(config);

        for (const calendar of calendars) {
            const icsString = await toICS(calendar);
            const path = `output/${config.config.name}-${calendar.name}.ics`;
            console.log(`Writing ${path}`);
            await writeFile(path, icsString);
        }
        tableOfContents += generateCalendarList(config.config, calendars);
        
    };
    console.log("writing table of contents");
    await writeFile("output/index.html", tableOfContents);
}