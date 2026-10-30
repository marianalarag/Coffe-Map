import { supabase } from '../supabase';

export const editPublication = async ({ post, changes, photos, userId }) => {
  const uploaded = [];
  const results = new Array(photos.length);
  try {
    // Upload first. The existing publication remains intact until the RPC commits.
    for (let from = 0; from < photos.length; from += 3) {
      const batch = await Promise.allSettled(photos.slice(from, from + 3).map(async (photo, offset) => {
        const index = from + offset;
        if (!photo.file) { results[index] = { id: String(photo.id).endsWith(':legacy') ? crypto.randomUUID() : photo.id, storage_path: photo.storage_path, public_url: photo.public_url }; return; }
        const extension = photo.file.name.split('.').pop()?.toLowerCase();
        const path = `${userId}/posts/${post.id}/${crypto.randomUUID()}.${/^[a-z0-9]{2,5}$/.test(extension) ? extension : 'jpg'}`;
        const { error } = await supabase.storage.from('cafe-photos').upload(path, photo.file, { contentType: photo.file.type });
        if (error) throw error;
        uploaded.push(path);
        results[index] = { id: crypto.randomUUID(), storage_path: path, public_url: supabase.storage.from('cafe-photos').getPublicUrl(path).data.publicUrl, preview_url: photo.preview_url };
      }));
      const failure = batch.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
    const { data, error } = await supabase.rpc('edit_publication', {
      target_post_id: post.id, changes,
      photo_items: results.map(({ id, storage_path, public_url }) => ({ id, storage_path, public_url })),
    });
    if (error) throw error;
    const previews = new Map(results.filter((photo) => photo.preview_url).map((photo) => [photo.storage_path, photo.preview_url]));
    const images = data.images.map((photo) => ({ ...photo, preview_url: previews.get(photo.storage_path) }));
    // Storage cleanup is separate from the committed publication update.
    if (data.removed_paths?.length) supabase.storage.from('cafe-photos').remove(data.removed_paths).catch(() => {});
    return { ...data.post, images };
  } catch (error) {
    if (uploaded.length) await supabase.storage.from('cafe-photos').remove(uploaded).catch(() => {});
    throw error;
  }
};
