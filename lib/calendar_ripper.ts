import { RipperLoader } from "./config/loader.js";
import { writeFile, mkdir, readFile } from 'fs/promises'
import { RipperConfig, toICS, externalConfigSchema, ExternalConfig, ExternalCalendar } from "./config/schema.js";
import { join, dirname } from 'path';
import { parse } from 'yaml';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CalendarOutput {
    friendlyName: string;
    icsPath: string;
    errorsPath: string;
    errorCount: number;
}

const generateCalendarList = (ripper: RipperConfig, outputs: CalendarOutput[]) => {
    const toc = outputs.map(calendar => {
        // Create a webcal link by replacing http with webcal
        // Since we don't know the actual host, we'll use a relative path that works with the server
        const webcalLink = `webcal://REPLACE_WITH_BASE${calendar.icsPath}`;
        const fullIcsLink = `https://REPLACE_WITH_BASE${calendar.icsPath}`;
        
        return `<p>
            <a href="${calendar.icsPath}">${calendar.friendlyName}</a> 
            <a href="${calendar.errorsPath}">(${calendar.errorCount} errors)</a>
            <a href="${webcalLink}" title="Subscribe to this calendar in iCal/Outlook">[Subscribe]</a>
            <button class="copy-btn" data-clipboard-text="${fullIcsLink}" title="Copy calendar URL to clipboard">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                </svg>
            </button>
        </p>`;
    }).join("\n");
    
    return `<h2>${ripper.description}:</h2>\n ${toc}`;
}

const generateExternalCalendarList = (externals: ExternalCalendar[]) => {
    if (externals.length === 0) {
        return "";
    }
    
    const toc = externals.map(calendar => {
        // Create a webcal link by replacing http/https with webcal
        const webcalLink = calendar.icsUrl.replace(/^https?:\/\//, 'webcal://');
        
        let entry = `<p><a href="${calendar.icsUrl}">${calendar.friendlyname}</a>`;
        if (calendar.infoUrl) {
            entry += ` (<a href="${calendar.infoUrl}">info</a>)`;
        }
        entry += ` <a href="${webcalLink}" title="Subscribe to this calendar in iCal/Outlook">[Subscribe]</a>`;
        entry += ` <button class="copy-btn" data-clipboard-text="${calendar.icsUrl}" title="Copy calendar URL to clipboard">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
            </svg>
        </button>`;
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
    
    // Load the HTML template from file
    try {
        const templatePath = join(__dirname, 'templates', 'index.html');
        let templateHtml = await readFile(templatePath, 'utf8');
        
        // Replace the placeholder with the table of contents
        const finalHtml = templateHtml.replace('{{TABLE_OF_CONTENTS}}', tableOfContents);
        
        await writeFile("output/index.html", finalHtml);
        await writeFile('errorCount.txt', totalErrorCount.toString());
    } catch (error) {
        console.error("Error loading template:", error);
        throw error;
    }
}
