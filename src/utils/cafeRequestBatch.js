// Each acceptance still goes through the server's location verification.
// Keep failed requests separate so a partial batch can be retried safely.
export async function processCafeRequestBatch(requests, nextStatus, moderate, onProgress = () => {}) {
  if (!['active', 'closed'].includes(nextStatus)) throw new Error('Acción de solicitudes inválida.');
  const unique = [...new Map(requests.filter((cafe) => cafe.status === 'needs_review').map((cafe) => [cafe.id, cafe])).values()];
  const processedIds = [];
  const failed = [];
  for (let offset = 0; offset < unique.length; offset += 3) {
    const batch = unique.slice(offset, offset + 3);
    const results = await Promise.allSettled(batch.map((cafe) => moderate(cafe, nextStatus)));
    results.forEach((result, index) => {
      const cafe = batch[index];
      if (result.status === 'fulfilled' && result.value !== false) processedIds.push(cafe.id);
      else failed.push({ id: cafe.id, nombre: cafe.nombre, error: result.status === 'rejected' ? result.reason?.message || 'No se pudo completar la solicitud.' : 'No se pudo confirmar el cambio.' });
    });
    onProgress({ completed: processedIds.length + failed.length, total: unique.length });
  }
  return { processedIds, failed };
}
