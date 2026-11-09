import { useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parse = (value) => new Date(`${value}T12:00:00`);

export default function CoffeeDatePicker({ value, onChange, max, disabled, label = 'Fecha de la publicación' }) {
  const id = useId();
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parse(value || iso(new Date())));
  const today = iso(new Date());
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (start.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const select = (date) => { onChange(date); setOpen(false); trigger.current?.focus(); };
  return <div className="coffee-date-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} type="button" className="coffee-date-trigger" disabled={disabled} aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => { if (!open) setMonth(parse(value || today)); setOpen(!open); }}><span>{value ? parse(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Seleccionar fecha'}</span><CalendarDays size={19} /></button>
    {open && <div className="coffee-calendar" id={id} role="group" aria-label="Calendario de visitas">
      <header><button type="button" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}><ChevronLeft size={18} /></button><strong aria-live="polite">{month.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Mes siguiente" disabled={Boolean(max && iso(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12)) > max)} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}><ChevronRight size={18} /></button></header>
      <div className="coffee-calendar-days">{['L', 'M', 'Mi', 'J', 'V', 'S', 'D'].map((day) => <span key={day}>{day}</span>)}{Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => {
        const date = iso(new Date(month.getFullYear(), month.getMonth(), i + 1, 12));
        return <button type="button" key={date} aria-label={parse(date).toLocaleDateString('es-MX', { dateStyle: 'full' })} aria-pressed={date === value} aria-current={date === today ? 'date' : undefined} disabled={Boolean(max && date > max)} onClick={() => select(date)}>{i + 1}</button>;
      })}</div><footer><button type="button" disabled={Boolean(max && today > max)} onClick={() => select(today)}>Hoy</button><button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Cerrar</button></footer>
    </div>}
  </div>;
}
