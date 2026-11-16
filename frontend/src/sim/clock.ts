// De simulatie speelt op zaterdag 1 augustus 2026. Tijd = minuten sinds 00:00 die dag.
const BASE = new Date(2026, 7, 1, 0, 0, 0).getTime();

export const SHIFT_START = 6 * 60;
export const SHIFT_END = 22 * 60;
/** Echte seconden per gesimuleerde minuut (op snelheid 1). Een dienst duurt zo ruim 7 minuten. */
export const SECONDS_PER_MINUTE = 0.45;

const two = (n: number) => String(n).padStart(2, '0');

export function dateAt(minute: number): Date {
  return new Date(BASE + Math.floor(minute) * 60000);
}

/** Tijdstip zoals de backend het verwacht (lokale tijd van de camping, zonder tijdzone). */
export function isoAt(minute: number): string {
  const d = dateAt(minute);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:00`;
}

export const isoDate = (minute: number) => isoAt(minute).slice(0, 10);

export function clock(minute: number): string {
  const d = dateAt(minute);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function dateLabel(minute: number): string {
  return dateAt(minute).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export const timeOf = (iso: string) => iso.slice(11, 16);

/** "vandaag 08:12", "gisteren 16:40" */
export function momentLabel(iso: string, nowMinute: number): string {
  const then = new Date(iso);
  const day = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const diff = day(dateAt(nowMinute)) - day(then);
  const label = diff === 0 ? 'vandaag' : diff === 1 ? 'gisteren' : diff === 2 ? 'eergisteren' : `${diff} dagen geleden`;
  return `${label} ${timeOf(iso)}`;
}

export function durationSince(iso: string, nowMinute: number): string {
  const minutes = Math.max(0, Math.floor((dateAt(nowMinute).getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} u ${minutes % 60} min`;
  return `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} u`;
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

/** 0 = nacht, 1 = volop dag. */
export function daylight(minute: number): number {
  const h = (((minute % 1440) + 1440) % 1440) / 60;
  if (h < 5 || h >= 21.5) return 0;
  if (h < 7) return (h - 5) / 2;
  if (h < 19.5) return 1;
  return (21.5 - h) / 2;
}
