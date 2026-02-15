import { ZonedDateTime, Duration, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "./schema.js";
import { getFetchForConfig } from "./proxy-fetch.js";
import '@js-joda/timezone';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const EVENTS_PER_PAGE = 10;
const MAX_PAGES = 10;

/**
 * Shared ripper for venues that use the AXS ticketing platform.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with:
 *   - venueId: the AXS venue ID (e.g. 133070)
 *   - venueSlug: the URL slug for the venue page (e.g. "5th-avenue-theatre-seattle-tickets")
 *   - venueName: display name used as location fallback
 *   - venueAddress: full address used as location fallback
 */
export class AXSRipper implements IRipper {
    private fetchFn: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const venueId = cal.config?.venueId as number | undefined;
            const venueSlug = cal.config?.venueSlug as string | undefined;
            if (!venueId || !venueSlug) continue;

            try {
                const rawEvents = await this.fetchVenueEvents(venueId, venueSlug, ripper.config.proxy);
                const parsed = this.parseEvents(rawEvents, cal.timezone, cal.config);
                calendars[cal.name].events = parsed;
            } catch (error) {
                calendars[cal.name].events = [{
                    type: "ParseError" as const,
                    reason: `Failed to fetch AXS events for venue ${venueId}: ${error}`,
                    context: `venueSlug: ${venueSlug}`
                }];
            }
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags
        }));
    }

    private async fetchPageViaProxy(url: string): Promise<string> {
        const res = await this.fetchFn!(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        if (!res.ok) {
            throw new Error(`AXS fetch error: HTTP ${res.status} for ${url}`);
        }
        return res.text();
    }

    private async fetchPageViaCurl(url: string): Promise<string> {
        // Use curl instead of fetch to avoid Cloudflare TLS fingerprint blocking.
        // Node.js fetch (undici) is detected and rejected with 403; curl is not.
        let stdout: string;
        try {
            const result = await execFileAsync('curl', [
                '-s', '-L', '--max-time', '30',
                '-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                '-H', 'Accept: text/html,application/xhtml+xml',
                '-H', 'Accept-Language: en-US,en;q=0.9',
                '-w', '\n%{http_code}',
                url,
            ], { maxBuffer: 10 * 1024 * 1024 });
            stdout = result.stdout;
        } catch (error: any) {
            throw new Error(`curl failed for ${url}: ${error.message || error}`);
        }

        const lastNewline = stdout.lastIndexOf('\n');
        if (lastNewline === -1) {
            throw new Error(`Unexpected curl output for ${url}: no status code found`);
        }

        const statusCode = stdout.slice(lastNewline + 1).trim();
        const body = stdout.slice(0, lastNewline);

        if (!/^\d{3}$/.test(statusCode)) {
            throw new Error(`Could not parse HTTP status from curl output for ${url}: '${statusCode}'`);
        }

        if (statusCode !== '200') {
            throw new Error(`AXS fetch error: HTTP ${statusCode} for ${url}`);
        }
        return body;
    }

    private async fetchPage(url: string, useProxy: boolean): Promise<string> {
        // When proxy is enabled, use fetch through the proxy instead of curl.
        // The proxy runs from AWS IPs which aren't blocked by Cloudflare.
        if (useProxy && process.env.PROXY_URL) {
            return this.fetchPageViaProxy(url);
        }
        return this.fetchPageViaCurl(url);
    }

    private async fetchVenueEvents(venueId: number, venueSlug: string, useProxy?: boolean): Promise<any[]> {
        if (!Number.isInteger(venueId) || venueId <= 0) {
            throw new Error(`Invalid venueId: ${venueId}`);
        }
        if (!/^[a-z0-9-]+$/.test(venueSlug)) {
            throw new Error(`Invalid venueSlug: ${venueSlug}`);
        }

        const allEvents: any[] = [];

        for (let page = 1; page <= MAX_PAGES; page++) {
            const pageParam = page > 1 ? `?page=${page}` : '';
            const url = `https://www.axs.com/venues/${venueId}/${venueSlug}${pageParam}`;

            const html = await this.fetchPage(url, useProxy ?? false);
            const pageData = this.extractNextData(html);
            if (!pageData) {
                throw new Error(`Could not extract event data from AXS page for venue ${venueId}`);
            }

            const events = pageData.venueEventsData?.eventItems || [];
            allEvents.push(...events);

            const totalEvents = pageData.venueEventsData?.totalEvents || 0;
            if (allEvents.length >= totalEvents || events.length < EVENTS_PER_PAGE) {
                break;
            }
        }

        return allEvents;
    }

    private extractNextData(html: string): any | null {
        const match = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/s);
        if (!match) return null;

        try {
            const data = JSON.parse(match[1]);
            return data?.props?.pageProps || null;
        } catch {
            return null;
        }
    }

    public parseEvents(eventsData: any[], timezone: any, config: any): RipperEvent[] {
        const events: RipperEvent[] = [];
        const seenEvents = new Set<string>();

        for (const event of eventsData) {
            try {
                const eventId = event.id;
                const title = event.headlinersText;
                if (!eventId || !title) continue;

                const dedupKey = String(eventId);
                if (seenEvents.has(dedupKey)) continue;
                seenEvents.add(dedupKey);

                const date = this.parseDate(event.date, timezone);
                if (!date) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date for event: ${title}`,
                        context: String(event.date).substring(0, 200)
                    });
                    continue;
                }

                const location = config?.venueAddress
                    ? `${config.venueName}, ${config.venueAddress}`
                    : config?.venueName || undefined;

                const url = `https://www.axs.com/events/${eventId}`;

                const image = this.getBestImage(event.relatedMedia);

                const descParts: string[] = [];
                if (event.supportingText) descParts.push(event.supportingText);
                if (event.tourTitle) descParts.push(`Tour: ${event.tourTitle}`);
                if (event.majorCategory) descParts.push(`Category: ${event.majorCategory}`);

                const calEvent: RipperCalendarEvent = {
                    id: `axs-${eventId}`,
                    ripped: new Date(),
                    date: date,
                    duration: Duration.ofHours(2),
                    summary: title,
                    description: descParts.length > 0 ? descParts.join('\n') : undefined,
                    location: location || undefined,
                    url: url,
                    image: image,
                };

                events.push(calEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse AXS event: ${error}`,
                    context: JSON.stringify(event).substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseDate(dateStr: string | undefined, timezone: any): ZonedDateTime | null {
        if (!dateStr) return null;

        try {
            const dt = LocalDateTime.parse(dateStr);
            return ZonedDateTime.of(dt, timezone);
        } catch {
            return null;
        }
    }

    private getBestImage(media: any[]): string | undefined {
        if (!media?.length) return undefined;

        // Prefer larger images (mediaTypeId 17 is 678x399, 18 is 564x564)
        const preferred = media.find((m: any) => m.mediaTypeId === 17);
        if (preferred?.fileName) return preferred.fileName;

        const square = media.find((m: any) => m.mediaTypeId === 18);
        if (square?.fileName) return square.fileName;

        return media[0]?.fileName;
    }
}
