// Vindt en leest een kenteken in een camerabeeld, volledig in de browser (tesseract.js). Er gaat geen beeld
// naar de server.
//
// 1. Zoeken: een kenteken is een smalle, liggende strook met veel verticale randen (de letters) en daarboven
//    en daaronder weinig. Het hele beeld wordt op zulke stroken afgezocht, zodat de plaat overal mag staan.
// 2. Lezen: alleen die stroken gaan door de tekstherkenning. De blauwe band met de landcode wordt apart
//    gelezen en de kleur van de plaat (geel of wit) helpt het land te bepalen.
// 3. Controleren: de tekst telt alleen als hij past bij de vorm van een Europees kenteken (sim/plates.ts).
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { bandCountry, guessPlate, plateKeyOf, type PlateGuess } from '../sim/plates';
import type { Permit } from '../types';

let worker: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = (async () => {
      const w = await createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/core',
        langPath: '/tesseract/lang',
        workerBlobURL: false,
      });
      return w;
    })();
    worker.catch(() => { worker = null; });
  }
  return worker;
}

/** Laadt de tekstherkenning alvast, zodat het eerste kenteken niet hoeft te wachten. */
export function warmUp() {
  void getWorker().catch(() => undefined);
}

export interface Box { x: number; y: number; w: number; h: number }

// ---------- 1. zoeken ----------

const SEARCH_WIDTH = 480;

/** Stroken in het beeld die op een kentekenplaat lijken, de meest waarschijnlijke eerst (in beeldpixels). */
export function findCandidates(frame: HTMLCanvasElement, limit = 5): Box[] {
  const scale = Math.min(1, SEARCH_WIDTH / frame.width);
  const W = Math.round(frame.width * scale);
  const H = Math.round(frame.height * scale);
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const ctx = small.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(frame, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  // Verticale randen: groot verschil tussen links en rechts.
  const strength = new Float32Array(W * H);
  let total = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 1; x < W - 1; x++) {
      const v = Math.abs(gray[y * W + x + 1] - gray[y * W + x - 1]);
      strength[y * W + x] = v;
      total += v;
    }
  }
  const threshold = Math.min(90, Math.max(28, (total / (W * H)) * 3));
  // Somtabel: het aantal randpunten in elke rechthoek is zo in vier stappen te tellen.
  const sums = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += strength[y * W + x] > threshold ? 1 : 0;
      sums[(y + 1) * (W + 1) + x + 1] = sums[y * (W + 1) + x + 1] + row;
    }
  }
  const count = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.max(0, Math.min(W, Math.round(x)));
    const y0 = Math.max(0, Math.min(H, Math.round(y)));
    const x1 = Math.max(0, Math.min(W, Math.round(x + w)));
    const y1 = Math.max(0, Math.min(H, Math.round(y + h)));
    const area = (x1 - x0) * (y1 - y0);
    if (area <= 0) return 0;
    return (sums[y1 * (W + 1) + x1] - sums[y0 * (W + 1) + x1] - sums[y1 * (W + 1) + x0] + sums[y0 * (W + 1) + x0]) / area;
  };

  const found: (Box & { score: number })[] = [];
  for (const h of [10, 13, 17, 22, 29, 38, 50, 66]) {
    if (h > H * 0.6) continue;
    for (const ratio of [2.6, 3.6, 4.7]) {
      const w = Math.round(h * ratio);
      if (w > W * 0.98) continue;
      const step = Math.max(2, Math.round(h / 4));
      for (let y = 0; y + h <= H; y += step) {
        for (let x = 0; x + w <= W; x += step) {
          const inside = count(x, y, w, h);
          if (inside < 0.1) continue;
          // De letters staan over de hele breedte: in minstens drie van de vier stukken zitten randen.
          let filled = 0;
          for (let i = 0; i < 4; i++) if (count(x + (i * w) / 4, y, w / 4, h) > inside * 0.4) filled++;
          if (filled < 3) continue;
          // Boven en onder de plaat is het rustiger (bumper, carrosserie).
          const around = Math.max(count(x, y - h * 0.7, w, h * 0.7), count(x, y + h, w, h * 0.7));
          const score = inside - 0.85 * around;
          if (score > 0.06) found.push({ x, y, w, h, score });
        }
      }
    }
  }

  // Een strook valt vaak op een paar letters. Laat hem links en rechts uitgroeien zolang daar nog tekens staan,
  // zodat hij de hele plaat omvat. Brede stroken met de vorm van een plaat gaan voor.
  found.sort((a, b) => b.score - a.score);
  const grown = found.slice(0, 60).map((box) => {
    const inside = count(box.x, box.y, box.w, box.h);
    const slab = box.h / 3;
    let { x, w } = box;
    // Een streepje of een smal teken (zoals de 1) geeft even weinig randen: kijk dan één stap verder.
    const busy = (left: number) => count(left, box.y, slab, box.h) > inside * 0.3;
    for (;;) {
      if (w >= box.h * 7) break;
      if (x - slab >= 0 && busy(x - slab)) { x -= slab; w += slab; continue; }
      if (x - 2 * slab >= 0 && busy(x - 2 * slab)) { x -= 2 * slab; w += 2 * slab; continue; }
      break;
    }
    for (;;) {
      if (w >= box.h * 7) break;
      if (x + w + slab <= W && busy(x + w)) { w += slab; continue; }
      if (x + w + 2 * slab <= W && busy(x + w + slab)) { w += 2 * slab; continue; }
      break;
    }
    const around = Math.max(count(x, box.y - box.h * 0.7, w, box.h * 0.7), count(x, box.y + box.h, w, box.h * 0.7));
    const score = (count(x, box.y, w, box.h) - 0.85 * around) * Math.min(1.6, Math.max(0.6, w / box.h / 3));
    return { x, y: box.y, w, h: box.h, score };
  });

  // Overlappende stroken: alleen de beste houden.
  grown.sort((a, b) => b.score - a.score);
  const kept: (Box & { score: number })[] = [];
  for (const box of grown) {
    if (kept.length >= limit) break;
    if (kept.some((other) => overlap(box, other) > 0.3)) continue;
    kept.push(box);
  }
  // Terug naar beeldpixels, met wat ruimte om de plaat heen zodat er geen letter afvalt.
  return kept.map(({ x, y, w, h }) => clampBox({
    x: (x - w * 0.14) / scale, y: (y - h * 0.3) / scale, w: (w * 1.28) / scale, h: (h * 1.6) / scale,
  }, frame.width, frame.height));
}

function overlap(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}

function clampBox(box: Box, width: number, height: number): Box {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  return { x, y, w: Math.min(width - x, box.w - (x - box.x)), h: Math.min(height - y, box.h - (y - box.y)) };
}

// ---------- 2. lezen ----------

function crop(frame: HTMLCanvasElement, box: Box): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(box.w));
  canvas.height = Math.max(1, Math.round(box.h));
  canvas.getContext('2d', { willReadFrequently: true })!
    .drawImage(frame, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const isBlue = (r: number, g: number, b: number) => b > 80 && b > r + 35 && b > g + 10;

interface Look {
  /** Begin en einde van de blauwe band, in pixels van de uitsnede (end 0 als er geen band is). */
  bandStart: number;
  band: number;
  /** Boven- en onderkant van de band (de hoogte van de plaat). */
  bandTop: number;
  bandBottom: number;
  /** De achtergrond van de plaat is geel. null als de plaat te donker of te klein is om dat te zeggen. */
  yellow: boolean | null;
}

/** Kijkt naar de kleuren: waar zit de blauwe band en is de plaat geel of wit? */
function look(canvas: HTMLCanvasElement): Look {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height);
  // De band: kolommen vanaf links waarin het middelste deel grotendeels blauw is.
  let band = 0;
  let bandStart = 0;
  let seenBlue = false;
  for (let x = 0; x < width * 0.45; x++) {
    let blue = 0;
    let rows = 0;
    for (let y = Math.round(height * 0.2); y < height * 0.8; y++) {
      const i = (y * width + x) * 4;
      rows++;
      if (isBlue(data[i], data[i + 1], data[i + 2])) blue++;
    }
    if (blue / rows > 0.45) {
      if (!seenBlue) bandStart = x;
      seenBlue = true;
      band = x + 1;
    } else if (seenBlue) break;
  }
  if (band - bandStart < width * 0.02) band = 0;
  // Hoe hoog is de band? Dat is de hoogte van de plaat; de landcode staat onderin.
  let bandTop = 0;
  let bandBottom = height;
  if (band) {
    const blueRow = (y: number) => {
      let blue = 0;
      for (let x = bandStart; x < band; x++) {
        const i = (y * width + x) * 4;
        if (isBlue(data[i], data[i + 1], data[i + 2])) blue++;
      }
      return blue / (band - bandStart) > 0.3;
    };
    const middle = Math.round(height / 2);
    bandTop = middle;
    while (bandTop > 0 && blueRow(bandTop - 1)) bandTop--;
    bandBottom = middle;
    // Onder de sterren staan witte letters; een paar rijen zonder blauw overbruggen.
    for (let y = middle, gap = 0; y < height && gap < (band - bandStart); y++) {
      if (blueRow(y)) { bandBottom = y + 1; gap = 0; } else gap++;
    }
  }

  // De achtergrond: het lichtste kwart van de pixels rechts van de band.
  const bright: [number, number, number][] = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = band; x < width; x += 2) {
      const i = (y * width + x) * 4;
      bright.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  bright.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
  const top = bright.slice(0, Math.max(1, Math.round(bright.length / 4)));
  const [r, g, b] = top.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]], [0, 0, 0]).map((v) => v / top.length);
  const yellow = r + g < 220 ? null : b < Math.min(r, g) * 0.72;
  return { bandStart, band, bandTop, bandBottom, yellow };
}

/** Zwart-wit met hoog contrast en donkere letters op een lichte achtergrond: dat leest het best. */
function prepare(source: HTMLCanvasElement, from = 0): HTMLCanvasElement {
  const width = source.width - from;
  const scale = Math.min(4, Math.max(0.5, 120 / source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, from, 0, width, source.height, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    // Bij een gele plaat valt blauw weg; het minimum van rood en groen houdt de letters donker en de plaat licht.
    const gray = Math.round(Math.min(0.5 * (data[i] + data[i + 1]), 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] + 40));
    data[i] = Math.max(0, Math.min(255, gray));
    histogram[data[i]]++;
  }
  // Drempel volgens Otsu: de grens die donkere letters en lichte achtergrond het best scheidt.
  const total = data.length / 4;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * histogram[v];
  let below = 0, sumBelow = 0, best = 0, threshold = 127;
  for (let v = 0; v < 256; v++) {
    below += histogram[v];
    if (!below || below === total) continue;
    sumBelow += v * histogram[v];
    const meanBelow = sumBelow / below;
    const meanAbove = (sum - sumBelow) / (total - below);
    const between = below * (total - below) * (meanBelow - meanAbove) ** 2;
    if (between > best) { best = between; threshold = v; }
  }
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] <= threshold) dark++;
  // Letters beslaan minder dan de helft van een plaat; is het meeste donker, dan is het beeld omgekeerd.
  const flip = dark > total / 2;
  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] > threshold) !== flip ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // Witte rand eromheen: tesseract leest beter als de tekst niet tegen de rand staat.
  const framed = document.createElement('canvas');
  framed.width = canvas.width + 24;
  framed.height = canvas.height + 24;
  const out = framed.getContext('2d')!;
  out.fillStyle = '#fff';
  out.fillRect(0, 0, framed.width, framed.height);
  out.drawImage(canvas, 12, 12);
  return framed;
}

async function recognize(image: HTMLCanvasElement, mode: PSM, whitelist: string) {
  const w = await getWorker();
  await w.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: mode });
  const { data } = await w.recognize(image);
  return { text: data.text.toUpperCase().replace(/[^A-Z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim(), confidence: data.confidence };
}

// ---------- 3. controleren ----------

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** Zoekt het kenteken in de lijst: precies gelijk, met ruis ervoor of erna, of met één teken fout. */
function findPermit(key: string, permits: Permit[]): Permit | null {
  if (key.length < 4) return null;
  return permits.find((p) => p.plate_key === key)
    ?? permits.find((p) => p.plate_key.length >= 5 && key.length <= p.plate_key.length + 3 && key.includes(p.plate_key))
    ?? permits.find((p) => p.plate_key.length >= 5 && Math.abs(p.plate_key.length - key.length) <= 1 && distance(p.plate_key, key) === 1)
    ?? null;
}

/** Tekens die de herkenning vaak verwart. */
const AS_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };

/**
 * Probeert van de gelezen tekst een kenteken te maken: zoals gelezen, en zonder losse tekens aan de randen (de rand
 * van de plaat of de landcode wordt soms als B, I of 1 meegelezen). De beste lezing wint: een die in de lijst
 * staat, dan een waarvan de groepen precies bij de vorm van het land passen, dan een met de landcode van de band.
 */
function interpret(text: string, hints: { band: string | null; yellow: boolean | null }, permits: Permit[]): (PlateGuess & { permit: Permit | null }) | null {
  const words = text.split(' ').filter(Boolean);
  const tries = new Set<string>([text]);
  if (words.length > 1) {
    tries.add(words.slice(1).join(' '));
    tries.add(words.slice(0, -1).join(' '));
  }
  if (words.length > 2) tries.add(words.slice(1, -1).join(' '));
  // Een Nederlands kenteken heeft geen klinkers; een O of I is daar vrijwel zeker een 0 of 1.
  if (hints.yellow) for (const attempt of [...tries]) tries.add(attempt.replace(/[OQDIL]/g, (c) => AS_DIGIT[c]));

  let best: (PlateGuess & { permit: Permit | null }) | null = null;
  let bestScore = -1;
  for (const attempt of tries) {
    if (!attempt) continue;
    const permit = findPermit(plateKeyOf(attempt), permits);
    if (permit) {
      return { plate: permit.plate, key: permit.plate_key, country: permit.country, basis: 'lijst', alternatives: [], exact: true, permit };
    }
    const guess = guessPlate(attempt, hints);
    if (!guess) continue;
    // Groepen die precies passen tellen het zwaarst, dan de volledige tekst (niet ingekort), dan de landcode van de band.
    const score = (guess.exact ? 4 : 0) + (attempt === text ? 3 : 0) + (guess.basis === 'band' ? 2 : 0);
    if (score > bestScore) { best = { ...guess, permit: null }; bestScore = score; }
  }
  return best;
}

export interface Detection {
  /** De groepen passen precies bij de vorm van het land (zie PlateGuess). */
  exact: boolean;
  /** Waar de plaat in het beeld staat (in beeldpixels). */
  box: Box;
  plate: string;
  key: string;
  country: string;
  basis: PlateGuess['basis'];
  alternatives: string[];
  permit: Permit | null;
  raw: string;
  confidence: number;
}

export interface Scan {
  detection: Detection | null;
  /** Plekken die op een kenteken leken maar niet te lezen waren. */
  candidates: Box[];
}

const PLATE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ';

/**
 * Leest een uitsnede, en ook twee bredere kaders: de gevonden strook valt soms te smal uit en snijdt dan een
 * letter af. De volledigste geldige lezing wint (een kenteken uit de lijst gaat altijd voor).
 */
async function readBox(frame: HTMLCanvasElement, box: Box, permits: Permit[]): Promise<Detection | null> {
  const found: Detection[] = [];
  for (const grow of [0, 0.2, 0.45]) {
    const wider = grow ? clampBox({ x: box.x - box.w * grow, y: box.y - box.h * grow * 0.4, w: box.w * (1 + 2 * grow), h: box.h * (1 + grow * 0.8) }, frame.width, frame.height) : box;
    const detection = await readOnce(frame, wider, permits);
    if (detection?.permit) return detection;
    if (detection) found.push(detection);
  }
  if (!found.length) return null;
  // Een lezing die een andere lezing helemaal bevat, is vollediger; past de vorm precies, dan telt dat zwaarder.
  const score = (d: Detection) => d.key.length + (d.exact ? 3 : 0) + found.filter((other) => other !== d && d.key.includes(other.key)).length * 2;
  return found.sort((a, b) => score(b) - score(a))[0];
}

/** Leest één uitsnede: de band apart, dan de tekens. */
async function readOnce(frame: HTMLCanvasElement, box: Box, permits: Permit[]): Promise<Detection | null> {
  // De blauwe band zit links van de tekens: kijk daar ook.
  const reach = clampBox({ x: box.x - box.h, y: box.y - box.h * 0.4, w: box.w + box.h, h: box.h * 1.8 }, frame.width, frame.height);
  const { bandStart, band: bandEnd, bandTop, bandBottom, yellow } = look(crop(frame, reach));
  const band = bandEnd ? Math.max(0, bandEnd - (box.x - reach.x)) : 0;
  const piece = crop(frame, box);
  let bandCode: string | null = null;
  if (bandEnd) {
    // De landcode staat onderaan de band, wit op blauw; prepare() keert dat vanzelf om.
    const tall = bandBottom - bandTop;
    const strip = crop(frame, { x: reach.x + bandStart, y: reach.y + bandTop + tall * 0.55, w: bandEnd - bandStart, h: tall * 0.45 });
    const code = await recognize(prepare(strip), PSM.SINGLE_WORD, 'ABCDEFGHIJKLMNOPRSTUVZ');
    bandCode = bandCountry(code.text);
  }
  const read = await recognize(prepare(piece, band), PSM.SINGLE_LINE, PLATE_CHARS);
  if (!read.text || read.confidence < 35) return null;
  const found = interpret(read.text, { band: bandCode, yellow }, permits);
  if (!found) return null;
  return { box, raw: read.text, confidence: Math.round(read.confidence), ...found };
}

/** Zoekt in het hele beeld naar een kenteken en leest het. */
export async function scanFrame(frame: HTMLCanvasElement, permits: Permit[]): Promise<Scan> {
  const candidates = findCandidates(frame);
  for (const box of candidates) {
    const detection = await readBox(frame, box, permits);
    if (detection) return { detection, candidates };
  }
  return { detection: null, candidates };
}
