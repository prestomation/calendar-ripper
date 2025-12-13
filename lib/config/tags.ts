// Valid tags for calendar events
export const VALID_TAGS = [
    // Location-based
    "Seattle",
    "Downtown", 
    "QueenAnne",
    "CapitolHill",
    
    // Activity types
    "Music",
    "Movies", 
    "Beer",
    "Arts",
    "Crafts",
    "Markets",
    "MakersMarkets",
    "Shopping",
    "Handmade",
    
    // Pet/Animal related
    "Pets",
    "Dogs", 
    "DogEvents",
    "PetFriendly",
    
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
