# Coffee Map data strategy

Coffee Map should behave like the definitive cafe map for Merida and use only
open or community-owned sources. The product value lives in Coffee Map data: visited status, favorites,
want-to-go, personal reviews, lists, tags, photos uploaded by users, and later
community rankings.

## Recommended source of truth

Use Supabase as the source of truth for app screens:

- `cafes`: one row per cafe.
- `user_cafes`: each user's visited/favorite/want-to-go/rating/review state.
- Future tables: `cafe_photos`, `cafe_tags`, `lists`, `list_items`,
  `cafe_reports`.

The public app reads Supabase first. Open-data scans are controlled admin jobs,
not requests made whenever a user opens the map or a cafe detail page.

## What to store for each cafe

Keep the permanent row small and app-owned:

- `id`: internal Coffee Map id.
- `source` and `source_id`: identity from OpenStreetMap or Overture.
- `nombre`
- `lat`
- `lng`
- `address`
- `source_url`: canonical OpenStreetMap or Overture URL.
- `cover_image_url`: only if this is an app-owned/allowed image.
- `last_verified_at`
- `status`: `active`, `closed`, `needs_review`.

Do not copy ratings, reviews, menus, or photos from proprietary services. Those
fields make the app depend on paid calls and third-party content rules.

## Open discovery sources

- OpenStreetMap/Overpass: periodic scans split into Merida quadrants.
- Overture Maps Places: high-confidence open POIs queried by bounding box.
- Wikimedia Commons: only images with supported open-license metadata.
- Community uploads: preferred source for current storefront and drink photos.

## Why this matters

The practical rule for Coffee Map:

1. Import/verify cafes in batches.
2. Store the cafe identity and coordinates.
3. Build the experience from Coffee Map user data.
4. Keep attribution and license metadata for every third-party image.

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
