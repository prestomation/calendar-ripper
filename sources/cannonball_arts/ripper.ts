import { Duration, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_LOCATION = "Cannonball Arts Center, 1930 3rd Ave, Seattle, WA 98101";
const DEFAULT_DURATION_HOURS = 2;

interface SchemaEvent {
    '@type'?: string;
    name: string;
    startDate: string;
    endDate?: string;
    url?: string;
}

interface SchemaListItem {
    '@type'?: string;
    item?: SchemaEvent;
}

interface SchemaItemList {
    '@type'?: string;
    itemListElement?: SchemaListItem[];
}

export function extractItemList(html: string): SchemaItemList | null {
    const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const match of matches) {
        try {
            const data = JSON.parse(match[1]);
            if (data['@type'] === 'ItemList') return data as SchemaItemList;
        } catch {
            // skip invalid JSON blocks
        }
    }
    return null;
}

export function parseEventFromSchema(
    event: SchemaEvent,
    now: ZonedDateTime,
    zone: ZoneId
): RipperCalendarEvent | ParseError | null {
    let startDate: ZonedDateTime;
    try {
        startDate = ZonedDateTime.parse(event.startDate).withZoneSameInstant(zone);
    } catch {
        return {
            type: 'ParseError',
            reason: `Unparseable startDate: ${event.startDate}`,
            context: event.name,
        };
    }

    if (startDate.isBefore(now)) return null;

    let duration = Duration.ofHours(DEFAULT_DURATION_HOURS);
    if (event.endDate) {
        try {
            const endDate = ZonedDateTime.parse(event.endDate).withZoneSameInstant(zone);
            const diffMillis = endDate.toInstant().toEpochMilli() - startDate.toInstant().toEpochMilli();
            if (diffMillis > 0) {
                duration = Duration.ofMillis(diffMillis);
            }
        } catch {
            // use default duration
        }
    }

    const slug = event.url?.split('/').filter(Boolean).pop() ?? event.name.toLowerCase().replace(/\s+/g, '-');
    return {
        id: `cannonball-arts-${slug}`,
        ripped: new Date(),
        date: startDate,
        duration,
        summary: event.name,
        location: DEFAULT_LOCATION,
        url: event.url ?? '',
    };
}

export default class CannonballArtsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`Cannonball Arts events page returned ${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const itemList = extractItemList(html);

        const events: RipperCalendarEvent[] = [];
        const errors: ParseError[] = [];

        for (const listItem of itemList?.itemListElement ?? []) {
            const event = listItem.item;
            if (!event || event['@type'] !== 'Event') continue;

            const result = parseEventFromSchema(event, now, zone);
            if (result === null) continue;
            if ('date' in result) events.push(result);
            else errors.push(result);
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
