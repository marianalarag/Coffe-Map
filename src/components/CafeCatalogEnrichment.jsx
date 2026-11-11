import { useMemo, useState } from 'react';
import { Check, ExternalLink, Globe, Instagram, LoaderCircle, Menu, Music2, Search, X } from 'lucide-react';
import { supabase } from '../supabase';

const FIELDS = [
  ['website_url', 'Sitio web', Globe],
  ['instagram_url', 'Instagram', Instagram],
  ['tiktok_url', 'TikTok', Music2],
  ['menu_page_url', 'Menú', Menu],
];
const missingAny = (cafe) => FIELDS.some(([field]) => !cafe[field]);
const canAssign = (result, field) => {
  let host;
  try { host = new URL(result.url).hostname.toLowerCase(); } catch { return false; }
  if (field === 'instagram_url') return host === 'instagram.com' || host.endsWith('.instagram.com');
  if (field === 'tiktok_url') return host === 'tiktok.com' || host.endsWith('.tiktok.com');
  return true;
};

export default function CafeCatalogEnrichment({ cafes, onApply, busy }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState([]);
  const [fields, setFields] = useState(FIELDS.map(([field]) => field));
  const [results, setResults] = useState([]);
  const [approved, setApproved] = useState({});
  const [progress, setProgress] = useState(0);
  const missing = useMemo(() => cafes.filter((cafe) => !cafe.deleted_at && missingAny(cafe)), [cafes]);
  const visible = useMemo(() => missing.filter((cafe) => `${cafe.nombre} ${cafe.neighborhood || ''} ${cafe.address || ''}`.toLowerCase().includes(query.toLowerCase())), [missing, query]);
  const selectedFields = Object.keys(approved).length;
  const locked = working || saving || busy;

  const toggleCafe = (id) => setChosen((current) => current.includes(id)
    ? current.filter((entry) => entry !== id)
    : current.length < 5 ? [...current, id] : current);

  const search = async () => {
    if (working || !chosen.length || !fields.length) return;
    setError(''); setResults([]); setApproved({}); setProgress(0); setWorking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Inicia sesión otra vez para buscar información.');
      const batchId = crypto.randomUUID();
      for (let index = 0; index < chosen.length; index += 1) {
        const cafe = cafes.find((item) => item.id === chosen[index]);
        if (!cafe) continue;
        const requestedFields = fields.filter((field) => !cafe[field]);
        if (!requestedFields.length) { setProgress(index + 1); continue; }
        setProgress(index + 1);
        const response = await fetch('/api/search-cafe', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ cafeId: cafe.id, fields: requestedFields, batchId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(`${cafe.nombre}: ${payload.error || 'No se pudo completar la búsqueda.'}`);
        setResults((current) => [...current.filter((item) => item.cafeId !== cafe.id), payload]);
      }
    } catch (failure) { setError(failure.message || 'No se pudo completar la búsqueda.'); }
    finally { setWorking(false); }
  };

  const assignResult = (row, result, field) => {
    const key = `${row.cafeId}:${field}`;
    setApproved((current) => current[key]?.value === result.url
      ? Object.fromEntries(Object.entries(current).filter(([entry]) => entry !== key))
      : { ...current, [key]: { value: result.url, sourceUrl: result.url, sourceTitle: result.title } });
  };

  const apply = async () => {
    const rows = new Map();
    Object.entries(approved).forEach(([key, source]) => {
      const separator = key.lastIndexOf(':');
      const id = key.slice(0, separator);
      const field = key.slice(separator + 1);
      if (!rows.has(id)) rows.set(id, { id, fields: {}, sources: {} });
      rows.get(id).fields[field] = source.value;
      rows.get(id).sources[field] = { url: source.sourceUrl, title: source.sourceTitle };
    });
    const suggestions = [...rows.values()];
    if (!suggestions.length || saving) return;
    setSaving(true); setError('');
    try {
      const saved = await onApply(suggestions);
      if (saved) setOpen(false);
      else setError('No se guardaron todos los enlaces. Revisa el mensaje del Centro de control e intenta otra vez.');
    } finally { setSaving(false); }
  };

  return <>
    <button type="button" className="cms-primary cafe-enrichment-trigger" disabled={!missing.length || locked} onClick={() => setOpen(true)}><Search size={16} /> Buscar datos en web gratis ({missing.length})</button>
    {open && <div className="cafe-enrichment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !locked) setOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape' && !locked) setOpen(false); }}>
      <section className="cafe-enrichment-dialog" role="dialog" aria-modal="true" aria-labelledby="cafe-enrichment-title">
        <header><div><small>BÚSQUEDA PÚBLICA EN INTERNET</small><h2 id="cafe-enrichment-title">Completar datos de cafeterías</h2></div><button type="button" aria-label="Cerrar" disabled={locked} onClick={() => setOpen(false)}><X size={21} /></button></header>
        <p className="cafe-enrichment-description">Busca páginas públicas para cafeterías y redes sociales. Revisa los resultados y asigna cada enlace al campo correcto antes de guardar.</p>
        <div className="cafe-enrichment-cost-note">Sin clave ni cobro de API. El buscador tiene límites gratuitos y los resultados pueden incluir negocios con nombres parecidos. Verifica la sucursal antes de guardar.</div>
        <div className="cafe-enrichment-controls"><label>Campos que quieres encontrar</label><div>{FIELDS.map(([field, label]) => <label key={field}><input type="checkbox" checked={fields.includes(field)} disabled={locked} onChange={(event) => setFields((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} /> {label}</label>)}</div>
          <label htmlFor="cafe-enrichment-search">Elige hasta 5 cafeterías</label><input id="cafe-enrichment-search" value={query} disabled={locked} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o zona" />
        </div>
        <div className="cafe-enrichment-picker">{visible.slice(0, 60).map((cafe) => <label key={cafe.id}><input type="checkbox" checked={chosen.includes(cafe.id)} disabled={locked || (!chosen.includes(cafe.id) && chosen.length >= 5)} onChange={() => toggleCafe(cafe.id)} /><span>{cafe.nombre}</span><small>{cafe.neighborhood || cafe.address || 'Mérida'}</small></label>)}{!visible.length && <p>No encontramos cafeterías con campos vacíos.</p>}{visible.length > 60 && <small>Escribe en el buscador para acotar las {visible.length} coincidencias.</small>}</div>
        <button type="button" className="cms-primary cafe-enrichment-search-button" disabled={locked || !chosen.length || !fields.length} onClick={search}>{working ? <><LoaderCircle className="admin-spin" size={16} /> Buscando {progress} de {chosen.length}…</> : <><Search size={16} /> Buscar {chosen.length} cafeterías</>}</button>
        {error && <p className="cafe-enrichment-feedback" role="alert">{error}</p>}
        {results.length > 0 && <div className="cafe-enrichment-results">{results.map((row) => <article key={row.cafeId}>
          <div className="cafe-enrichment-cafe"><strong>{row.nombre}</strong><span className="cafe-enrichment-match">{row.sourcesCount} resultados web</span></div>
          {row.results.length ? row.results.map((result) => <div className="cafe-search-result" key={`${row.cafeId}:${result.url}`}>
            <div><a className="cafe-search-result-title" href={result.url} target="_blank" rel="noreferrer">{result.title}<ExternalLink size={12} /></a><small>{result.domain}</small>{result.excerpt && <p>{result.excerpt}</p>}</div>
            <div className="cafe-search-result-actions">{FIELDS.filter(([field]) => fields.includes(field) && !cafes.find((cafe) => cafe.id === row.cafeId)?.[field] && canAssign(result, field)).map(([field, label]) => { const key = `${row.cafeId}:${field}`; const active = approved[key]?.value === result.url; return <button key={field} type="button" className={active ? 'is-assigned' : ''} disabled={locked} onClick={() => assignResult(row, result, field)}>{active ? '✓ ' : ''}{active ? `Asignado: ${label}` : `Usar para ${label}`}</button>; })}</div>
          </div>) : <small>No encontré resultados para esta cafetería.</small>}
        </article>)}</div>}
        <footer><small className="cafe-enrichment-attribution">El buscador entrega enlaces y extractos; tú verificas la sucursal.</small><button type="button" onClick={() => setOpen(false)} disabled={locked}>Cerrar</button><button type="button" className="cms-primary" onClick={apply} disabled={locked || !selectedFields}>{saving ? 'Guardando…' : <><Check size={16} /> Guardar seleccionados ({selectedFields})</>}</button></footer>
      </section>
    </div>}
  </>;
}
