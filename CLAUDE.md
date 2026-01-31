# Claude AI Assistant Guidelines

👋 Hi Claude! Welcome to the calendar-ripper project.

## Getting Started

Please read **[AGENTS.md](./AGENTS.md)** for comprehensive guidelines on:

- Project architecture and structure
- Calendar integration strategy (ICS > API > HTML parsing)
- Development workflow and branching
- Unit testing requirements

## Quick Reference

- **Steering file**: `.kiro/steering.md` - Detailed project architecture
- **Integration priority**: ICS feeds > JSON APIs > HTML scraping
- **Development**: Always use feature branches, never push to main
- **Testing**: Include unit tests in ripper directories

## Adding a New Calendar

1. Check for ICS/iCal feeds first (add to `sources/external.yaml`)
2. Look for JSON APIs second (implement `JSONRipper`)
3. Only parse HTML as last resort (implement `HTMLRipper`)

See the [Calendar Integration Strategy](./AGENTS.md#calendar-integration-strategy) section in AGENTS.md for detailed guidance.

---

For more details, please review [AGENTS.md](./AGENTS.md) before making any changes.
