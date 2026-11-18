// Het draaiboek van één dienst: welke voertuigen komen en gaan, en wanneer.
// Bij een deel belt de bestuurder aan via de intercom; dan beslist de receptie.
import type { Country, Direction, Permit, VehicleType } from '../types';
import { isoDate, SHIFT_START } from './clock';

export interface Scenario {
  at: number;
  dir: Direction;
  plate: string;
  country: Country;
  type: VehicleType;
  color: string;
  /** Herkenbaar automodel voor de 3D-weergave; de administratie hoeft dit niet op te slaan. */
  model?: string;
  /** Wat de bestuurder door de intercom zegt als de slagboom dicht blijft. */
  message?: string;
}

export const CAR_COLORS = ['#b8322a', '#2e5e8c', '#e4e2da', '#3b3f45', '#6f8a3a', '#c9772b', '#8fa6b5', '#5b4a8a'];
export const CAR_MODELS = ['Volkswagen Golf', 'BMW M2', 'Audi RS4 Avant', 'Opel Corsa F', 'Tesla Model 3'];

/** "Familie Jansen" wordt in een zin "de familie Jansen". */
const family = (holder: string) => (holder.startsWith('Familie ') ? `de familie ${holder.slice(8)}` : holder);
const t = (hour: number, minute = 0) => hour * 60 + minute;
const between = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const shuffle = <T,>(list: T[]): T[] => [...list].sort(() => Math.random() - 0.5);

/** Een willekeurig kenteken: meestal Nederlands, soms uit een ander Europees land. */
export function randomPlate(): { plate: string; country: Country } {
  const letters = 'BDFGHJKLNPRSTVXZ';
  const l = (n = 1) => Array.from({ length: n }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const d = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
  const r = Math.random();
  if (r < 0.2) return { plate: `${l(2)} ${l(2)} ${d(3)}`, country: 'D' };
  if (r < 0.3) return { plate: `${1 + Math.floor(Math.random() * 9)}-${l(3)}-${d(3)}`, country: 'B' };
  if (r < 0.36) return { plate: `${l(2)}-${d(3)}-${l(2)}`, country: 'F' };
  if (r < 0.41) return { plate: `${l(2)}${d(2)} ${l(3)}`, country: 'GB' };
  if (r < 0.45) return { plate: `${l(2)} ${d(5)}`, country: 'PL' };
  if (r < 0.48) return { plate: `${l(2)} ${d(4)}`, country: 'L' };
  return { plate: `${l()}-${d(3)}-${l(2)}`, country: 'NL' };
}

export function buildDeck(permits: Permit[], presentKeys: Set<string>): Scenario[] {
  const deck: Scenario[] = [];
  const byKey = new Map(permits.map((p) => [p.plate_key, p]));
  const today = isoDate(SHIFT_START);

  const known = (key: string, at: number, dir: Direction, extra: Partial<Scenario> = {}) => {
    const p = byKey.get(key);
    if (p) deck.push({
      at, dir, plate: p.plate, country: p.country, type: p.vehicle_type,
      model: p.vehicle_type === 'auto' ? pick(CAR_MODELS) : undefined,
      color: pick(CAR_COLORS), ...extra,
    });
  };
  const stranger = (at: number, extra: Partial<Scenario> & Pick<Scenario, 'message'>) =>
    deck.push({ at, dir: 'in', ...randomPlate(), type: 'auto', model: pick(CAR_MODELS), color: pick(CAR_COLORS), ...extra });

  // Leveranciers: komen binnen hun tijdvak en rijden na een halfuur weer weg.
  ([['VF284T', t(6, 15)], ['45BKT2', t(7, 22)], ['BXFR71', t(8, 45)], ['V619JD', t(10, 10)], ['VN731K', t(11, 25)]] as const)
    .forEach(([key, at]) => {
      const start = at + between(-4, 4);
      known(key, start, 'in');
      known(key, start + between(28, 40), 'out');
    });

  // Medewerkers. Joris is vandaag te vroeg en moet aanbellen.
  ([['H306PN', t(7, 4), t(19, 5)], ['J847RS', t(7, 46), t(18, 4)], ['B451ZG', t(9, 4), t(21, 2)]] as const)
    .forEach(([key, start, end]) => {
      known(key, start + between(0, 4), 'in');
      known(key, end + between(0, 5), 'out');
    });
  known('L590TK', t(6, 40), 'in', {
    message: 'Goedemorgen, u spreekt met Joris van de schoonmaak. Ik begin vandaag wat eerder.',
  });
  known('L590TK', t(16, 6), 'out');

  // Gasten met een reservering die vandaag geldig is.
  const guests = permits.filter((p) => p.category === 'guest' && p.arrival && p.departure
    && p.arrival <= today && today <= p.departure);
  const arriving = shuffle(guests.filter((p) => !presentKeys.has(p.plate_key)));
  const inside = guests.filter((p) => presentKeys.has(p.plate_key));

  // Eén gast komt met een leenauto: het kenteken is onbekend, maar naam en plek kloppen.
  const borrowed = arriving.pop();
  if (borrowed) {
    stranger(t(13, 20) + between(-10, 10), {
      message: `Goedemiddag, wij zijn ${family(borrowed.holder)}, van ${borrowed.pitch}. Onze eigen auto staat bij de garage; dit is een leenauto.`,
    });
  }
  // De laatste gast komt in het donker aan.
  const late = arriving.pop();
  if (late) known(late.plate_key, t(21, 10), 'in');
  arriving.forEach((p, i) => {
    const at = t(10, 30) + Math.round((i + Math.random() * 0.8) * (t(20, 30) - t(10, 30)) / Math.max(1, arriving.length));
    known(p.plate_key, at, 'in');
    if (i % 3 === 0 && at + 150 < t(21, 0)) {
      known(p.plate_key, at + between(100, 150), 'out'); // even naar het dorp
      known(p.plate_key, at + between(190, 240), 'in');
    }
  });
  // Een gast die al binnen is, gaat een dagje weg en komt terug: binnen het verblijf mag dat altijd.
  const dayTrip = inside[0];
  if (dayTrip) {
    known(dayTrip.plate_key, t(10, 40), 'out');
    known(dayTrip.plate_key, t(16, 10), 'in');
  }

  // Bezoek voor gasten: alleen binnen als naam en plek kloppen met een reservering van vandaag.
  const hosts = shuffle(guests);
  if (hosts[0]) {
    stranger(t(12, 15) + between(-8, 8), {
      message: `Goedemiddag, wij komen op bezoek bij ${family(hosts[0].holder)}, op ${hosts[0].pitch}.`,
    });
  }
  if (hosts[1]) {
    stranger(t(19, 30) + between(-8, 8), {
      message: `Goedenavond, wij komen op bezoek bij ${family(hosts[1].holder)}, op ${hosts[1].pitch}.`,
    });
  }
  if (hosts[2]) {
    const wrong = `plek ${between(41, 59)}`;
    stranger(t(17, 20) + between(-8, 8), {
      message: `Goedemiddag, wij komen op bezoek bij ${family(hosts[2].holder)}, op ${wrong}.`,
    });
  }
  stranger(t(18, 40) + between(-8, 8), {
    message: 'Goedenavond, ik hoor bij de familie Koster, op plek 12. Wilt u de slagboom openen?',
  });
  deck.push({
    at: t(9, 40) + between(-5, 5), dir: 'in', plate: `V-${between(100, 999)}-PD`, country: 'NL', type: 'bestelbus', color: '#f4f3ec',
    message: 'Goedemorgen, pakketdienst. Ik heb een pakket voor de receptie.',
  });

  // Bekende kentekens die het systeem toch tegenhoudt.
  known('VF284T', t(14, 20), 'in', {
    message: 'Goedemiddag, u spreekt met Bakkerij Van Dijk. Ik kom de bestelling voor morgen ophalen.',
  });
  known('VF284T', t(14, 50), 'out');
  known('N264GT', t(15, 5), 'in', {
    message: 'Goedemiddag, wij zijn de familie Visser. We zijn een dag eerder aangekomen. Kunnen we er al in?',
  });
  known('D829RV', t(11, 10), 'in', {
    message: 'Goedemorgen, wij zijn de familie De Boer. We zijn iets vergeten op plek 40. Mogen we er nog even in?',
  });

  // Hulpdienst.
  // Volgens de RDW geen klinkers op een Nederlands kenteken: dus niet AMB.
  const ambulance = { plate: `${between(10, 19)}-GHR-${between(1, 9)}`, country: 'NL' as Country, type: 'ambulance' as VehicleType, color: '#f4d21f' };
  deck.push({ at: t(17, 45), dir: 'in', ...ambulance });
  deck.push({ at: t(18, 15), dir: 'out', ...ambulance });

  return deck.sort((a, b) => a.at - b.at);
}
