---
name: "Can Can Culinary Cabaret"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-05-09
pr: 286
---
**Can Can Culinary Cabaret** — Spektrix API (`https://system.spektrix.com/cancan/api/v3`) — publicly accessible, no auth required. Previous assessment (notviable) was based on Squarespace `?format=json` returning `itemCount: 0`; the venue migrated to Spektrix for ticketing (`booking.thecancan.com`). Events API returns 6 main productions per year (Carnival, Spectacular, Lola, Zombies, Ooh La La, Wonderland); instances API returns ~1,100 individual performance slots. Custom `IRipper` implementation filters to duration > 0 events and deduplicates ticket-tier variants.

Tags: Theatre, Pike Place, Nightlife
