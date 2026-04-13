# iCalendar Ripper

Subscribe to Seattle-area event calendars in your favorite calendar app. This project scrapes event data from dozens of local websites, ICS feeds, and APIs, then publishes them as standard iCalendar (.ics) files you can add to Google Calendar, Apple Calendar, Outlook, or any other calendar application.

## Browse Calendars

Visit the web interface to search, filter by tag, and preview upcoming events:

**https://206.events/**

From there you can:
- Search for calendars by name or keyword
- Filter by neighborhood (Capitol Hill, Ballard, Downtown, etc.) or category (Music, Art, Beer, Movies, etc.)
- View an agenda of upcoming events for any calendar
- Copy the subscription URL for any calendar
- Add individual events directly to Google Calendar with a single click
- Subscribe to RSS feeds for any calendar or tag

## Subscribe to a Calendar

Each calendar is available as a `.ics` file. To subscribe:

1. Find the calendar you want on the [web interface](https://206.events/)
2. Copy its subscription URL
3. Add it to your calendar app:
   - **Google Calendar**: Settings > Add other calendars > From URL
   - **Apple Calendar**: File > New Calendar Subscription
   - **Outlook**: Add calendar > Subscribe from web

Calendars are regenerated daily, so your subscriptions stay up to date automatically.

### Tag Calendars

In addition to individual source calendars, there are aggregate tag calendars that combine events from every source sharing a tag. For example, subscribing to the "Music" tag calendar gives you events from all music-related sources in a single feed.

## Sign In & Personal Favorites Feed

You can favorite any calendar by clicking the ♡ heart button next to it. Favorites are shown together in a dedicated view so you can browse events across all your chosen calendars in one place.

**Sign in with Google** (button in the top-right corner of the site) to unlock two additional benefits:

- **Sync across devices** — your favorites are saved to your account and available on any browser or device
- **Personal ICS subscription link** — after signing in, a unique private URL appears in the Favorites view. Add it to Google Calendar, Apple Calendar, or Outlook to subscribe to all your favorited calendars in a single feed that updates automatically as you add or remove favorites

Your personal feed URL is secret — anyone with the link can subscribe to your favorites, so keep it private.

## Add Individual Events to Google Calendar

When browsing upcoming events in the web interface, each event has a 📅 button that lets you add that specific event to your calendar. Clicking it gives you two options:

- **Google Calendar** — opens Google Calendar in a new tab with the event details pre-filled (title, date/time, location, description)
- **Download .ics** — downloads a single-event `.ics` file you can open with Apple Calendar, Outlook, or any other calendar app

This is useful when you don't want to subscribe to an entire calendar but just want to save one event.

## RSS Feeds

Every calendar and tag feed has a corresponding RSS feed you can follow in any RSS reader. Look for the **RSS** link next to each calendar or tag on the web interface.

- Individual calendar RSS feeds are available at `<calendar-name>.rss`
- Tag aggregate RSS feeds are available at `tag-<tagname>.rss`

RSS feeds include the same events as the `.ics` files, making it easy to stay up to date in tools like Feedly, NetNewsWire, or any RSS-capable app.

## Filing an Issue

Issues are the best way to report problems or request new calendars. The more detail you provide, the faster things get resolved.

### Report a Bug

If a calendar has incorrect data, is missing events, or is broken, [open a bug report](https://github.com/prestomation/calendar-ripper/issues/new) with:

- **Which calendar** is affected (name or URL)
- **What you expected** to see vs. what actually appeared
- **An example event** that is wrong or missing, including the date and event name
- **A link** to the original source website showing the correct information

### Request a New Calendar

Want to see a new Seattle-area event source added? [Open a request](https://github.com/prestomation/calendar-ripper/issues/new) with:

- **The website URL** where the events are listed
- **What kind of events** the source covers (music, art, food, community, etc.)
- **Any known calendar feeds**: check if the site already offers an ICS/iCal export, a `webcal://` link, or a public API. This dramatically simplifies adding it. Look for "Subscribe", "Export Calendar", or "Add to Calendar" links on the site.
- **Suggested tags**: neighborhood or category tags that would apply (see the tag list on the web interface)

### Report a Stale or Dead Calendar

If a calendar source has shut down, changed its website, or is consistently returning errors, [let us know](https://github.com/prestomation/calendar-ripper/issues/new) with:

- **Which calendar** is affected
- **What changed**: did the website move, shut down, or start blocking requests?

## Contributing

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for technical details on the architecture, how to implement new rippers, configuration schema, and development workflow.
