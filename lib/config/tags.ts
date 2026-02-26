// Valid tags for calendar events
export const VALID_TAGS = [
    // Neighborhood / Location
    "Ballard",
    "Beacon Hill",
    "Belltown",
    "Capitol Hill",
    "Central District",
    "Downtown",
    "Fremont",
    "Georgetown",
    "Greenwood",
    "International District",
    "Lake City",
    "Phinney",
    "Pike Place",
    "Pioneer Square",
    "QueenAnne",
    "Seward Park",
    "University District",
    "Wallingford",
    "West Seattle",

    // Activity types
    "Artwalk",
    "Art",
    "Arts",
    "Beer",
    "Cycling",
    "Dogs",
    "Education",
    "Events",
    "Food",
    "Movies",
    "Music",
    "Museums",
    "Nightlife",
    "OpenMic",
    "Sports",
    "Theatre",

    // Market types
    "FarmersMarket",
    "MakersMarket",

    // Community/Social
    "Activism",
    "Community",
    "Volunteer"
] as const;

export type ValidTag = typeof VALID_TAGS[number];

export function validateTags(tags: string[]): { valid: ValidTag[], invalid: string[] } {
    const valid: ValidTag[] = [];
    const invalid: string[] = [];
    
    for (const tag of tags) {
        if (VALID_TAGS.includes(tag as ValidTag)) {
            valid.push(tag as ValidTag);
        } else {
            invalid.push(tag);
        }
    }
    
    return { valid, invalid };
}
