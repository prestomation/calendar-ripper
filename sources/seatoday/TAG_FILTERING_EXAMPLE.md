# How to Add Tag Filtering to SEAtoday Ripper

## Change 1: Update parseEvents signature to accept config

Change this line in ripper.ts (around line 61):
```typescript
private async parseEvents(jsonData: any, timezone: any): Promise<RipperEvent[]> {
```

To:
```typescript
private async parseEvents(jsonData: any, timezone: any, config?: any): Promise<RipperEvent[]> {
```

## Change 2: Add tag filtering logic

Add this code after line 78 (after checking if startDate exists):

```typescript
// Filter by CitySpark tags if configured
if (config && config.citysparkTags && Array.isArray(config.citysparkTags)) {
    const eventTags = eventData.Tags || [];
    // Check if event has ANY of the configured tags
    const hasMatchingTag = eventTags.some((tagId: number) =>
        config.citysparkTags.includes(tagId)
    );
    if (!hasMatchingTag) {
        continue; // Skip this event, doesn't match our tags
    }
}
```

## Change 3: Update rip() method to pass config

Change this line (around line 27):
```typescript
const events = await this.parseEvents(jsonData, cal.timezone);
```

To:
```typescript
const events = await this.parseEvents(jsonData, cal.timezone, cal.config);
```

## Result

Now each calendar in ripper.yaml will only include events that have at least one matching CitySpark tag ID.

Example:
- Calendar with `citysparkTags: [12]` will only get Food & Drink events
- Calendar with `citysparkTags: [2, 3, 4]` will get Arts events
- Calendar without `citysparkTags` config will get ALL events (current behavior)
