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
  const selectedFields = results.reduce((count, row) => count + row.suggestions.filter((item) => approved[`${row.cafeId}:${item.field}`]).length, 0);
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
      for (let index = 0; index < chosen.length; index += 1) {
        const cafe = cafes.find((item) => item.id === chosen[index]);
        if (!cafe) continue;
        const requestedFields = fields.filter((field) => !cafe[field]);
        if (!requestedFields.length) { setProgress(index + 1); continue; }
        setProgress(index + 1);
        const response = await fetch('/api/research-cafe', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ cafeId: cafe.id, fields: requestedFields }),
        });
        const payload = await response.json();
        if (!response.ok) {
          if (response.status === 503) throw new Error('Para activar la búsqueda web, falta configurar OPENAI_API_KEY como secreto de producción en Vercel.');
          throw new Error(`${cafe.nombre}: ${payload.error || 'No se pudo completar la búsqueda.'}`);
        }
        setResults((current) => [...current.filter((item) => item.cafeId !== cafe.id), payload]);
        setApproved((current) => ({ ...current, ...Object.fromEntries((payload.suggestions || []).map((item) => [`${cafe.id}:${item.field}`, true])) }));
      }
    } catch (failure) { setError(failure.message || 'No se pudo completar la búsqueda.'); }
    finally { setWorking(false); }
  };

  const apply = async () => {
    const suggestions = results.map((row) => ({ id: row.cafeId, nombre: row.nombre, fields: Object.fromEntries(row.suggestions.filter((item) => approved[`${row.cafeId}:${item.field}`]).map((item) => [item.field, item.value])) })).filter((row) => Object.keys(row.fields).length);
    if (!suggestions.length || saving) return;
    setSaving(true); setError('');
    try {
      const saved = await onApply(suggestions);
      if (saved) setOpen(false);
      else setError('No se guardaron todos los enlaces. Revisa el mensaje del Centro de control e intenta otra vez.');
    } finally { setSaving(false); }
  };

  return <>
    <button type="button" className="cms-primary cafe-enrichment-trigger" disabled={!missing.length || locked} onClick={() => setOpen(true)}><Search size={16} /> Buscar en internet con IA ({missing.length})</button>
    {open && <div className="cafe-enrichment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !locked) setOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape' && !locked) setOpen(false); }}>
      <section className="cafe-enrichment-dialog" role="dialog" aria-modal="true" aria-labelledby="cafe-enrichment-title">
        <header><div><small>ASISTENTE DE INVESTIGACIÓN WEB</small><h2 id="cafe-enrichment-title">Completar datos de cafeterías</h2></div><button type="button" aria-label="Cerrar" disabled={locked} onClick={() => setOpen(false)}><X size={21} /></button></header>
        <p className="cafe-enrichment-description">Busca sitios oficiales, perfiles sociales y páginas de menú en la web actual. Revisa las fuentes y aprueba cada dato antes de guardarlo.</p>
        <div className="cafe-enrichment-cost-note">Cada cafetería inicia una búsqueda web de OpenAI y consume créditos de tu API. Máximo 5 cafeterías por lote. Los resultados no se guardan automáticamente.</div>
        <div className="cafe-enrichment-setup" hidden={!error.includes('OPENAI_API_KEY')} role="status">Agrega <code>OPENAI_API_KEY</code> en Vercel → Settings → Environment Variables (Production) y vuelve a desplegar para activar la búsqueda.</div>
        <div className="cafe-enrichment-controls"><label>Campos que quieres encontrar</label><div>{FIELDS.map(([field, label]) => <label key={field}><input type="checkbox" checked={fields.includes(field)} disabled={locked} onChange={(event) => setFields((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} /> {label}</label>)}</div>
          <label htmlFor="cafe-enrichment-search">Elige hasta 5 cafeterías</label><input id="cafe-enrichment-search" value={query} disabled={locked} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o zona" />
        </div>
        <div className="cafe-enrichment-picker">{visible.slice(0, 60).map((cafe) => <label key={cafe.id}><input type="checkbox" checked={chosen.includes(cafe.id)} disabled={locked || (!chosen.includes(cafe.id) && chosen.length >= 5)} onChange={() => toggleCafe(cafe.id)} /><span>{cafe.nombre}</span><small>{cafe.neighborhood || cafe.address || 'Mérida'}</small></label>)}{!visible.length && <p>No encontramos cafeterías con campos vacíos.</p>}{visible.length > 60 && <small>Escribe en el buscador para acotar las {visible.length} coincidencias.</small>}</div>
        <button type="button" className="cms-primary cafe-enrichment-search-button" disabled={locked || !chosen.length || !fields.length} onClick={search}>{working ? <><LoaderCircle className="admin-spin" size={16} /> Investigando {progress} de {chosen.length}…</> : <><Search size={16} /> Buscar {chosen.length} cafeterías</>}</button>
        {error && !error.includes('OPENAI_API_KEY') && <p className="cafe-enrichment-feedback" role="alert">{error}</p>}
        {results.length > 0 && <>
          <div className="cafe-enrichment-results">{results.map((row) => <article key={row.cafeId}>
            <div className="cafe-enrichment-cafe"><strong>{row.nombre}</strong><span className={`cafe-enrichment-match is-${row.match}`}>{row.match === 'exact' ? 'Coincidencia exacta' : row.match === 'likely' ? 'Coincidencia probable' : row.match === 'ambiguous' ? 'Revisar sucursal' : 'Sin coincidencia'}</span></div>
            {row.reason && <p className="cafe-enrichment-reason">{row.reason}</p>}
            {row.suggestions.map((item) => { const Icon = FIELDS.find(([field]) => field === item.field)?.[2] || Globe; const key = `${row.cafeId}:${item.field}`; return <label className="cafe-enrichment-field" key={key}><input type="checkbox" checked={Boolean(approved[key])} disabled={locked} onChange={(event) => setApproved((current) => ({ ...current, [key]: event.target.checked }))} /><Icon size={16} /><span>{item.label}</span><a href={item.value} target="_blank" rel="noreferrer" title={item.value}>{item.value}<ExternalLink size={12} /></a><small>Fuente: <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceTitle || item.sourceUrl}</a></small></label>; })}
            {!row.suggestions.length && <small>No encontré enlaces con fuente verificable.</small>}
          </article>)}</div>
        </>}
        <footer><small className="cafe-enrichment-attribution">Las fuentes se conservan visibles para verificar cada sugerencia.</small><button type="button" onClick={() => setOpen(false)} disabled={locked}>Cerrar</button><button type="button" className="cms-primary" onClick={apply} disabled={locked || !selectedFields}>{saving ? 'Guardando…' : <><Check size={16} /> Guardar seleccionados ({selectedFields})</>}</button></footer>
      </section>
    </div>}
  </>;
}
