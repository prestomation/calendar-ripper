import { RipperLoader } from "./config/loader.js";
import { writeFile, mkdir, readFile } from 'fs/promises'
import { RipperConfig, toICS, externalConfigSchema, ExternalConfig, ExternalCalendar } from "./config/schema.js";
import { join } from 'path';
import { parse } from 'yaml';

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

const generateExternalCalendarList = (externals: ExternalCalendar[]) => {
    if (externals.length === 0) {
        return "";
    }
    
    const toc = externals.map(calendar => {
        let entry = `<p><a href="${calendar.icsUrl}">${calendar.friendlyname}</a>`;
        if (calendar.infoUrl) {
            entry += ` (<a href="${calendar.infoUrl}">info</a>)`;
        }
        if (calendar.description) {
            entry += `<br><small>${calendar.description}</small>`;
        }
        entry += `</p>`;
        return entry;
    }).join("\n");
    
    return `<h2>External Calendars:</h2>\n ${toc}`;
}

export const main = async () => {
    const loader = new RipperLoader("sources/");
    const [configs, errors] = await loader.loadConfigs();
    
    // Load external calendars directly
    let externalCalendars: ExternalConfig = [];
    try {
        const filePath = join("sources", "external.yaml");
        const fileContents = await readFile(filePath, 'utf8');
        const parsed = parse(fileContents);
        
        const result = externalConfigSchema.safeParse(parsed);
        if (!result.success) {
            throw new Error(`Failed to parse external.yaml: ${result.error.message}`);
        }
        externalCalendars = result.data;
    } catch (error) {
        if ((error as any).code !== 'ENOENT') {
            // If the file doesn't exist, that's fine - just use empty array
            // Otherwise, fail the program
            console.error("Error loading external calendars:", error);
            throw error;
        }
    }
    
    try {
        // Create the output directory
        // If it exists, just ignore the failure. that's fine.
        await mkdir("output");
    }
    catch (e) { }

    let tableOfContents: string = "";
    let totalErrorCount = 0;

    for (const config of configs) {
        console.log(`Processing ${config.config.name}`);
        if (config.config.disabled) {
            console.log(`Skipping disabled ripper: ${config.config.name}`);
            continue;
        }
        
        // Rip the calendars
        const calendars = await config.ripperImpl.rip(config);
        
        const outputs: CalendarOutput[] = [];
        for (const calendar of calendars) {
            const icsPath = `${config.config.name}-${calendar.name}.ics`;
            const errorsPath = `${config.config.name}-${calendar.name}-errors.txt`;
            const errorCount = calendar.errors.length;
            totalErrorCount += errorCount;
            const icsString = await toICS(calendar);
            if (errorCount > 0) {
                console.error(`${errorCount} errors for ${config.config.name}`);
                console.error(calendar.errors);
            }
            await writeFile(`output/${icsPath}`, icsString);
            await writeFile(`output/${errorsPath}`, JSON.stringify(calendar.errors, null, 2));
            outputs.push({errorCount, errorsPath, icsPath, friendlyName: calendar.friendlyname});
        }
        tableOfContents += generateCalendarList(config.config, outputs);
    };
    
    // Add external calendars to the table of contents
    const activeExternalCalendars = externalCalendars.filter(cal => !cal.disabled);
    
    if (activeExternalCalendars.length > 0) {
        tableOfContents += generateExternalCalendarList(activeExternalCalendars);
    }
    
    tableOfContents += `\n\nLast generated ${new Date()}`
    console.log("writing table of contents");
    await writeFile("output/index.html", tableOfContents);

    await writeFile('errorCount.txt', totalErrorCount.toString());
}
