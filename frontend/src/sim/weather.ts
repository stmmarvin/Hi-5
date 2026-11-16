// Het weer in de simulatie en wat het doet met de camera en de slagboom.
// De camera is weerbestendig (IP66, verwarmde lens): hij blijft lezen bij regen, sneeuw, hagel en vorst,
// maar heeft bij zware neerslag meer tijd nodig. Lukt het niet binnen 10 seconden, dan neemt de intercom het over.

export type Weather = 'helder' | 'regen' | 'sneeuw' | 'hagel' | 'ijzel' | 'noodweer';

export interface WeatherInfo {
  label: string;
  /** Graden Celsius. */
  temperature: number;
  /** Hoe lang de camera over een kenteken doet, in seconden (kortste en langste). */
  read: [number, number];
  /** Kans dat het kenteken zelf onleesbaar is (dichtgesneeuwd of weggespoeld) en de camera het opgeeft. */
  failChance: number;
  falls: 'niets' | 'regen' | 'sneeuw' | 'hagel';
  /** Hoeveel het weer het daglicht en het zicht wegneemt (0 tot 1). */
  dim: number;
  /** Geluid van de neerslag: sterkte en toonhoogte. */
  sound: [number, number];
}

export const WEATHER: Record<Weather, WeatherInfo> = {
  helder: { label: 'Helder', temperature: 18, read: [0.8, 1.2], failChance: 0, falls: 'niets', dim: 0, sound: [0, 3000] },
  regen: { label: 'Regen', temperature: 12, read: [1.5, 3], failChance: 0, falls: 'regen', dim: 0.45, sound: [0.03, 3200] },
  sneeuw: { label: 'Sneeuw', temperature: -1, read: [2.5, 4.5], failChance: 0, falls: 'sneeuw', dim: 0.5, sound: [0.006, 900] },
  hagel: { label: 'Hagel', temperature: 4, read: [3, 5.5], failChance: 0, falls: 'hagel', dim: 0.55, sound: [0.045, 5200] },
  ijzel: { label: 'IJzel en vorst', temperature: -4, read: [1.5, 3], failChance: 0, falls: 'regen', dim: 0.4, sound: [0.012, 4200] },
  noodweer: { label: 'Noodweer', temperature: 9, read: [5, 9], failChance: 0.35, falls: 'regen', dim: 0.8, sound: [0.06, 2400] },
};

export const WEATHER_ORDER: Weather[] = ['helder', 'regen', 'sneeuw', 'hagel', 'ijzel', 'noodweer'];

/** Kwaliteitseis: binnen zoveel seconden is het kenteken herkend, anders gaat het via de intercom. */
export const READ_LIMIT = 10;
/** Vanaf zoveel centimeter sneeuw bij de slagboom vergrendelt het systeem de slagbomen. */
export const SNOW_LOCK_CM = 8;
/** Zo snel hoopt sneeuw zich op en smelt hij weer, in centimeter per uur. */
export const SNOW_PER_HOUR = 4;
export const MELT_PER_HOUR = 6;
/** Na zoveel minuten ijzel ligt er ijs op de slagboom; strooien houdt hem zoveel minuten ijsvrij. */
export const ICE_AFTER_MINUTES = 20;
export const SALT_LASTS_MINUTES = 180;
/** Bij zelf rijden maakt de beheerder de slagboom na zoveel minuten zelf vrij. */
export const KEEPER_MINUTES = 15;

export type GateLock = 'ijzel' | 'sneeuw';

/** De lens wordt verwarmd bij kou en bij neerslag, tegen condens en ijs. */
export const heaterOn = (weather: Weather) => WEATHER[weather].temperature <= 5 || WEATHER[weather].falls !== 'niets';

export const seconds = (value: number) => `${value.toFixed(1).replace('.', ',')} s`;
