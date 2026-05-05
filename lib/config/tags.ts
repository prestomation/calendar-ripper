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
