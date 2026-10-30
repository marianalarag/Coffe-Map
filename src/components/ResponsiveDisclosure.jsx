import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function ResponsiveDisclosure({ className, summary, children }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px)');
    const resize = () => setOpen(media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  return <details className={`cafe-disclosure ${className}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{summary}<ChevronDown className="cafe-disclosure-chevron" size={18} /></summary>
    <div className="cafe-disclosure-body">{children}</div>
  </details>;
}
