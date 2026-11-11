import { isGoogleMapsLink, normalizeGoogleMapsLink } from './cafeLocation.js';
import { parseCafeHours } from './cafeHours.js';

export const EDITOR_DAYS = [
  ['Mo', 'Lunes'], ['Tu', 'Martes'], ['We', 'Miércoles'], ['Th', 'Jueves'],
  ['Fr', 'Viernes'], ['Sa', 'Sábado'], ['Su', 'Domingo'],
];

const TEXT_FIELDS = ['nombre', 'neighborhood', 'category', 'address', 'link', 'website_url', 'instagram_url', 'tiktok_url', 'menu_page_url', 'image_url'];
export const createCafeDraft = (cafe) => ({
  ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, cafe[field] || ''])),
  opening_hours: cafe.opening_hours || '',
  menuImages: [...(cafe.menuImages || [])],
});

export const hasCafeDraftChanges = (base, draft) => Boolean(base && draft && (
  [...TEXT_FIELDS, 'opening_hours'].some((field) => base[field] !== draft[field])
  || JSON.stringify(base.menuImages) !== JSON.stringify(draft.menuImages)
));

export const normalizeCafeEditorUrl = (value, label, host) => {
  let text = String(value || '').trim();
  if (!text) return null;
  if (host === 'instagram.com' && /^@?[\w.]+$/.test(text) && !text.includes('.com')) text = `https://instagram.com/${text.replace(/^@/, '')}`;
  if (host === 'tiktok.com' && /^@[\w.]+$/.test(text)) text = `https://www.tiktok.com/${text}`;
  if (!/^https?:\/\//i.test(text)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(text)) throw new Error(`Agrega un enlace válido de ${label}.`);
    text = `https://${text}`;
  }
  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password
      || (host && url.hostname !== host && !url.hostname.endsWith(`.${host}`))) throw new Error();
    return url.href;
  } catch { throw new Error(`Agrega un enlace válido de ${label}.`); }
};

// Only changed fields are sent, so background refreshes and other editors do not
// cause unrelated values (or community ratings) to be overwritten.
export const buildCafeEditorPatch = (base, draft, timestamp = new Date().toISOString()) => {
  const patch = {};
  for (const field of TEXT_FIELDS) {
    if (base[field] !== draft[field]) patch[field] = String(draft[field] || '').trim() || null;
  }
  if (!String(draft.nombre || '').trim()) throw new Error('El nombre de la cafetería es obligatorio.');
  if (patch.category && !['cafeteria', 'panaderia'].includes(patch.category)) throw new Error('Elige un tipo de lugar válido.');
  for (const [field, label, host] of [
    ['website_url', 'sitio web'], ['menu_page_url', 'menú'], ['image_url', 'imagen'],
    ['instagram_url', 'Instagram', 'instagram.com'], ['tiktok_url', 'TikTok', 'tiktok.com'],
  ]) {
    if (patch[field]) patch[field] = normalizeCafeEditorUrl(patch[field], label, host);
  }
  if (patch.link) {
    if (!isGoogleMapsLink(patch.link)) throw new Error('Agrega un enlace válido de Google Maps.');
    patch.link = normalizeGoogleMapsLink(patch.link);
  }
  if (Object.hasOwn(patch, 'image_url')) Object.assign(patch, {
    image_source_url: null, image_attribution: patch.image_url ? 'Foto añadida por la administración de Coffee Map' : null, image_license: null,
  });
  if (base.opening_hours !== draft.opening_hours) Object.assign(patch, {
    opening_hours: draft.opening_hours || null,
    opening_hours_source: draft.opening_hours ? 'admin' : null,
    opening_hours_source_url: null,
    opening_hours_verified_at: draft.opening_hours ? timestamp : null,
  });
  if (JSON.stringify(base.menuImages) !== JSON.stringify(draft.menuImages)) {
    if (draft.menuImages.length > 12) throw new Error('Puedes agregar hasta 12 imágenes de menú.');
    patch.menu_url = JSON.stringify(draft.menuImages.map((url) => normalizeCafeEditorUrl(url, 'imagen del menú')));
  }
  if (Object.keys(patch).length) patch.updated_at = timestamp;
  return patch;
};

export const editableCafeSchedule = (expression) => parseCafeHours(expression)
  || Object.fromEntries(EDITOR_DAYS.map(([key]) => [key, []]));

export const serializeCafeSchedule = (schedule) => EDITOR_DAYS.map(([key]) => {
  const ranges = schedule[key] || [];
  for (const range of ranges) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d-(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(range)) throw new Error('Revisa las horas de apertura y cierre.');
  }
  return `${key} ${ranges.length ? ranges.join(',') : 'off'}`;
}).join('; ');

export const validateCafeImage = (file) => {
  if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error('Elige una imagen JPG, PNG, WebP o HEIC de máximo 8 MB.');
  }
};

export const saveCafeEditorPatch = async (client, cafeId, patch) => {
  const { data, error } = await client.from('cafes').update(patch).eq('id', cafeId).is('deleted_at', null).select('*').single();
  if (error) throw error;
  if (!data?.id) throw new Error('No pudimos confirmar el cambio. Revisa tus permisos e intenta otra vez.');
  return data;
};
