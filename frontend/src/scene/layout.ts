// Waar alles op de camping staat: bomen, tenten, caravans, struiken en geparkeerde auto's.
// De 3D-wereld tekent deze indeling en de rijsimulatie gebruikt hem om te botsen (sim/obstacles.ts).
import { seeded, type BushSpot, type TreeSpot, type TuftSpot } from './Nature';

export interface TentSpot { x: number; z: number; color: string; turn: number; camper: boolean }

export interface CampLayout {
  trees: TreeSpot[];
  tents: TentSpot[];
  hedge: BushSpot[];
  shrubs: BushSpot[];
  flowers: TuftSpot[];
}

/** Vaste caravans rond de receptie en de parkeerplaats. */
export const CARAVANS: { x: number; z: number; turn: number }[] = [
  { x: 26.5, z: -8, turn: 0.35 },
  { x: 29, z: -19, turn: -0.2 },
  { x: -11, z: -29, turn: 1.3 },
  { x: -73, z: -12, turn: 0.15 },
];

export const RECEPTION = { x: 14.5, z: -15 };
/** De grote parkeerplaats voor bezoekers, links van de weg: 2 rijen van 16 vakken met een rijbaan ertussen. */
export const PARKING = { x: -35, z: -15, width: 59, depth: 22 };
/** Plek van het parkeerbord, ten opzichte van het midden van de parkeerplaats. */
export const PARKING_SIGN = { x: 27.5, z: 10.4 };
/** Lantaarnpalen langs de oprit: aan beide kanten, op deze afstanden. */
export const LAMP_POSTS = { x: 6.6, z: [30, -22, -48] };

/** Geparkeerde auto's, met hun plek ten opzichte van het midden van de parkeerplaats. */
export const PARKED: { x: number; z: number; color: string; model: string; plate: string }[] = [
  { x: -4.5, z: -8.5, color: '#2e5e8c', model: 'Audi RS4 Avant', plate: 'K-553-HV' },
  { x: 1.5, z: -8.5, color: '#e4e2da', model: 'Volkswagen Golf', plate: 'R-218-DX' },
  { x: 4.5, z: -8.5, color: '#3b3f45', model: 'Tesla Model 3', plate: 'T-640-NB' },
];

let made: CampLayout | null = null;

/** De indeling is elke keer dezelfde: het toeval heeft een vast beginpunt. */
export function campLayout(): CampLayout {
  if (made) return made;
  const random = seeded(42);
  const trees: TreeSpot[] = [];
  // laan langs de oprit, zoals op de schets
  for (const z of [13, 25, 37, 49]) for (const side of [-1, 1]) {
    trees.push({ x: side * (9.6 + random() * 1.5), z: z + random() * 3, size: 1.05 + random() * 0.3 });
  }
  while (trees.length < 78) {
    const x = (random() - 0.5) * 190;
    const z = 50 - random() * 150;
    const onRoad = Math.abs(x) < 12;
    const onYard = x > 4 && x < 30 && z < -3 && z > -30;
    const onParking = x < -4 && x > -67 && z < -2 && z > -28;
    const onField = Math.abs(x) > 12 && Math.abs(x) < 46 && z < -32 && z > -66;
    if (onRoad || onYard || onParking || onField || Math.abs(z) < 4) continue;
    trees.push({ x, z, size: 0.85 + random() * 0.6, pine: random() < 0.22 });
  }
  // bosrand achter de camping en aan de overkant van de weg
  for (let i = 0; i < 56; i++) trees.push({ x: -150 + i * 5.4 + random() * 3, z: -104 - random() * 26, size: 1.2 + random() * 0.6, pine: random() < 0.3 });
  for (let i = 0; i < 30; i++) trees.push({ x: -150 + i * 10 + random() * 6, z: 72 + random() * 22, size: 1 + random() * 0.6, pine: random() < 0.2 });

  const colors = ['#e8834a', '#f2c94c', '#5aa0c8', '#d95f5f', '#7fb069', '#f4f3ec'];
  const tents = Array.from({ length: 14 }, (_, i): TentSpot => ({
    x: (i % 2 ? 1 : -1) * (15 + random() * 28), z: -35 - random() * 28,
    color: colors[Math.floor(random() * colors.length)], turn: random() * Math.PI, camper: i % 4 === 0,
  }));

  // heg op de erfgrens
  const hedge: BushSpot[] = [];
  for (const side of [-1, 1]) for (let x = 6.6; x < 70; x += 1.5) hedge.push({ x: side * x, z: (random() - 0.5) * 0.7, size: 1.15 + random() * 0.4 });
  // struiken en bloemen rond de receptie, de parkeerplaats en langs de oprit
  const shrubs: BushSpot[] = [];
  const flowers: TuftSpot[] = [];
  const kinds = ['lavendel', 'bloem', 'gras'] as const;
  for (const side of [-1, 1]) for (let z = 4; z < 54; z += 2.6) {
    if (random() < 0.7) shrubs.push({ x: side * (6.9 + random() * 1.2), z: z + random(), size: 0.42 + random() * 0.3 });
    if (random() < 0.6) flowers.push({ x: side * (6.6 + random() * 1.4), z: z + 1.2 + random(), size: 0.7 + random() * 0.4, kind: kinds[Math.floor(random() * 3)] });
  }
  for (let i = 0; i < 16; i++) {
    shrubs.push({ x: 6.4 + random() * 1.6, z: -3 - i * 1.5, size: 0.6 + random() * 0.5 });
    flowers.push({ x: 6.2 + random() * 2.4, z: -2.4 - i * 1.5, size: 0.7 + random() * 0.4, kind: kinds[i % 3] });
    // Langs de weg, behalve bij de inrit van de parkeerplaats.
    const roadside = { x: -5.8 - random() * 0.8, z: -3 - i * 1.3, size: 0.55 + random() * 0.4 };
    if (Math.abs(roadside.z - PARKING.z) > 5) shrubs.push(roadside);
  }
  for (let x = 9; x < 21; x += 1.4) shrubs.push({ x, z: -24.5 + random() * 0.6, size: 0.8 + random() * 0.4 });
  made = { trees, tents, hedge, shrubs, flowers };
  return made;
}
