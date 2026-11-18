// Alle geluiden van de simulatie, gemaakt in de browser (Web Audio): motor, rijwind, claxon,
// richtingaanwijzer, slagboom en de bel van de intercom. Er worden geen geluidsbestanden geladen.
let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!window.AudioContext) return null;
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(context.destination);
  }
  void context.resume();
  return { ctx: context, out: master! };
}

export function setMuted(value: boolean) {
  muted = value;
  if (value) window.speechSynthesis?.cancel();
  if (master && context) master.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, 0.03);
}

// ---------- de stem van de receptie ----------
// De browser levert de stemmen. Alleen een Nederlandse stem wordt gebruikt: een Engelse stem die Nederlands
// voorleest klinkt nergens naar, dan liever alleen tekst.

export type Gender = 'man' | 'vrouw';

let dutchVoices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  dutchVoices = window.speechSynthesis.getVoices().filter((voice) => /^nl([-_]|$)/i.test(voice.lang));
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  // Stemmen komen in de meeste browsers pas even na het laden beschikbaar.
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

// De browser zegt niet of een stem van een man of een vrouw is; dat halen we uit de naam van de stem.
const FEMALE_VOICE = /colette|fenna|hanna|dena|ellen|claire|lotte|laura|saskia|google nederlands|female|vrouw/i;
const MALE_VOICE = /frank|maarten|arnaud|xander|bart|willem|\bmale\b|\bman\b/i;

function genderOf(voice: SpeechSynthesisVoice): Gender | null {
  if (FEMALE_VOICE.test(voice.name)) return 'vrouw';
  if (MALE_VOICE.test(voice.name)) return 'man';
  return null;
}

/** Hoe goed een stem is: Nederlands uit Nederland en de natuurlijke (online) stemmen gaan voor. */
function quality(voice: SpeechSynthesisVoice): number {
  return (/^nl[-_]nl/i.test(voice.lang) ? 2 : 0) + (/natural|online|neural|google/i.test(voice.name) ? 1 : 0);
}

export function hasDutchVoice(): boolean {
  if (!dutchVoices.length && window.speechSynthesis) loadVoices();
  return dutchVoices.length > 0;
}

/** Laat de receptie hardop praten met een Nederlandse mannen- of vrouwenstem. Zonder Nederlandse stem blijft het stil. */
export function speak(text: string, gender: Gender = 'vrouw') {
  if (muted || !window.speechSynthesis || !hasDutchVoice()) return;
  const best = (list: SpeechSynthesisVoice[]) => [...list].sort((a, b) => quality(b) - quality(a))[0];
  const matching = best(dutchVoices.filter((voice) => genderOf(voice) === gender));
  const voice = matching ?? best(dutchVoices);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 1;
  // Is er geen stem van het juiste geslacht, dan maakt de toonhoogte het verschil.
  utterance.pitch = matching ? 1 : genderOf(voice) === null ? (gender === 'man' ? 0.8 : 1.15) : gender === 'man' ? 0.6 : 1.45;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

/** Korte toon met een zachte in- en uitloop. */
function tone(frequency: number, delay: number, length: number, volume: number, type: OscillatorType = 'sine', endFrequency = frequency) {
  const a = audio();
  if (!a) return;
  const start = a.ctx.currentTime + delay;
  const oscillator = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.03, length / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(a.out);
  oscillator.start(start);
  oscillator.stop(start + length + 0.02);
}

/** De bel van de intercom bij de receptie: twee keer een ding-dong. */
export function chime() {
  [[660, 0], [520, 0.28], [660, 0.9], [520, 1.18]].forEach(([frequency, delay]) => tone(frequency, delay, 0.5, 0.2));
}

export function hornSound() {
  tone(392, 0, 0.45, 0.16, 'sawtooth');
  tone(494, 0, 0.45, 0.12, 'sawtooth');
}

/** Tik van de richtingaanwijzer: hoog bij aan, laag bij uit. */
export function tick(on: boolean) {
  tone(on ? 1900 : 1400, 0, 0.035, 0.08, 'square');
}

/** Piepje van de slagboom die opengaat of sluit. */
export function barrierSound(open: boolean) {
  if (open) { tone(880, 0, 0.12, 0.1); tone(1320, 0.14, 0.18, 0.1); } else tone(520, 0, 0.2, 0.08);
  tone(90, 0.05, 0.9, 0.05, 'sawtooth', 70); // zoemende motor van de arm
}

/** Zoemend motortje van het raam; met het raam open hoor je meer rijwind. */
let windowOpen = false;
export function windowSound(open: boolean, silent = false) {
  windowOpen = open;
  if (silent) return;
  tone(open ? 330 : 290, 0, 0.85, 0.05, 'sawtooth', open ? 290 : 330);
  tone(120, 0.85, 0.06, 0.12, 'triangle', 70);
}

/** Doffe tik als je ergens tegenaan rijdt. */
export function bump() {
  tone(110, 0, 0.18, 0.25, 'triangle', 50);
}

/** Portier dicht en starten. */
export function startSound() {
  tone(140, 0, 0.5, 0.14, 'sawtooth', 60);
  tone(70, 0.1, 0.45, 0.16, 'square', 95);
}

// ---------- motorgeluid ----------
// Elke auto heeft een eigen motor. Het geluid wordt opgebouwd uit de ontstekingsfrequentie (toerental x
// aantal cilinders), met per motor een eigen klankkleur, rauwheid, uitlaatgrom en eventueel een turbofluit.

interface EngineSound {
  /** Aantal cilinders; 0 is een elektromotor. */
  cylinders: number;
  idle: number;
  redline: number;
  /** Sterkte van de boventonen: bepaalt de klankkleur. */
  harmonics: number[];
  /** Diepe grom een octaaf onder de ontsteking. */
  growl: number;
  /** Rauwheid (vervorming) van de uitlaat. */
  rasp: number;
  /** Hoe ver het filter opengaat: dof (laag) tot scherp (hoog). */
  bright: number;
  /** Turbofluit bij gas geven. */
  turbo: number;
  volume: number;
}

const ENGINES: Record<string, EngineSound> = {
  // zware diesel van de ambulance en de brandweerwagen
  'Mercedes Sprinter ambulance': { cylinders: 4, idle: 700, redline: 4200, harmonics: [1, 0.7, 0.4, 0.2, 0.1], growl: 0.45, rasp: 2, bright: 0.5, turbo: 0.2, volume: 1 },
  'Scania brandweerwagen': { cylinders: 6, idle: 600, redline: 2800, harmonics: [1, 0.8, 0.5, 0.25, 0.12], growl: 0.6, rasp: 2.4, bright: 0.4, turbo: 0.25, volume: 1.1 },
  // viercilinder turbo: beschaafd en gelijkmatig
  'Volkswagen Golf': { cylinders: 4, idle: 800, redline: 6000, harmonics: [1, 0.5, 0.28, 0.12, 0.06], growl: 0.25, rasp: 1.5, bright: 0.8, turbo: 0.25, volume: 0.9 },
  // zes-in-lijn: hees, metalig en luid, met een grommende uitlaat
  'BMW M2': { cylinders: 6, idle: 900, redline: 7200, harmonics: [1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.12], growl: 0.6, rasp: 5, bright: 1.5, turbo: 0.35, volume: 1.2 },
  // V6 biturbo: diep en brommend, met duidelijke turbofluit
  'Audi RS4 Avant': { cylinders: 6, idle: 850, redline: 6700, harmonics: [1, 0.9, 0.4, 0.5, 0.2, 0.25, 0.1], growl: 0.85, rasp: 3.5, bright: 1.15, turbo: 0.6, volume: 1.15 },
  // driecilinder: roffelend, wat rommelig
  'Opel Corsa F': { cylinders: 3, idle: 900, redline: 6000, harmonics: [1, 0.7, 0.2, 0.3, 0.08], growl: 0.7, rasp: 2.2, bright: 0.7, turbo: 0.15, volume: 0.85 },
  // elektrisch: geen motor, alleen een hoge zoem die met de snelheid meeloopt
  'Tesla Model 3': { cylinders: 0, idle: 0, redline: 0, harmonics: [1, 0.3], growl: 0, rasp: 0, bright: 1, turbo: 0, volume: 0.7 },
};
const DEFAULT_ENGINE = 'Volkswagen Golf';

interface Engine {
  profile: EngineSound;
  main: OscillatorNode; sub: OscillatorNode; lump: OscillatorNode; lumpGain: GainNode;
  filter: BiquadFilterNode; gain: GainNode;
  whistle: OscillatorNode; whistleGain: GainNode;
  wind: GainNode; windFilter: BiquadFilterNode;
  pulse: OscillatorNode; breath: GainNode; breathDepth: GainNode; breathFilter: BiquadFilterNode;
  nodes: AudioScheduledSourceNode[];
  rpm: number;
}
let engine: Engine | null = null;

/** Vervormingscurve: hoe hoger "amount", hoe rauwer de uitlaat. */
function distortion(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * (1 + amount)) / Math.tanh(1 + amount);
  }
  return curve;
}

export function startEngine(model = DEFAULT_ENGINE) {
  const a = audio();
  if (!a || engine) return;
  const profile = ENGINES[model] ?? ENGINES[DEFAULT_ENGINE];
  const electric = profile.cylinders === 0;
  if (!electric) startSound();
  else tone(660, 0, 0.18, 0.08, 'sine', 990); // "klaar om te rijden"

  // Klankkleur van de motor als eigen golfvorm.
  const real = new Float32Array(profile.harmonics.length + 1);
  const imag = new Float32Array(profile.harmonics.length + 1);
  profile.harmonics.forEach((strength, i) => { imag[i + 1] = strength; });
  const main = a.ctx.createOscillator();
  main.setPeriodicWave(a.ctx.createPeriodicWave(real, imag));
  const sub = a.ctx.createOscillator();
  sub.type = 'sawtooth';
  const subGain = a.ctx.createGain();
  subGain.gain.value = profile.growl;

  const shaper = a.ctx.createWaveShaper();
  shaper.curve = distortion(profile.rasp);
  shaper.oversample = '2x';
  const filter = a.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = electric ? 0.5 : 1.4;
  const gain = a.ctx.createGain();
  gain.gain.value = 0;
  // Vaste resonanties van uitlaat en carrosserie: die blijven op hun plek terwijl het toerental verandert.
  const body = a.ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 115;
  body.Q.value = 1.2;
  body.gain.value = electric ? 0 : 6;
  const pipe = a.ctx.createBiquadFilter();
  pipe.type = 'peaking';
  pipe.frequency.value = 430;
  pipe.Q.value = 2;
  pipe.gain.value = electric ? 0 : 4;
  main.connect(shaper);
  sub.connect(subGain).connect(shaper);
  shaper.connect(filter).connect(body).connect(pipe).connect(gain).connect(a.out);

  // Uitlaatgeruis: ruis die op het ritme van de ontstekingen wordt doorgelaten. Dat maakt van de zoem een motor.
  const breathNoise = noiseSource(a.ctx);
  const breathFilter = a.ctx.createBiquadFilter();
  breathFilter.type = 'bandpass';
  breathFilter.frequency.value = 400;
  breathFilter.Q.value = 0.8;
  const breath = a.ctx.createGain();
  breath.gain.value = 0;
  const pulse = a.ctx.createOscillator();
  pulse.type = 'sawtooth';
  const breathDepth = a.ctx.createGain();
  breathDepth.gain.value = 0;
  pulse.connect(breathDepth).connect(breath.gain);
  breathNoise.connect(breathFilter).connect(breath).connect(body);

  // Geen twee ontstekingen zijn gelijk: het toerental zwabbert een heel klein beetje.
  const jitterNoise = noiseSource(a.ctx);
  const jitterFilter = a.ctx.createBiquadFilter();
  jitterFilter.type = 'lowpass';
  jitterFilter.frequency.value = 10;
  const jitter = a.ctx.createGain();
  jitter.gain.value = electric ? 0 : 350;
  jitterNoise.connect(jitterFilter).connect(jitter);
  jitter.connect(main.detune);
  jitter.connect(sub.detune);
  jitter.connect(pulse.detune);

  // Elke cilinder klinkt net anders: het volume golft mee met de krukas. Dat geeft het roffelen.
  const lump = a.ctx.createOscillator();
  const lumpGain = a.ctx.createGain();
  lumpGain.gain.value = 0;
  lump.connect(lumpGain).connect(gain.gain);

  const whistle = a.ctx.createOscillator();
  whistle.type = 'sine';
  const whistleGain = a.ctx.createGain();
  whistleGain.gain.value = 0;
  whistle.connect(whistleGain).connect(a.out);

  // Rijwind en bandengeruis: ruis door een filter, harder naarmate je sneller rijdt.
  const buffer = a.ctx.createBuffer(1, a.ctx.sampleRate * 2, a.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = a.ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const windFilter = a.ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 500;
  windFilter.Q.value = 0.6;
  const wind = a.ctx.createGain();
  wind.gain.value = 0;
  noise.connect(windFilter).connect(wind).connect(a.out);

  const nodes = [main, sub, lump, whistle, noise, breathNoise, pulse, jitterNoise];
  nodes.forEach((node) => node.start());
  engine = {
    profile, main, sub, lump, lumpGain, filter, gain, whistle, whistleGain, wind, windFilter,
    pulse, breath, breathDepth, breathFilter, nodes, rpm: profile.idle,
  };
}

/** Toerental volgt de snelheid, met een automaat die bij ongeveer 25 en 45 km/u opschakelt. */
export function updateEngine(speed: number, throttle: number) {
  if (!engine || !context) return;
  const now = context.currentTime;
  const { profile } = engine;
  const v = Math.abs(speed);
  const gas = Math.abs(throttle);

  engine.wind.gain.setTargetAtTime(Math.min(0.09, v * 0.006) * (windowOpen ? 2.4 : 1) * (profile.cylinders ? 1 : 1.5), now, 0.15);
  engine.windFilter.frequency.setTargetAtTime(350 + v * 45, now, 0.15);

  if (profile.cylinders === 0) {
    // Elektrisch: toonhoogte loopt gelijk op met de snelheid, stil bij stilstand.
    const pitch = 180 + v * 95;
    engine.main.frequency.setTargetAtTime(pitch, now, 0.05);
    engine.sub.frequency.setTargetAtTime(pitch * 1.5, now, 0.05);
    engine.filter.frequency.setTargetAtTime(1200 + v * 220, now, 0.08);
    engine.gain.gain.setTargetAtTime((Math.min(1, v / 3) * 0.02 + gas * Math.min(1, v / 2 + 0.3) * 0.035) * profile.volume, now, 0.08);
    return;
  }

  const inGear = v < 7 ? v / 7 : v < 12.5 ? 0.38 + (v - 7) / 9 : 0.48 + (v - 12.5) / 9;
  const target = profile.idle + (profile.redline * 0.82 - profile.idle) * Math.min(1, inGear) + gas * 350;
  // Het toerental loopt niet schoksgewijs: het zakt bij opschakelen en klimt bij gas geven.
  engine.rpm += (target - engine.rpm) * 0.12;
  const rpm = engine.rpm;
  const firing = (rpm / 60) * (profile.cylinders / 2);
  const load = 0.35 + gas * 0.65;

  engine.main.frequency.setTargetAtTime(firing, now, 0.03);
  engine.sub.frequency.setTargetAtTime(firing / 2, now, 0.03);
  engine.lump.frequency.setTargetAtTime(rpm / 120, now, 0.03);
  // Onder belasting blaast de uitlaat harder en scherper.
  const blow = 0.5 + gas * 1.4;
  engine.pulse.frequency.setTargetAtTime(firing, now, 0.03);
  engine.breath.gain.setTargetAtTime(blow, now, 0.08);
  engine.breathDepth.gain.setTargetAtTime(blow * 0.9, now, 0.08);
  engine.breathFilter.frequency.setTargetAtTime(300 + (rpm / profile.redline) * 900, now, 0.08);
  const level = (0.05 + gas * 0.06 + (rpm / profile.redline) * 0.03) * profile.volume;
  engine.gain.gain.setTargetAtTime(level, now, 0.06);
  // Stationair roffelt de motor het meest; op toeren loopt hij gelijkmatig.
  engine.lumpGain.gain.setTargetAtTime(level * (profile.cylinders === 3 ? 0.5 : 0.25) * (1 - Math.min(1, rpm / 4000) * 0.8), now, 0.1);
  engine.filter.frequency.setTargetAtTime((220 + (rpm / profile.redline) * 1900 * load) * profile.bright, now, 0.06);
  engine.whistle.frequency.setTargetAtTime(2400 + rpm * 0.75, now, 0.2);
  engine.whistleGain.gain.setTargetAtTime(profile.turbo * gas * Math.min(1, rpm / 3500) * 0.012, now, gas ? 0.35 : 0.08);
}

// ---------- sirene van de hulpdienst die je zelf bestuurt ----------

let siren: { gain: GainNode; nodes: OscillatorNode[] } | null = null;

/** Tweetonige sirene, aan of uit. */
export function setSiren(on: boolean) {
  if (!on) {
    if (!siren || !context) return;
    const stopped = siren;
    siren = null;
    stopped.gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
    window.setTimeout(() => stopped.nodes.forEach((node) => node.stop()), 300);
    return;
  }
  const a = audio();
  if (!a || siren) return;
  const voice = a.ctx.createOscillator();
  voice.type = 'square';
  voice.frequency.value = 660;
  const sweep = a.ctx.createOscillator();
  sweep.type = 'square';
  sweep.frequency.value = 0.9;
  const depth = a.ctx.createGain();
  depth.gain.value = 130;
  const filter = a.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  const gain = a.ctx.createGain();
  gain.gain.value = 0.04;
  sweep.connect(depth).connect(voice.frequency);
  voice.connect(filter).connect(gain).connect(a.out);
  voice.start();
  sweep.start();
  siren = { gain, nodes: [voice, sweep] };
}

export function stopEngine() {
  setSiren(false);
  if (!engine || !context) return;
  const stopped = engine;
  engine = null;
  const now = context.currentTime;
  stopped.gain.gain.setTargetAtTime(0, now, 0.08);
  stopped.lumpGain.gain.setTargetAtTime(0, now, 0.05);
  stopped.whistleGain.gain.setTargetAtTime(0, now, 0.05);
  stopped.wind.gain.setTargetAtTime(0, now, 0.08);
  window.setTimeout(() => stopped.nodes.forEach((node) => node.stop()), 400);
}

// ---------- natuur: vogels, wind in de bomen, 's nachts krekels en een uil ----------

let noiseBuffer: AudioBuffer | null = null;
function noiseSource(ctx: AudioContext): AudioBufferSourceNode {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  return source;
}

/** Eén fluittoon van een vogel, ergens links of rechts in het beeld. */
function whistleNote(from: number, to: number, delay: number, length: number, volume: number, pan: number) {
  const a = audio();
  if (!a) return;
  const start = a.ctx.currentTime + delay;
  const oscillator = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  const panner = a.ctx.createStereoPanner();
  panner.pan.value = pan;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + length * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(panner).connect(a.out);
  oscillator.start(start);
  oscillator.stop(start + length + 0.02);
}

const between = (low: number, high: number) => low + Math.random() * (high - low);

function birdCall() {
  const pan = between(-0.9, 0.9);
  const volume = between(0.012, 0.035);
  const kind = Math.random();
  if (kind < 0.35) {
    // mus: een paar korte tjilpen
    const count = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) whistleNote(between(3600, 4400), between(2500, 3000), i * between(0.11, 0.16), 0.07, volume, pan);
  } else if (kind < 0.6) {
    // koolmees: twee tonen die elkaar afwisselen
    const high = between(4200, 4800);
    for (let i = 0; i < 6; i++) whistleNote(i % 2 ? high * 0.78 : high, i % 2 ? high * 0.76 : high * 0.98, i * 0.17, 0.13, volume, pan);
  } else if (kind < 0.82) {
    // merel: langzame, golvende fluit
    let at = 0;
    for (let i = 0; i < 5; i++) {
      const from = between(1800, 2900);
      const length = between(0.14, 0.3);
      whistleNote(from, from * between(0.8, 1.3), at, length, volume, pan);
      at += length + between(0.03, 0.1);
    }
  } else if (kind < 0.93) {
    // snelle triller
    const pitch = between(5000, 6200);
    for (let i = 0; i < 12; i++) whistleNote(pitch, pitch * 0.9, i * 0.055, 0.04, volume * 0.8, pan);
  } else {
    // koekoek, ver weg
    whistleNote(740, 720, 0, 0.26, volume * 0.9, pan);
    whistleNote(587, 570, 0.36, 0.34, volume * 0.9, pan);
  }
}

function nightCall() {
  const pan = between(-0.9, 0.9);
  if (Math.random() < 0.9) {
    // krekel: korte reeksjes hoge tikjes
    const pitch = between(4200, 4700);
    for (let burst = 0; burst < 3; burst++) for (let i = 0; i < 4; i++) whistleNote(pitch, pitch, burst * 0.32 + i * 0.035, 0.028, 0.014, pan);
  } else {
    // uil
    whistleNote(380, 350, 0, 0.5, 0.03, pan);
    whistleNote(350, 320, 0.75, 0.8, 0.03, pan);
  }
}

interface Ambience { wind: GainNode; nodes: AudioScheduledSourceNode[]; timer: number; day: number }
let ambience: Ambience | null = null;

export function startAmbience() {
  const a = audio();
  if (!a || ambience) return;
  const noise = noiseSource(a.ctx);
  const filter = a.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  const wind = a.ctx.createGain();
  wind.gain.value = 0.018;
  // De wind zwelt langzaam aan en af.
  const swell = a.ctx.createOscillator();
  swell.frequency.value = 0.09;
  const depth = a.ctx.createGain();
  depth.gain.value = 0.011;
  swell.connect(depth).connect(wind.gain);
  noise.connect(filter).connect(wind).connect(a.out);
  noise.start();
  swell.start();

  const current: Ambience = { wind, nodes: [noise, swell], timer: 0, day: 1 };
  const next = () => {
    if (ambience !== current) return;
    // Bij neerslag houden de vogels zich stil.
    if ((weather?.gain.gain.value ?? 0) > 0.004) { /* stil */ } else if (current.day > 0.35) birdCall(); else nightCall();
    // In de schemering is het stiller; overdag zingen er meer vogels.
    current.timer = window.setTimeout(next, current.day > 0.35 ? between(500, 2600) / (0.4 + current.day * 0.6) : between(700, 2200));
  };
  ambience = current;
  current.timer = window.setTimeout(next, 800);
}

let weather: { gain: GainNode; filter: BiquadFilterNode } | null = null;

/** Het geruis van regen, hagel of natte sneeuw. Sterkte 0 is stil. */
export function setWeatherSound(level: number, pitch: number) {
  const a = audio();
  if (!a) return;
  if (!weather) {
    if (!level) return;
    const noise = noiseSource(a.ctx);
    const filter = a.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.6;
    const gain = a.ctx.createGain();
    gain.gain.value = 0;
    noise.connect(filter).connect(gain).connect(a.out);
    noise.start();
    weather = { gain, filter };
  }
  weather.filter.frequency.setTargetAtTime(pitch, a.ctx.currentTime, 0.5);
  weather.gain.gain.setTargetAtTime(level, a.ctx.currentTime, 0.8);
}

/** day: 0 is nacht, 1 is volop dag. */
export function updateAmbience(day: number) {
  if (ambience) ambience.day = day;
}

export function stopAmbience() {
  if (!ambience || !context) return;
  const stopped = ambience;
  ambience = null;
  window.clearTimeout(stopped.timer);
  stopped.wind.gain.setTargetAtTime(0, context.currentTime, 0.1);
  window.setTimeout(() => stopped.nodes.forEach((node) => node.stop()), 500);
}

// ---------- andere voertuigen: motor en banden, harder naarmate ze dichterbij zijn ----------

export interface CarVoice {
  /** speed: 0 (stationair) tot 1 (op snelheid); near: 0 (ver weg) tot 1 (vlak bij de slagboom). */
  update(speed: number, near: number): void;
  stop(): void;
}

const voices = new Set<CarVoice>();

export function carVoice(kind: 'auto' | 'zwaar' | 'elektrisch' | 'sirene'): CarVoice | null {
  const a = audio();
  if (!a) return null;
  const { ctx } = a;
  const heavy = kind === 'zwaar' || kind === 'sirene';
  const electric = kind === 'elektrisch';
  const idle = electric ? 0 : heavy ? 34 : 52;

  const motor = ctx.createOscillator();
  motor.type = electric ? 'sine' : 'sawtooth';
  const sub = ctx.createOscillator();
  sub.type = 'square';
  const subGain = ctx.createGain();
  subGain.gain.value = electric ? 0 : heavy ? 0.7 : 0.35;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const motorGain = ctx.createGain();
  motorGain.gain.value = 0;
  // Het ratelen van een diesel.
  const rattle = ctx.createOscillator();
  rattle.frequency.value = heavy ? 11 : 16;
  const rattleGain = ctx.createGain();
  rattleGain.gain.value = 0;
  rattle.connect(rattleGain).connect(motorGain.gain);

  const tyres = noiseSource(ctx);
  const tyreFilter = ctx.createBiquadFilter();
  tyreFilter.type = 'bandpass';
  tyreFilter.Q.value = 0.7;
  const tyreGain = ctx.createGain();
  tyreGain.gain.value = 0;

  const out = ctx.createGain();
  out.gain.value = 1;
  // Vaste resonantie van de uitlaat, uitlaatgeruis op het ritme van de motor en een licht zwabberend toerental.
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = heavy ? 90 : 120;
  body.Q.value = 1.2;
  body.gain.value = electric ? 0 : 6;
  const breathNoise = noiseSource(ctx);
  const breathFilter = ctx.createBiquadFilter();
  breathFilter.type = 'bandpass';
  breathFilter.frequency.value = heavy ? 280 : 420;
  breathFilter.Q.value = 0.8;
  const breath = ctx.createGain();
  breath.gain.value = electric ? 0 : 0.9;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = electric ? 0 : 0.8;
  motor.connect(breathDepth).connect(breath.gain);
  breathNoise.connect(breathFilter).connect(breath).connect(body);
  const jitterNoise = noiseSource(ctx);
  const jitterFilter = ctx.createBiquadFilter();
  jitterFilter.type = 'lowpass';
  jitterFilter.frequency.value = 10;
  const jitter = ctx.createGain();
  jitter.gain.value = electric ? 0 : 350;
  jitterNoise.connect(jitterFilter).connect(jitter);
  jitter.connect(motor.detune);
  jitter.connect(sub.detune);

  motor.connect(filter);
  sub.connect(subGain).connect(filter);
  filter.connect(body).connect(motorGain).connect(out);
  tyres.connect(tyreFilter).connect(tyreGain).connect(out);
  out.connect(a.out);
  const nodes: AudioScheduledSourceNode[] = [motor, sub, rattle, tyres, breathNoise, jitterNoise];

  // Ambulance: tweetonige sirene zolang hij rijdt.
  let siren: GainNode | null = null;
  if (kind === 'sirene') {
    const tone1 = ctx.createOscillator();
    tone1.type = 'square';
    const sweep = ctx.createOscillator();
    sweep.type = 'square';
    sweep.frequency.value = 1.1;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 110;
    tone1.frequency.value = 760;
    sweep.connect(sweepGain).connect(tone1.frequency);
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'bandpass';
    sirenFilter.frequency.value = 900;
    siren = ctx.createGain();
    siren.gain.value = 0;
    tone1.connect(sirenFilter).connect(siren).connect(out);
    nodes.push(tone1, sweep);
  }
  nodes.forEach((node) => node.start());

  const voice: CarVoice = {
    update(speed, near) {
      const now = ctx.currentTime;
      const loud = near * near;
      const pitch = electric ? 160 + speed * 520 : idle + speed * (heavy ? 70 : 115);
      motor.frequency.setTargetAtTime(pitch, now, 0.08);
      sub.frequency.setTargetAtTime(pitch / 2, now, 0.08);
      filter.frequency.setTargetAtTime(electric ? 1800 : 240 + speed * 900, now, 0.1);
      const level = (electric ? speed * 0.02 : 0.03 + speed * 0.045) * loud * (heavy ? 1.3 : 1);
      motorGain.gain.setTargetAtTime(level, now, 0.12);
      rattleGain.gain.setTargetAtTime(electric ? 0 : level * (heavy ? 0.5 : 0.2) * (1 - speed * 0.7), now, 0.12);
      tyreFilter.frequency.setTargetAtTime(500 + speed * 900, now, 0.1);
      tyreGain.gain.setTargetAtTime(speed * 0.05 * loud, now, 0.12);
      siren?.gain.setTargetAtTime(speed > 0.05 ? 0.035 * Math.max(0.15, loud) : 0, now, 0.2);
    },
    stop() {
      if (!voices.delete(voice)) return;
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      window.setTimeout(() => nodes.forEach((node) => node.stop()), 700);
    },
  };
  voices.add(voice);
  return voice;
}

export function stopAllVoices() {
  [...voices].forEach((voice) => voice.stop());
}
