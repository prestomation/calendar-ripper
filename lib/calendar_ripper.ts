import { RipperLoader } from "./config/loader.js";
import { writeFile, mkdir } from 'fs/promises'
import { RipperConfig, toICS } from "./config/schema.js";

interface CalendarOutput {
    friendlyName: string;
    icsPath: string;
    errorsPath: string;
    errorCount: number;
}

const generateCalendarList = (ripper: RipperConfig, outputs: CalendarOutput[]) => {

    const toc = outputs.map(calendar => `<p><a href="${calendar.icsPath}">${calendar.friendlyName}</a> <a href="${calendar.errorsPath}">(${calendar.errorCount} errors)</a></p>`).join("\n");
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

    let totalErrorCount = 0;

    for (const config of configs) {
        const calendars = await config.ripperImpl.rip(config);

        let outputs: CalendarOutput[] = [];
        for (const calendar of calendars) {
            const icsString = await toICS(calendar);
            const icsPath = `${config.config.name}-${calendar.name}.ics`;
            const errorsPath = `${config.config.name}-${calendar.name}-errors.txt`;
            const errorCount = calendar.errors.length;
            totalErrorCount += errorCount;
            console.log(`Writing ${icsPath}`);
            await writeFile(`output/${icsPath}`, icsString);
            await writeFile(`output/${errorsPath}`, JSON.stringify(calendar.errors, null, 2));
            outputs.push({errorCount, errorsPath, icsPath, friendlyName: calendar.friendlyname});
        }
        tableOfContents += generateCalendarList(config.config, outputs);
    };
    tableOfContents += `\n\nLast generated ${new Date()}`
    console.log("writing table of contents");
    await writeFile("output/index.html", tableOfContents);

    await writeFile('errorCount.txt', totalErrorCount.toString());
}