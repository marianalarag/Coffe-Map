# Coffee Map data strategy

Coffee Map should behave like the definitive cafe map for Merida, not like a
thin copy of Google Maps. The map and basic location data can come from Google,
but the product value should live in Coffee Map data: visited status, favorites,
want-to-go, personal reviews, lists, tags, photos uploaded by users, and later
community rankings.

## Recommended source of truth

Use Supabase as the source of truth for app screens:

- `cafes`: one row per cafe.
- `user_cafes`: each user's visited/favorite/want-to-go/rating/review state.
- Future tables: `cafe_photos`, `cafe_tags`, `lists`, `list_items`,
  `cafe_reports`.

The public app should read Supabase first. Google Places should not run every
time a user opens the map, searches, or opens a cafe detail page.

## What to store for each cafe

Keep the permanent row small and app-owned:

- `id`: internal Coffee Map id.
- `google_place_id`: stable external identity if the cafe was found with Google.
- `nombre`
- `lat`
- `lng`
- `address`
- `google_maps_url` or another external directions URL.
- `cover_image_url`: only if this is an app-owned/allowed image.
- `last_verified_at`
- `status`: `active`, `closed`, `needs_review`.

Avoid making Google/Yelp ratings, review counts, review text, menus, or photo
galleries the core visible content. Those fields make the app depend on paid
external calls and on third-party content rules.

## When to call Google Places

Use Google Places only in controlled flows:

- Admin import for a new area.
- "Falta una cafeteria" review flow.
- Occasional verification of place identity, coordinates, or closure.
- Directions/link-out to Google Maps.

Do not call Places from normal search results or cafe detail rendering. Those
screens should render from Supabase.

## Why this matters

Google documents that Places API content has caching/storage restrictions, while
`place_id` is exempt from those caching restrictions:

https://developers.google.com/maps/documentation/places/web-service/policies

Google also bills Places by SKU/request and field selection, so asking for more
fields or requesting details repeatedly can increase costs:

https://developers.google.com/maps/documentation/places/web-service/usage-and-billing

The practical rule for Coffee Map:

1. Import/verify cafes in batches.
2. Store the cafe identity and coordinates.
3. Build the experience from Coffee Map user data.
4. Refresh external data on a schedule, not per user interaction.

## Product direction

The app should answer questions Google Maps does not answer cleanly:

- Which cafes have I already visited?
- Which ones do I want to try?
- Which are good for working?
- Which have outlets, reliable Wi-Fi, parking, matcha, quiet tables, or late
  hours?
- Which cafes do my friends like?
- What are my personal cafe stats?

That is the Letterboxd-style advantage: the cafe exists on a map, but the reason
to return is personal memory and community context.
