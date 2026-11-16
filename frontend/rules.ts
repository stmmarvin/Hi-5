// De regels van de slagboom, lokaal. Dit is dezelfde beslissing als backend/app/rules.py
// en wordt gebruikt wanneer er geen internet is. Pas ze op beide plekken aan.
// Alleen de ingang leest kentekens; de uitgang gaat altijd open, zonder camera.
import type { Permit, ScanResult, VehicleType } from '../types';
import { isoAt, isoDate } from './clock';

export const plateKey = (plate: string) => plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

const LABEL = { staff: 'Medewerker', supplier: 'Leverancier' } as const;

export function decideLocal(
  permits: Permit[],
  vehicle: { plate: string; type: VehicleType },
  minute: number,
): ScanResult {
  const base = { passage_id: null };
  if (vehicle.type === 'ambulance') {
    return { ...base, open: true, code: 'emergency', reason: 'Hulpdienst, mag altijd door', holder: 'Hulpdienst', category: 'emergency' };
  }
  const key = plateKey(vehicle.plate);
  const today = isoDate(minute);
  // Een gast staat tot 24 uur na het einde van de reservering in het systeem; daarna is het kenteken onbekend.
  const permit = permits.find((p) => p.plate_key === key
    && !(p.category === 'guest' && p.departure && isoDate(minute - 1440) > p.departure));
  if (!permit) {
    return { ...base, open: false, code: 'unknown', reason: 'Kenteken staat niet in de lijst', holder: 'Onbekend', category: 'visitor' };
  }
  const known = { ...base, holder: permit.holder, category: permit.category, pitch: permit.pitch };

  // De uitgang leest niets, dus het systeem weet niet wie er weg is: terugkomen binnen het verblijf mag altijd.
  if (permit.category === 'guest') {
    if (permit.arrival && today < permit.arrival) {
      const days = Math.round((Date.parse(permit.arrival) - Date.parse(today)) / 86400000);
      return { ...known, open: false, code: 'too_early', reason: `Reservering begint pas ${days === 1 ? 'morgen' : `over ${days} dagen`}` };
    }
    if (permit.departure && today > permit.departure) {
      return { ...known, open: false, code: 'expired', reason: 'Reservering is afgelopen' };
    }
    return { ...known, open: true, code: 'ok', reason: `Reservering voor ${permit.pitch}` };
  }

  if (permit.window_start && permit.window_end) {
    const now = isoAt(minute).slice(11, 16);
    const start = permit.window_start.slice(0, 5);
    const end = permit.window_end.slice(0, 5);
    if (now < start || now > end) {
      return { ...known, open: false, code: 'outside_window', reason: `Buiten het tijdvak ${start} tot ${end}` };
    }
  }
  return { ...known, open: true, code: 'ok', reason: `${LABEL[permit.category]} binnen tijdvak` };
}
