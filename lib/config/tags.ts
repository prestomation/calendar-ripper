// Tag system for calendar events.
//
// Adding a new tag is just a matter of using it in a source's `tags:` field
// — there is no central allow-list to update. The build derives the tag
// universe from the configs themselves, which means adding a tag in a new
// PR doesn't conflict with another PR adding a different tag.
//
// `TAG_CATEGORIES` below is **categorization metadata** for the website
// sidebar, not gating. A tag that is missing from this map is still valid
// and will show up under the "Other" category in the UI. Categorize the
// tag here when you have time, but it's not required for the build to pass.
//
// Near-duplicate detection (`detectTagDuplicates`) catches the only failure
// mode worth blocking on: two sources spelling the same concept differently
// (`"Capitol Hill"` vs `"CapitolHill"`). Different spellings produce
// different ICS URLs, so they should always be reconciled.

export const TAG_CATEGORIES = {
    'Neighborhoods': [
        'Ballard',
        'Beacon Hill',
        'Belltown',
        'Capitol Hill',
        'Central District',
        'Columbia City',
        'Downtown',
        'Eastlake',
        'Fremont',
        'Georgetown',
        'Green Lake',
        'Greenwood',
        'International District',
        'Interbay',
        'Lake City',
        'Magnolia',
        'Maple Leaf',
        'Phinney',
        'Pike Place',
        'Pioneer Square',
        'QueenAnne',
        'Ravenna',
        'Seward Park',
        'Shoreline',
        'SoDo',
        'South Lake Union',
        'University District',
        'Wallingford',
        'Wedgwood',
        'West Seattle',
        'White Center',
    ],
    'Activities': [
        'Art',
        'Arts',
        'Artwalk',
        'Beer',
        'Books',
        'Comedy',
        'Cycling',
        'Dance',
        'Dogs',
        'Education',
        'Events',
        'Food',
        'Movies',
        'Music',
        'Tech',
        'Museums',
        'Nightlife',
        'OpenMic',
        'Pub Trivia',
        'Sports',
        'Theatre',
        'Trivia',
    ],
    'Markets': [
        'FarmersMarket',
        'MakersMarket',
    ],
    'Community': [
        'Activism',
        'Community',
        'Parks',
        'Volunteer',
    ],
    'Special': [
        'All',
    ],
    /**
     * Catch-all for tags not yet placed in a real category. The website
     * groups uncategorized tags here so they still surface in the sidebar
     * without forcing every PR to update this file.
     */
    'Other': [] as string[],
} as const;

export type TagCategoryName = keyof typeof TAG_CATEGORIES;

/**
 * Snapshot of every tag explicitly placed in a category. This is **not**
 * an allow-list — it's a static set used by `categoryFor` and by anything
 * that wants the categorized-only view.
 */
export const KNOWN_TAGS: readonly string[] = Object.values(TAG_CATEGORIES).flat();

/**
 * Return the display category for a tag, falling back to "Other" if the
 * tag isn't placed yet. Pure lookup — no normalization.
 */
export function categoryFor(tag: string): TagCategoryName {
    for (const [category, tags] of Object.entries(TAG_CATEGORIES) as Array<[TagCategoryName, readonly string[]]>) {
        if (tags.includes(tag)) return category;
    }
    return 'Other';
}

/**
 * Backwards-compat shim. The old build threw on any tag not in this list;
 * we keep the export so existing call sites can be migrated incrementally.
 * In the new world, `VALID_TAGS` is just every tag we've ever seen
 * categorized; uncategorized ones are valid too.
 */
export const VALID_TAGS = KNOWN_TAGS;

/**
 * Normalize a tag for duplicate detection: lowercase, drop non-alphanum.
 * `"Capitol Hill"` and `"CapitolHill"` both normalize to `"capitolhill"`.
 */
function normalizeTag(tag: string): string {
    return tag.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface TagDuplicate {
    /** The normalized form (case- and whitespace-insensitive). */
    normalized: string;
    /** All raw tags that collapsed to the same normalized form. */
    spellings: string[];
}

/**
 * Find tags that look like they're meant to be the same but differ in
 * casing or whitespace (e.g., `"Capitol Hill"` vs `"CapitolHill"`).
 * Returns one entry per ambiguous group; an empty array means the input
 * is consistently spelled.
 */
export function detectTagDuplicates(tags: Iterable<string>): TagDuplicate[] {
    const groups = new Map<string, Set<string>>();
    for (const tag of tags) {
        const key = normalizeTag(tag);
        if (!key) continue;
        let group = groups.get(key);
        if (!group) {
            group = new Set();
            groups.set(key, group);
        }
        group.add(tag);
    }
    const dups: TagDuplicate[] = [];
    for (const [normalized, spellings] of groups) {
        if (spellings.size > 1) {
            dups.push({ normalized, spellings: [...spellings].sort() });
        }
    }
    return dups;
}

/**
 * Legacy shim for callers that still want a (valid, invalid) split. With
 * the allow-list gone, every tag is valid, but the function preserves the
 * shape so older code keeps working.
 */
export function validateTags(tags: string[]): { valid: string[]; invalid: string[] } {
    return { valid: [...tags], invalid: [] };
}
