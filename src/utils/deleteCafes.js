// Bound URL size for large selections and report only rows confirmed by the server.
export async function softDeleteCafes(client, cafeIds) {
  const ids = [...new Set(cafeIds.filter(Boolean))];
  const deletedIds = [];
  const deletedAt = new Date().toISOString();

  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    try {
      const { data, error } = await client.from('cafes')
        .update({ status: 'closed', deleted_at: deletedAt, updated_at: deletedAt })
        .in('id', batch)
        .select('id');
      if (error) throw error;
      const confirmed = new Set((data || []).map((row) => row.id));
      deletedIds.push(...batch.filter((id) => confirmed.has(id)));
      if (batch.some((id) => !confirmed.has(id))) {
        return { deletedIds, deletedAt, error: 'No se pudo confirmar la eliminación de todas las cafeterías. Actualiza el catálogo y revisa tus permisos antes de reintentar.' };
      }
    } catch (error) {
      return { deletedIds, deletedAt, error: error.message || 'No se pudieron eliminar las cafeterías. Intenta nuevamente.' };
    }
  }
  return { deletedIds, deletedAt, error: '' };
}

// DELETE is guarded by the database admin policy. A zero-row response is not success.
export async function permanentlyDeleteCafe(client, cafeId) {
  if (!cafeId) throw new Error('Falta la cafetería que quieres eliminar.');
  const { data, error } = await client.from('cafes').delete().eq('id', cafeId).select('id').single();
  if (error) throw error;
  if (data?.id !== cafeId) throw new Error('No se pudo confirmar la eliminación. Revisa tus permisos e intenta nuevamente.');
  return data.id;
}
