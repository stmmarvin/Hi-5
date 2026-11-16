// Getekende texturen voor de ingang, zoals op de schets van de camping: houten borden, routebord met
// pictogrammen, intercom, vlag, gebladerte en ondergronden. Alles wordt in de browser getekend.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
type Ctx = CanvasRenderingContext2D;

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function finish(canvas: HTMLCanvasElement, repeat?: [number, number]): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

function randomOf(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Planken met nerf en naden. */
function planks(ctx: Ctx, width: number, height: number, plank: number, rgb: [number, number, number], seed = 3) {
  const random = randomOf(seed);
  for (let y = 0; y < height; y += plank) {
    const tint = (random() - 0.5) * 26;
    ctx.fillStyle = `rgb(${rgb[0] + tint}, ${rgb[1] + tint}, ${rgb[2] + tint * 0.8})`;
    ctx.fillRect(0, y, width, plank);
    for (let i = 0; i < 26; i++) {
      const gy = y + random() * plank;
      ctx.strokeStyle = `rgba(${random() < 0.5 ? '70, 45, 20' : '255, 235, 200'}, ${0.06 + random() * 0.12})`;
      ctx.lineWidth = 0.6 + random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(width * 0.3, gy + (random() - 0.5) * 7, width * 0.7, gy + (random() - 0.5) * 7, width, gy + (random() - 0.5) * 4);
      ctx.stroke();
    }
    if (random() < 0.6) {
      const kx = random() * width;
      const ky = y + plank * (0.3 + random() * 0.4);
      ctx.fillStyle = 'rgba(70, 42, 18, .45)';
      ctx.beginPath(); ctx.ellipse(kx, ky, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(40, 24, 10, .55)';
    ctx.fillRect(0, y, width, 2.5);
  }
}

export function woodTexture(repeat: [number, number] = [1, 1], rgb: [number, number, number] = [176, 132, 82]): CanvasTexture {
  const { canvas, ctx } = canvasOf(512, 512);
  planks(ctx, 512, 512, 64, rgb, 9);
  return finish(canvas, repeat);
}

function pine(ctx: Ctx, x: number, base: number, size: number) {
  for (let i = 0; i < 3; i++) {
    const top = base - size * (1 - i * 0.24);
    const half = size * (0.2 + i * 0.09);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + half, top + size * 0.42); ctx.lineTo(x - half, top + size * 0.42); ctx.closePath(); ctx.fill();
  }
  ctx.fillRect(x - size * 0.05, base - size * 0.12, size * 0.1, size * 0.14);
}

function tent(ctx: Ctx, x: number, base: number, size: number, gap: string) {
  const fill = ctx.fillStyle;
  ctx.beginPath(); ctx.moveTo(x, base - size); ctx.lineTo(x + size * 0.85, base); ctx.lineTo(x - size * 0.85, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = gap;
  ctx.beginPath(); ctx.moveTo(x + size * 0.1, base - size * 0.62); ctx.lineTo(x + size * 0.36, base); ctx.lineTo(x - size * 0.12, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = fill;
}

/** Het grote houten bord op het eiland. */
export function campSignTexture(): CanvasTexture {
  const { canvas, ctx } = canvasOf(768, 640);
  planks(ctx, 768, 640, 92, [196, 152, 98], 5);
  ctx.fillStyle = '#22301f';
  ctx.textAlign = 'center';
  ctx.font = `700 136px ${FONT}`;
  ctx.fillText('Camping', 384, 150);
  ctx.fillText('Boer Bert', 384, 282);
  pine(ctx, 196, 474, 124);
  pine(ctx, 572, 474, 124);
  tent(ctx, 384, 474, 136, '#c49862');
  ctx.fillRect(150, 474, 468, 7);
  ctx.font = `italic 500 62px ${FONT}`;
  ctx.fillText('Natuur. Rust. Samen.', 384, 566);
  return finish(canvas);
}

function carIcon(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath(); ctx.roundRect(x - s, y - s * 0.1, s * 2, s * 0.62, s * 0.16); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - s * 0.72, y - s * 0.05); ctx.lineTo(x - s * 0.5, y - s * 0.6); ctx.lineTo(x + s * 0.5, y - s * 0.6); ctx.lineTo(x + s * 0.72, y - s * 0.05); ctx.closePath(); ctx.fill();
  ctx.fillRect(x - s * 0.82, y + s * 0.45, s * 0.36, s * 0.3);
  ctx.fillRect(x + s * 0.46, y + s * 0.45, s * 0.36, s * 0.3);
}

/** Donker routebord onder het houten bord. */
export function routeTexture(): CanvasTexture {
  const { canvas, ctx } = canvasOf(640, 420);
  ctx.fillStyle = '#1d2227';
  ctx.fillRect(0, 0, 640, 420);
  ctx.strokeStyle = '#3a4047';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 634, 414);
  ctx.fillStyle = '#f2f4ee';
  ctx.strokeStyle = '#f2f4ee';
  ctx.font = `500 52px ${FONT}`;
  ctx.textBaseline = 'middle';
  const rows = ['Parkeren', 'Campingplaatsen', 'Camperplaatsen', 'Receptie'];
  rows.forEach((label, i) => {
    const y = 66 + i * 96;
    ctx.fillText(label, 236, y + 2);
    const x = 150;
    if (i === 0) {
      carIcon(ctx, x, y - 2, 30);
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(62, y + 26); ctx.lineTo(62, y - 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(62, y - 34); ctx.lineTo(84, y - 8); ctx.lineTo(40, y - 8); ctx.closePath(); ctx.fill();
    } else if (i === 1) {
      tent(ctx, x, y + 26, 50, '#1d2227');
    } else if (i === 2) {
      ctx.beginPath(); ctx.roundRect(x - 38, y - 26, 76, 44, 8); ctx.fill();
      ctx.fillStyle = '#1d2227';
      ctx.fillRect(x - 28, y - 16, 24, 16);
      ctx.fillRect(x + 4, y - 16, 22, 16);
      ctx.fillStyle = '#f2f4ee';
      ctx.beginPath(); ctx.arc(x - 16, y + 22, 9, 0, Math.PI * 2); ctx.arc(x + 20, y + 22, 9, 0, Math.PI * 2); ctx.fill();
    } else {
      for (const dx of [-17, 17]) {
        ctx.beginPath(); ctx.arc(x + dx, y - 20, 11, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.roundRect(x + dx - 14, y - 6, 28, 36, 8); ctx.fill();
      }
    }
  });
  return finish(canvas);
}

/** Bordje onder de camera. */
export function anprTexture(): CanvasTexture {
  const { canvas, ctx } = canvasOf(384, 384);
  ctx.fillStyle = '#1d2227';
  ctx.beginPath(); ctx.roundRect(0, 0, 384, 384, 26); ctx.fill();
  ctx.strokeStyle = '#f2f4ee';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(10, 10, 364, 364, 20); ctx.stroke();
  ctx.fillStyle = '#f2f4ee';
  carIcon(ctx, 192, 116, 66);
  ctx.textAlign = 'center';
  ctx.font = `600 66px ${FONT}`;
  ctx.fillText('Kenteken', 192, 258);
  ctx.fillText('herkenning', 192, 328);
  return finish(canvas);
}

/** Voorkant van de intercom: scherm met tekst, cameraoog, luidspreker en belknop. */
export function intercomTexture(): CanvasTexture {
  const { canvas, ctx } = canvasOf(256, 640);
  const metal = ctx.createLinearGradient(0, 0, 256, 0);
  metal.addColorStop(0, '#8d9297'); metal.addColorStop(0.5, '#c3c7cb'); metal.addColorStop(1, '#8d9297');
  ctx.fillStyle = metal;
  ctx.fillRect(0, 0, 256, 640);
  ctx.fillStyle = '#15191d';
  ctx.beginPath(); ctx.roundRect(18, 18, 220, 300, 16); ctx.fill();
  ctx.strokeStyle = '#f2f4ee';
  ctx.fillStyle = '#f2f4ee';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  for (const r of [28, 52, 76]) { ctx.beginPath(); ctx.arc(128, 150, r, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(128, 152, 9, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `600 46px ${FONT}`;
  ctx.fillText('Intercom', 128, 230);
  ctx.fillText('Receptie', 128, 280);
  // cameraoog
  ctx.fillStyle = '#15191d';
  ctx.beginPath(); ctx.arc(128, 392, 36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f4a66';
  ctx.beginPath(); ctx.arc(128, 392, 17, 0, Math.PI * 2); ctx.fill();
  // luidspreker
  ctx.fillStyle = '#4b5055';
  for (let row = 0; row < 4; row++) for (let col = 0; col < 9; col++) {
    ctx.beginPath(); ctx.arc(48 + col * 20, 470 + row * 18, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  // belknop
  ctx.fillStyle = '#2a2e32';
  ctx.beginPath(); ctx.arc(128, 588, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e9b63a';
  ctx.beginPath(); ctx.arc(128, 588, 19, 0, Math.PI * 2); ctx.fill();
  return finish(canvas);
}

export function helpTexture(): CanvasTexture {
  const { canvas, ctx } = canvasOf(384, 160);
  ctx.fillStyle = '#1d2227';
  ctx.beginPath(); ctx.roundRect(0, 0, 384, 160, 14); ctx.fill();
  ctx.fillStyle = '#f2f4ee';
  ctx.textAlign = 'center';
  ctx.font = `600 58px ${FONT}`;
  ctx.fillText('Druk voor hulp', 192, 74);
  ctx.font = `400 38px ${FONT}`;
  ctx.fillText('Press for assistance', 192, 126);
  return finish(canvas);
}

/** Vlag naast de ingang. */
export function bannerTexture(): CanvasTexture {
  const { canvas, ctx } = canvasOf(256, 640);
  ctx.fillStyle = '#eef0ea';
  ctx.fillRect(0, 0, 256, 640);
  ctx.fillStyle = '#2f4a34';
  pine(ctx, 96, 300, 170);
  pine(ctx, 164, 300, 210);
  ctx.fillRect(40, 300, 176, 6);
  ctx.textAlign = 'center';
  ctx.font = `600 70px ${FONT}`;
  ['Geniet', 'van de', 'natuur'].forEach((line, i) => ctx.fillText(line, 128, 400 + i * 76));
  return finish(canvas);
}

/** Afscheidsbordje bij de uitgang. */
export function farewellTexture(): CanvasTexture {
  const { canvas, ctx } = canvasOf(384, 384);
  planks(ctx, 384, 384, 96, [190, 146, 92], 21);
  ctx.fillStyle = '#22301f';
  ctx.textAlign = 'center';
  ctx.font = `italic 600 86px ${FONT}`;
  ctx.fillText('Tot ziens!', 192, 150);
  pine(ctx, 192, 330, 130);
  return finish(canvas);
}

export function receptionTexture(): CanvasTexture {
  const { canvas, ctx } = canvasOf(512, 96);
  ctx.fillStyle = '#23272b';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#e8eae4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 66px ${FONT}`;
  ctx.fillText('Receptie', 256, 52);
  return finish(canvas);
}

/** Gebladerte: lichte en donkere vlekjes. De kleur komt van de boom of struik zelf. */
export function foliageTexture(): CanvasTexture {
  const size = 256;
  const { canvas, ctx } = canvasOf(size, size);
  const random = randomOf(77);
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1500; i++) {
    const shade = random();
    const value = shade < 0.22 ? 96 + random() * 44 : 170 + random() * 85;
    ctx.fillStyle = `rgb(${value}, ${value}, ${value * 0.92})`;
    ctx.beginPath();
    ctx.ellipse(random() * size, random() * size, 4 + random() * 7, 2.5 + random() * 4, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, [3, 2]);
}

type Ground = 'gras' | 'asfalt' | 'grind' | 'mulch' | 'steen' | 'beton';
const GROUND: Record<Ground, { base: [number, number, number]; spread: number; blotch: string[] }> = {
  gras: { base: [66, 98, 46], spread: 26, blotch: ['rgba(40, 70, 30, .4)', 'rgba(126, 146, 66, .34)', 'rgba(88, 124, 52, .3)', 'rgba(150, 150, 84, .2)'] },
  asfalt: { base: [58, 60, 64], spread: 22, blotch: ['rgba(30, 30, 34, .16)', 'rgba(110, 110, 112, .1)'] },
  grind: { base: [168, 158, 136], spread: 46, blotch: ['rgba(120, 110, 90, .18)'] },
  mulch: { base: [74, 56, 40], spread: 44, blotch: ['rgba(40, 28, 18, .3)', 'rgba(120, 92, 62, .2)'] },
  steen: { base: [150, 146, 136], spread: 34, blotch: ['rgba(90, 88, 80, .28)', 'rgba(200, 196, 184, .22)', 'rgba(110, 120, 96, .16)'] },
  beton: { base: [176, 174, 166], spread: 20, blotch: ['rgba(120, 118, 110, .16)'] },
};

/** Korrelige ondergrond: basiskleur met spikkels en grotere vlekken, zodat een vlak niet egaal is. */
export function groundTexture(kind: Ground, repeatX: number, repeatY: number): CanvasTexture {
  const size = 512;
  const { canvas, ctx } = canvasOf(size, size);
  const { base, spread, blotch } = GROUND[kind];
  const random = randomOf(1234 + kind.length * 17);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const shade = (random() - 0.5) * spread;
    image.data[i] = base[0] + shade;
    image.data[i + 1] = base[1] + shade;
    image.data[i + 2] = base[2] + shade;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // De vlekken lopen over de rand door, zodat de herhaling niet opvalt.
  for (let i = 0; i < 46; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 30 + random() * 90;
    const color = blotch[Math.floor(random() * blotch.length)];
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = gradient;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
  if (kind === 'gras') {
    for (let i = 0; i < 5000; i++) {
      ctx.strokeStyle = random() < 0.5 ? 'rgba(44, 82, 34, .45)' : 'rgba(150, 176, 92, .35)';
      const x = random() * size;
      const y = random() * size;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (random() - 0.5) * 3, y - 2 - random() * 5); ctx.stroke();
    }
  }
  return finish(canvas, [repeatX, repeatY]);
}
