# AI Agent Guidelines

## Project Context

This repository contains steering files to help AI agents understand the project structure and architecture:

- **`.kiro/steering.md`** - Comprehensive project overview including architecture, core components, development workflow, and current limitations

## For AI Agents

When working with this codebase, please review the steering file first to understand:
- The ripper-based architecture for web scraping
- Configuration schema and directory structure  
- Base classes for HTML and JSON scraping
- Event processing and tag-based aggregation
- Current development workflow and limitations

The steering file provides essential context for making informed decisions about code changes, new feature implementations, and maintaining consistency with the existing architecture.

### Development Workflow

**NEVER push directly to main branch.** Always:
1. Create a feature branch for changes
2. Make commits to the feature branch
3. Open a Pull Request to merge into main
4. Wait for review and approval before merging

This ensures proper code review and prevents breaking the production deployment.

## Unit Tests

Unit tests for rippers are located in the individual ripper directories alongside the implementation files:

```
sources/
  ├── ripper-name/
  │   ├── ripper.yaml      # Configuration
  │   ├── ripper.ts        # Implementation  
  │   ├── ripper.test.ts   # Unit tests
  │   └── sample-data.html # Test data (optional)
```

### Test Framework
- Uses **Vitest** as the test framework
- Tests should cover:
  - Event extraction from sample HTML/JSON data
  - Error handling for malformed data
  - Deduplication logic (if applicable)
  - Date/time parsing accuracy
  - Event property validation

### Test Guidelines
- Include sample HTML/JSON files for realistic testing
- Test both success and failure scenarios
- Verify event properties (summary, date, duration, location, etc.)
- Test deduplication across multiple parseEvents calls
- Ensure graceful handling of missing or malformed data
