import { ZonedDateTime, Duration, LocalDate, LocalTime, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_LOOKAHEAD_MONTHS = 6;
const VENUE_ADDRESS = "Taproot Theatre, 204 N 85th St, Seattle, WA 98103";
const TICKET_URL = "https://web.ovationtix.com/trs/pe.c/37019";

/**
 * Ripper for Taproot Theatre using the OvationTix (AudienceView Professional) public API.
 *
 * The API endpoint requires a `clientId` header and an `Origin` header matching
 * the theater's website to satisfy CORS restrictions.
 *
 * Config fields (in ripper.yaml calendar config):
 *   - clientId: OvationTix client ID (37019 for Taproot)
 *   - clientOrigin: Origin header value (https://taproottheatre.org)
 *   - lookaheadMonths: Number of months ahead to fetch (default: 6)
 */
export default class TaprootRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const clientId = (cal.config?.clientId as number | undefined) ?? 37019;
            const clientOrigin = (cal.config?.clientOrigin as string | undefined) ?? "https://taproottheatre.org";
            const lookaheadMonths = (cal.config?.lookaheadMonths as number | undefined) ?? DEFAULT_LOOKAHEAD_MONTHS;

            try {
                const performances = await this.fetchAllPerformances(
                    ripper.config.url.toString(),
                    clientId,
                    clientOrigin,
                    lookaheadMonths,
                    fetchFn
                );
                calendars[cal.name].events = this.parseEvents(performances, cal.timezone);
            } catch (error) {
                calendars[cal.name].events = [{
                    type: "ParseError" as const,
                    reason: `Failed to fetch Taproot Theatre events: ${error}`,
                    context: undefined
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

    private async fetchAllPerformances(
        baseUrl: string,
        clientId: number,
        clientOrigin: string,
        lookaheadMonths: number,
        fetchFn: FetchFn
    ): Promise<any[]> {
        const now = LocalDate.now();
        const allPerformances: any[] = [];
        const seenIds = new Set<number>();

        for (let i = 0; i < lookaheadMonths; i++) {
            const targetDate = now.plusMonths(i);
            const month = targetDate.monthValue();
            const year = targetDate.year();

            const url = new URL(baseUrl);
            url.searchParams.set('month', String(month));
            url.searchParams.set('year', String(year));

            const res = await fetchFn(url.toString(), {
                headers: {
                    'clientId': String(clientId),
                    'Origin': clientOrigin,
                    'Accept': 'application/json',
                }
            });

            if (!res.ok) {
                throw new Error(`OvationTix API error: HTTP ${res.status} for ${month}/${year}`);
            }

            const data = await res.json() as { performancesByDateDisplay?: Record<string, any[]> };
            const performancesByDate = data.performancesByDateDisplay ?? {};

            for (const datePerformances of Object.values(performancesByDate)) {
                for (const perf of datePerformances) {
                    if (typeof perf.performanceId === 'number' && !seenIds.has(perf.performanceId)) {
                        seenIds.add(perf.performanceId);
                        allPerformances.push(perf);
                    }
                }
            }
        }

        return allPerformances;
    }

    public parseEvents(performances: any[], timezone: any): RipperEvent[] {
        const events: RipperEvent[] = [];
        const today = LocalDate.now();

        for (const perf of performances) {
            try {
                const localDateTime = this.parsePerformanceDateTime(perf);
                if (!localDateTime) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date for performance: ${perf.productionName}`,
                        context: `performanceDate: ${perf.performanceDate}, performanceTime24: ${perf.performanceTime24}`
                    });
                    continue;
                }

                if (localDateTime.toLocalDate().isBefore(today)) {
                    continue;
                }

                const zonedDate = ZonedDateTime.of(localDateTime, timezone);

                const summary = perf.performanceSuperTitle
                    ? `${perf.productionName}: ${perf.performanceSuperTitle}`
                    : String(perf.productionName);

                const descParts: string[] = [];
                if (perf.performanceSubTitle) {
                    descParts.push(String(perf.performanceSubTitle));
                }
                if (perf.productionDescription) {
                    const stripped = this.stripHtml(String(perf.productionDescription));
                    if (stripped) descParts.push(stripped);
                }
                if (perf.performanceNotes) {
                    descParts.push(String(perf.performanceNotes));
                }

                const event: RipperCalendarEvent = {
                    id: `ovationtix-taproot-${perf.performanceId}`,
                    ripped: new Date(),
                    date: zonedDate,
                    duration: Duration.ofMinutes(150),
                    summary,
                    description: descParts.length > 0 ? descParts.join('\n\n') : undefined,
                    location: VENUE_ADDRESS,
                    url: TICKET_URL,
                    image: perf.productionLogoLink || undefined,
                };

                events.push(event);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse OvationTix performance: ${error}`,
                    context: JSON.stringify(perf).substring(0, 200)
                });
            }
        }

        return events;
    }

    private parsePerformanceDateTime(perf: any): LocalDateTime | null {
        if (!perf.performanceDate || !perf.performanceTime24) return null;

        try {
            // performanceDate: "MM/DD/YYYY"
            const dateParts = String(perf.performanceDate).split('/');
            if (dateParts.length < 3) return null;
            const month = parseInt(dateParts[0]);
            const day = parseInt(dateParts[1]);
            const year = parseInt(dateParts[2]);
            if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
            const date = LocalDate.of(year, month, day);

            // performanceTime24: "HH:MM:SS"
            const timeParts = String(perf.performanceTime24).split(':');
            if (timeParts.length < 2) return null;
            const hours = parseInt(timeParts[0]);
            const minutes = parseInt(timeParts[1]);
            if (isNaN(hours) || isNaN(minutes)) return null;
            const time = LocalTime.of(hours, minutes);

            return LocalDateTime.of(date, time);
        } catch {
            return null;
        }
    }

    private stripHtml(html: string): string {
        return html
            .replace(/<[^>]*>/g, ' ')
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}
