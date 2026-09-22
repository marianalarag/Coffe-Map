const DAY_KEYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_LABELS = { Mo: 'Lun', Tu: 'Mar', We: 'Mié', Th: 'Jue', Fr: 'Vie', Sa: 'Sáb', Su: 'Dom' };

const expandDays = (value) => {
  const days = [];
  value.split(',').forEach((part) => {
    const [start, end] = part.trim().split('-');
    const startIndex = DAY_KEYS.indexOf(start);
    const endIndex = DAY_KEYS.indexOf(end);
    if (startIndex < 0) return;
    if (endIndex < 0) days.push(start);
    else {
      let index = startIndex;
      while (true) {
        days.push(DAY_KEYS[index]);
        if (index === endIndex) break;
        index = (index + 1) % 7;
      }
    }
  });
  return days;
};

const parseHours = (expression) => {
  if (!expression) return null;
  if (expression.trim() === '24/7') return Object.fromEntries(DAY_KEYS.map((day) => [day, ['00:00-24:00']]));
  const schedule = Object.fromEntries(DAY_KEYS.map((day) => [day, []]));
  let parsedAny = false;
  expression.split(';').forEach((clause) => {
    const match = clause.trim().match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(.+)$/);
    if (!match) return;
    const ranges = /\boff\b|\bclosed\b/i.test(match[2]) ? [] : match[2].match(/\d{2}:\d{2}-\d{2}:\d{2}/g) || [];
    expandDays(match[1]).forEach((day) => { schedule[day] = ranges; });
    parsedAny = true;
  });
  return parsedAny ? schedule : null;
};

const minutes = (time) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

export const getCafeOpenStatus = (expression, date = new Date()) => {
  if (!expression) return { state: 'unknown', label: 'Horario por confirmar' };
  const schedule = parseHours(expression);
  if (!schedule) return { state: 'known', label: 'Consultar horario' };
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Merida', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value.slice(0, 2);
  const current = Number(parts.find((part) => part.type === 'hour')?.value) * 60
    + Number(parts.find((part) => part.type === 'minute')?.value);
  const activeRange = (schedule[weekday] || []).find((range) => {
    const [start, end] = range.split('-').map(minutes);
    return end > start ? current >= start && current < end : current >= start || current < end;
  });
  if (!activeRange) return { state: 'closed', label: 'Cerrado ahora' };
  return { state: 'open', label: `Abierto · cierra ${activeRange.split('-')[1]}` };
};

export const getCafeScheduleRows = (expression) => {
  const schedule = parseHours(expression);
  if (!schedule) return [];
  return ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => ({
    day: DAY_LABELS[day],
    hours: schedule[day].length ? schedule[day].join(', ').replaceAll('-', ' – ') : 'Cerrado',
  }));
};
