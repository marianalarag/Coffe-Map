import { useMemo, useState } from 'react';
import { Check, ExternalLink, Globe, Instagram, LoaderCircle, Music2, Search, X } from 'lucide-react';
import { supabase } from '../supabase';

const labels = { website_url: 'Sitio web', instagram_url: 'Instagram', tiktok_url: 'TikTok' };
const icons = { website_url: Globe, instagram_url: Instagram, tiktok_url: Music2 };

export default function CafeCatalogEnrichment({ cafes, onApply }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState({});
  const missing = useMemo(() => cafes.filter((cafe) => cafe.source === 'osm' && !cafe.deleted_at
    && (!cafe.website_url || !cafe.instagram_url || !cafe.tiktok_url)), [cafes]);
  const selectedFields = results.reduce((total, row) => total + Object.keys(row.fields).filter((field) => selected[`${row.id}:${field}`]).length, 0);

  const close = () => { if (!working && !saving) setOpen(false); };
  const search = async () => {
    setError(''); setResults([]); setSelected({}); setWorking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Inicia sesión otra vez para buscar información.');
      const response = await fetch('/api/enrich-cafes', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ cafeIds: missing.map((cafe) => cafe.id) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo completar la búsqueda.');
      setResults(payload.results || []);
      setSelected(Object.fromEntries((payload.results || []).flatMap((row) => Object.keys(row.fields).map((field) => [`${row.id}:${field}`, true]))));
      if (!(payload.results || []).length) setError('No se encontraron enlaces nuevos en las fichas públicas.');
    } catch (failure) { setError(failure.message || 'No se pudo completar la búsqueda.'); }
    finally { setWorking(false); }
  };

  const apply = async () => {
    const approved = results.map((row) => ({ ...row, fields: Object.fromEntries(Object.entries(row.fields).filter(([field]) => selected[`${row.id}:${field}`])) })).filter((row) => Object.keys(row.fields).length);
    if (!approved.length || saving) return;
    setSaving(true); setError('');
    try {
      const saved = await onApply(approved);
      if (saved) setOpen(false);
      else setError('No se guardaron todos los enlaces. Revisa el mensaje del Centro de control e intenta otra vez.');
    } finally { setSaving(false); }
  };

  return <>
    <button type="button" className="cms-primary cafe-enrichment-trigger" disabled={!missing.length || working || saving} onClick={() => { setOpen(true); search(); }}><Search size={16} /> Buscar datos faltantes ({missing.length})</button>
    {open && <div className="cafe-enrichment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
      <section className="cafe-enrichment-dialog" role="dialog" aria-modal="true" aria-labelledby="cafe-enrichment-title">
        <header><div><small>CATÁLOGO · DATOS ABIERTOS</small><h2 id="cafe-enrichment-title">Buscar información faltante</h2></div><button type="button" aria-label="Cerrar" disabled={working || saving} onClick={close}><X size={21} /></button></header>
        <p className="cafe-enrichment-description">Comprobamos fichas de OpenStreetMap vinculadas por ID a las cafeterías. Solo sugerimos enlaces que faltan; tú eliges cuáles guardar.</p>
        {working && <div className="cafe-enrichment-status" role="status"><LoaderCircle className="admin-spin" size={19} /> Buscando en {missing.length} fichas…</div>}
        {error && !working && <p className="cafe-enrichment-feedback" role="status">{error}</p>}
        {results.length > 0 && <>
          <div className="cafe-enrichment-results">{results.map((row) => <article key={row.id}>
            <div className="cafe-enrichment-cafe"><strong>{row.nombre}</strong><a href={row.sourceUrl} target="_blank" rel="noreferrer">Fuente OSM <ExternalLink size={12} /></a></div>
            {Object.entries(row.fields).map(([field, url]) => { const Icon = icons[field]; const key = `${row.id}:${field}`; return <label className="cafe-enrichment-field" key={key}><input type="checkbox" checked={Boolean(selected[key])} disabled={saving} onChange={(event) => setSelected((current) => ({ ...current, [key]: event.target.checked }))} /><Icon size={16} /><span>{labels[field]}</span><a href={url} target="_blank" rel="noreferrer" title={url}>{url}<ExternalLink size={12} /></a></label>; })}
          </article>)}</div>
          <small className="cafe-enrichment-attribution">Datos de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small>
        </>}
        <footer><button type="button" onClick={search} disabled={working || saving || !missing.length}><Search size={15} /> Volver a buscar</button><button type="button" className="cms-primary" onClick={apply} disabled={working || saving || !selectedFields}>{saving ? 'Guardando…' : <><Check size={16} /> Guardar seleccionados ({selectedFields})</>}</button></footer>
      </section>
    </div>}
  </>;
}
