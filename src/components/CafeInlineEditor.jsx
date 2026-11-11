import { useId, useState } from 'react';
import { Camera, Check, Edit3, Loader2, Plus, Save, Shield, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { EDITOR_DAYS, editableCafeSchedule, serializeCafeSchedule } from '../utils/cafeEditor';
import '../cafeInlineEditor.css';

export function CafeInlineToolbar({ editor }) {
  if (!editor.isAdmin) return null;
  return <div className={`cafe-inline-toolbar ${editor.editing ? 'is-editing' : ''}`}>
    {editor.editing ? <>
      <div className="cafe-inline-mode"><Shield size={17} /><span><strong>Edición de cafetería</strong><small>{editor.dirty ? 'Tienes cambios sin guardar' : 'Edita los campos en esta página'}</small></span></div>
      <div className="cafe-inline-toolbar-actions">
        <button type="button" onClick={() => editor.requestConfirmation({ type: 'cafe' })} disabled={editor.busy} className="cafe-inline-danger" aria-label="Eliminar cafetería"><Trash2 size={17} /><span>Eliminar</span></button>
        <button type="button" onClick={editor.requestCancel} disabled={editor.busy}><X size={17} />Cancelar</button>
        <button type="button" onClick={editor.save} disabled={editor.busy || !editor.dirty} className="cafe-inline-primary">{editor.busy ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}{editor.busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </> : <button type="button" className="cafe-inline-edit-toggle" onClick={editor.start}><Edit3 size={16} />Editar cafetería</button>}
    {editor.error && <p className="cafe-inline-feedback is-error" role="alert">{editor.error}</p>}
    {editor.notice && <p className="cafe-inline-feedback" role="status"><Check size={15} />{editor.notice}</p>}
  </div>;
}

export function CafeInlineField({ editor, field, label, multiline = false, className = '' }) {
  const id = useId();
  const Input = multiline ? 'textarea' : 'input';
  return <label className={`cafe-inline-field ${className}`} htmlFor={id}><span id={`${id}-label`}>{label}</span><Input id={id} aria-labelledby={`${id}-label`} value={editor.draft[field]} disabled={editor.busy} onChange={(event) => editor.change(field, event.target.value)} placeholder={`Agregar ${label.toLowerCase()}`} rows={multiline ? 3 : undefined} /></label>;
}

export function CafeInlineCover({ editor }) {
  return <div className="cafe-inline-cover-tools">
    <label className="cafe-inline-upload"><Camera size={16} />{editor.draft.image_url ? 'Cambiar portada' : 'Agregar portada'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={editor.busy} onChange={(event) => { editor.stageImages('image_url', [...event.target.files]); event.target.value = ''; }} /></label>
    {editor.draft.image_url && <button type="button" disabled={editor.busy} onClick={() => editor.change('image_url', '')} aria-label="Quitar portada"><Trash2 size={16} /></button>}
    <small>Usa una foto propia o con permiso de publicación. Máximo 8 MB.</small>
  </div>;
}

export function CafeInlineHours({ editor }) {
  const schedule = editableCafeSchedule(editor.draft.opening_hours);
  const updateDay = (day, ranges) => editor.change('opening_hours', serializeCafeSchedule({ ...schedule, [day]: ranges }));
  return <section className="cafe-inline-panel cafe-inline-hours" aria-label="Editar horarios">
    <header><h2>Horarios</h2><button type="button" disabled={editor.busy} onClick={() => editor.change('opening_hours', '')}>Sin confirmar</button><button type="button" disabled={editor.busy} onClick={() => editor.change('opening_hours', '24/7')}>24 horas</button></header>
    <p className="cafe-inline-help">Activa los días abiertos. Puedes agregar varios turnos y horarios que terminan al día siguiente.</p>
    {EDITOR_DAYS.map(([day, label]) => <div className="cafe-inline-day" key={day}>
      <label className="cafe-inline-day-toggle"><input type="checkbox" disabled={editor.busy} checked={schedule[day].length > 0} onChange={(event) => updateDay(day, event.target.checked ? ['08:00-18:00'] : [])} />{label}</label>
      {schedule[day].length ? <div className="cafe-inline-ranges">{schedule[day].map((range, index) => {
        const [from, to] = range.split('-');
        const changeTime = (part, time) => {
          if (!time) return;
          const next = [...schedule[day]];
          next[index] = part === 'from' ? `${time}-${to}` : `${from}-${time}`;
          updateDay(day, next);
        };
        return <div key={index} className="cafe-inline-time-range"><input type="time" aria-label={`Apertura de ${label}, turno ${index + 1}`} value={from} disabled={editor.busy} onChange={(event) => changeTime('from', event.target.value)} /><span>a</span><input type="time" aria-label={`Cierre de ${label}, turno ${index + 1}`} value={to === '24:00' ? '00:00' : to} disabled={editor.busy} onChange={(event) => changeTime('to', event.target.value)} /><button type="button" disabled={editor.busy} onClick={() => updateDay(day, schedule[day].filter((_, i) => i !== index))} aria-label={`Quitar turno ${index + 1} de ${label}`}><X size={14} /></button></div>;
      })}{schedule[day].length < 3 && <button type="button" className="cafe-inline-add-shift" disabled={editor.busy} onClick={() => updateDay(day, [...schedule[day], '16:00-20:00'])}><Plus size={13} />Turno</button>}</div> : <span className="cafe-inline-help">{editor.draft.opening_hours ? 'Cerrado' : 'Sin confirmar'}</span>}
    </div>)}
  </section>;
}

export function CafeInlineMenu({ editor }) {
  const images = editor.draft.menuImages;
  const move = (index, target) => {
    const next = [...images];
    const [url] = next.splice(index, 1);
    next.splice(target, 0, url);
    editor.change('menuImages', next);
  };
  return <section className="cafe-inline-panel">
    <header><h2>Menú</h2><span>{images.length} / 12 imágenes</span></header>
    <CafeInlineField editor={editor} field="menu_page_url" label="Enlace del menú o PDF" />
    <div className="cafe-inline-image-grid">{images.map((url, index) => <div className="cafe-inline-image-item" key={`${url}-${index}`}><img src={url} alt={`Menú, página ${index + 1}`} /><span>Página {index + 1}</span><div><button type="button" disabled={editor.busy || index === 0} aria-label={`Mover página ${index + 1} antes`} onClick={() => move(index, index - 1)}><ChevronLeft size={16} /></button><button type="button" disabled={editor.busy || index === images.length - 1} aria-label={`Mover página ${index + 1} después`} onClick={() => move(index, index + 1)}><ChevronRight size={16} /></button><button type="button" disabled={editor.busy} aria-label={`Quitar página ${index + 1}`} onClick={() => editor.change('menuImages', images.filter((_, i) => i !== index))}><Trash2 size={16} /></button></div></div>)}</div>
    <label className="cafe-inline-upload"><Plus size={16} />Agregar imágenes al menú<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple disabled={editor.busy || images.length >= 12} onChange={(event) => { editor.stageImages('menuImages', [...event.target.files]); event.target.value = ''; }} /></label>
    <p className="cafe-inline-help">Fotos propias o con permiso, hasta 8 MB cada una. El menú y la portada se publican al guardar.</p>
  </section>;
}

export function CafeInlineGallery({ editor, photos }) {
  const [file, setFile] = useState(null);
  const [rights, setRights] = useState(false);
  return <div className="cafe-inline-panel">
    <div className="cafe-inline-image-grid">{photos.map((photo, index) => <div className="cafe-inline-image-item" key={photo.id}><img src={photo.public_url} alt={`Foto ${index + 1} de la galería`} /><button type="button" disabled={editor.busy} onClick={() => editor.requestConfirmation({ type: 'photo', id: photo.id })}><Trash2 size={15} />Quitar de galería</button></div>)}</div>
    <label className="cafe-inline-upload"><Plus size={16} />Elegir foto<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={editor.busy} onChange={(event) => { setFile(event.target.files?.[0] || null); event.target.value = ''; }} /></label>
    {file && <div className="cafe-inline-publish"><span>{file.name}</span><label><input type="checkbox" checked={rights} disabled={editor.busy} onChange={(event) => setRights(event.target.checked)} />Tengo permiso para publicar esta foto.</label><button type="button" className="cafe-inline-primary" disabled={editor.busy || !rights} onClick={() => editor.addGalleryPhoto(file, rights, () => { setFile(null); setRights(false); })}><Plus size={15} />Publicar foto</button></div>}
    <p className="cafe-inline-help">Las fotos de galería se publican al pulsar «Publicar foto». Quitar una foto no elimina la publicación de su autor.</p>
  </div>;
}

export function CafeInlineTikToks({ editor, tiktoks, ready }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  return <div className="cafe-inline-panel">
    {tiktoks.map((tiktok) => <div className="cafe-inline-video-row" key={tiktok.id}><a href={tiktok.url} target="_blank" rel="noreferrer">{tiktok.title || tiktok.url}</a><button type="button" disabled={editor.busy} aria-label={`Quitar TikTok ${tiktok.title || tiktok.url}`} onClick={() => editor.requestConfirmation({ type: 'tiktok', id: tiktok.id })}><Trash2 size={16} /></button></div>)}
    <form className="cafe-inline-video-form" onSubmit={(event) => { event.preventDefault(); editor.addTikTok(url, title, () => { setUrl(''); setTitle(''); }); }}>
      <label className="cafe-inline-field"><span>Enlace del video de TikTok</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.tiktok.com/@cuenta/video/…" required disabled={editor.busy || !ready} /></label>
      <label className="cafe-inline-field"><span>Título (opcional)</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={editor.busy || !ready} /></label>
      <button type="submit" className="cafe-inline-primary" disabled={editor.busy || !url.trim() || !ready}><Plus size={16} />Publicar TikTok</button>
    </form>
    <p className="cafe-inline-help">Los videos se publican al pulsar «Publicar TikTok».</p>
  </div>;
}

export function CafeInlineConfirmation({ editor, cafeName }) {
  if (!editor.confirmation) return null;
  const { type } = editor.confirmation;
  const [title, description, label] = {
    cafe: ['Eliminar cafetería', `¿Eliminar ${cafeName} del catálogo y del mapa? Se conservará el historial de visitas.`, 'Eliminar cafetería'],
    photo: ['Quitar foto de la galería', 'La foto dejará de aparecer en esta galería. La publicación original de su autor se conservará.', 'Quitar foto'],
    tiktok: ['Quitar TikTok', 'Este video dejará de aparecer en la ficha de la cafetería.', 'Quitar TikTok'],
    discard: ['Descartar cambios', 'Se descartarán los cambios pendientes de datos, portada y menú. Las fotos y videos que ya publicaste se conservarán.', 'Descartar cambios'],
  }[type];
  return <ConfirmDialog title={title} description={description} confirmLabel={label} busy={editor.busy} error={editor.error} onConfirm={editor.confirm} onCancel={editor.closeConfirmation} />;
}
