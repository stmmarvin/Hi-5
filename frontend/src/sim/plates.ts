// Europese kentekens: de landcode op de blauwe band, de kleur van de plaat en de vorm van het kenteken.
// De camera gebruikt dit om een gelezen tekst te herkennen als kenteken en het land te bepalen.
//
// Een vorm is een sjabloon: L = letter, D = cijfer, A = letter of cijfer, {a,b} = aantal, en een spatie of
// streepje is het scheidingsteken zoals het op de plaat staat. Voor Nederland gelden de regels van de RDW
// (rdw.nl, "Cijfers en letters op de kentekenplaat"): K = letter zonder klinkers, C en Q (sinds serie 4),
// O = letter zonder C en Q (de oudste series 1 tot en met 3, toen klinkers nog mochten). Veel landen delen een vorm (Frankrijk en Italië
// hebben allebei AB-123-CD); dan beslist de landcode op de band, de kleur van de plaat of de volgorde hieronder.

export interface CountryInfo {
  /** Landcode zoals op de blauwe band (en de internationale autocode). */
  code: string;
  name: string;
  /** Gele achtergrond (Nederland, Luxemburg). Andere landen hebben een witte plaat. */
  yellow?: boolean;
  /** Rode of groene letters in plaats van zwarte. */
  ink?: string;
  shapes: string[];
}

/** In volgorde van hoe vaak ze bij een Nederlandse camping te verwachten zijn: bij twijfel wint de eerste. */
export const COUNTRIES: CountryInfo[] = [
  {
    code: 'NL', name: 'Nederland', yellow: true,
    // De veertien Nederlandse zijcodes volgens de RDW: altijd zes tekens in drie groepen.
    shapes: [
      'OO-DD-DD', 'DD-DD-OO', 'DD-OO-DD', 'KK-DD-KK', 'KK-KK-DD', 'DD-KK-KK', 'DD-KKK-D', 'D-KKK-DD',
      'KK-DDD-K', 'K-DDD-KK', 'KKK-DD-K', 'K-DD-KKK', 'D-KK-DDD', 'DDD-KK-D',
    ],
  },
  { code: 'D', name: 'Duitsland', shapes: ['L{1,3} L{1,2} D{1,4}', 'L{1,3} L{1,2} D{1,3}E', 'L{1,3} L{1,2} D{1,3}H'] },
  { code: 'B', name: 'België', ink: '#a8121a', shapes: ['D-LLL-DDD'] },
  { code: 'F', name: 'Frankrijk', shapes: ['LL-DDD-LL'] },
  { code: 'GB', name: 'Verenigd Koninkrijk', shapes: ['LLDD LLL'] },
  { code: 'L', name: 'Luxemburg', yellow: true, shapes: ['LL DDDD'] },
  { code: 'CH', name: 'Zwitserland', shapes: ['LL D{1,6}'] },
  { code: 'A', name: 'Oostenrijk', ink: '#1b1b1b', shapes: ['L{1,2} D{1,5}L{1,3}', 'L{1,2} D{1,5} L{1,3}'] },
  { code: 'I', name: 'Italië', shapes: ['LL DDD LL'] },
  { code: 'E', name: 'Spanje', shapes: ['DDDD LLL'] },
  { code: 'DK', name: 'Denemarken', shapes: ['LL DD DDD'] },
  { code: 'PL', name: 'Polen', shapes: ['L{2,3} A{4,5}'] },
  { code: 'CZ', name: 'Tsjechië', shapes: ['DLA DDDD'] },
  { code: 'P', name: 'Portugal', shapes: ['LL-DD-LL', 'DD-LL-DD', 'DD-DD-LL', 'LL-DD-DD'] },
  { code: 'S', name: 'Zweden', shapes: ['LLL DDA'] },
  { code: 'N', name: 'Noorwegen', shapes: ['LL DDDDD'] },
  { code: 'FIN', name: 'Finland', shapes: ['L{2,3}-D{1,3}'] },
  { code: 'IRL', name: 'Ierland', shapes: ['D{2,3}-L{1,2}-D{1,6}'] },
  { code: 'SK', name: 'Slowakije', shapes: ['LL-DDDLL'] },
  { code: 'H', name: 'Hongarije', shapes: ['LL LL-DDD', 'LLL-DDD'] },
  { code: 'SLO', name: 'Slovenië', shapes: ['LL A{1,3}-A{2,3}'] },
  { code: 'HR', name: 'Kroatië', shapes: ['LL D{3,4}-L{1,2}'] },
  { code: 'RO', name: 'Roemenië', shapes: ['L{1,2} D{2,3} LLL'] },
  { code: 'BG', name: 'Bulgarije', shapes: ['L{1,2} DDDD L{1,2}'] },
  { code: 'GR', name: 'Griekenland', shapes: ['LLL-DDDD'] },
  { code: 'LT', name: 'Litouwen', shapes: ['LLL DDD'] },
  { code: 'LV', name: 'Letland', shapes: ['LL-D{1,4}'] },
  { code: 'EST', name: 'Estland', shapes: ['DDD LLL'] },
  { code: 'CY', name: 'Cyprus', shapes: ['LLL DDD'] },
  { code: 'M', name: 'Malta', shapes: ['LLL DDD'] },
  { code: 'IS', name: 'IJsland', shapes: ['LL ADD'] },
];

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code);
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
/** Codes die op de band anders staan dan de autocode. */
const BAND_ALIAS: Record<string, string> = { UK: 'GB', GBR: 'GB', NLD: 'NL', DE: 'D', BE: 'B', FR: 'F', ES: 'E', IT: 'I', AT: 'A', LU: 'L' };

export const countryInfo = (code: string): CountryInfo => BY_CODE.get(code) ?? { code, name: code, shapes: [] };
export const countryName = (code: string) => countryInfo(code).name;

/** Leest een landcode zoals de camera die van de band haalt; geeft null als het geen bekend land is. */
export function bandCountry(text: string): string | null {
  const code = text.toUpperCase().replace(/[^A-Z]/g, '');
  const known = BAND_ALIAS[code] ?? code;
  return BY_CODE.has(known) ? known : null;
}

interface Shape { regex: RegExp; runs: RegExp[]; separators: string[] }

/** Nederlandse letters volgens de RDW: geen C en Q (lijken op een 0) en sinds serie 4 geen klinkers. */
export const DUTCH_LETTERS = 'BDFGHJKLMNPRSTVWXYZ';
const CLASS: Record<string, string> = {
  L: '[A-Z]', D: '[0-9]', A: '[A-Z0-9]', K: `[${DUTCH_LETTERS}]`, O: '[ABD-PR-Z]',
};

/** Lettercombinaties die de RDW niet uitgeeft. SS en SD komen nergens in een kenteken voor. */
const DUTCH_FORBIDDEN = ['GVD', 'KKK', 'NSB', 'PKK', 'PSV', 'TBS', 'PVV', 'SGP', 'VVD', 'FVD', 'BBB'];

/** Waarom dit geen geldig Nederlands kenteken is, of null als het wel kan. */
export function dutchPlateProblem(plate: string): string | null {
  const key = plateKeyOf(plate);
  if (key.length !== 6) return 'Een Nederlands kenteken heeft zes letters en cijfers, bijvoorbeeld T-902-BZ.';
  if (/[CQ]/.test(key)) return 'De letters C en Q komen niet voor op een Nederlands kenteken (ze lijken te veel op een 0).';
  const groups = key.match(/[A-Z]+/g) ?? [];
  if (groups.some((g) => /SS|SD/.test(g) || DUTCH_FORBIDDEN.includes(g))) {
    return 'Deze lettercombinatie geeft de RDW niet uit (zoals SS, SD, PVV of VVD).';
  }
  if (!SHAPES.get('NL')!.some((shape) => shape.regex.test(key))) {
    return /[AEIOU]/.test(key)
      ? 'Sinds 1978 komen er geen klinkers (A, E, I, O, U) meer voor op een Nederlands kenteken.'
      : 'Dit past bij geen van de Nederlandse zijcodes, zoals 99-XX-XX, X-999-XX of XXX-99-X.';
  }
  return null;
}

/** Zet een sjabloon als 'L{1,3} L{1,2} D{1,4}' om in een patroon met één groep per deel tussen de scheidingstekens. */
function compile(shape: string): Shape {
  const parts = shape.split(/([ -])/);
  const runs = parts.filter((_, i) => i % 2 === 0).map((run) => run.replace(/([LDAKO])(\{\d+(?:,\d+)?\})?/g, (_, kind: string, count = '') => (
    `${CLASS[kind]}${count}`
  )));
  return {
    regex: new RegExp(`^${runs.map((run) => `(${run})`).join('')}$`),
    runs: runs.map((run) => new RegExp(`^${run}$`)),
    separators: parts.filter((_, i) => i % 2 === 1),
  };
}

const SHAPES = new Map(COUNTRIES.map((c) => [c.code, c.shapes.map(compile)]));

export const plateKeyOf = (plate: string) => plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Zet een kenteken in de schrijfwijze van het land, bijvoorbeeld T902BZ in Nederland als T-902-BZ. */
function formatAs(key: string, code: string, written = ''): string | null {
  // De delen zoals de camera ze zag (gescheiden door spaties of streepjes).
  const seen = written.toUpperCase().replace(/[^A-Z0-9 -]/g, ' ').trim().split(/[ -]+/).filter(Boolean);
  for (const shape of SHAPES.get(code) ?? []) {
    const match = shape.regex.exec(key);
    if (!match) continue;
    // Past de verdeling van de camera ook bij deze vorm (bij Duitsland kan de verdeling verschillen), volg die dan.
    const parts = seen.length === shape.runs.length && seen.every((part, i) => shape.runs[i].test(part)) ? seen : match.slice(1);
    return parts.map((part, i) => part + (shape.separators[i] ?? '')).join('');
  }
  return null;
}

export interface PlateGuess {
  /** Het kenteken in de schrijfwijze van het land. */
  plate: string;
  key: string;
  country: string;
  /** Hoe zeker het land is: van de band gelezen, uit de lijst, of alleen afgeleid uit de vorm. */
  basis: 'band' | 'lijst' | 'vorm';
  /** Andere landen waar deze vorm ook bij past. */
  alternatives: string[];
  /** De groepen zoals gelezen (spaties en streepjes) passen precies bij de vorm van het land. */
  exact: boolean;
}

/** De landen waarvan de vorm bij dit kenteken past, in de volgorde van COUNTRIES. */
export function countriesFor(key: string): string[] {
  return COUNTRIES.filter((c) => SHAPES.get(c.code)!.some((shape) => shape.regex.test(key)))
    .map((c) => c.code)
    .filter((code) => code !== 'NL' || dutchPlateProblem(key) === null);
}

/**
 * Bepaalt of een gelezen tekst een Europees kenteken is en uit welk land.
 * band: landcode van de blauwe band (als die gelezen is); yellow: de plaat is geel.
 */
export function guessPlate(text: string, hints: { band?: string | null; yellow?: boolean | null; known?: string | null } = {}): PlateGuess | null {
  const key = plateKeyOf(text);
  if (key.length < 2 || key.length > 10 || !/[0-9]/.test(key)) return null;
  const fits = countriesFor(key);
  if (!fits.length) return null;

  // Landen waarvan ook de verdeling in groepen klopt met wat de camera zag (AB 12 345 is Deens, niet Zwitsers).
  const seen = text.toUpperCase().replace(/[^A-Z0-9 -]/g, ' ').trim().split(/[ -]+/).filter(Boolean);
  const grouped = seen.length > 1
    ? fits.filter((code) => SHAPES.get(code)!.some((shape) => shape.runs.length === seen.length && seen.every((part, i) => shape.runs[i].test(part))))
    : [];
  // Nog sterker: ook de scheidingstekens (spatie of streepje) kloppen. ABC-1234 is Grieks, ABC 1234 Pools.
  const marks = text.toUpperCase().replace(/[^A-Z0-9 -]/g, ' ').trim().replace(/[A-Z0-9]+/g, '').replace(/\s*-\s*/g, '-').split('');
  const marked = grouped.filter((code) => SHAPES.get(code)!.some((shape) => shape.runs.length === seen.length
    && seen.every((part, i) => shape.runs[i].test(part)) && shape.separators.join('') === marks.join('')));
  // Een vaste vorm (Italië: altijd AB 123 CD) zegt meer dan een vrije vorm (Oostenrijk: 1 tot 5 cijfers).
  const fixed = (code: string) => SHAPES.get(code)!.some((shape) => shape.regex.test(key) && !/\{/.test(shape.regex.source));
  const likely = [...(marked.length ? marked : grouped.length ? grouped : fits)].sort((a, b) => Number(fixed(b)) - Number(fixed(a)));

  let country: string | undefined;
  let basis: PlateGuess['basis'] = 'vorm';
  if (hints.band && fits.includes(hints.band)) {
    country = hints.band;
    basis = 'band';
  } else if (hints.known && fits.includes(hints.known)) {
    country = hints.known;
    basis = 'lijst';
  } else if (hints.yellow != null) {
    // Geel is (bijna) altijd Nederland of Luxemburg; een witte plaat is nooit Nederlands.
    country = likely.find((code) => Boolean(countryInfo(code).yellow) === hints.yellow)
      ?? fits.find((code) => Boolean(countryInfo(code).yellow) === hints.yellow);
  }
  country ??= likely[0];
  return {
    plate: formatAs(key, country, text) ?? key, key, country, basis,
    alternatives: fits.filter((code) => code !== country),
    exact: grouped.includes(country),
  };
}

/** Schrijft een kenteken netjes in het formaat van het land; onbekende vormen blijven zoals ze zijn. */
export function formatPlate(plate: string, country: string): string {
  return formatAs(plateKeyOf(plate), country, plate) ?? plate.toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Invoer van een kenteken uit elk land: hoofdletters, cijfers, spaties en streepjes. */
export function cleanPlateInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').replace(/([ -]){2,}/g, '$1').slice(0, 14);
}
