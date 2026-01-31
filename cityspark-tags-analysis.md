# CitySpark Tags Analysis for SEAtoday

## Top-Level Categories Available

Based on the CitySpark data, these are the main event categories:

- **ID 2**: Performing Arts (includes Music, Dance, Theater, Comedy)
- **ID 3**: Visual Arts (Drawing, Painting, Sculpture, Photography, Film)
- **ID 4**: Literary Arts (Writing, Poetry, Storytelling, Book Clubs)
- **ID 5**: Destinations (Festivals, Museums, Zoos, Parks)
- **ID 6**: Sports & Outdoors (Sports, Outdoor Recreation, Fitness)
- **ID 7**: Learning (Conferences, Workshops, Talks, Classes)
- **ID 8**: Professional (Business, Tech, Real Estate, Science)
- **ID 10**: Lifestyle
- **ID 11**: Civic Benefit
- **ID 12**: Food & Drink
- **ID 14**: Nightlife
- **ID 15**: Special Audience

## Sample Event Tagging

Example events and their tags:
- **Rising Artisans Kids Fine Art Classes**: Visual Arts, Special Audience, Professional, Learning
- **Stretch & Savor at Pike Place Market**: Professional, Lifestyle
- **SAM Body + Mind**: Lifestyle, Sports & Outdoors, Performing Arts, Music, Literary Arts
- **Get With It Auto Club Cars and Coffee**: Lifestyle, Food & Drink

## Proposed Calendar Split

We could create separate calendars like:

1. **seatoday-arts** - Visual Arts, Performing Arts, Literary Arts (IDs: 2, 3, 4, 17)
2. **seatoday-food-drink** - Food & Drink (ID: 12)
3. **seatoday-sports** - Sports & Outdoors (ID: 6)
4. **seatoday-learning** - Learning, Professional (IDs: 7, 8)
5. **seatoday-community** - Civic Benefit, Destinations (IDs: 5, 11)
6. **seatoday-nightlife** - Nightlife (ID: 14)
7. **seatoday-general** - Everything else / Lifestyle (ID: 10)

## Mapping to Project Tags

CitySpark Category → Project Tags:
- Performing Arts → Art, Music
- Food & Drink → Beer, Food
- Sports & Outdoors → Sports
- Learning → Education
- Civic Benefit → Activism, Volunteer
