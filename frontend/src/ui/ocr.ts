// Leest een kenteken uit een beeld, volledig in de browser (tesseract.js). Er gaat geen beeld naar de server.
import { createWorker, PSM, type Worker } from 'tesseract.js';
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
      await w.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ',
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
      });
      return w;
    })();
    worker.catch(() => { worker = null; });
  }
  return worker;
}

/** Maakt het beeld zwart-wit met hoog contrast; dat leest een stuk beter. */
function prepare(source: HTMLCanvasElement): HTMLCanvasElement {
  const scale = Math.min(3, Math.max(0.5, 150 / source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;
    histogram[gray]++;
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
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const keyOf = (text: string) => text.replace(/[^A-Z0-9]/g, '');

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

/** Zet streepjes op de overgangen tussen letters en cijfers, zoals op een Nederlands kenteken. */
function withDashes(key: string): string {
  const groups = key.match(/[A-Z]+|[0-9]+/g) ?? [];
  return key.length === 6 && groups.length >= 2 ? groups.join('-') : key;
}

export interface PlateReading {
  plate: string;
  confidence: number;
  /** Het kenteken uit de lijst waar de lezing bij hoort, als dat gevonden is. */
  permit: Permit | null;
  raw: string;
}

export async function readPlate(source: HTMLCanvasElement, permits: Permit[]): Promise<PlateReading> {
  const w = await getWorker();
  const { data } = await w.recognize(prepare(source));
  const raw = data.text.toUpperCase().replace(/[^A-Z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();

  // De blauwe band met de landcode wordt vaak meegelezen; die hoort niet bij het kenteken.
  const words = raw.split(' ').filter(Boolean);
  if (words.length > 1 && /^(NL|N|L|D|B|I|1)$/.test(words[0])) words.shift();
  const text = words.join(' ');
  const key = keyOf(text);

  // Zoek het kenteken in de lijst: precies gelijk, erin verstopt (ruis ervoor of erna), of één teken fout.
  const permit = !key ? null
    : permits.find((p) => p.plate_key === key)
      ?? permits.find((p) => key.length <= p.plate_key.length + 2 && key.includes(p.plate_key))
      ?? permits.find((p) => distance(p.plate_key, key) === 1)
      ?? null;

  return { plate: permit?.plate ?? (text.includes('-') || text.includes(' ') ? text : withDashes(key)), confidence: Math.round(data.confidence), permit, raw };
}
