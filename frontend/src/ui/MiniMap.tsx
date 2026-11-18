// Plattegrond tijdens het rijden: de camping van bovenaf, met jouw auto in het midden. De camping ligt boven
// (zo kijk je ook als je aankomt), de openbare weg onder. De plekken komen uit scene/layout.ts.
import { useEffect, useRef } from 'react';
import { campLayout, CARAVANS, PARKED, PARKING, RECEPTION } from '../scene/layout';
import { specOf } from '../scene/Car';
import { playerPose, useGame, world } from '../sim/engine';
import { corners, type Box } from '../sim/obstacles';

const SIZE = 220;          // pixels van het kaartje
const SCALE = 3;           // pixels per meter: het kaartje toont zo ruim 70 meter
const WORLD = { x0: -120, x1: 120, z0: -120, z1: 75 };

/** Tekent eenmalig de hele camping op een groot canvas; daaruit wordt elk beeld het stuk rond de auto gehaald. */
function drawGround(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = (WORLD.x1 - WORLD.x0) * SCALE;
  canvas.height = (WORLD.z1 - WORLD.z0) * SCALE;
  const ctx = canvas.getContext('2d')!;
  const px = (x: number) => (x - WORLD.x0) * SCALE;
  const pz = (z: number) => (z - WORLD.z0) * SCALE;
  const rect = (x: number, z: number, w: number, d: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px(x - w / 2), pz(z - d / 2), w * SCALE, d * SCALE);
  };
  const shape = (box: Box, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    corners(box).forEach(([x, z], i) => (i ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z))));
    ctx.closePath();
    ctx.fill();
  };
  const text = (value: string, x: number, z: number, size = 11) => {
    ctx.font = `700 ${size * SCALE / 3}px "Barlow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20, 30, 20, .75)';
    ctx.strokeText(value, px(x), pz(z));
    ctx.fillStyle = '#fff';
    ctx.fillText(value, px(x), pz(z));
  };

  ctx.fillStyle = '#5b7d43';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const { trees, tents, hedge } = campLayout();

  // kampeervelden, wegen en de oprit
  rect(-29, -49, 30, 34, '#6c8c4c');
  rect(29, -49, 30, 34, '#6c8c4c');
  rect(0, 59.5, 240, 9, '#3a3e43');           // openbare weg
  rect(0, -27, 10.8, 164, '#4b5157');          // oprit en weg over de camping
  rect(PARKING.x, PARKING.z, PARKING.width, PARKING.depth, '#b4a68a');
  rect(RECEPTION.x, RECEPTION.z + 1.4, 13, 10, '#8b6b47');
  rect(RECEPTION.x, RECEPTION.z, 10, 6, '#5d4128');
  // middenstreep van de oprit
  ctx.fillStyle = '#dfe3d8';
  for (let z = -105; z < 54; z += 4) ctx.fillRect(px(-0.08), pz(z), 0.16 * SCALE, 2 * SCALE);
  // eiland tussen de slagbomen
  rect(0, 5, 2.6, 13, '#8f877a');
  // heg op de erfgrens en hek langs de oprit
  ctx.fillStyle = '#2f5a2a';
  for (const bush of hedge) ctx.fillRect(px(bush.x - 0.7), pz(bush.z - 0.7), 1.4 * SCALE, 1.4 * SCALE);
  rect(-6.1, 28, 0.25, 48, '#8a6238');
  rect(6.1, 28, 0.25, 48, '#8a6238');

  for (const caravan of [...CARAVANS, ...tents.filter((t) => t.camper)]) {
    shape({ x: caravan.x, z: caravan.z, halfW: 1.12, halfL: 2.4, turn: caravan.turn }, '#eeeeea');
  }
  for (const tent of tents.filter((t) => !t.camper)) shape({ x: tent.x, z: tent.z, halfW: 1.7, halfL: 1.5, turn: tent.turn }, tent.color);
  for (const car of PARKED) {
    const spec = specOf(car.model);
    shape({ x: PARKING.x + car.x, z: PARKING.z + car.z, halfW: spec.W / 2, halfL: spec.L / 2, turn: 0 }, car.color);
  }
  ctx.fillStyle = '#2d5228';
  for (const tree of trees) {
    ctx.beginPath();
    ctx.arc(px(tree.x), pz(tree.z), Math.max(2, 1.4 * tree.size * SCALE), 0, Math.PI * 2);
    ctx.fill();
  }

  text('Receptie', RECEPTION.x, RECEPTION.z);
  text('P  Bezoekers', PARKING.x, PARKING.z, 14);
  text('Kampeerveld', -29, -49);
  text('Kampeerveld', 29, -49);
  text('Openbare weg', 18, 59.5);
  text('IN', 3.3, 22);
  text('UIT', -3.3, 22);
  return canvas;
}

export function MiniMap() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ground = drawGround();
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const ctx = canvas.current?.getContext('2d');
      const { playerVehicle, vehicles } = useGame.getState();
      if (!ctx || !playerVehicle) return;
      const me = playerPose(playerVehicle);
      // Het stuk van de camping rond de auto.
      const left = (me.x - WORLD.x0) * SCALE - SIZE / 2;
      const top = (me.z - WORLD.z0) * SCALE - SIZE / 2;
      ctx.fillStyle = '#5b7d43';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(ground, left, top, SIZE, SIZE, 0, 0, SIZE, SIZE);
      const sx = (x: number) => (x - WORLD.x0) * SCALE - left;
      const sz = (z: number) => (z - WORLD.z0) * SCALE - top;

      // Slagbomen: rood als ze dicht zijn, groen als ze open staan.
      ctx.lineWidth = 3;
      for (const [lane, x0, x1] of [['in', 1.1, 5.2], ['out', -1.1, -5.2]] as const) {
        ctx.strokeStyle = world.barrier[lane] ? '#3fd16b' : '#ff3b30';
        ctx.beginPath();
        ctx.moveTo(sx(x0), sz(0));
        ctx.lineTo(world.barrier[lane] ? sx(x0) : sx(x1), world.barrier[lane] ? sz(lane === 'in' ? -2.5 : 2.5) : sz(0));
        ctx.stroke();
      }
      // De camera bij de ingang.
      ctx.fillStyle = '#4fd1c5';
      ctx.beginPath();
      ctx.arc(sx(1.45), sz(1.33), 3, 0, Math.PI * 2);
      ctx.fill();

      // Andere voertuigen (alleen in de simulatie).
      for (const other of vehicles) {
        if (other === playerVehicle) continue;
        ctx.fillStyle = other.type === 'ambulance' ? '#f4d21f' : '#e4e2da';
        ctx.fillRect(sx((other.lane === 'in' ? 3.3 : -3.3) - 0.9), sz(other.z - 2.2), 1.8 * SCALE, 4.4 * SCALE);
      }

      // Jouw auto: een pijl in de rijrichting, altijd in het midden.
      ctx.save();
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(-me.heading);
      ctx.fillStyle = '#4fd1c5';
      ctx.strokeStyle = '#081018';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section className="minikaart" aria-label="Plattegrond">
      <canvas ref={canvas} width={SIZE} height={SIZE} />
      <p className="minikaart-noord" aria-hidden="true">camping ↑</p>
    </section>
  );
}
