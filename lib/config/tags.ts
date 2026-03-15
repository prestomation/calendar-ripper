// Valid tags for calendar events, organized by category.
// VALID_TAGS is derived from TAG_CATEGORIES — to add a new tag, add it to the
// appropriate category below. The build will fail if any tag in a config is not
// in VALID_TAGS, which means it must also be in a category.
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
        'Greenwood',
        'International District',
        'Lake City',
        'Magnolia',
        'Phinney',
        'Pike Place',
        'Pioneer Square',
        'QueenAnne',
        'Seward Park',
        'Shoreline',
        'South Lake Union',
        'University District',
        'Wallingford',
        'West Seattle',
        'White Center',
    ],
    'Activities': [
        'Art',
        'Arts',
        'Artwalk',
        'Beer',
        'Cycling',
        'Dogs',
        'Education',
        'Events',
        'Food',
        'Movies',
        'Music',
        'Museums',
        'Nightlife',
        'OpenMic',
        'Sports',
        'Theatre',
    ],
    'Markets': [
        'FarmersMarket',
        'MakersMarket',
    ],
    'Community': [
        'Activism',
        'Community',
        'Volunteer',
    ],
    'Special': [
        'All',
    ],
} as const;

export type TagCategoryName = keyof typeof TAG_CATEGORIES;
export type ValidTag = typeof TAG_CATEGORIES[TagCategoryName][number];

export const VALID_TAGS = Object.values(TAG_CATEGORIES).flat() as ValidTag[];

export function validateTags(tags: string[]): { valid: ValidTag[], invalid: string[] } {
    const valid: ValidTag[] = [];
    const invalid: string[] = [];

    for (const tag of tags) {
        if ((VALID_TAGS as string[]).includes(tag)) {
            valid.push(tag as ValidTag);
        } else {
            invalid.push(tag);
        }
    }

    return { valid, invalid };
}
