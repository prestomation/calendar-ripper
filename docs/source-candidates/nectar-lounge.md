---
name: "Nectar Lounge"
status: added
pr: 300
firstSeen: 2026-05-08
lastChecked: 2026-05-12
---
Implemented as `sources/nectar_lounge/`. Page at `nectarlounge.com/events/calendar/` embeds Tixr events as JSON-LD (`application/ld+json`). Custom HTMLRipper parses the events array and filters to `location.name === "Nectar Lounge"`. 54 upcoming events confirmed in sample data. Tags: Music, Fremont. Note: Hidden Hall events on the same page are covered by the separate `sources/hidden_hall/` ripper.
