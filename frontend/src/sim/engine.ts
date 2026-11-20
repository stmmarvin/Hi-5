// Simulatiemotor: laat voertuigen rijden, vraagt de backend om een beslissing
// en laat de intercom overgaan.
import { create } from 'zustand';
import { api, ApiError } from '../api';
import type { Country, Direction, PassageRow, Permit, PresenceRow, ScanResult, SyncItem, User, VehicleType } from '../types';
import { daylight, isoAt, isoDate, SECONDS_PER_MINUTE, SHIFT_END, SHIFT_START } from './clock';
import { specOf } from '../scene/Car';
import { CatmullRomCurve3, Vector3 } from 'three';
import { BAYS, PARKING, type Bay } from '../scene/layout';
import { clearLocal, loadLocal, saveLocal } from './localStore';
import { boxesOverlap, corners, hitsScenery, type Box } from './obstacles';
import {
  heaterOn, ICE_AFTER_MINUTES, KEEPER_MINUTES, MELT_PER_HOUR, READ_LIMIT, SALT_LASTS_MINUTES, SNOW_LOCK_CM, SNOW_PER_HOUR,
  WEATHER, type GateLock, type Weather,
} from './weather';
import { DUTCH_LETTERS, dutchPlateProblem, formatPlate } from './plates';
import { decideLocal, plateKey, EMERGENCY_TYPES, isEmergency, zoneFor, type Zone } from './rules';
import { buildDeck, CAR_COLORS, CAR_MODELS, type Scenario } from './scenarios';
import { barrierSound, bump, carVoice, chime, hornSound, startAmbience, stopAllVoices, stopAmbience, updateAmbience, type CarVoice, setMuted, setSiren, setWeatherSound, startEngine, speak, stopEngine, stopSpeaking, tick as indicatorTick, windowSound, hasDutchVoice, type Gender } from './sound';

export interface SimVehicle {
  id: number;
  plate: string;
  country: Country;
  type: VehicleType;
  color: string;
  model: string;
  player?: boolean;
  offset?: number;
  indicator?: 'left' | 'right' | null;
  windowsOpen?: boolean;
  hornUntil?: number;
  /** Zwaailicht en sirene van de hulpdienst die je zelf bestuurt. */
  siren?: boolean;
  lane: Direction;
  /** Positie langs de oprit; wordt elk beeld bijgewerkt, buiten React om. */
  z: number;
  // Alleen bij de auto die de gebruiker zelf bestuurt: snelheid (m/s), rijrichting (0 = naar de camping), stuurstand (-1..1),
  // afgelegde weg en of de slagboom voor deze auto open is gezet.
  speed?: number;
  heading?: number;
  steer?: number;
  odo?: number;
  cleared?: boolean;
  /** Vrije plek in de wereld (van de weg af, op de parkeerplaats). `heading` is de draaiing van het model om de y-as. */
  pose?: { x: number; z: number; heading: number };
  /** Staat geparkeerd in een vak. */
  parked?: boolean;
}

export type DriveView = 'binnen' | 'buiten';

export type SessionMode = 'simulatie' | 'zelf_rijden';

export interface Readout {
  plate: string;
  country: Country;
  type: VehicleType;
  model: string;
  status: 'reading' | 'done';
  /** Uitleg tijdens het lezen, bijvoorbeeld dat de camera door de neerslag meer tijd nodig heeft. */
  note?: string;
  /** Hoe lang de camera over het kenteken deed, in seconden. */
  readSeconds?: number;
  /** De camera zag zwaailicht en sirene. */
  siren?: boolean;
  open?: boolean;
  reason?: string;
  holder?: string;
}

export interface Call {
  plate: string;
  country: Country;
  reason: string;
  holder: string;
  message: string;
  since: number;
  /** Er is een storing: een medewerker staat bij de slagboom en bedient die met de hand. */
  manual?: 'stroom' | 'defect';
}

export interface Chat {
  /** Wie er opneemt bij de receptie. */
  name: string;
  lines: { who: 'receptie' | 'jij'; text: string }[];
  /** Wat de bestuurder kan zeggen; leeg zolang de receptie aan het woord is. */
  options: string[];
  status: string;
  done?: boolean;
}

interface GameState {
  user: User | null;
  phase: 'loading' | 'login' | 'ready' | 'playing' | 'ended';
  minute: number;
  speed: 1 | 2;
  online: boolean;
  pendingSync: number;
  passages: number;
  readout: Readout | null;
  call: Call | null;
  /** Gesprek met de receptie als de gebruiker zelf aanbelt. */
  chat: Chat | null;
  queue: { in: number; out: number };
  vehicles: SimVehicle[];
  permits: Permit[];
  presence: PresenceRow[];
  log: PassageRow[];
  notice: string;
  driving: boolean;
  playerVehicle: SimVehicle | null;
  driveMessage: string;
  playerNeedsIntercom: boolean;
  mode: SessionMode;
  view: DriveView;
  /** Telt op bij elke knop in de auto (richtingaanwijzer, raam), zodat het scherm meteen bijwerkt. */
  controls: number;
  speedKmh: number;
  muted: boolean;
  weather: Weather;
  /** Centimeters sneeuw op en rond de slagboom. */
  snowCm: number;
  /** Veiligheidsvergrendeling: bij ijzel of sneeuwophoping blijven de slagbomen dicht. */
  gateLock: GateLock | null;
  /** De laatste keer dat de camera een kenteken las: hoe lang het duurde en of het lukte. */
  lastRead: { seconds: number; read: boolean } | null;
  /** Stroom: gewoon net, de noodaccu of helemaal uit. */
  power: 'net' | 'accu' | 'uit';
  /** Hoeveel minuten de noodaccu nog meegaat. */
  battery: number;
  gateDefect: boolean;
  /** Het overzichtsportaal staat open (los van de simulatie). */
  portal: boolean;
}

const fresh = {
  minute: SHIFT_START, speed: 1 as const, online: true, pendingSync: 0,
  passages: 0, driving: false, playerVehicle: null, driveMessage: '', playerNeedsIntercom: false,
  mode: 'simulatie' as SessionMode, view: 'binnen' as DriveView, speedKmh: 0, controls: 0,
  readout: null, call: null, chat: null, queue: { in: 0, out: 0 }, vehicles: [], notice: '',
  weather: 'helder' as Weather, snowCm: 0, gateLock: null, lastRead: null,
  power: 'net' as 'net' | 'accu' | 'uit', battery: 60, gateDefect: false, portal: false,
};

export const useGame = create<GameState>(() => ({
  user: null, phase: 'loading', permits: [], presence: [], log: [], muted: false, ...fresh,
}));
const set = useGame.setState;
const get = useGame.getState;

// Een melding verdwijnt na een paar seconden vanzelf.
useGame.subscribe((state, previous) => {
  if (state.notice && state.notice !== previous.notice && state.phase === 'playing') {
    const shown = state.notice;
    window.setTimeout(() => { if (get().notice === shown) set({ notice: '' }); }, 7000);
  }
});

// De uitslag bij de slagboom en de melding voor de bestuurder verdwijnen na een paar seconden vanzelf,
// zodat het beeld leeg is tot het volgende voertuig komt. Zolang iemand aan de intercom staat, blijven ze staan.
const waiting = () => Boolean(get().call || get().chat || get().playerNeedsIntercom);
function clearLater(read: () => unknown, clear: () => void, ms: number) {
  const shown = read();
  const check = () => {
    if (read() !== shown) return;
    if (waiting()) window.setTimeout(check, 1500);
    else clear();
  };
  window.setTimeout(check, ms);
}
useGame.subscribe((state, previous) => {
  if (state.readout && state.readout !== previous.readout && state.readout.status === 'done') {
    clearLater(() => get().readout, () => set({ readout: null }), 6000);
  }
  if (state.driveMessage && state.driveMessage !== previous.driveMessage) {
    clearLater(() => get().driveMessage, () => set({ driveMessage: '' }), 8000);
  }
});

/** Toestand die de 3D-scène elk beeld uitleest. */
export const world = {
  minute: SHIFT_START,
  speed: 1,
  barrier: { in: false, out: false },
  /** Storing: het lampje op de slagboom knippert oranje. */
  fault: false,
  beam: { in: false },
  // Het weer bij de slagboom: soort, sneeuwhoogte in centimeters, ijs op de slagboom, vergrendeling en lensverwarming.
  weather: 'helder' as Weather,
  snow: 0,
  ice: false,
  locked: false,
  heater: false,
  /** Het overzichtsportaal staat open: klok, voertuigen en geluid staan stil. */
  paused: false,
};

export const VEHICLE_LENGTH: Record<VehicleType, number> = { auto: 4.3, camper: 6.4, bestelbus: 5.4, vrachtwagen: 8, ambulance: 5.8, brandweer: 7.4, politie: 4.78 };
export const VEHICLE_NAME: Record<VehicleType, string> = {
  auto: 'Personenauto', camper: 'Camper', bestelbus: 'Bestelbus', vrachtwagen: 'Vrachtwagen', ambulance: 'Ambulance',
  brandweer: 'Brandweerwagen', politie: 'Politieauto',
};

export const VEHICLE_MODEL: Record<VehicleType, string> = {
  auto: 'Volkswagen Golf',
  camper: 'Camper',
  bestelbus: 'Mercedes Sprinter',
  vrachtwagen: 'DAF XD',
  ambulance: 'Mercedes Sprinter ambulance',
  brandweer: 'Scania brandweerwagen',
  politie: 'Audi RS4 Avant',
};

export type EmergencyType = 'politie' | 'ambulance' | 'brandweer';

/** De hulpdiensten waarmee je zelf kunt rijden. De kentekens zijn verzonnen en voldoen aan de regels van de RDW. */
export const EMERGENCY_SERVICES: Record<EmergencyType, { label: string; plate: string; color: string }> = {
  politie: { label: 'Politie', plate: 'PT-112-K', color: '#f2f4f5' },
  ambulance: { label: 'Ambulance', plate: 'GZ-112-B', color: '#f4d21f' },
  brandweer: { label: 'Brandweer', plate: 'BW-112-R', color: '#c8201c' },
};

/** Deze voertuigen hebben de carrosserie van een personenauto; de rest is een groot voertuig. */
export const hasCarBody = (type: VehicleType) => type === 'auto' || type === 'politie';

/**
 * Een Nederlands kenteken bestaat uit letters, cijfers en streepjes. Volgens de RDW zonder klinkers en zonder C en Q;
 * al het andere (ook een spatie) valt weg.
 */
export function cleanDutchPlateInput(value: string): string {
  return value.toUpperCase().replace(new RegExp(`[^${DUTCH_LETTERS}0-9-]`, 'g'), '').replace(/-{2,}/g, '-');
}

// De slagbomen staan op z = 0. Inrijden gaat richting -z, uitrijden richting +z.
const ROAD = { spawnIn: 57, stopIn: 2.4, endIn: -75, spawnOut: -75, stopOut: -2.4, endOut: 57 };

/** Kenteken dat de camera niet kon lezen. */
const UNREADABLE = 'ONBEKEND';

class Aborted extends Error {}

let epoch = 0;
let timer: number | undefined;
let deck: Scenario[] = [];
let nextId = 1;
let offlineQueue: SyncItem[] = [];
let answerCall: ((open: boolean) => void) | null = null;
let playerIntercom: (() => void) | null = null;
/** Welke voertuigen in de simulatie echt op het terrein rijden. Het systeem zelf weet dit niet: de uitgang leest geen kentekens. */
const present = new Set<string>();
/** Tot waar een geregistreerd voertuig mag: de parkeerplaats of ook de camping. */
const zoneOf = new Map<string, Zone>();
const BATTERY_MINUTES = 60;
const chain: Record<Direction, Promise<void>> = { in: Promise.resolve(), out: Promise.resolve() };

/** Wacht `ms` milliseconden simulatietijd: telt niet door zolang de simulatie gepauzeerd is. */
async function sleep(ms: number): Promise<void> {
  let left = ms;
  while (left > 0) {
    await new Promise((done) => setTimeout(done, Math.min(100, left / world.speed)));
    if (!world.paused) left -= 100 * world.speed;
  }
}
const guard = (mine: number) => { if (mine !== epoch) throw new Aborted(); };
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Het motorgeluid van elk voertuig dat de gebruiker niet zelf bestuurt. */
const voiceOf = new Map<SimVehicle, CarVoice>();
/** Hoe dichtbij een voertuig klinkt: 1 bij de slagboom, bijna 0 op de openbare weg of diep op de camping. */
const nearness = (z: number) => 1 / (1 + ((z - 8) / 20) ** 2);

function drive(vehicle: SimVehicle, toZ: number, ms: number): Promise<void> {
  const from = vehicle.z;
  const duration = ms / world.speed;
  const direction = Math.sign(toZ - from);
  let start = performance.now();
  let last = start;
  return new Promise((done) => {
    const step = (now: number) => {
      // Gepauzeerd, of de zelf bestuurde auto staat in de weg: dan wacht dit voertuig.
      if (world.paused || playerAhead(vehicle, direction)) {
        start += now - last;
        last = now;
        voiceOf.get(vehicle)?.update(0, nearness(vehicle.z));
        requestAnimationFrame(step);
        return;
      }
      const p = Math.min(1, (now - start) / duration);
      const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const z = from + (toZ - from) * eased;
      // Snelheid in meters per seconde, voor het motorgeluid.
      const speed = Math.abs(z - vehicle.z) / Math.max(0.001, (now - last) / 1000);
      last = now;
      vehicle.z = z;
      voiceOf.get(vehicle)?.update(p < 1 ? Math.min(1, speed / 22) : 0, nearness(z));
      if (p < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}

function silence(vehicle: SimVehicle) {
  voiceOf.get(vehicle)?.stop();
  voiceOf.delete(vehicle);
}

function silenceAll() {
  voiceOf.clear();
  stopAllVoices();
}

const removeVehicle = (vehicle: SimVehicle) => (silence(vehicle), set((s) => ({
  vehicles: s.vehicles.filter((v) => v !== vehicle),
  ...(s.playerVehicle === vehicle ? { playerVehicle: null, driving: false } : {}),
})));

// ---------- verbinding met de backend ----------

function sessionExpired(): never {
  stopClock();
  epoch++;
  silenceAll();
  stopAmbience();
  stopEngine();
  clearLocal();
  set({ user: null, phase: 'login', notice: 'Je sessie is verlopen. Log opnieuw in.' });
  throw new Aborted();
}

/** Vraagt de backend om een beslissing. Geeft null als er geen verbinding is: dan beslist de slagboom zelf. */
async function scanRemote(sc: Scenario, minute: number) {
  if (!get().online) return null;
  try {
    return await api.scan({ plate: sc.plate, country: sc.country, vehicle_type: sc.type, siren: Boolean(sc.siren), at: isoAt(minute) });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) sessionExpired();
      if (error.status < 500) throw error;
    }
    set({ online: false, notice: 'De server is niet bereikbaar. De slagboom werkt lokaal door.' });
    return null;
  }
}

function queueOffline(sc: Scenario, minute: number, open: boolean, manual: boolean, reason: string) {
  offlineQueue.push({
    plate: sc.plate, country: sc.country, vehicle_type: sc.type, siren: Boolean(sc.siren),
    at: isoAt(minute), open, manual, reason: reason.slice(0, 200),
  });
  saveLocal({ queue: offlineQueue });
  set({ pendingSync: offlineQueue.length });
}

export async function refresh() {
  if (!get().online) return;
  try {
    // Ook de kentekenlijst: een gast verdwijnt 24 uur na het einde van de reservering uit het systeem.
    const [presence, log, permits] = await Promise.all([api.presence(), api.passages(60), api.permits()]);
    saveLocal({ permits });
    set({ presence, log, permits });
  } catch {
    /* het overzicht wordt bij de volgende passage opnieuw opgehaald */
  }
}

export async function setOnline(online: boolean) {
  set({ online, notice: '' });
  if (!online) return;
  await flushQueue('Internet is terug');
  if (!get().notice) set({ notice: 'Internet is terug.' });
}

/** Stuurt wat tijdens een storing is gebeurd alsnog naar de server. */
async function flushQueue(intro: string) {
  if (offlineQueue.length) {
    const items = offlineQueue;
    offlineQueue = [];
    try {
      await api.sync(items);
      saveLocal({ queue: offlineQueue });
      set({ pendingSync: 0, notice: `${intro}: ${items.length} passage(s) alsnog vastgelegd in het logboek.` });
    } catch {
      offlineQueue = [...items, ...offlineQueue];
      saveLocal({ queue: offlineQueue });
      set({ online: false, pendingSync: offlineQueue.length, notice: 'Synchroniseren is niet gelukt. Probeer het zo nog eens.' });
      return;
    }
  }
  await refresh();
}

// ---------- na de ingang ----------

/** Draait van de weg af de parkeerplaats op en verdwijnt daar uit beeld. */
function turnIntoParking(vehicle: SimVehicle): Promise<void> {
  const duration = 2000 / world.speed;
  let start = performance.now();
  let last = start;
  return new Promise((done) => {
    const step = (now: number) => {
      if (world.paused) start += now - last;
      last = now;
      const p = Math.min(1, (now - start) / duration);
      vehicle.heading = Math.min(1, p * 2.5) * (Math.PI / 2);
      vehicle.offset = -24 * p * p;
      if (p < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}

// ---------- parkeren ----------

/** Welk voertuig in welk vak staat, en in welk vak een kenteken staat. */
const parkedIn = new Map<number, SimVehicle>();
const bayOf = new Map<string, Bay>();

function clearParking() {
  parkedIn.clear();
  bayOf.clear();
}

/** Een vrij vak, meestal dicht bij de inrit van de parkeerplaats. */
function freeBay(): Bay | null {
  const free = BAYS.filter((bay) => !parkedIn.has(bay.index)).sort((a, b) => b.x - a.x);
  return free.length ? free[Math.floor(Math.random() * Math.min(8, free.length))] : null;
}

/** Hoe ver het midden van het voertuig van het midden van de parkeerplaats staat: lange voertuigen steken achter het vak uit. */
function bayDepth(vehicle: SimVehicle): number {
  const length = hasCarBody(vehicle.type) ? specOf(vehicle.model).L : VEHICLE_LENGTH[vehicle.type];
  return Math.max(8.5, 6.2 + length / 2);
}

const headingOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/**
 * Rijdt een voertuig langs een vloeiende lijn door de punten [x, z], met `speed` meter per seconde.
 * Achteruit wijst de neus de andere kant op. Staat de zelf bestuurde auto in de weg, dan wacht het voertuig.
 */
function follow(vehicle: SimVehicle, points: [number, number][], speed: number, reverse = false): Promise<void> {
  const curve = new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');
  const duration = (curve.getLength() / speed) * 1000;
  let elapsed = 0;
  let last = performance.now();
  return new Promise((done) => {
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      if (world.paused) {
        requestAnimationFrame(step);
        return;
      }
      const p = Math.min(1, (elapsed + dt * world.speed) / duration);
      const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const at = curve.getPointAt(eased);
      const tangent = curve.getTangentAt(eased);
      const pose = { x: at.x, z: at.z, heading: reverse ? headingOf(-tangent.x, -tangent.z) : headingOf(tangent.x, tangent.z) };
      const player = get().playerVehicle;
      const ahead = footprint(vehicle, pose.x + Math.sin(pose.heading) * (reverse ? -1 : 1), pose.z + Math.cos(pose.heading) * (reverse ? -1 : 1), pose.heading);
      if (player && player !== vehicle && p < 1 && boxesOverlap(ahead, boxOf(player))) {
        voiceOf.get(vehicle)?.update(0, nearness(vehicle.z));
        requestAnimationFrame(step);
        return;
      }
      const moved = vehicle.pose ? Math.hypot(pose.x - vehicle.pose.x, pose.z - vehicle.pose.z) : 0;
      elapsed += dt * world.speed;
      vehicle.pose = pose;
      vehicle.z = pose.z;
      voiceOf.get(vehicle)?.update(p < 1 ? Math.min(1, moved / Math.max(0.001, dt / 1000) / 22) : 0, nearness(pose.z));
      if (p < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}

/** Rijdt van de inrijbaan de parkeerplaats op en zet het voertuig met de neus vooruit in een vrij vak. */
async function park(vehicle: SimVehicle, key: string, mine: number): Promise<boolean> {
  const bay = freeBay();
  if (!bay) return false;
  parkedIn.set(bay.index, vehicle);
  bayOf.set(key, bay);
  const middle = PARKING.z;
  const s = bay.side;
  const depth = bayDepth(vehicle);
  vehicle.indicator = 'left';
  await follow(vehicle, [
    [LANE_X.in, vehicle.z], [LANE_X.in, middle + 7], [2, middle + 2.6], [-1.5, middle + 0.4], [-7, middle],
    [bay.x + 6, middle], [bay.x + 1.8, middle + s * 2.8], [bay.x + 0.2, middle + s * (depth - 2.2)], [bay.x, middle + s * depth],
  ], 4.2);
  guard(mine);
  vehicle.indicator = null;
  vehicle.parked = true;
  silence(vehicle);
  return true;
}

/** Rijdt achteruit uit het vak, over de parkeerplaats terug naar de weg en zet het voertuig op de uitrijbaan. */
async function unpark(vehicle: SimVehicle, key: string, mine: number) {
  const bay = bayOf.get(key)!;
  const middle = PARKING.z;
  const s = bay.side;
  const depth = bayDepth(vehicle);
  vehicle.parked = false;
  await follow(vehicle, [[bay.x, middle + s * depth], [bay.x, middle + s * (depth - 2.6)], [bay.x - 1.6, middle + s * 1.6], [bay.x - 4.2, middle + s * 0.6]], 1.8, true);
  guard(mine);
  parkedIn.delete(bay.index);
  bayOf.delete(key);
  vehicle.indicator = 'right';
  await follow(vehicle, [[bay.x - 4.2, middle + s * 0.6], [bay.x + 1, middle], [-9, middle], [-5, middle + 1.4], [-3.6, middle + 4.5], [LANE_X.out, middle + 7.5]], 4.2);
  guard(mine);
  vehicle.indicator = null;
  vehicle.pose = undefined;
  vehicle.lane = 'out';
  vehicle.z = middle + 7.5;
}

/** Wie al op de parkeerplaats staat als de dienst begint, staat er ook echt geparkeerd. */
function parkAtStart(row: PresenceRow) {
  const bay = freeBay();
  if (!bay) return;
  const type = (row.vehicle_type in VEHICLE_LENGTH ? row.vehicle_type : 'auto') as VehicleType;
  const vehicle: SimVehicle = {
    id: nextId++, plate: row.plate, country: row.country, type, lane: 'in', parked: true,
    color: CAR_COLORS[nextId % CAR_COLORS.length],
    model: type === 'auto' ? CAR_MODELS[nextId % CAR_MODELS.length] : VEHICLE_MODEL[type],
    z: 0,
  };
  const depth = bayDepth(vehicle);
  vehicle.pose = { x: bay.x, z: PARKING.z + bay.side * depth, heading: bay.side > 0 ? 0 : Math.PI };
  vehicle.z = vehicle.pose.z;
  parkedIn.set(bay.index, vehicle);
  bayOf.set(row.plate_key, bay);
  set((s) => ({ vehicles: [...s.vehicles, vehicle] }));
}

/** Het vak waar de zelf bestuurde auto nu netjes in staat, of null. */
function bayUnder(x: number, z: number, heading: number): Bay | null {
  if (Math.abs(Math.cos(heading)) < 0.85) return null;
  return BAYS.find((bay) => Math.abs(x - bay.x) < 1.2 && Math.abs(z - bay.z) < 2.6) ?? null;
}

/** Bezoekers en leveranciers parkeren op de parkeerplaats, de anderen rijden door naar de camping. */
async function onSite(vehicle: SimVehicle, zone: Zone, mine: number) {
  try {
    if (zone === 'parkeren') {
      // Blijft op de parkeerplaats staan tot het weer vertrekt.
      if (await park(vehicle, plateKey(vehicle.plate), mine)) return;
      // De parkeerplaats is vol: het voertuig rijdt de parkeerplaats op en verdwijnt uit beeld.
      await drive(vehicle, PARKING.z, 1900);
      guard(mine);
      await turnIntoParking(vehicle);
    } else {
      await drive(vehicle, ROAD.endIn, 3600);
    }
    guard(mine);
    removeVehicle(vehicle);
  } catch (error) {
    if (!(error instanceof Aborted)) throw error;
  }
}

/** Laat een voertuig bij de ingang door en stuurt het naar de plek waar het mag komen. */
async function letIn(vehicle: SimVehicle, key: string, zone: Zone, mine: number) {
  present.add(key);
  zoneOf.set(key, zone);
  world.barrier.in = true;
  barrierSound(true);
  await sleep(850);
  guard(mine);
  void onSite(vehicle, zone, mine);
  await sleep(1500);
  world.barrier.in = false;
}

// ---------- storingen: stroom en een defecte slagboom ----------

export type Fault = 'geen' | 'stroom' | 'defect';

function applyFault() {
  const { power, gateDefect } = get();
  // Bij een storing staat de uitgang open: niemand mag vast komen te zitten.
  world.fault = power === 'uit' || gateDefect;
  world.barrier.out = world.fault;
}

function reportFault(on: boolean, cause: 'stroom' | 'defect') {
  if (get().online) api.safety(on, cause).catch(() => { /* de slagboom werkt ook zonder dit logboek */ });
}

/** Zet een storing aan of uit in de simulatie. */
export function setFault(fault: Fault) {
  const { power, gateDefect } = get();
  const hadPower = power !== 'net';
  const wantsPower = fault === 'stroom';
  if (hadPower && !wantsPower) reportFault(false, 'stroom');
  if (gateDefect && fault !== 'defect') reportFault(false, 'defect');
  if (!hadPower && wantsPower) reportFault(true, 'stroom');
  if (!gateDefect && fault === 'defect') reportFault(true, 'defect');
  set({
    power: wantsPower ? (hadPower ? power : 'accu') : 'net',
    battery: wantsPower && hadPower ? get().battery : BATTERY_MINUTES,
    gateDefect: fault === 'defect',
    notice: fault === 'stroom' ? 'Stroomuitval: de slagboom werkt door op de noodaccu.'
      : fault === 'defect' ? 'De slagboom is defect. De uitgang staat open; bij de ingang bedient een medewerker hem met de hand.'
        : 'De storing is voorbij. Alles werkt weer normaal.',
  });
  applyFault();
  if (hadPower && !wantsPower && get().online) void flushQueue('De stroom is terug');
}

function updatePower(minutes: number) {
  if (get().power !== 'accu') return;
  const battery = Math.max(0, get().battery - minutes);
  if (battery > 0) {
    set({ battery });
    return;
  }
  set({ battery: 0, power: 'uit', notice: 'De noodaccu is leeg. Camera en slagboom zijn uit: een medewerker handelt de ingang met de hand af.' });
  chime();
  applyFault();
}

// ---------- intercom ----------

function ring(call: Call): Promise<boolean> {
  return new Promise((resolve) => {
    answerCall = resolve;
    set({ call });
    chime();
  });
}

/** Wat de slagboom nu met dit kenteken zou doen, zonder dat er een voertuig aankomt of iets wordt vastgelegd. */
export function checkPlate(plate: string): ScanResult {
  const permit = get().permits.find((p) => p.plate_key === plateKey(plate));
  return decideLocal(get().permits, { plate, type: permit?.vehicle_type ?? 'auto' }, world.minute);
}

export function answer(open: boolean) {
  const resolve = answerCall;
  answerCall = null;
  set({ call: null });
  resolve?.(open);
}

// ---------- de receptie neemt zelf op ----------

interface Plea { say: string; open: boolean; reply: string }

/** Boer Bert staat bij de slagboom en neemt de intercom op. */
const GATEKEEPER: { name: string; gender: Gender } = { name: 'Boer Bert', gender: 'man' };
let chooseLine: ((index: number) => void) | null = null;
let pleas: Plea[] = [];

/** "Familie Jansen" wordt in een zin "de familie Jansen"; "Henk (klusjesman)" wordt "Henk". */
const inSentence = (holder: string) => (holder.startsWith('Familie ') ? `de familie ${holder.slice(8)}` : holder.replace(/\s*\(.*\)$/, ''));
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function greetingOfDay(): string {
  const hour = Math.floor((world.minute % 1440) / 60);
  return hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
}

/** Wat de receptie op het scherm ziet staan, als gewone zin. */
function seenByReception(result: ScanResult, misread = false): string {
  if (misread) return 'Ik zie dat de camera uw kenteken door het weer niet kon lezen.';
  switch (result.code) {
    case 'unknown': return 'Ik zie dat uw kenteken niet bij ons bekend is.';
    case 'too_early': return 'Ik zie dat uw reservering nog niet is ingegaan.';
    case 'expired': return 'Ik zie dat uw reservering al is afgelopen.';
    case 'outside_window': return 'Ik zie dat u buiten uw vaste tijden bij de slagboom staat.';
    default: return 'Ik zie dat de slagboom voor u dicht blijft.';
  }
}

/** Wat de bestuurder kan zeggen, en wat de receptie daar volgens de regels van de camping op antwoordt. */
function pleasFor(result: ScanResult, plate: string, misread = false): Plea[] {
  const today = isoDate(world.minute);
  const guests = get().permits.filter((p) => p.category === 'guest' && p.arrival && p.departure
    && p.arrival <= today && today <= p.departure && p.plate_key !== plateKey(plate));
  const host = guests[Math.floor(Math.random() * guests.length)];
  const who = inSentence(result.holder);
  const walk = 'U kunt de auto buiten het terrein parkeren en te voet naar de receptie komen.';
  const list: Plea[] = [];

  if (misread) {
    // De camera las het kenteken niet: de bestuurder noemt het zelf en de receptie zoekt het op.
    const real = checkPlate(plate);
    list.push({
      say: `De camera leest mijn kenteken niet. Mijn kenteken is ${plate}.`, open: real.open,
      reply: real.open
        ? `Ik heb uw kenteken gevonden: ${lowerFirst(real.reason)}. Ik doe de slagboom handmatig voor u open.`
        : `Ik heb uw kenteken opgezocht: ${lowerFirst(real.reason)}. Daarom kan ik de slagboom niet voor u openen.`,
    });
  }
  if (result.code === 'outside_window') {
    list.push({
      say: `U spreekt met ${who}. Ik ben er vandaag op een ander tijdstip dan normaal.`, open: true,
      reply: 'Ik zie het. Uw kenteken is bij ons bekend, alleen bent u er nu buiten uw vaste tijden. Ik doe de slagboom voor u open.',
    });
  } else if (result.code === 'too_early') {
    list.push({
      say: `Wij zijn ${who}. We zijn eerder aangekomen dan gepland. Kunnen we er al in?`, open: false,
      reply: `Ik heb uw reservering gevonden, maar die gaat pas later in en uw plek is nu nog bezet. Met de auto kunt u het terrein daarom nog niet op. ${walk}`,
    });
  } else if (result.code === 'expired') {
    list.push({
      say: `Wij zijn ${who}. We zijn iets vergeten op onze plek. Mogen we er nog even in?`, open: false,
      reply: 'Uw reservering is afgelopen, dus met de auto kan ik u niet meer binnenlaten. Ik zoek het voor u op en breng het naar de slagboom.',
    });
  } else {
    if (host) {
      const family = inSentence(host.holder);
      list.push({
        say: `Ik kom op bezoek bij ${family}, op ${host.pitch}.`, open: true,
        reply: `Dat klopt, ${family} staat op ${host.pitch}. Ik doe de slagboom voor u open. U kunt parkeren op de parkeerplaats aan uw linkerhand.`,
      });
      list.push({
        say: `Ik hoor bij ${family}, op ${host.pitch}. Dit is een leenauto.`, open: true,
        reply: 'De naam en de plek kloppen met de reservering. Ik laat u binnen en noteer dit kenteken erbij. Een fijn verblijf gewenst!',
      });
    }
    list.push({
      say: 'Ik hoor bij de familie Koster, op plek 12. Wilt u de slagboom openen?', open: false,
      reply: 'Ik kan geen reservering vinden op naam van de familie Koster en uw kenteken is niet bij ons bekend. De toegang wordt geweigerd; de slagboom blijft dicht.',
    });
    list.push({
      say: 'Ik heb niet gereserveerd. Is er nog een plek vrij?', open: false,
      reply: 'Zonder reservering of afspraak heeft u geen toegang tot het terrein. De toegang wordt geweigerd; de slagboom blijft dicht.',
    });
    list.push({
      say: 'Ik kom een pakket bezorgen.', open: false,
      reply: 'Bezorgers zonder afspraak mogen het terrein niet op. De toegang wordt geweigerd; de slagboom blijft dicht.',
    });
  }
  list.push({ say: 'Laat maar, ik keer om.', open: false, reply: 'Geen probleem. Goede reis en tot ziens!' });
  return list.map((plea) => ({ ...plea, say: capital(plea.say) }));
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const addLine = (who: 'receptie' | 'jij', text: string, extra: Partial<Chat> = {}) => set((s) => (s.chat
  ? { chat: { ...s.chat, lines: [...s.chat.lines, { who, text }], ...extra } } : {}));

/** De receptie neemt op, luistert naar de bestuurder en beslist zelf of de slagboom open gaat. */
async function receptionCall(result: ScanResult, plate: string, mine: number, misread = false): Promise<boolean> {
  const { name, gender } = GATEKEEPER;
  pleas = pleasFor(result, plate, misread);
  set({ chat: { name, lines: [], options: [], status: 'De intercom gaat over…' }, driveMessage: '' });
  chime();
  await pause(2400);
  guard(mine);

  // Zonder Nederlandse stem op deze computer blijft het gesprek alleen tekst.
  const silent = get().muted || hasDutchVoice() ? '' : ' (geen Nederlandse stem gevonden: alleen tekst)';
  const greeting = `${greetingOfDay()}, camping De Groene Weide, u spreekt met ${name} bij de slagboom. ${seenByReception(result, misread)} Waarmee kan ik u helpen?`;
  addLine('receptie', greeting, { status: `Kies wat je zegt${silent}`, options: pleas.map((p) => p.say) });
  speak(greeting, gender);
  const index = await new Promise<number>((resolve) => { chooseLine = resolve; });
  guard(mine);

  const plea = pleas[index] ?? pleas[pleas.length - 1];
  stopSpeaking();
  addLine('jij', plea.say, { options: [], status: `${name} zoekt het op…` });
  await pause(1900);
  guard(mine);
  addLine('receptie', plea.reply, { status: plea.open ? 'Boer Bert opent de slagboom' : 'Boer Bert laat de slagboom dicht', done: true });
  speak(plea.reply, gender);
  // Het gesprek blijft nog even staan en sluit daarna vanzelf.
  const shown = get().chat;
  window.setTimeout(() => { if (get().chat?.lines.length === (shown?.lines.length ?? 0) && get().chat?.done) set({ chat: null }); }, 9000);
  return plea.open;
}

/** De bestuurder kiest wat hij door de intercom zegt. */
export function sayToReception(index: number) {
  const resolve = chooseLine;
  chooseLine = null;
  resolve?.(index);
}

export function closeChat() {
  if (get().chat?.done) set({ chat: null });
}

function waitForPlayerIntercom(): Promise<void> {
  return new Promise((resolve) => { playerIntercom = resolve; });
}

/** De bestuurder drukt zelf op de intercom nadat de plaat onleesbaar bleek. */
export function pressPlayerIntercom() {
  if (get().playerNeedsIntercom) {
    const resolve = playerIntercom;
    playerIntercom = null;
    set({ playerNeedsIntercom: false, driveMessage: 'Intercom wordt verbonden…' });
    resolve?.();
  }
}

function playerVehicle() {
  const vehicle = get().playerVehicle;
  return vehicle?.player ? vehicle : null;
}

function bumpVehicleControls() {
  set((state) => ({ controls: state.controls + 1 }));
}

export function toggleIndicator(side: 'left' | 'right') {
  const vehicle = playerVehicle();
  if (!vehicle) return;
  vehicle.indicator = vehicle.indicator === side ? null : side;
  turning = false;
  indicatorTick(Boolean(vehicle.indicator));
  bumpVehicleControls();
}

export function toggleWindows() {
  const vehicle = playerVehicle();
  if (!vehicle) return;
  vehicle.windowsOpen = !vehicle.windowsOpen;
  windowSound(vehicle.windowsOpen);
  bumpVehicleControls();
}

/** Zwaailicht en sirene van de hulpdienst aan of uit. */
export function toggleSiren() {
  const vehicle = playerVehicle();
  if (!vehicle || !EMERGENCY_TYPES.includes(vehicle.type)) return;
  vehicle.siren = !vehicle.siren;
  setSiren(vehicle.siren);
  bumpVehicleControls();
}

export function honk() {
  const vehicle = playerVehicle();
  if (!vehicle) return;
  vehicle.hornUntil = performance.now() + 450;
  hornSound();
  bumpVehicleControls();
}

// ---------- één passage ----------

/** Geen stroom: geen camera en geen intercom. Een medewerker controleert de lokale lijst en opent met de hand. */
async function arriveWithoutPower(sc: Scenario, vehicle: SimVehicle, mine: number) {
  const key = plateKey(sc.plate);
  const minute = world.minute;
  const local = decideLocal(get().permits, sc, minute);
  const open = await ring({
    plate: sc.plate, country: sc.country, holder: local.holder, since: performance.now(), manual: 'stroom',
    reason: local.open ? `Volgens de lokale lijst mag dit voertuig binnen: ${lowerFirst(local.reason)}` : `Volgens de lokale lijst niet: ${lowerFirst(local.reason)}`,
    message: 'De slagboom doet het niet. Kunt u mij helpen?',
  });
  guard(mine);
  if (!open) {
    await drive(vehicle, ROAD.spawnIn, 2600);
    removeVehicle(vehicle);
    return;
  }
  queueOffline(sc, minute, true, true, 'Met de hand geopend tijdens stroomuitval');
  await letIn(vehicle, key, zoneFor(local.category), mine);
}

async function arrive(sc: Scenario, vehicle: SimVehicle, mine: number) {
  const key = plateKey(sc.plate);
  const model = sc.model ?? VEHICLE_MODEL[sc.type];

  if (!vehicle.player) await drive(vehicle, ROAD.stopIn + VEHICLE_LENGTH[sc.type] / 2, 2600);
  guard(mine);
  // Bij ijzel of te veel sneeuw blijft de slagboom dicht: het voertuig wacht tot hij is vrijgemaakt.
  await gateFree(mine, vehicle);
  if (!vehicle.player && get().power === 'uit') {
    await arriveWithoutPower(sc, vehicle, mine);
    return;
  }
  const minute = world.minute;
  const heavy = WEATHER[get().weather].read[1] > 2;
  set({
    readout: {
      plate: sc.plate, country: sc.country, type: sc.type, model, status: 'reading', siren: isEmergency(sc.type, sc.siren),
      note: heavy ? `${WEATHER[get().weather].label}: de camera heeft meer tijd nodig (hooguit ${READ_LIMIT} seconden).` : undefined,
    },
  });
  const reading = await readPlate(mine);
  // Niet gelezen binnen 10 seconden: het systeem weet het kenteken niet en de intercom neemt het over.
  const misread = !reading.read && key !== UNREADABLE;
  const scanned = misread ? { ...sc, plate: UNREADABLE } : sc;
  const shown = { plate: scanned.plate, country: sc.country, type: sc.type, model, readSeconds: reading.seconds, siren: isEmergency(sc.type, sc.siren) };

  const remote = await scanRemote(scanned, minute);
  guard(mine);
  const result = remote ?? decideLocal(get().permits, scanned, minute);
  if (!result.open && plateKey(scanned.plate) === UNREADABLE) {
    result.reason = misread ? `Kenteken niet herkend binnen ${READ_LIMIT} seconden door het weer` : 'Kenteken niet herkenbaar door modder of regen';
  }
  set({ readout: { ...shown, status: 'done', open: result.open, reason: result.reason, holder: result.holder } });

  let open = result.open;
  let reason = result.reason;
  const manual = !open;
  if (!open) {
    if (vehicle.player) {
      set({
        playerNeedsIntercom: true,
        driveMessage: `De slagboom blijft dicht: ${lowerFirst(result.reason)}. Druk op de intercom (E) om te vragen of je naar binnen mag.`,
      });
      await waitForPlayerIntercom();
      guard(mine);
    }
    const since = performance.now();
    // Belt de gebruiker zelf aan, dan neemt de receptie op en beslist. Bij andere voertuigen is de gebruiker de receptie.
    open = vehicle.player ? await receptionCall(result, sc.plate, mine, misread) : await ring({
      plate: scanned.plate, country: sc.country, reason: result.reason, holder: result.holder, since,
      message: misread ? `Goedendag, de camera leest mijn kenteken niet door het weer. Mijn kenteken is ${sc.plate}. Mag ik naar binnen?`
        : sc.message ?? (result.code === 'unknown' && key !== UNREADABLE
        ? 'Goedendag, ik heb niet gereserveerd en de slagboom gaat niet open. Mag ik naar binnen?'
        : 'Goedendag, de slagboom gaat niet open. Mag ik naar binnen?'),
    });
    guard(mine);
    reason = `${open ? 'Door receptie binnengelaten' : 'Door receptie geweigerd'} (${lowerFirst(result.reason)})`;
    set({ readout: { ...shown, status: 'done', open, reason, holder: result.holder } });
    if (remote?.passage_id != null) {
      try {
        await api.decide(remote.passage_id, open);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) sessionExpired();
        set({ notice: 'Het antwoord van de receptie kon niet worden opgeslagen.' });
      }
      guard(mine);
    }
  }
  // AVG: een geweigerd kenteken wordt niet bewaard, dus ook niet later doorgestuurd.
  if (!remote && open) queueOffline(scanned, minute, open, manual, reason);
  if (open) await gateFree(mine, vehicle);
  if (open && !vehicle.player && get().gateDefect) {
    await ring({
      plate: sc.plate, country: sc.country, holder: result.holder, since: performance.now(), manual: 'defect',
      reason: 'Toegang is goedgekeurd, maar de slagboom beweegt niet', message: 'De slagboom gaat niet open.',
    });
    guard(mine);
  }
  // Tot waar dit voertuig mag. Las de camera het kenteken niet, dan geldt wat bij het genoemde kenteken hoort.
  const known = misread ? get().permits.find((p) => p.plate_key === key) : undefined;
  const zone = zoneFor(known?.category ?? result.category);

  if (vehicle.player) {
    // De gebruiker rijdt zelf: de slagboom blijft open tot de auto erdoor is.
    if (!open) {
      // Geweigerd: na het antwoord van de receptie begint de rit vanzelf opnieuw bij het kiezen van een kenteken.
      set({ driveMessage: 'Toegang geweigerd. De rit begint zo opnieuw.' });
      await pause(9000);
      guard(mine);
      if (get().playerVehicle === vehicle) {
        stopDriving();
        set({ chat: null, readout: null, driveMessage: 'Toegang geweigerd. Kies een kenteken om opnieuw te beginnen.' });
      }
      return;
    }
    present.add(key);
    zoneOf.set(key, zone);
    world.barrier.in = true;
    vehicle.cleared = true;
    barrierSound(true);
    set({ driveMessage: zone === 'camping'
      ? 'De slagboom is open. Rijd door naar de camping.'
      : 'De slagboom is open. De bezoekersparkeerplaats ligt links van de weg.' });
    while (get().playerVehicle === vehicle && vehicle.z > -7) {
      await new Promise((done) => setTimeout(done, 150));
      guard(mine);
    }
    vehicle.cleared = false;
    world.barrier.in = false;
    barrierSound(false);
    if (get().playerVehicle === vehicle) set({ driveMessage: zone === 'camping' ? 'Welkom. Via de baan UIT rijd je het terrein weer af.' : 'Welkom. Parkeer op de grote parkeerplaats links van de weg.' });
    return;
  }

  if (open) {
    await letIn(vehicle, key, zone, mine);
  } else {
    await drive(vehicle, ROAD.spawnIn, 2600); // achteruit terug naar de weg
    removeVehicle(vehicle);
  }
}

/** Bij de uitgang staat geen camera: de slagboom gaat voor elk voertuig open en het systeem legt niets vast. */
async function depart(sc: Scenario, vehicle: SimVehicle, mine: number) {
  await drive(vehicle, ROAD.stopOut - VEHICLE_LENGTH[sc.type] / 2, 2600);
  guard(mine);
  // Ook de uitgang blijft dicht zolang de veiligheidsvergrendeling aan staat.
  await gateFree(mine);
  present.delete(plateKey(sc.plate));

  world.barrier.out = true;
  barrierSound(true);
  await sleep(850);
  guard(mine);
  void drive(vehicle, ROAD.endOut, 3200).then(() => removeVehicle(vehicle));
  await sleep(1500);
  world.barrier.out = world.fault;
}

async function run(sc: Scenario, mine: number) {
  guard(mine);
  // Wegrijden kan alleen als het voertuig ook echt binnen staat.
  if (sc.dir === 'out' && !present.has(plateKey(sc.plate))) return;

  // Staat het voertuig op de parkeerplaats, dan rijdt het eerst uit zijn vak.
  const parked = sc.dir === 'out' ? parkedIn.get(bayOf.get(plateKey(sc.plate))?.index ?? -1) : undefined;
  if (parked) {
    const voice = carVoice(hasCarBody(parked.type) ? (parked.model === 'Tesla Model 3' ? 'elektrisch' : 'auto') : 'zwaar');
    if (voice) voiceOf.set(parked, voice);
    try {
      await unpark(parked, plateKey(sc.plate), mine);
      await depart(sc, parked, mine);
    } catch (error) {
      if (!(error instanceof Aborted)) removeVehicle(parked);
    }
    return;
  }

  const vehicle: SimVehicle = {
    id: nextId++, plate: sc.plate, country: sc.country, type: sc.type, color: sc.color, siren: isEmergency(sc.type, sc.siren),
    model: sc.model ?? (sc.type === 'auto' ? CAR_MODELS[nextId % CAR_MODELS.length] : VEHICLE_MODEL[sc.type]),
    lane: sc.dir,
    // Wie alleen op de parkeerplaats mocht, vertrekt ook daarvandaan.
    z: sc.dir === 'in' ? ROAD.spawnIn : zoneOf.get(plateKey(sc.plate)) === 'parkeren' ? PARKING.z : ROAD.spawnOut,
  };
  set((s) => ({ vehicles: [...s.vehicles, vehicle] }));
  const voice = carVoice(vehicle.siren ? 'sirene' : hasCarBody(sc.type) ? (vehicle.model === 'Tesla Model 3' ? 'elektrisch' : 'auto') : 'zwaar');
  if (voice) voiceOf.set(vehicle, voice);
  try {
    if (sc.dir === 'out') {
      await depart(sc, vehicle, mine);
      return;
    }
    await arrive(sc, vehicle, mine);
    set((s) => ({ passages: s.passages + 1 }));
    void refresh();
  } catch (error) {
    if (error instanceof Aborted) return;
    removeVehicle(vehicle);
    set({ notice: error instanceof Error ? error.message : 'Er ging iets mis bij deze passage.' });
  }
}

function plan(sc: Scenario) {
  const mine = epoch;
  const lane = sc.dir;
  set((s) => ({ queue: { ...s.queue, [lane]: s.queue[lane] + 1 } }));
  chain[lane] = chain[lane]
    .then(() => run(sc, mine))
    .catch(() => undefined)
    .finally(() => {
      if (mine === epoch) set((s) => ({ queue: { ...s.queue, [lane]: Math.max(0, s.queue[lane] - 1) } }));
    });
}

// ---------- de dienst ----------

// ---------- weer en veiligheidsvergrendeling ----------

/** Het moment waarop er ijs op de slagboom ligt; null als het niet ijzelt. */
let iceAt: number | null = null;
let lockedSince = 0;

function resetWeather() {
  iceAt = null;
  Object.assign(world, { weather: 'helder', snow: 0, ice: false, locked: false, heater: false });
  setWeatherSound(0, 3000);
}

export function setWeather(weather: Weather) {
  const info = WEATHER[weather];
  world.weather = weather;
  world.heater = heaterOn(weather);
  iceAt = weather === 'ijzel' ? world.minute + ICE_AFTER_MINUTES : null;
  setWeatherSound(info.sound[0], info.sound[1]);
  set({ weather });
  updateWeather(0);
}

/** Sneeuw hoopt zich op en smelt weer, ijs vormt zich bij ijzel. Bij te veel sneeuw of ijs vergrendelt de slagboom. */
function updateWeather(minutes: number) {
  const info = WEATHER[world.weather];
  if (info.falls === 'sneeuw') world.snow += (SNOW_PER_HOUR / 60) * minutes;
  else if (info.temperature > 0) world.snow = Math.max(0, world.snow - (MELT_PER_HOUR / 60) * minutes);
  world.ice = iceAt !== null && world.minute >= iceAt;

  const lock: GateLock | null = world.ice ? 'ijzel' : world.snow >= SNOW_LOCK_CM ? 'sneeuw' : null;
  const shown = Math.round(world.snow);
  if (shown !== get().snowCm) set({ snowCm: shown });
  if (lock !== get().gateLock) {
    const before = get().gateLock;
    world.locked = Boolean(lock);
    lockedSince = world.minute;
    set({
      gateLock: lock,
      notice: lock
        ? `Veiligheidsvergrendeling: ${lock === 'ijzel' ? 'ijzel op de slagboom' : 'te veel sneeuw bij de slagboom'}. De slagbomen blijven dicht.`
        : 'De slagboom is weer vrij. De veiligheidsvergrendeling is opgeheven.',
    });
    if (lock) chime();
    reportSafety(Boolean(lock), lock ?? before ?? 'sneeuw');
  }
  // Rijd je zelf, dan is er niemand achter de receptie: de beheerder maakt de slagboom na een poos vrij.
  if (lock && get().mode === 'zelf_rijden' && world.minute - lockedSince >= KEEPER_MINUTES) clearGate();
}

function reportSafety(locked: boolean, cause: GateLock) {
  if (!get().online) return;
  api.safety(locked, cause).catch(() => { /* het auditlog is hier niet nodig om veilig te blijven */ });
}

/** De beheerder heeft sneeuw geruimd en gestrooid: de slagboom mag weer open. */
export function clearGate() {
  world.snow = 0;
  if (iceAt !== null) iceAt = world.minute + SALT_LASTS_MINUTES;
  updateWeather(0);
}

const lockText = () => (get().gateLock === 'ijzel'
  ? 'De slagboom is vergrendeld door ijzel. Wacht tot de beheerder heeft gestrooid.'
  : 'De slagboom is vergrendeld door sneeuw. Wacht tot de beheerder de sneeuw heeft geruimd.');

/** Wacht tot de veiligheidsvergrendeling is opgeheven. */
async function gateFree(mine: number, vehicle?: SimVehicle) {
  while (get().gateLock) {
    if (vehicle?.player && get().driveMessage !== lockText()) set({ driveMessage: lockText() });
    await pause(250);
    guard(mine);
  }
}

/** De camera leest het kenteken. Bij zware neerslag duurt dat langer; na 10 seconden geeft hij het op. */
async function readPlate(mine: number): Promise<{ seconds: number; read: boolean }> {
  const info = WEATHER[get().weather];
  const read = Math.random() >= info.failChance;
  const seconds = read ? info.read[0] + Math.random() * (info.read[1] - info.read[0]) : READ_LIMIT;
  world.beam.in = true;
  await sleep(seconds * 1000);
  world.beam.in = false;
  guard(mine);
  set({ lastRead: { seconds, read } });
  return { seconds, read };
}

function stopClock() {
  window.clearInterval(timer);
  timer = undefined;
}

let dayPaused = false;

function tick() {
  if (world.paused) return;
  world.minute += (0.1 / SECONDS_PER_MINUTE) * world.speed;
  const minute = Math.floor(world.minute);
  if (minute !== get().minute) set({ minute });
  updateAmbience(daylight(world.minute));
  updateWeather((0.1 / SECONDS_PER_MINUTE) * world.speed);
  updatePower((0.1 / SECONDS_PER_MINUTE) * world.speed);
  if (get().mode !== 'simulatie') return;
  while (deck.length && deck[0].at <= world.minute) plan(deck.shift()!);

  const { queue } = get();
  if (world.minute >= SHIFT_END && !deck.length && queue.in === 0 && queue.out === 0 && !dayPaused) {
    dayPaused = true;
    stopClock();
    set({ notice: 'De geplande dag is afgerond. Je kunt de slagboom en je eigen auto nog steeds gebruiken.' });
  }
}

export async function startShift(mode: SessionMode = 'simulatie') {
  world.paused = false;
  stopClock();
  epoch++;
  answerCall = null;
  dayPaused = false;
  world.minute = SHIFT_START;
  world.speed = 1;
  world.barrier.in = world.barrier.out = world.fault = false;
  zoneOf.clear();
  clearParking();
  world.beam.in = false;
  resetWeather();
  resetPlayer();
  silenceAll();
  const permitsBefore = get().permits;
  set({ ...fresh, mode });

  const begin = (permits: Permit[], presence: PresenceRow[]) => {
    present.clear();
    presence.forEach((p) => {
      present.add(p.plate_key);
      zoneOf.set(p.plate_key, zoneFor(p.category));
    });
    set({ vehicles: [] });
    presence.filter((p) => zoneFor(p.category) === 'parkeren').forEach(parkAtStart);
    deck = mode === 'simulatie' ? buildDeck(permits, new Set(present)) : [];
    set({ permits, presence, log: [], phase: 'playing' });
    startAmbience();
    updateAmbience(daylight(world.minute));
    timer = window.setInterval(tick, 100);
  };

  try {
    await api.reset();
    const [permits, presence] = await Promise.all([api.permits(), api.presence()]);
    offlineQueue = [];
    saveLocal({ permits, queue: [] });
    begin(permits, presence);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      set({ user: null, phase: 'login' });
      return;
    }
    // Server weg: met de lokale kentekenlijst draait de slagboom gewoon door.
    if (permitsBefore.length) {
      set({ online: false, pendingSync: offlineQueue.length, notice: 'De server is niet bereikbaar. De slagboom werkt met de lokale kentekenlijst.' });
      begin(permitsBefore, []);
      return;
    }
    set({ phase: 'ready', notice: 'De dienst kon niet starten: de server is niet bereikbaar.' });
  }
}

export function setSpeed(speed: 1 | 2) {
  world.speed = speed;
  set({ speed });
}

// ---------- zelf rijden ----------

const LANE_IN = 3.3;
let playerChecked = false;
/** Het parkeervak waarin de zelf bestuurde auto als laatste is stilgezet. */
let playerBay: number | null = null;
let playerBusy = false;
let exitOpen = false;
/** De bocht waarvoor richting is aangegeven, is ingezet. */
let turning = false;
function resetPlayer() {
  playerChecked = playerBusy = exitOpen = turning = false;
  playerBay = null;
  chooseLine = null;
  stopSpeaking();
  windowSound(false, true);
  playerIntercom = null;
  stopEngine();
}

/** Start een rit: de auto staat op de oprit, met de neus naar de camping. */
export function startDriving(plateInput = 'T-902-BZ', model = 'Volkswagen Golf', color = '#b8322a', type: VehicleType = 'auto') {
  if (get().phase !== 'playing' || get().mode !== 'zelf_rijden' || get().playerVehicle) return;
  // Een kenteken uit de database wordt precies zo overgenomen; een zelf getypt kenteken wordt eerst opgeschoond.
  const permit = get().permits.find((item) => item.plate_key === plateKey(plateInput));
  const plate = permit?.plate ?? cleanDutchPlateInput(plateInput.trim()).replace(/^-+|-+$/g, '');
  if (plate.length < 3) {
    set({ driveMessage: 'Kies een kenteken uit de lijst of vul er zelf een in, bijvoorbeeld T-902-BZ.' });
    return;
  }
  // Een zelf getypt kenteken moet een echt Nederlands kenteken kunnen zijn (regels van de RDW).
  const problem = permit ? null : dutchPlateProblem(plate);
  if (problem) {
    set({ driveMessage: problem });
    return;
  }
  const vehicle: SimVehicle = {
    id: nextId++, plate: permit?.plate ?? formatPlate(plate, 'NL'), country: permit?.country ?? 'NL',
    type, color,
    model, player: true, offset: 0, indicator: null, windowsOpen: false, hornUntil: 0,
    lane: 'in', z: 46, speed: 0, heading: 0, steer: 0, odo: 0, cleared: false,
  };
  resetPlayer();
  startEngine(model);
  set((s) => ({
    vehicles: [...s.vehicles, vehicle],
    playerVehicle: vehicle,
    driving: true,
    speedKmh: 0,
    driveMessage: EMERGENCY_TYPES.includes(type)
      ? 'Zet zwaailicht en sirene aan met L: dan herkent de camera je als hulpdienst en gaat de slagboom altijd open.'
      : 'Geef gas met W en stuur met A en D. De camera bij de slagboom leest je kenteken vanzelf.',
  }));
}

/** Stopt de rit en haalt de auto weg. */
export function stopDriving() {
  const vehicle = get().playerVehicle;
  if (vehicle) removeVehicle(vehicle);
  if (exitOpen) world.barrier.out = false;
  resetPlayer();
  set({ driveMessage: '', playerNeedsIntercom: false, speedKmh: 0 });
}

/** Terug naar het keuzescherm: automatische kentekenherkenning of zelf rijden. */
export function backToMenu() {
  world.paused = false;
  stopClock();
  epoch++;
  answerCall = null;
  world.barrier.in = world.barrier.out = false;
  world.beam.in = false;
  resetWeather();
  resetPlayer();
  silenceAll();
  stopAmbience();
  clearParking();
  set({ ...fresh, phase: 'ready' });
}

/** Opent het overzichtsportaal. Loopt er een simulatie, dan stopt die eerst: het portaal staat er los van. */
/** Opent het overzichtsportaal. Een lopende simulatie pauzeert: klok, voertuigen en geluid staan stil. */
export function openPortal() {
  world.paused = get().phase === 'playing';
  if (world.paused) setMuted(true);
  set({ portal: true });
}

/** Terug naar de simulatie: die loopt verder waar hij was. */
export function closePortal() {
  if (world.paused) setMuted(get().muted);
  world.paused = false;
  set({ portal: false });
}

export function toggleView() {
  set((s) => ({ view: s.view === 'binnen' ? 'buiten' : 'binnen' }));
}

export function toggleMute() {
  const muted = !get().muted;
  setMuted(muted);
  set({ muted });
}

/** Plek en richting van de zelf bestuurde auto in de 3D-wereld. */
export function playerPose(vehicle: SimVehicle) {
  return { x: LANE_IN + (vehicle.offset ?? 0), z: vehicle.z, heading: vehicle.heading ?? 0 };
}

const LANE_X: Record<Direction, number> = { in: LANE_IN, out: -LANE_IN };

/** De ruimte die een voertuig op de grond inneemt. */
function footprint(vehicle: SimVehicle, x: number, z: number, heading: number): Box {
  if (hasCarBody(vehicle.type)) {
    const spec = specOf(vehicle.model);
    return { x, z, halfW: spec.W / 2, halfL: spec.L / 2, turn: heading };
  }
  return { x, z, halfW: vehicle.type === 'vrachtwagen' || vehicle.type === 'brandweer' ? 1.2 : 1.03, halfL: VEHICLE_LENGTH[vehicle.type] / 2, turn: heading };
}

const boxOf = (vehicle: SimVehicle): Box => (vehicle.player
  ? footprint(vehicle, LANE_IN + (vehicle.offset ?? 0), vehicle.z, vehicle.heading ?? 0)
  : vehicle.pose ? footprint(vehicle, vehicle.pose.x, vehicle.pose.z, vehicle.pose.heading)
  : footprint(vehicle, LANE_X[vehicle.lane], vehicle.z, 0));

/** Plek en draaiing (om de y-as, zoals de rechthoek op de grond) van elk voertuig, voor de kaart. */
export function groundBox(vehicle: SimVehicle): Box {
  return boxOf(vehicle);
}

/** Staat de zelf bestuurde auto vlak voor dit voertuig op dezelfde baan? */
function playerAhead(vehicle: SimVehicle, direction: number): boolean {
  const player = get().playerVehicle;
  if (!player || player === vehicle || !direction) return false;
  const own = boxOf(vehicle);
  return corners(boxOf(player)).some(([x, z]) => {
    const ahead = (z - own.z) * direction;
    return Math.abs(x - own.x) < own.halfW + 0.15 && ahead > 0 && ahead < own.halfL + 1.6;
  });
}

/** Rijdt de auto op deze plek tegen een ander voertuig aan? Wegrijden van een voertuig dat al raakt, mag altijd. */
function hitsVehicle(vehicle: SimVehicle, next: Box): boolean {
  const now = boxOf(vehicle);
  return get().vehicles.some((other) => {
    if (other === vehicle) return false;
    const box = boxOf(other);
    if (!boxesOverlap(next, box)) return false;
    const closer = Math.hypot(next.x - box.x, next.z - box.z) < Math.hypot(now.x - box.x, now.z - box.z);
    return closer || !boxesOverlap(now, box);
  });
}

/** Waar de auto niet kan komen: eiland, hek, heg, een dichte slagboom, alles wat op de camping staat en andere voertuigen. */
function blocked(x: number, z: number, heading: number, vehicle: SimVehicle): boolean {
  if (Math.abs(x) > 110 || z > 63.5 || z < -95) return true;
  const car = footprint(vehicle, x, z, heading);
  if (hitsVehicle(vehicle, car)) return true;
  // Het hek langs de oprit: ook met een hoek van de auto kom je er niet doorheen.
  if (corners(car).some(([cx, cz]) => cz > 4.4 && cz < 54 && Math.abs(cx) > 6)) return true;
  if (z > 55) return false; // openbare weg
  if (Math.abs(x) < 2.3 && z > -3.6 && z < 13.6) return true; // eiland
  if (z > -2.4 && z < 4.4) {
    // de erfgrens: alleen door een open slagboom
    const viaIn = vehicle.cleared && x > 2.2 && x < 4.7;
    const viaOut = exitOpen && x < -2.2 && x > -4.7;
    if (!(viaIn || viaOut)) return true;
    return hitsScenery(car); // Boer Bert en zijn bedieningskast
  }
  if (z >= 4.4 && Math.abs(x) > 5.2) return true; // hek langs de oprit
  return hitsScenery(car); // receptie, caravans, tenten, bomen, palen en geparkeerde auto's
}

export interface DriveInput { throttle: number; steer: number; brake: boolean }

/** Wat het voertuig technisch haalt, in meter per seconde. */
const TOP_SPEED = 16.5;

/** Maximumsnelheid in km/u: 30 op de weg en de oprit, 15 op het terrein. Hulpdiensten hebben geen limiet (null). */
export function speedLimit(z: number, type: VehicleType = 'auto'): number | null {
  if (EMERGENCY_TYPES.includes(type)) return null;
  return z < 0 ? 15 : 30;
}

/** Eén stap van de rijsimulatie: gas, rem, sturen en botsen. Wordt elk beeld aangeroepen. */
export function stepPlayer(delta: number, input: DriveInput) {
  const vehicle = get().playerVehicle;
  if (!vehicle?.player) return;
  const dt = Math.min(delta, 0.05);
  let speed = vehicle.speed ?? 0;
  const heading = vehicle.heading ?? 0;

  if (input.brake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), 14 * dt);
  else if (input.throttle > 0) speed += (speed < 0 ? 9 : 3.4 * (1 - speed / 17)) * dt;
  else if (input.throttle < 0) speed -= (speed > 0.3 ? 9 : 2.4) * dt;
  else speed -= Math.sign(speed) * Math.min(Math.abs(speed), 1.1 * dt);
  // De auto houdt zich aan de maximumsnelheid. Rijd je het terrein op, dan remt hij rustig af naar 15 km/u.
  const allowed = speedLimit(vehicle.z, vehicle.type);
  const limit = allowed === null ? TOP_SPEED : allowed / 3.6;
  if (speed > limit) speed = Math.max(limit, speed - 5 * dt);
  speed = Math.max(-Math.min(4.5, limit), speed);

  // Het stuur draait soepel mee en veert terug; bij hogere snelheid stuurt de auto minder scherp in.
  const steer = (vehicle.steer ?? 0) + (input.steer - (vehicle.steer ?? 0)) * Math.min(1, dt * (input.steer ? 4 : 6));
  vehicle.steer = steer;
  // Net als in een echte auto springt de richtingaanwijzer uit zodra het stuur na de bocht terugdraait.
  if (vehicle.indicator) {
    const into = vehicle.indicator === 'right' ? steer : -steer;
    if (into > 0.45 && Math.abs(speed) > 0.5) turning = true;
    else if (turning && into < 0.08) {
      turning = false;
      vehicle.indicator = null;
      bumpVehicleControls();
    }
  }
  const wheelAngle = (steer * 0.62) / (1 + Math.abs(speed) * 0.1);
  const nextHeading = heading - ((speed * Math.tan(wheelAngle)) / 2.7) * dt;
  const x = LANE_IN + (vehicle.offset ?? 0);
  const nextX = x - Math.sin(nextHeading) * speed * dt;
  const nextZ = vehicle.z - Math.cos(nextHeading) * speed * dt;

  if (blocked(nextX, nextZ, nextHeading, vehicle)) {
    if (Math.abs(speed) > 3) bump();
    speed = 0;
  } else {
    vehicle.heading = nextHeading;
    vehicle.offset = nextX - LANE_IN;
    vehicle.z = nextZ;
    vehicle.odo = (vehicle.odo ?? 0) + speed * dt;
  }
  vehicle.speed = speed;
  // Netjes in een parkeervak gezet: de bestuurder ziet in welk vak hij staat.
  const bay = Math.abs(speed) < 0.05 ? bayUnder(LANE_IN + (vehicle.offset ?? 0), vehicle.z, vehicle.heading ?? 0) : null;
  if (bay && bay.index !== playerBay) {
    playerBay = bay.index;
    set({ driveMessage: `Netjes geparkeerd in vak ${bay.number}. Wil je weer weg? Rijd via de baan UIT het terrein af.` });
  } else if (!bay && Math.abs(speed) > 1) playerBay = null;
  const kmh = Math.round(Math.abs(speed) * 3.6);
  if (kmh !== get().speedKmh) set({ speedKmh: kmh });

  // De camera leest het kenteken zodra de auto op de inrijbaan de slagboom nadert.
  const towardsCamp = Math.cos(vehicle.heading ?? 0);
  if (!playerChecked && !playerBusy && !vehicle.cleared && towardsCamp > 0.6 && nextX > 1.9 && nextX < 5 && vehicle.z < 8.5 && vehicle.z > 4) {
    playerChecked = true;
    checkPlayer(vehicle);
  }
  if (playerChecked && !playerBusy && vehicle.z > 16) playerChecked = false;

  // Uitrijden mag altijd: de slagboom bij de uitgang gaat vanzelf open, zonder het kenteken te lezen.
  if (!exitOpen && towardsCamp < -0.6 && vehicle.z < -2.4 && vehicle.z > -10 && x < -1.9 && x > -5) leave(vehicle);
  if (exitOpen && (vehicle.z > 8 || vehicle.z < -14)) {
    exitOpen = false;
    world.barrier.out = false;
    barrierSound(false);
  }
}

function playerScenario(vehicle: SimVehicle): Scenario {
  return { at: world.minute, dir: 'in', plate: vehicle.plate, country: vehicle.country, type: vehicle.type, model: vehicle.model, color: vehicle.color, siren: Boolean(vehicle.siren) };
}

function checkPlayer(vehicle: SimVehicle) {
  const mine = epoch;
  playerBusy = true;
  set({ driveMessage: 'De camera leest je kenteken…', playerNeedsIntercom: false });
  void arrive(playerScenario(vehicle), vehicle, mine)
    .then(() => {
      set((s) => ({ passages: s.passages + 1 }));
      void refresh();
    })
    .catch((error) => {
      if (error instanceof Aborted) return;
      set({ driveMessage: error instanceof Error ? error.message : 'De rit kon niet worden afgehandeld.' });
    })
    .finally(() => { if (mine === epoch) playerBusy = false; });
}

function leave(vehicle: SimVehicle) {
  if (get().gateLock) {
    if (get().driveMessage !== lockText()) set({ driveMessage: lockText() });
    return;
  }
  exitOpen = true;
  world.barrier.out = true;
  barrierSound(true);
  present.delete(plateKey(vehicle.plate));
  set({ driveMessage: 'Tot ziens! De slagboom bij de uitgang gaat vanzelf open. Binnen je verblijf mag je gewoon terugkomen.' });
}

/** De gebruiker stuurt zelf een voertuig naar de slagboom. */
export function sendCustom(plateInput: string, country?: Country): string {
  if (get().phase !== 'playing') return 'Start eerst een simulatie; daarna kan dit kenteken naar de slagboom.';
  // Bij zelf rijden rijd alleen jij: er komen geen andere auto's naar de slagboom.
  if (get().mode !== 'simulatie') return 'Bij zelf rijden komen er geen andere auto’s. Kies "Automatische kentekenherkenning" om auto’s te laten aankomen.';
  const plate = plateInput.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!/^[A-Z0-9][A-Z0-9 -]{1,12}[A-Z0-9]$/.test(plate)) return 'Vul een kenteken in van 3 tot 14 letters, cijfers of streepjes.';
  const permit = get().permits.find((p) => p.plate_key === plateKey(plate));
  // Een Nederlands kenteken dat de RDW zo nooit uitgeeft, kan niet aankomen (de camera gebruikt dezelfde regels).
  const problem = !permit && country === 'NL' ? dutchPlateProblem(plate) : null;
  if (problem) return problem;
  plan({
    at: world.minute, dir: 'in', plate: permit?.plate ?? plate, country: permit?.country ?? country ?? 'NL',
    type: permit?.vehicle_type ?? 'auto', model: permit?.vehicle_type === 'auto' ? CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)] : undefined,
    color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
  });
  return '';
}

export async function reloadPermits() {
  set({ permits: await api.permits() });
}

// ---------- inloggen ----------

export async function boot() {
  try {
    const user = await api.me();
    const permits = await api.permits();
    saveLocal({ user, permits });
    set({ user, permits, phase: 'ready' });
  } catch (error) {
    // Server weg (geen sessieprobleem): verder met de lokale kopie, ook na opnieuw laden van de pagina.
    const local = !(error instanceof ApiError) || error.status >= 500 ? loadLocal() : null;
    if (local) {
      offlineQueue = local.queue;
      set({ user: local.user, permits: local.permits, online: false, pendingSync: local.queue.length, phase: 'ready', notice: 'De server is niet bereikbaar. De slagboom werkt met de lokale kentekenlijst.' });
      return;
    }
    set({ phase: 'login' });
  }
}

export async function logout() {
  stopClock();
  epoch++;
  try {
    await api.logout();
  } catch {
    /* de cookie verloopt vanzelf */
  }
  resetWeather();
  resetPlayer();
  silenceAll();
  stopAmbience();
  clearLocal();
  offlineQueue = [];
  clearParking();
  set({ user: null, phase: 'login', ...fresh });
}
