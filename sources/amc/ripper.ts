import { ZonedDateTime, Duration, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const GRAPHQL_URL = "https://graph.amctheatres.com/graphql";

const SHOWTIMES_QUERY = `{
  viewer {
    theatre(slug: "%SLUG%") {
      theatreId
      name
      longName
      slug
      addressLine1
      city
      state
      postalCode
      utcOffset
      movies(first: 50) {
        edges {
          node {
            name
            runTime
            mpaaRating
            genre
            movieId
            slug
            formats {
              items {
                groups {
                  edges {
                    node {
                      showtimes {
                        edges {
                          node {
                            showtimeId
                            showDateTimeUtc
                            auditorium
                            status
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

interface AMCShowtime {
    showtimeId: number;
    showDateTimeUtc: string;
    auditorium: number;
    status: string;
}

interface AMCMovie {
    name: string;
    runTime: number;
    mpaaRating: string | null;
    genre: string;
    movieId: number;
    slug: string;
}

interface FlatShowtime {
    movie: AMCMovie;
    showtime: AMCShowtime;
}

/**
 * Ripper for AMC Theatres using the public GraphQL API.
 * Each calendar entry specifies a theatre slug in its config.
 */
export default class AMCRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const slug = cal.config?.slug as string | undefined;
            if (!slug) continue;

            try {
                const response = await this.fetchShowtimes(slug);
                const theatre = response?.data?.viewer?.theatre;
                if (!theatre) {
                    calendars[cal.name].events.push({
                        type: "ParseError",
                        reason: `No theatre found for slug: ${slug}`,
                        context: JSON.stringify(response).substring(0, 200)
                    });
                    continue;
                }

                const flat = this.flattenShowtimes(theatre);
                const location = `${theatre.name}, ${theatre.addressLine1}, ${theatre.city}, ${theatre.state} ${theatre.postalCode}`;
                const parsed = this.parseEvents(flat, location, theatre.slug);
                calendars[cal.name].events = parsed;
            } catch (error) {
                calendars[cal.name].events.push({
                    type: "ParseError",
                    reason: `Failed to fetch AMC showtimes for ${slug}: ${error}`,
                    context: slug
                });
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

    private async fetchShowtimes(slug: string): Promise<any> {
        if (!/^[a-z0-9-]+$/.test(slug)) {
            throw new Error(`Invalid theatre slug: ${slug}`);
        }

        const query = SHOWTIMES_QUERY.replace("%SLUG%", slug);

        const res = await fetch(GRAPHQL_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": "https://www.amctheatres.com",
                "Referer": "https://www.amctheatres.com/",
            },
            body: JSON.stringify({ query })
        });

        if (!res.ok) {
            throw new Error(`AMC GraphQL error: HTTP ${res.status}`);
        }

        return res.json();
    }

    public flattenShowtimes(theatre: any): FlatShowtime[] {
        const results: FlatShowtime[] = [];

        for (const movieEdge of theatre.movies?.edges || []) {
            const movieNode = movieEdge.node;
            const movie: AMCMovie = {
                name: movieNode.name,
                runTime: movieNode.runTime,
                mpaaRating: movieNode.mpaaRating,
                genre: movieNode.genre,
                movieId: movieNode.movieId,
                slug: movieNode.slug,
            };

            for (const formatItem of movieNode.formats?.items || []) {
                for (const groupEdge of formatItem.groups?.edges || []) {
                    for (const showtimeEdge of groupEdge.node?.showtimes?.edges || []) {
                        results.push({
                            movie,
                            showtime: showtimeEdge.node
                        });
                    }
                }
            }
        }

        return results;
    }

    public parseEvents(flatShowtimes: FlatShowtime[], location: string, theatreSlug: string): RipperEvent[] {
        const events: RipperEvent[] = [];
        const seenShowtimes = new Set<number>();

        for (const { movie, showtime } of flatShowtimes) {
            try {
                if (seenShowtimes.has(showtime.showtimeId)) continue;
                seenShowtimes.add(showtime.showtimeId);

                // Skip past/cancelled showtimes
                if (showtime.status === "Cancelled") continue;

                const date = this.parseDate(showtime.showDateTimeUtc);
                if (!date) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date for showtime ${showtime.showtimeId}: ${movie.name}`,
                        context: showtime.showDateTimeUtc
                    });
                    continue;
                }

                const rating = movie.mpaaRating ? ` (${movie.mpaaRating})` : "";

                const calEvent: RipperCalendarEvent = {
                    id: `amc-${showtime.showtimeId}`,
                    ripped: new Date(),
                    date,
                    duration: Duration.ofMinutes(movie.runTime || 120),
                    summary: `${movie.name}${rating}`,
                    description: movie.genre || undefined,
                    location,
                    url: `https://www.amctheatres.com/movies/${movie.slug}`
                };

                events.push(calEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse AMC showtime: ${error}`,
                    context: JSON.stringify({ movie: movie.name, showtime }).substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseDate(utcString: string): ZonedDateTime | null {
        // Parse "2026-02-14T23:15:00.000Z"
        const match = utcString.match(
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/
        );
        if (!match) return null;

        const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
        const utcDateTime = LocalDateTime.of(
            parseInt(yearStr),
            parseInt(monthStr),
            parseInt(dayStr),
            parseInt(hourStr),
            parseInt(minuteStr),
            parseInt(secondStr)
        );

        // Convert from UTC to Pacific time
        return utcDateTime.atZone(ZoneId.of("UTC"))
            .withZoneSameInstant(ZoneId.of("America/Los_Angeles"));
    }
}
