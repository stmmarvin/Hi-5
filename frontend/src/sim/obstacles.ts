// Alles waar de zelf bestuurde auto tegenaan kan rijden: gebouwen, caravans, tenten, bomen, palen en
// geparkeerde auto's. De plekken komen uit scene/layout.ts, dezelfde indeling als de 3D-wereld tekent.
import { specOf } from '../scene/Car';
import { BERT, campLayout, CARAVANS, LAMP_POSTS, PARKED, PARKING, PARKING_SIGN, RECEPTION } from '../scene/layout';

/** Rechthoek op de grond. De lengte ligt langs de eigen z-as; `turn` is de draaiing om de y-as. */
export interface Box { x: number; z: number; halfW: number; halfL: number; turn: number }
interface Circle { x: number; z: number; r: number }

/** De vier hoekpunten van een rechthoek, als [x, z]. */
export function corners(box: Box): [number, number][] {
  const cos = Math.cos(box.turn);
  const sin = Math.sin(box.turn);
  return ([[1, 1], [1, -1], [-1, -1], [-1, 1]] as const).map(([w, l]) => [
    box.x + w * box.halfW * cos + l * box.halfL * sin,
    box.z - w * box.halfW * sin + l * box.halfL * cos,
  ]);
}

/** Overlappen twee gedraaide rechthoeken? (scheidende-assen-test) */
export function boxesOverlap(a: Box, b: Box): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const reach = a.halfW + a.halfL + b.halfW + b.halfL;
  if (Math.abs(dx) > reach || Math.abs(dz) > reach) return false;
  const axes = [a, b].flatMap((box) => {
    const cos = Math.cos(box.turn);
    const sin = Math.sin(box.turn);
    return [[cos, -sin], [sin, cos]];
  });
  const radius = (box: Box, nx: number, nz: number) => {
    const cos = Math.cos(box.turn);
    const sin = Math.sin(box.turn);
    return box.halfW * Math.abs(cos * nx - sin * nz) + box.halfL * Math.abs(sin * nx + cos * nz);
  };
  return axes.every(([nx, nz]) => Math.abs(dx * nx + dz * nz) <= radius(a, nx, nz) + radius(b, nx, nz));
}

function circleOverlaps(box: Box, circle: Circle): boolean {
  const dx = circle.x - box.x;
  const dz = circle.z - box.z;
  const cos = Math.cos(box.turn);
  const sin = Math.sin(box.turn);
  // Het middelpunt van de cirkel, gezien vanuit de rechthoek.
  const across = dx * cos - dz * sin;
  const along = dx * sin + dz * cos;
  const nearX = across - Math.max(-box.halfW, Math.min(box.halfW, across));
  const nearZ = along - Math.max(-box.halfL, Math.min(box.halfL, along));
  return nearX * nearX + nearZ * nearZ < circle.r * circle.r;
}

/** Een caravan met dissel: de dissel steekt aan de voorkant uit. */
function caravanBox({ x, z, turn }: { x: number; z: number; turn: number }): Box {
  const shift = 0.52;
  return { x: x + shift * Math.sin(turn), z: z + shift * Math.cos(turn), halfW: 1.14, halfL: 2.93, turn };
}

let scenery: { boxes: Box[]; circles: Circle[] } | null = null;

function buildScenery() {
  const { trees, tents } = campLayout();
  const boxes: Box[] = [
    // receptie met terras
    { x: RECEPTION.x, z: RECEPTION.z + 1.4, halfW: 6.5, halfL: 5, turn: 0 },
    ...CARAVANS.map(caravanBox),
    ...tents.map((tent) => (tent.camper ? caravanBox(tent) : { x: tent.x, z: tent.z, halfW: 1.7, halfL: 1.5, turn: tent.turn })),
    ...PARKED.map((car) => {
      const spec = specOf(car.model);
      return { x: PARKING.x + car.x, z: PARKING.z + car.z, halfW: spec.W / 2, halfL: spec.L / 2, turn: 0 };
    }),
  ];
  const circles: Circle[] = [
    // boomstammen
    ...trees.map((tree) => ({ x: tree.x, z: tree.z, r: 0.2 * tree.size + 0.1 })),
    ...LAMP_POSTS.z.flatMap((z) => [-1, 1].map((side) => ({ x: side * LAMP_POSTS.x, z, r: 0.15 }))),
    // Boer Bert en zijn bedieningskast bij de slagboom
    { x: BERT.x, z: BERT.z, r: 0.35 },
    { x: BERT.post.x, z: BERT.post.z, r: 0.2 },
    // paal van het parkeerbord
    { x: PARKING.x + PARKING_SIGN.x, z: PARKING.z + PARKING_SIGN.z, r: 0.12 },
    // picknicktafel met parasol op het terras
    { x: RECEPTION.x - 8.6, z: RECEPTION.z + 3.2, r: 1.1 },
    // mensen voor de receptie
    ...[[-3.6, 5.4], [-2.2, 6.1], [-1.3, 5.5]].map(([x, z]) => ({ x: RECEPTION.x + x, z: RECEPTION.z + z, r: 0.35 })),
  ];
  return { boxes, circles };
}

/** Raakt deze rechthoek (de auto) iets wat vast op de camping staat? */
export function hitsScenery(car: Box): boolean {
  scenery ??= buildScenery();
  return scenery.boxes.some((box) => boxesOverlap(car, box)) || scenery.circles.some((circle) => circleOverlaps(car, circle));
}
