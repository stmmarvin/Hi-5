import { CanvasTexture, SRGBColorSpace } from 'three';
import { countryInfo } from '../sim/plates';
import type { Country } from '../types';

const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

function finish(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

const plates = new Map<string, CanvasTexture>();

export function plateTexture(plate: string, country: Country): CanvasTexture {
  const id = `${country}|${plate}`;
  const cached = plates.get(id);
  if (cached) return cached;

  const { canvas, ctx } = canvasOf(320, 80);
  const info = countryInfo(country);
  ctx.fillStyle = info.yellow ? '#f7b500' : '#ffffff';
  ctx.fillRect(0, 0, 320, 80);
  ctx.strokeStyle = '#15181a';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 314, 74);
  ctx.fillStyle = '#1b4fa0';
  ctx.fillRect(6, 6, 34, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${country.length > 2 ? 14 : 20}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(country, 23, 66, 30);
  ctx.fillStyle = info.ink ?? '#111111';
  ctx.font = `700 54px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(plate, 180, 43, 262);

  const texture = finish(canvas);
  plates.set(id, texture);
  return texture;
}

export function boardTexture(lines: string[], background: string, color: string, size = 60): CanvasTexture {
  const height = Math.max(128, lines.length * (size + 22) + 36);
  const { canvas, ctx } = canvasOf(512, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, height);
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, 256, ((i + 0.5) * height) / lines.length, 470));
  return finish(canvas);
}

/** Wegmarkering met pijl, van bovenaf leesbaar vanaf de openbare weg. */
export function roadMarkTexture(word: string, arrowUp: boolean): CanvasTexture {
  const { canvas, ctx } = canvasOf(256, 512);
  ctx.fillStyle = '#eef1e8';
  ctx.strokeStyle = '#eef1e8';
  ctx.lineWidth = 26;
  const top = arrowUp ? 40 : 300;
  ctx.beginPath(); ctx.moveTo(128, 60); ctx.lineTo(128, 290); ctx.stroke();
  ctx.beginPath();
  if (arrowUp) { ctx.moveTo(128, top - 30); ctx.lineTo(196, top + 70); ctx.lineTo(60, top + 70); }
  else { ctx.moveTo(128, top + 20); ctx.lineTo(196, top - 80); ctx.lineTo(60, top - 80); }
  ctx.closePath(); ctx.fill();
  ctx.font = `700 150px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(word, 128, 470, 240);
  return finish(canvas);
}

