// Keep client-side cafe objects (which may also contain presentation aliases)
// separate from rows sent to PostgREST.
export const CAFE_DB_COLUMNS = [
  'id',
  'nombre',
  'lat',
  'lng',
  'rating',
  'reviews',
  'link',
  'image_url',
  'image_source_url',
  'image_attribution',
  'image_license',
  'instagram_url',
  'tiktok_url',
  'opening_hours',
  'opening_hours_source',
  'opening_hours_source_url',
  'opening_hours_verified_at',
  'address',
  'neighborhood',
  'category',
  'source',
  'source_id',
  'source_url',
  'status',
  'submitted_by',
  'last_verified_at',
];

export const toCafeDbRow = (cafe) => Object.fromEntries(
  CAFE_DB_COLUMNS
    .filter((column) => Object.prototype.hasOwnProperty.call(cafe, column))
    .map((column) => [column, cafe[column]]),
);
