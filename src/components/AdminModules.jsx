import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Camera, Coffee, Download, ExternalLink, Image, LayoutGrid, List, MapPin, Plus, Search, Shield, Trash2, Users, X } from 'lucide-react';
import CafeMapPreview from './AdminMapPreview';
import ConfirmDialog from './ConfirmDialog';
import { adminDate, statusLabel } from '../utils/adminFormatting';
import CafeCatalogEnrichment from './CafeCatalogEnrichment';

const includes = (value, term) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
export function AdminEmpty({ text }) { return <div className="cms-empty"><Coffee size={28} /><p>{text}</p></div>; }
export function AdminSearch({ value, onChange, placeholder }) { return <label className="cms-search"><Search size={17} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>; }
export function AdminDrawer({ title, onClose, children }) {
  useEffect(() => { const close = (event) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  return createPortal(<div className="cms-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="cms-drawer" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" aria-label="Cerrar detalle" onClick={onClose} autoFocus><X size={22} /></button></header>{children}</aside></div>, document.body);
}

export function AdminOverview({ metrics, cafes, photos, posts, profiles, onModule, onNewCafe, onNewPost, loading, notice }) {
  const pending = cafes.filter((cafe) => cafe.source === 'community' && cafe.status === 'needs_review');
  const photoCount = photos.length;
  const entries = [['Cafeterías en mapa', metrics.cafes, Coffee, 'cafes'], ['Usuarios', metrics.users, Users, 'users'], ['Publicaciones', metrics.posts, Camera, 'posts'], ['Fotos', metrics.photos, Image, 'photos'], ['Reseñas', metrics.reviews, BarChart3, 'posts']];
  return <section className="cms-overview">
    <div className="cms-metrics">{entries.map((entry) => { const [label, value, Icon, target] = entry; return <button type="button" key={label} onClick={() => onModule(target)}><Icon size={25} /><span><strong>{loading ? '…' : value ?? 0}</strong><small>{label}</small></span></button>; })}</div>
    <div className="cms-overview-top"><section className="cms-panel"><h2>Acciones rápidas</h2><div className="cms-quick-actions"><button type="button" className="cms-primary" onClick={onNewCafe}><Plus size={17} /> Nueva cafetería</button><button type="button" onClick={() => onModule('requests')}>Revisar solicitudes</button><button type="button" onClick={() => onModule('photos')}>Moderar fotos</button><button type="button" onClick={onNewPost}>Crear publicación</button></div></section><section className="cms-panel"><h2><Shield size={20} /> Estado del centro</h2><p className="cms-system-status">{loading ? 'Actualizando datos…' : notice?.startsWith('Error') ? notice : 'Datos cargados'}</p><small>{pending.length} solicitudes · {photoCount} fotos</small></section></div>
    <div className="cms-overview-bottom"><section className="cms-panel"><h2>Solicitudes por revisar</h2>{pending.length ? pending.slice(0, 4).map((cafe) => <button className="cms-mini-row" type="button" key={cafe.id} onClick={() => onModule('requests')}><Coffee size={20} /><span><strong>{cafe.nombre}</strong><small>{cafe.address || 'Dirección pendiente'}</small></span><span>Revisar →</span></button>) : <AdminEmpty text="No hay solicitudes pendientes." />}</section><section className="cms-panel"><h2>Publicaciones recientes</h2>{posts.length ? posts.slice(0, 4).map((post) => <button className="cms-mini-row" type="button" key={post.id} onClick={() => onModule('posts')}><Camera size={20} /><span><strong>{profiles.get(post.user_id)?.username || 'Usuario'}</strong><small>{post.content || 'Publicación con fotos'}</small></span><small>{adminDate(post.created_at)}</small></button>) : <AdminEmpty text="Todavía no hay publicaciones." />}</section></div>
  </section>;
}

export function AdminCafeOverview({ cafes, onSelect, onNew, onDuplicate, onDeleteMany, onEnrich, busy }) {
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [view, setView] = useState('kanban'); const [limit, setLimit] = useState(24);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [working, setWorking] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const filtered = cafes.filter((cafe) => (status === 'all' || cafe.status === status) && includes([cafe.nombre, cafe.address, cafe.neighborhood].join(' '), search));
  const visible = filtered.slice(0, limit);
  const chosen = filtered.filter((cafe) => selectedIds.includes(cafe.id));
  const visibleSelected = visible.filter((cafe) => selectedIds.includes(cafe.id)).length;
  const locked = busy || working;
  const toggleCafe = (id, checked) => setSelectedIds((ids) => checked ? [...new Set([...ids, id])] : ids.filter((entry) => entry !== id));
  const toggleVisible = (checked) => setSelectedIds((ids) => checked ? [...new Set([...ids, ...visible.map((cafe) => cafe.id)])] : ids.filter((id) => !visible.some((cafe) => cafe.id === id)));
  const confirmDelete = async () => {
    if (locked || !deleting?.length) return;
    setWorking(true);
    setDeleteError('');
    try {
      const result = await onDeleteMany(deleting);
      const removed = new Set(result.deletedIds);
      setSelectedIds((ids) => ids.filter((id) => !removed.has(id)));
      const remaining = deleting.filter((cafe) => !removed.has(cafe.id));
      if (remaining.length) {
        setDeleting(remaining);
        setDeleteError(`${removed.size} de ${deleting.length} eliminadas. ${result.error || 'Las restantes siguen seleccionadas para reintentar.'}`);
      } else {
        setDeleting(null);
        setSelectionMode(false);
      }
    } catch (error) {
      setDeleteError(error.message || 'No se pudieron eliminar las cafeterías. Intenta nuevamente.');
    } finally {
      setWorking(false);
    }
  };
  const selectionBox = (cafe) => <input type="checkbox" className="cms-cafe-checkbox" aria-label={`Seleccionar ${cafe.nombre}`} checked={selectedIds.includes(cafe.id)} disabled={locked} onChange={(event) => toggleCafe(cafe.id, event.target.checked)} />;

  return <section className="cms-catalog-overview"><header className="cms-module-heading"><div><h2>Cafeterías <small>({filtered.length})</small></h2><p>Abre una cafetería para editarla o marca varias para eliminarlas.</p></div><div className="cms-cafe-heading-actions"><CafeCatalogEnrichment cafes={cafes} onApply={onEnrich} /><button className="cms-primary" type="button" disabled={locked} onClick={onNew}><Plus size={17} /> Nueva cafetería</button></div></header>
    <div className="cms-toolbar"><AdminSearch value={search} onChange={(value) => { setSearch(value); setLimit(24); setSelectedIds([]); }} placeholder="Buscar cafeterías" /><select value={status} onChange={(event) => { setStatus(event.target.value); setLimit(24); setSelectedIds([]); }} aria-label="Filtrar estado de cafeterías"><option value="all">Todos los estados</option><option value="active">Activas</option><option value="closed">Inactivas</option><option value="needs_review">Pendientes</option></select><div className="cms-view-toggle"><button type="button" aria-label="Vista de tarjetas" aria-pressed={view === 'kanban'} onClick={() => setView('kanban')}><LayoutGrid size={18} /></button><button type="button" aria-label="Vista de lista" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={18} /></button></div></div>
    <div className="cms-selection-toggle"><button type="button" disabled={locked} aria-pressed={selectionMode} onClick={() => { setSelectionMode((value) => !value); setSelectedIds([]); }}>{selectionMode ? 'Cancelar selección' : 'Seleccionar cafeterías'}</button></div>
    {selectionMode && <div className="cms-batch-bar cms-cafe-batch-bar">
      <label><input type="checkbox" checked={visible.length > 0 && visibleSelected === visible.length} ref={(node) => { if (node) node.indeterminate = visibleSelected > 0 && visibleSelected < visible.length; }} disabled={locked || !visible.length} onChange={(event) => toggleVisible(event.target.checked)} /> Seleccionar visibles ({visible.length})</label>
      {filtered.length > visible.length && <button type="button" disabled={locked || chosen.length === filtered.length} onClick={() => setSelectedIds(filtered.map((cafe) => cafe.id))}>Seleccionar todas las coincidencias ({filtered.length})</button>}
      <span role="status" aria-live="polite">{chosen.length} seleccionadas</span>
      {chosen.length > 0 && <button type="button" disabled={locked} onClick={() => setSelectedIds([])}>Limpiar selección</button>}
      <button type="button" className="cms-danger cms-cafe-batch-delete" disabled={locked || !chosen.length} onClick={() => { setDeleteError(''); setDeleting(chosen); }}><Trash2 size={16} /> Eliminar seleccionadas ({chosen.length})</button>
    </div>}
    {filtered.length ? view === 'kanban' ? <div className="cms-kanban">{visible.map((cafe) => <article key={cafe.id} className={selectedIds.includes(cafe.id) ? 'is-selected' : ''}>{selectionMode && <label className="cms-cafe-selection">{selectionBox(cafe)} Seleccionar</label>}<button type="button" className="cms-cafe-open" disabled={locked} onClick={() => selectionMode ? toggleCafe(cafe.id, !selectedIds.includes(cafe.id)) : onSelect(cafe.id)}>{cafe.image_url ? <img src={cafe.image_url} alt="" /> : <span className="cms-cafe-placeholder"><Coffee size={35} /></span>}<span><strong>{cafe.nombre}</strong><small><MapPin size={13} /> {cafe.neighborhood || cafe.address || 'Zona por confirmar'}</small></span></button><footer><span className={`cms-badge is-${cafe.status}`}>{statusLabel(cafe.status)}</span><button type="button" disabled={locked} onClick={() => onSelect(cafe.id)}>Editar</button><button type="button" disabled={locked} onClick={() => onDuplicate(cafe)}>Duplicar</button></footer></article>)}</div> : <div className="cms-table-wrap"><table className="cms-table"><thead><tr>{selectionMode && <th>Seleccionar</th>}<th>Cafetería</th><th>Ubicación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visible.map((cafe) => <tr key={cafe.id} className={selectedIds.includes(cafe.id) ? 'is-selected' : ''}>{selectionMode && <td>{selectionBox(cafe)}</td>}<td><button type="button" className="cms-record-link" disabled={locked} onClick={() => onSelect(cafe.id)}>{cafe.nombre}</button></td><td>{cafe.neighborhood || cafe.address || 'Por confirmar'}</td><td><span className={`cms-badge is-${cafe.status}`}>{statusLabel(cafe.status)}</span></td><td><button type="button" disabled={locked} onClick={() => onSelect(cafe.id)}>Editar</button><button type="button" disabled={locked} onClick={() => onDuplicate(cafe)}>Duplicar</button></td></tr>)}</tbody></table></div> : <AdminEmpty text="No encontramos cafeterías con esos filtros." />}
    {filtered.length > limit && <button className="cms-load-more" type="button" onClick={() => setLimit((count) => count + 24)}>Mostrar más cafeterías</button>}
    {deleting && <ConfirmDialog title={`Eliminar ${deleting.length} ${deleting.length === 1 ? 'cafetería' : 'cafeterías'}`} description={<span>Se retirarán del catálogo y del mapa las cafeterías de esta lista. Confirma que deseas eliminarlas.<span className="cms-cafe-delete-list" role="list" aria-label="Cafeterías por eliminar">{deleting.map((cafe) => <span role="listitem" key={cafe.id}>{cafe.nombre}</span>)}</span></span>} confirmLabel={`Eliminar ${deleting.length} ${deleting.length === 1 ? 'cafetería' : 'cafeterías'}`} busy={locked} error={deleteError} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
  </section>;
}

export function AdminRequests({ cafes, profiles, onModerate, onModerateMany, busy, notice }) {
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('needs_review'); const [selectedId, setSelectedId] = useState(null);
  const filtered = cafes.filter((cafe) => cafe.source === 'community' && (status === 'all' || cafe.status === status) && includes([cafe.nombre, cafe.address].join(' '), search));
  const selected = cafes.find((cafe) => cafe.id === selectedId);
  const [moderating, setModerating] = useState('');
  const [attemptedId, setAttemptedId] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchConfirm, setBatchConfirm] = useState(null);
  const [batchWorking, setBatchWorking] = useState(false);
  const [batchError, setBatchError] = useState('');
  const pending = filtered.filter((cafe) => cafe.status === 'needs_review');
  const chosen = pending.filter((cafe) => selectedIds.includes(cafe.id));
  const locked = busy || Boolean(moderating) || batchWorking;
  const toggleRequest = (id, checked) => setSelectedIds((ids) => checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id));
  const confirmBatch = async () => {
    if (locked || !batchConfirm?.cafes.length) return;
    setBatchWorking(true); setBatchError('');
    try {
      const result = await onModerateMany(batchConfirm.cafes, batchConfirm.status);
      const completed = new Set(result.processedIds);
      setSelectedIds((ids) => ids.filter((id) => !completed.has(id)));
      if (result.failed.length) {
        setBatchConfirm((current) => ({ ...current, cafes: current.cafes.filter((cafe) => !completed.has(cafe.id)) }));
        setBatchError(`${result.processedIds.length} completadas. ${result.failed.map((item) => `${item.nombre}: ${item.error}`).join(' ')} Las solicitudes pendientes siguen seleccionadas.`);
      } else { setBatchConfirm(null); setSelectionMode(false); }
    } catch (error) { setBatchError(error.message || 'No se pudo completar el grupo. Intenta otra vez.'); }
    finally { setBatchWorking(false); }
  };
  const moderate = async (nextStatus) => {
    setAttemptedId(selected.id);
    setModerating(nextStatus);
    try { await onModerate(selected, nextStatus); }
    finally { setModerating(''); }
  };
  return <section className="cms-requests-module"><header className="cms-module-heading"><div><h2>Solicitudes de nuevas cafeterías</h2><p>Verifica la ubicación y los datos antes de aprobar.</p></div></header><div className="cms-toolbar"><AdminSearch value={search} onChange={(value) => { if (!locked) { setSearch(value); setSelectedIds([]); } }} placeholder="Buscar solicitudes" /><select disabled={locked} aria-label="Estado de solicitudes" value={status} onChange={(event) => { setStatus(event.target.value); setSelectedIds([]); }}><option value="needs_review">Pendientes</option><option value="active">Aprobadas</option><option value="closed">Rechazadas</option><option value="all">Todas</option></select></div>
    <div className="cms-selection-toggle"><button type="button" disabled={locked || (!selectionMode && !pending.length)} aria-pressed={selectionMode} onClick={() => { setSelectionMode((value) => !value); setSelectedIds([]); }}>{selectionMode ? 'Cancelar selección' : 'Seleccionar solicitudes'}</button></div>
    {selectionMode && <div className="cms-batch-bar cms-request-batch-bar"><label><input type="checkbox" checked={pending.length > 0 && chosen.length === pending.length} ref={(node) => { if (node) node.indeterminate = chosen.length > 0 && chosen.length < pending.length; }} disabled={locked || !pending.length} onChange={(event) => setSelectedIds(event.target.checked ? pending.map((cafe) => cafe.id) : [])} />Seleccionar pendientes ({pending.length})</label><span role="status">{chosen.length} seleccionadas</span><button className="cms-primary" type="button" disabled={locked || !chosen.length} onClick={() => { setBatchError(''); setBatchConfirm({ status: 'active', cafes: chosen }); }}>Aceptar seleccionadas ({chosen.length})</button><button className="cms-danger" type="button" disabled={locked || !chosen.length} onClick={() => { setBatchError(''); setBatchConfirm({ status: 'closed', cafes: chosen }); }}>Rechazar seleccionadas ({chosen.length})</button></div>}
    {filtered.length ? <div className="cms-request-list" role="list">{filtered.map((cafe) => <article role="listitem" key={cafe.id} className={`cms-request-row${selectedIds.includes(cafe.id) ? ' is-selected' : ''}`}>
      <div className="cms-request-info"><div className="cms-request-name">{selectionMode && cafe.status === 'needs_review' && <input type="checkbox" aria-label={`Seleccionar ${cafe.nombre}`} disabled={locked} checked={selectedIds.includes(cafe.id)} onChange={(event) => toggleRequest(cafe.id, event.target.checked)} />}<strong>{cafe.nombre}</strong></div><p>{cafe.address || 'Dirección por confirmar'}</p><div className="cms-request-meta"><span>{profiles.get(cafe.submitted_by)?.username || 'Usuario'}</span><time>{adminDate(cafe.created_at)}</time><span className={`cms-badge is-${cafe.status}`}>{cafe.status === 'active' ? 'Aprobada' : cafe.status === 'closed' ? 'Rechazada' : 'Pendiente'}</span></div></div><button type="button" className="cms-request-review" disabled={locked} onClick={() => setSelectedId(cafe.id)} aria-label={`Revisar ${cafe.nombre}`}>Revisar</button>
    </article>)}</div> : <AdminEmpty text="No hay solicitudes con estos filtros." />}
    {batchConfirm && <ConfirmDialog title={`${batchConfirm.status === 'active' ? 'Aceptar' : 'Rechazar'} ${batchConfirm.cafes.length} ${batchConfirm.cafes.length === 1 ? 'solicitud' : 'solicitudes'}`} description={<span>{batchConfirm.status === 'active' ? 'Se verificará la ubicación de cada cafetería antes de publicarla en el mapa.' : 'Se rechazarán las solicitudes seleccionadas.'}<span className="cms-cafe-delete-list" role="list" aria-label="Solicitudes seleccionadas">{batchConfirm.cafes.map((cafe) => <span role="listitem" key={cafe.id}>{cafe.nombre}</span>)}</span></span>} confirmLabel={batchConfirm.status === 'active' ? 'Aceptar solicitudes' : 'Rechazar solicitudes'} busy={locked} error={batchError} onCancel={() => setBatchConfirm(null)} onConfirm={confirmBatch} />}
    {selected && <AdminDrawer title={`Solicitud: ${selected.nombre}`} onClose={() => setSelectedId(null)}><div className="cms-drawer-content cms-request-detail"><p className={`cms-request-state is-${selected.status}`} role="status">{moderating ? moderating === 'active' ? 'Verificando ubicación y aceptando solicitud…' : 'Rechazando solicitud…' : selected.status === 'active' ? 'Aprobada · ubicación confirmada. Ya está publicada en el mapa.' : selected.status === 'closed' ? 'Solicitud rechazada.' : 'Pendiente de revisión'}</p>{notice && attemptedId === selectedId && !moderating && <p className={`cms-request-feedback ${notice.startsWith('Error:') ? 'is-error' : ''}`} role={notice.startsWith('Error:') ? 'alert' : 'status'}>{notice}</p>}<p>{selected.address || 'Dirección pendiente'}</p><p>{profiles.get(selected.submitted_by)?.username || 'Usuario'} · {adminDate(selected.created_at)}</p>{Number.isFinite(Number(selected.lat)) && selected.lat != null && selected.lng != null ? <CafeMapPreview lat={Number(selected.lat)} lng={Number(selected.lng)} /> : selected.status === 'needs_review' ? <p className="cms-note">La ubicación exacta se verificará en el servidor al aceptar la solicitud.</p> : null}{selected.link && <a href={selected.link} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Comprobar en Google Maps</a>}{selected.status === 'needs_review' && <div className="cms-drawer-actions"><button className="cms-primary" disabled={busy || Boolean(moderating)} onClick={() => moderate('active')}>{moderating === 'active' ? 'Ubicando…' : 'Aceptar y ubicar'}</button><button className="cms-danger" disabled={busy || Boolean(moderating)} onClick={() => moderate('closed')}>{moderating === 'closed' ? 'Rechazando…' : 'Rechazar solicitud'}</button></div>}</div></AdminDrawer>}
  </section>;
}

export function AdminPosts({ posts, profiles, cafes, onStatus, onDelete, onNew, busy }) {
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [selectedId, setSelectedId] = useState(null); const [deleting, setDeleting] = useState(null);
  const selected = posts.find((post) => post.id === selectedId);
  const filtered = posts.filter((post) => (status === 'all' || post.status === status) && includes([post.content, profiles.get(post.user_id)?.username, cafes.get(post.cafe_id)?.nombre].join(' '), search));
  return <section><header className="cms-module-heading"><div><h2>Publicaciones</h2><p>Lee, revisa y modera las publicaciones de la comunidad.</p></div><button className="cms-primary" onClick={onNew}><Plus size={17} /> Nueva publicación</button></header><div className="cms-toolbar"><AdminSearch value={search} onChange={setSearch} placeholder="Buscar publicaciones" /><select aria-label="Estado de publicaciones" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todas</option><option value="published">Publicadas</option><option value="hidden">Ocultas</option></select></div>
    {filtered.length ? <div className="cms-table-wrap"><table className="cms-table"><thead><tr><th>Publicación</th><th>Autor</th><th>Cafetería</th><th>Fecha</th><th>Estado</th><th /></tr></thead><tbody>{filtered.map((post) => <tr key={post.id}><td><button className="cms-post-cell" onClick={() => setSelectedId(post.id)}>{post.image_url ? <img src={post.image_url} alt="" /> : <Camera size={24} />}<span>{post.content || 'Publicación con fotos'}</span></button></td><td>{profiles.get(post.user_id)?.username || 'Usuario'}</td><td>{cafes.get(post.cafe_id)?.nombre || 'General'}</td><td>{adminDate(post.created_at)}</td><td><span className={`cms-badge is-${post.status}`}>{statusLabel(post.status)}</span></td><td><button onClick={() => setSelectedId(post.id)}>Revisar</button></td></tr>)}</tbody></table></div> : <AdminEmpty text="No hay publicaciones con estos filtros." />}
    {selected && <AdminDrawer title="Revisar publicación" onClose={() => setSelectedId(null)}><div className="cms-drawer-content"><h3>{profiles.get(selected.user_id)?.username || 'Usuario'}</h3><small>{cafes.get(selected.cafe_id)?.nombre || 'Publicación general'} · {adminDate(selected.created_at)}</small>{selected.image_url && <img className="cms-post-preview" src={selected.image_url} alt="Foto de publicación" />}<p className="cms-full-text">{selected.content}</p><div className="cms-drawer-actions"><button disabled={busy} onClick={() => onStatus(selected, selected.status === 'hidden' ? 'published' : 'hidden')}>{selected.status === 'hidden' ? 'Mostrar publicación' : 'Ocultar publicación'}</button><button className="cms-danger" disabled={busy} onClick={() => setDeleting(selected)}>Eliminar publicación</button></div></div></AdminDrawer>}
    {deleting && <ConfirmDialog title="Eliminar publicación" description="Se eliminará esta publicación. Esta acción no se puede deshacer." confirmLabel="Eliminar publicación" busy={busy} onCancel={() => setDeleting(null)} onConfirm={async () => { if (await onDelete(deleting)) { setDeleting(null); setSelectedId(null); } }} />}
  </section>;
}

export function AdminUsers({ profiles, currentUserId, onRole, busy }) {
  const [search, setSearch] = useState(''); const [role, setRole] = useState('all'); const [change, setChange] = useState(null); const [roleError, setRoleError] = useState('');
  const filtered = profiles.filter((profile) => (role === 'all' || profile.role === role) && includes(profile.username, search));
  return <section><header className="cms-module-heading"><div><h2>Usuarios del sistema</h2><p>Administra los roles y permisos de acceso.</p></div></header><div className="cms-toolbar"><AdminSearch value={search} onChange={setSearch} placeholder="Buscar usuarios" /><select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Filtrar roles"><option value="all">Todos los roles</option><option value="usuario">Usuarios</option><option value="administrador">Administradores</option></select></div>
    {filtered.length ? <div className="cms-table-wrap"><table className="cms-table"><thead><tr><th>Usuario</th><th>Última actualización</th><th>Rol</th><th>Permisos</th></tr></thead><tbody>{filtered.map((profile) => <tr key={profile.id}><td><span className="cms-user-cell">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <Users size={26} />}<strong>{profile.username || 'Usuario'}</strong>{profile.id === currentUserId && <small>Tu cuenta</small>}</span></td><td>{adminDate(profile.updated_at)}</td><td><span className="cms-badge">{profile.role === 'administrador' ? 'Administrador' : 'Usuario'}</span></td><td><select aria-label={`Rol de ${profile.username}`} value={profile.role} disabled={profile.id === currentUserId || busy} onChange={(event) => { setRoleError(''); setChange({ profile, role: event.target.value }); }}><option value="usuario">Usuario</option><option value="administrador">Administrador</option></select></td></tr>)}</tbody></table></div> : <AdminEmpty text="No encontramos usuarios con esos filtros." />}
    {change && <ConfirmDialog title="Confirmar cambio de permisos" description={`${change.role === 'administrador' ? 'Darás acceso al centro de control a' : 'Retirarás el acceso de administrador a'} ${change.profile.username}.`} confirmLabel="Confirmar cambio" error={roleError} busy={busy} onCancel={() => setChange(null)} onConfirm={async () => { if (await onRole(change.profile, change.role)) setChange(null); else setRoleError('No pudimos cambiar el rol. Intenta de nuevo.'); }} />}
  </section>;
}

export function AdminPhotos({ postPhotos, photos, posts, cafes, profiles, onPostAction, onPhotoAction, busy }) {
  const [search, setSearch] = useState(''); const [cafe, setCafe] = useState('all'); const [since, setSince] = useState(''); const [selected, setSelected] = useState([]); const [blocking, setBlocking] = useState(false); const [viewing, setViewing] = useState(null); const [working, setWorking] = useState(false); const [feedback, setFeedback] = useState('');
  const entries = useMemo(() => {
    const byPath = new Map(photos.map((photo) => [photo.storage_path, photo]));
    return [...postPhotos.map((photo) => { const post = posts.get(photo.post_id); const moderation = byPath.get(photo.storage_path); return { ...photo, key: `post:${photo.id}`, source: 'post', cafe_id: post?.cafe_id, content: post?.content, status: moderation?.status === 'rejected' ? 'rejected' : 'approved', rights_confirmed: true }; }), ...photos.filter((photo) => !photo.post_id).map((photo) => ({ ...photo, key: `photo:${photo.id}`, source: 'direct', content: photo.rights_note }))];
  }, [photos, postPhotos, posts]);
  const filtered = entries.filter((entry) => (cafe === 'all' || entry.cafe_id === cafe) && (!since || String(entry.created_at || '').slice(0, 10) >= since) && includes([entry.content, cafes.get(entry.cafe_id)?.nombre, profiles.get(entry.user_id)?.username].join(' '), search));
  const chosen = filtered.filter((photo) => selected.includes(photo.key));
  const viewingPhoto = entries.find((photo) => photo.key === viewing);
  const run = async (entry, action) => entry.source === 'post' ? onPostAction(entry, action === 'reject' ? 'block' : action) : onPhotoAction(entry, action === 'reject' ? 'rejected' : 'approved', action === 'cover');
  const batch = async (action) => { setWorking(true); setFeedback(''); let completed = 0; try { for (const photo of chosen) { const saved = await run(photo, action); if (!saved) break; completed += 1; } setSelected((keys) => keys.filter((key) => !chosen.slice(0, completed).some((photo) => photo.key === key))); setFeedback(`${completed} de ${chosen.length} fotos procesadas.`); } finally { setWorking(false); setBlocking(false); } };
  return <section><header className="cms-module-heading"><div><h2>Gestión de fotografías</h2><p>Revisa las fotos de publicaciones y las enviadas a cafeterías.</p></div></header><div className="cms-toolbar"><AdminSearch value={search} onChange={setSearch} placeholder="Buscar fotos" /><select aria-label="Filtrar fotos por cafetería" value={cafe} onChange={(event) => setCafe(event.target.value)}><option value="all">Todas las cafeterías</option>{[...cafes.values()].map((entry) => <option key={entry.id} value={entry.id}>{entry.nombre}</option>)}</select><label className="cms-date-filter">Desde<input aria-label="Fotos desde fecha" type="date" value={since} onChange={(event) => setSince(event.target.value)} /></label></div>
    <div className="cms-batch-bar"><label><input type="checkbox" checked={filtered.length > 0 && chosen.length === filtered.length} onChange={(event) => setSelected(event.target.checked ? filtered.map((entry) => entry.key) : [])} /> Seleccionar visibles</label><span>{chosen.length} seleccionadas</span><button className="cms-danger" disabled={!chosen.length || working || busy} onClick={() => setBlocking(true)}>Bloquear seleccionadas</button></div>
    {feedback && <p role="status" className="cms-note">{feedback}</p>}{filtered.length ? <div className="cms-photo-gallery">{filtered.map((photo) => <article key={photo.key}><div className="cms-photo-media"><button type="button" className="cms-photo-open" aria-label="Ver foto y descripción" onClick={() => setViewing(photo.key)}><img src={photo.public_url} alt={cafes.get(photo.cafe_id)?.nombre || 'Foto de comunidad'} loading="lazy" /></button><input type="checkbox" aria-label={`Seleccionar foto de ${cafes.get(photo.cafe_id)?.nombre || 'comunidad'}`} checked={selected.includes(photo.key)} onChange={(event) => setSelected((keys) => event.target.checked ? [...keys, photo.key] : keys.filter((key) => key !== photo.key))} /></div><div className="cms-photo-copy"><strong>{cafes.get(photo.cafe_id)?.nombre || 'Publicación general'}</strong><small>{profiles.get(photo.user_id)?.username || 'Usuario'} · {adminDate(photo.created_at)}</small><p>{photo.content || 'Sin descripción'}</p></div><footer><button disabled={!photo.cafe_id || busy || working || !photo.rights_confirmed} onClick={() => run(photo, 'cover')}>Usar como portada</button><details className="cms-photo-menu"><summary aria-label="Más acciones de foto">•••</summary><div><button disabled={busy || working} onClick={() => { setSelected([photo.key]); setBlocking(true); }}>Bloquear foto</button><a href={photo.public_url} target="_blank" rel="noreferrer" download><Download size={14} /> Descargar</a></div></details></footer></article>)}</div> : <AdminEmpty text="No hay fotos con estos filtros." />}
    {viewingPhoto && <AdminDrawer title="Foto de la comunidad" onClose={() => setViewing(null)}><div className="cms-drawer-content"><h3>{cafes.get(viewingPhoto.cafe_id)?.nombre || 'Publicación general'}</h3><small>{profiles.get(viewingPhoto.user_id)?.username || 'Usuario'} · {adminDate(viewingPhoto.created_at)}</small><img className="cms-post-preview" src={viewingPhoto.public_url} alt="Foto de comunidad" /><p className="cms-full-text">{viewingPhoto.content || 'Sin descripción'}</p>{!viewingPhoto.rights_confirmed && <p className="cms-note">Esta foto no tiene declaración de derechos.</p>}<a href={viewingPhoto.public_url} target="_blank" rel="noreferrer" download><Download size={16} /> Descargar foto</a></div></AdminDrawer>}
    {blocking && <ConfirmDialog title="Bloquear fotografías" description={`Se retirarán ${chosen.length} fotos seleccionadas. Las fotos de publicaciones se eliminarán de su publicación.`} confirmLabel="Bloquear fotos" busy={working} onCancel={() => setBlocking(false)} onConfirm={() => batch('reject')} />}
  </section>;
}
