// Personenauto's met een herkenbaar silhouet per model. Elk model is een zijaanzicht (motorkap, dak,
// achterkant) dat over de breedte van de auto wordt uitgetrokken, met daarop de details van het merk.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BufferAttribute, BufferGeometry, ExtrudeGeometry, MeshPhysicalMaterial, Path, PlaneGeometry, Shape, ShapeGeometry, Vector2,
  type Group, type Material,
} from 'three';
import type { SimVehicle } from '../sim/engine';
import type { Country } from '../types';
import {
  chromeMaterial, clearGlassMaterial, glassMaterial, headlightMaterial, Plates, taillightMaterial, trimMaterial, TurnSignals, Wheels,
} from './parts';

type Style = 'golf' | 'm2' | 'rs4' | 'corsa' | 'model3';

export interface Spec {
  style: Style;
  /** Lengte, breedte, hoogte en wielbasis in meters, zoals het echte model. */
  L: number; W: number; H: number; wb: number;
  wheel: number;
  /** Punten van het zijaanzicht (z langs de auto, voorkant is positief). */
  cowl: number; roofFront: number; roofRear: number; tailBase: number;
  belt: number; hood: number; deck: number;
  /** Plek van de stijlen tussen de zijruiten. */
  pillars: number[];
  darkWheels?: boolean;
  glassRoof?: boolean;
}

export const CAR_SPECS: Record<string, Spec> = {
  'Volkswagen Golf': {
    style: 'golf', L: 4.28, W: 1.79, H: 1.46, wb: 2.62, wheel: 0.32,
    cowl: 0.92, roofFront: 0.22, roofRear: -1.52, tailBase: -1.98, belt: 0.95, hood: 0.76, deck: 0.97, pillars: [-0.38, -1.22],
  },
  'BMW M2': {
    style: 'm2', L: 4.58, W: 1.89, H: 1.4, wb: 2.75, wheel: 0.35,
    cowl: 0.72, roofFront: 0.02, roofRear: -0.98, tailBase: -1.72, belt: 0.93, hood: 0.76, deck: 0.96, pillars: [-0.5],
    darkWheels: true,
  },
  'Audi RS4 Avant': {
    style: 'rs4', L: 4.78, W: 1.87, H: 1.41, wb: 2.83, wheel: 0.35,
    cowl: 0.98, roofFront: 0.28, roofRear: -1.9, tailBase: -2.24, belt: 0.94, hood: 0.75, deck: 0.96, pillars: [-0.32, -1.24],
    darkWheels: true,
  },
  'Opel Corsa F': {
    style: 'corsa', L: 4.06, W: 1.77, H: 1.43, wb: 2.54, wheel: 0.31,
    cowl: 0.95, roofFront: 0.28, roofRear: -1.38, tailBase: -1.87, belt: 0.96, hood: 0.78, deck: 0.98, pillars: [-0.3, -1.12],
  },
  'Tesla Model 3': {
    style: 'model3', L: 4.69, W: 1.85, H: 1.44, wb: 2.88, wheel: 0.34,
    cowl: 1.02, roofFront: 0.22, roofRear: -0.82, tailBase: -1.92, belt: 0.94, hood: 0.72, deck: 0.98, pillars: [-0.36],
    glassRoof: true,
  },
};

const DEFAULT_MODEL = 'Volkswagen Golf';
/** Maten van de cabine van de grote hulpverleningsvoertuigen: daarmee zit je hoger en verder naar voren. */
const CAB_SPECS: Record<string, Spec> = {
  'Mercedes Sprinter ambulance': {
    style: 'golf', L: 5.8, W: 2.05, H: 2.25, wb: 3.5, wheel: 0.4,
    cowl: 2.35, roofFront: 1.65, roofRear: -2.2, tailBase: -2.6, belt: 1.74, hood: 1.55, deck: 1.8, pillars: [],
  },
  'Scania brandweerwagen': {
    style: 'golf', L: 7.4, W: 2.4, H: 2.6, wb: 4.2, wheel: 0.5,
    cowl: 3.3, roofFront: 2.6, roofRear: -3.2, tailBase: -3.6, belt: 2.09, hood: 1.9, deck: 2.15, pillars: [],
  },
};

export const specOf = (model: string): Spec => CAR_SPECS[model] ?? CAB_SPECS[model] ?? CAR_SPECS[DEFAULT_MODEL];

export const SILL = 0.2;      // onderkant van de carrosserie boven de weg
const BEVEL = 0.09;    // afronding van de randen
export const CABIN_INSET = 0.22;

/** Maten van de kuip waarin het interieur staat (alleen bij de auto waar je in kunt kijken). */
export function cabinOf(spec: Spec) {
  const arch = spec.wheel + 0.065;
  return {
    /** Tussen deze twee punten is de carrosserie van boven open. */
    rear: Math.max(spec.tailBase, -spec.L / 2 + 0.13),
    front: spec.cowl,
    /** Schot tussen motorruimte en cabine: achter de voorste wielkast. */
    firewall: Math.min(spec.cowl, spec.wb / 2 - arch) - 0.03,
    /** Voorkant en bovenkant van de achterste wielkast. */
    archFront: -spec.wb / 2 + arch + 0.04,
    archTop: Math.min(spec.belt - 0.03, spec.wheel + arch + 0.04),
  };
}

/** Zet een zijaanzicht (x = lengte, y = hoogte) om in een vorm over de breedte van de auto. */
function extrude(shape: Shape, width: number, bevel = BEVEL): BufferGeometry {
  const depth = width - 2 * bevel;
  const geometry = new ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 5, curveSegments: 18,
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(depth / 2, 0, 0);
  return geometry;
}

function sideGeometry(points: [number, number][]): BufferGeometry {
  const shape = new Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  const geometry = new ShapeGeometry(shape);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

/** De cabine loopt naar het dak toe smaller, zoals bij een echte auto. */
function taper(geometry: BufferGeometry, belt: number, top: number): BufferGeometry {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = Math.min(1, Math.max(0, (position.getY(i) - belt) / (top - belt)));
    position.setX(i, position.getX(i) * (1 - 0.2 * t));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** De carrosserie zonder het vlak onder de ruiten, zodat je van boven de cabine in kijkt. */
function withoutLid(geometry: BufferGeometry, y: number, zFrom: number, zTo: number): BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.attributes.position;
  const keep: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const lid = [0, 1, 2].every((k) => Math.abs(position.getY(i + k) - y) < 1e-3
      && position.getZ(i + k) > zFrom - 1e-3 && position.getZ(i + k) < zTo + 1e-3);
    if (!lid) keep.push(i, i + 1, i + 2);
  }
  const result = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const attribute = source.attributes[name];
    if (!attribute) continue;
    const size = attribute.itemSize;
    const values = new Float32Array(keep.length * size);
    keep.forEach((vertex, i) => { for (let k = 0; k < size; k++) values[i * size + k] = attribute.getComponent(vertex, k); });
    result.setAttribute(name, new BufferAttribute(values, size));
  }
  return result;
}

interface Built {
  body: BufferGeometry;
  /** Open varianten: kuip, zijwand van de cabine met raamopeningen, dak en heldere voor- en achterruit. */
  tub: BufferGeometry;
  frame: BufferGeometry;
  shell: BufferGeometry;
  clearScreens: BufferGeometry[];
  cabin: BufferGeometry;
  roof: BufferGeometry;
  /** Zijruiten: de voorste eerst, zodat die apart open kan. */
  windows: BufferGeometry[];
  screens: BufferGeometry[];
}

const built = new Map<string, Built>();

function build(spec: Spec): Built {
  const { L, H, wb, wheel, cowl, roofFront, roofRear, tailBase, belt, hood, deck } = spec;
  const front = L / 2;
  const rear = -L / 2;
  const arch = wheel + 0.065;
  const dip = Math.asin((wheel - SILL) / arch);

  // Carrosserie tot aan de ruiten, met uitsparingen voor de wielen.
  const body = new Shape();
  body.moveTo(rear + 0.14, SILL);
  body.lineTo(rear + 0.02, SILL + 0.14);
  body.lineTo(rear, deck - 0.14);
  body.quadraticCurveTo(rear, deck, rear + 0.12, deck);
  body.lineTo(Math.max(tailBase, rear + 0.13), belt);
  body.lineTo(cowl, belt);
  body.quadraticCurveTo((cowl + front) / 2 + 0.15, belt - 0.03, front - 0.16, hood);
  body.quadraticCurveTo(front, hood, front, hood - 0.1);
  body.lineTo(front, SILL + 0.16);
  body.lineTo(front - 0.12, SILL);
  body.absarc(wb / 2, wheel, arch, -dip, Math.PI + dip, false);
  body.absarc(-wb / 2, wheel, arch, -dip, Math.PI + dip, false);
  body.closePath();

  // Cabine: voorruit, dak en achterruit.
  const cabin = new Shape();
  cabin.moveTo(tailBase, belt - 0.03);
  cabin.lineTo(roofRear, H - 0.04);
  cabin.quadraticCurveTo((roofRear + roofFront) / 2, H + 0.02, roofFront, H - 0.05);
  cabin.lineTo(cowl, belt - 0.03);
  cabin.closePath();

  // Dakpaneel (zwart glas bij een panoramadak).
  const roof = new Shape();
  roof.moveTo(roofRear + 0.12, H - 0.06);
  roof.quadraticCurveTo((roofRear + roofFront) / 2, H, roofFront - 0.12, H - 0.07);
  roof.lineTo(roofFront - 0.12, H - 0.1);
  roof.lineTo(roofRear + 0.12, H - 0.1);
  roof.closePath();

  // Zijruiten: het vlak tussen voor- en achterstijl, verdeeld door de tussenstijlen.
  const low = belt + 0.04;
  const high = H - 0.13;
  const span = H - 0.045 - (belt - 0.03);
  const frontEdge = (y: number) => cowl + ((roofFront - cowl) * (y - (belt - 0.03))) / span - 0.11;
  const rearEdge = (y: number) => tailBase + ((roofRear - tailBase) * (y - (belt - 0.03))) / span + 0.11;
  const cuts = [...spec.pillars].sort((a, b) => b - a);
  const windows: BufferGeometry[] = [];
  const openings: [number, number][][] = [];
  let previous: number | null = null;
  for (const cut of [...cuts, null]) {
    const start = previous === null ? null : previous - 0.045;
    const end = cut === null ? null : cut + 0.045;
    const outline: [number, number][] = [
      [start ?? frontEdge(low), low],
      [start ?? frontEdge(high), high],
      [end ?? rearEdge(high), high],
      [end ?? rearEdge(low), low],
    ];
    openings.push(outline);
    const window = sideGeometry(outline);
    window.translate((spec.W - CABIN_INSET) / 2 + 0.006, 0, 0);
    windows.push(taper(window, belt, H));
    previous = cut;
  }

  // Voor- en achterruit liggen als een plaat op de schuine kant van de cabine.
  const screen = (baseZ: number, topZ: number, outward: 1 | -1, width = spec.W - CABIN_INSET - 0.16) => {
    const y0 = belt + 0.03;
    const y1 = H - 0.1;
    const z0 = baseZ + ((topZ - baseZ) * (y0 - (belt - 0.03))) / span;
    const z1 = baseZ + ((topZ - baseZ) * (y1 - (belt - 0.03))) / span;
    const dz = z1 - z0;
    const dy = y1 - y0;
    const height = Math.hypot(dz, dy);
    const lift = 0.01;
    const plane = new PlaneGeometry(width, height);
    plane.rotateX(Math.atan2(dz, dy));
    plane.translate(0, (y0 + y1) / 2 + (Math.abs(dz) / height) * lift, (z0 + z1) / 2 + outward * (dy / height) * lift);
    return taper(plane, belt, H);
  };

  // Open cabine: een zijwand met raamopeningen (stijlen en dakrand) en een los dak, in plaats van een dicht blok.
  const frame = new Shape(cabin.getPoints(18));
  for (const outline of openings) frame.holes.push(new Path().setFromPoints(outline.map(([z, y]) => new Vector2(z, y))));
  const frameGeometry = extrude(frame, 0.07, 0.015);
  frameGeometry.translate((spec.W - CABIN_INSET) / 2 - 0.035, 0, 0);
  const shell = new Shape();
  shell.moveTo(roofRear, H - 0.04);
  shell.quadraticCurveTo((roofRear + roofFront) / 2, H + 0.02, roofFront, H - 0.05);
  shell.lineTo(roofFront, H - 0.12);
  shell.quadraticCurveTo((roofRear + roofFront) / 2, H - 0.05, roofRear, H - 0.11);
  shell.closePath();
  const bodyGeometry = extrude(body, spec.W);
  const clearWidth = spec.W - CABIN_INSET - 0.02;

  return {
    body: bodyGeometry,
    tub: withoutLid(bodyGeometry, belt, Math.max(tailBase, rear + 0.13), cowl),
    frame: taper(frameGeometry, belt, H),
    shell: taper(extrude(shell, spec.W - CABIN_INSET, 0.03), belt, H),
    clearScreens: [screen(cowl, roofFront, 1, clearWidth), screen(tailBase, roofRear, -1, clearWidth)],
    cabin: taper(extrude(cabin, spec.W - CABIN_INSET, 0.07), belt, H),
    roof: taper(extrude(roof, spec.W - CABIN_INSET - 0.2, 0.012), belt, H),
    windows,
    screens: [screen(cowl, roofFront, 1), screen(tailBase, roofRear, -1)],
  };
}

function geometryOf(model: string, spec: Spec): Built {
  let entry = built.get(model);
  if (!entry) {
    entry = build(spec);
    built.set(model, entry);
  }
  return entry;
}

function Box({ at, size, material }: { at: [number, number, number]; size: [number, number, number]; material: Material }) {
  return (
    <mesh position={at} material={material}>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Koplampen, grille en luchtinlaten: per merk anders. */
function Front({ spec, z }: { spec: Spec; z: number }) {
  const lampY = spec.hood - 0.12;
  const pair = (x: number, y: number, w: number, h: number, material: Material, d = 0.04) => [-1, 1].map((side) => (
    <Box key={`${x}${y}${side}`} at={[side * x, y, z]} size={[w, h, d]} material={material} />
  ));
  switch (spec.style) {
    case 'golf':
      return (
        <>
          {pair(0.6, lampY, 0.44, 0.085, headlightMaterial)}
          <Box at={[0, lampY, z]} size={[0.76, 0.035, 0.03]} material={trimMaterial} />
          <Box at={[0, lampY + 0.03, z]} size={[0.76, 0.012, 0.035]} material={headlightMaterial} />
          <Box at={[0, 0.36, z]} size={[1.34, 0.15, 0.03]} material={trimMaterial} />
        </>
      );
    case 'm2':
      return (
        <>
          {pair(0.66, lampY, 0.36, 0.12, headlightMaterial)}
          {/* liggende nieren, zonder omlijsting */}
          {pair(0.19, lampY - 0.02, 0.32, 0.16, trimMaterial)}
          <Box at={[0, 0.37, z]} size={[0.72, 0.18, 0.03]} material={trimMaterial} />
          {pair(0.69, 0.38, 0.34, 0.2, trimMaterial)}
        </>
      );
    case 'rs4':
      return (
        <>
          {pair(0.64, lampY + 0.01, 0.42, 0.085, headlightMaterial)}
          {/* brede, lage grille met honingraat */}
          <Box at={[0, 0.5, z]} size={[0.9, 0.36, 0.03]} material={trimMaterial} />
          <Box at={[0, 0.69, z]} size={[0.8, 0.02, 0.035]} material={chromeMaterial} />
          {pair(0.72, 0.4, 0.28, 0.2, trimMaterial)}
          <Box at={[0, 0.28, z - 0.04]} size={[1.6, 0.04, 0.16]} material={trimMaterial} />
        </>
      );
    case 'corsa':
      return (
        <>
          {pair(0.58, lampY, 0.4, 0.1, headlightMaterial)}
          <Box at={[0, lampY, z]} size={[0.74, 0.05, 0.03]} material={trimMaterial} />
          <Box at={[0, lampY, z]} size={[0.3, 0.014, 0.035]} material={chromeMaterial} />
          <Box at={[0, 0.37, z]} size={[1.1, 0.16, 0.03]} material={trimMaterial} />
        </>
      );
    case 'model3':
      return (
        <>
          {pair(0.63, lampY, 0.34, 0.1, headlightMaterial)}
          <Box at={[0, 0.3, z]} size={[1.1, 0.06, 0.03]} material={trimMaterial} />
          {pair(0.74, 0.36, 0.1, 0.14, trimMaterial)}
        </>
      );
  }
}

/** Achterlichten, spoilers en uitlaten: per merk anders. */
function Rear({ spec, z, paint }: { spec: Spec; z: number; paint: Material }) {
  const lampY = spec.deck - 0.16;
  const half = spec.W / 2;
  const pair = (x: number, y: number, w: number, h: number, material: Material) => [-1, 1].map((side) => (
    <Box key={`${x}${y}${side}`} at={[side * x, y, z]} size={[w, h, 0.04]} material={material} />
  ));
  const exhaust = (x: number, radius: number, wide = 1) => (
    <mesh key={x} position={[x, 0.27, z + 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[wide, 1, 1]} material={chromeMaterial}>
      <cylinderGeometry args={[radius, radius, 0.14, 14]} />
    </mesh>
  );
  const roofSpoiler = (
    <Box at={[0, spec.H - 0.05, spec.roofRear - 0.06]} size={[(spec.W - CABIN_INSET) * 0.78, 0.035, 0.26]} material={paint} />
  );
  switch (spec.style) {
    case 'golf':
      return (
        <>
          {pair(half - 0.3, lampY, 0.44, 0.12, taillightMaterial)}
          <Box at={[0, 0.3, z]} size={[1.3, 0.1, 0.03]} material={trimMaterial} />
          {roofSpoiler}
        </>
      );
    case 'm2':
      return (
        <>
          {pair(half - 0.32, lampY, 0.46, 0.1, taillightMaterial)}
          <Box at={[0, spec.deck + 0.03, -spec.L / 2 + 0.08]} size={[1.36, 0.035, 0.14]} material={trimMaterial} />
          <Box at={[0, 0.3, z]} size={[1.4, 0.18, 0.03]} material={trimMaterial} />
          {[-0.5, -0.34, 0.34, 0.5].map((x) => exhaust(x, 0.05))}
        </>
      );
    case 'rs4':
      return (
        <>
          {pair(half - 0.3, lampY, 0.42, 0.1, taillightMaterial)}
          <Box at={[0, lampY, z]} size={[1.0, 0.025, 0.035]} material={taillightMaterial} />
          <Box at={[0, 0.3, z]} size={[1.5, 0.18, 0.03]} material={trimMaterial} />
          {[-0.56, 0.56].map((x) => exhaust(x, 0.07, 1.6))}
          {roofSpoiler}
          {/* dakrails */}
          {[-1, 1].map((side) => (
            <Box key={side} at={[side * (half - CABIN_INSET / 2) * 0.74, spec.H + 0.01, (spec.roofFront + spec.roofRear) / 2]}
              size={[0.035, 0.03, spec.roofFront - spec.roofRear - 0.3]} material={chromeMaterial} />
          ))}
        </>
      );
    case 'corsa':
      return (
        <>
          {pair(half - 0.26, lampY, 0.32, 0.15, taillightMaterial)}
          <Box at={[0, 0.3, z]} size={[1.2, 0.1, 0.03]} material={trimMaterial} />
          {roofSpoiler}
        </>
      );
    case 'model3':
      return (
        <>
          {pair(half - 0.32, lampY, 0.46, 0.09, taillightMaterial)}
          <Box at={[0, spec.deck + 0.02, -spec.L / 2 + 0.07]} size={[1.3, 0.025, 0.1]} material={paint} />
          <Box at={[0, 0.29, z]} size={[1.3, 0.1, 0.03]} material={trimMaterial} />
        </>
      );
  }
}

interface CarBodyProps {
  model: string;
  color: string;
  plate?: string;
  country?: Country;
  /** Alleen bij rijdende auto's: wielen draaien, ramen en richtingaanwijzers werken. */
  vehicle?: SimVehicle;
  /** Heldere ruiten en een open cabine, zodat je van buiten het interieur ziet (zie Interior in Cockpit.tsx). */
  open?: boolean;
}

export function CarBody({ model, color, plate, country = 'NL', vehicle, open = false }: CarBodyProps) {
  const spec = specOf(model);
  const geometry = geometryOf(CAR_SPECS[model] ? model : DEFAULT_MODEL, spec);
  const paint = useMemo(() => new MeshPhysicalMaterial({
    color, roughness: 0.38, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.12,
  }), [color]);
  const front = spec.L / 2 + 0.006;
  const rear = -front;
  const side = spec.W / 2 + 0.004;
  const glass = open ? clearGlassMaterial : glassMaterial;
  const cabin = cabinOf(spec);
  // De voorste zijruiten zakken soepel in de deur als het raam open gaat.
  const frontWindows = useRef<(Group | null)[]>([]);
  useFrame((_, delta) => {
    const target = vehicle?.windowsOpen ? 0.06 : 1;
    for (const pane of frontWindows.current) {
      if (pane) pane.scale.y += (target - pane.scale.y) * Math.min(1, delta * 4);
    }
  });

  return (
    <>
      {open ? (
        <>
          <mesh geometry={geometry.tub} material={paint} castShadow receiveShadow />
          {[-1, 1].map((x) => <mesh key={x} geometry={geometry.frame} scale={[x, 1, 1]} material={paint} castShadow />)}
          <mesh geometry={geometry.shell} material={paint} castShadow />
          {/* binnenkant van de wielkasten voor en achter de cabine; de cabine zelf heeft een eigen vloer */}
          <Box at={[0, 0.46, (cabin.firewall + spec.L / 2 - 0.25) / 2]} size={[spec.W - 0.56, 0.56, spec.L / 2 - 0.25 - cabin.firewall]} material={trimMaterial} />
          {cabin.rear > -spec.L / 2 + 0.3 && (
            <Box at={[0, 0.46, (cabin.rear - spec.L / 2 + 0.25) / 2]} size={[spec.W - 0.56, 0.56, cabin.rear + spec.L / 2 - 0.25]} material={trimMaterial} />
          )}
        </>
      ) : (
        <>
          <mesh geometry={geometry.body} material={paint} castShadow receiveShadow />
          <mesh geometry={geometry.cabin} material={paint} castShadow />
          <mesh geometry={geometry.roof} material={spec.glassRoof ? glassMaterial : paint} />
          {/* bodem en binnenkant van de wielkasten */}
          <Box at={[0, 0.46, 0]} size={[spec.W - 0.56, 0.56, spec.L - 0.5]} material={trimMaterial} />
        </>
      )}

      {(open ? geometry.clearScreens : geometry.screens).map((screen, i) => (
        <mesh key={i} geometry={screen} material={glass} />
      ))}
      {[-1, 1].map((x) => geometry.windows.map((window, i) => (
        // Het raam van de bestuurder zakt in de deur als het open staat.
        <group key={`${x}${i}`} ref={i === 0 ? (group) => { frontWindows.current[x < 0 ? 0 : 1] = group; } : undefined} position={[0, spec.belt, 0]} scale={[x, 1, 1]}>
          <mesh geometry={window} position={[0, -spec.belt, 0]} material={glass} />
        </group>
      )))}

      {[-1, 1].map((x) => (
        <group key={x}>
          {/* buitenspiegel */}
          <Box at={[x * (spec.W / 2 - 0.02), spec.belt + 0.07, spec.cowl - 0.32]} size={[0.2, 0.1, 0.08]} material={paint} />
          {/* deurnaden en grepen */}
          {[spec.cowl - 0.42, ...spec.pillars].map((z) => (
            <Box key={z} at={[x * side, (SILL + spec.belt) / 2 + 0.04, z]} size={[0.006, spec.belt - SILL - 0.18, 0.012]} material={trimMaterial} />
          ))}
          {spec.pillars.map((z) => (
            <Box key={z} at={[x * side, spec.belt - 0.13, z + 0.16]} size={[0.014, 0.025, 0.15]} material={spec.style === 'model3' ? chromeMaterial : paint} />
          ))}
          {/* dorpel */}
          <Box at={[x * (spec.W / 2 - 0.01), SILL + 0.03, 0]} size={[0.04, 0.07, spec.wb - 2 * spec.wheel - 0.2]} material={trimMaterial} />
        </group>
      ))}

      <Front spec={spec} z={front} />
      <Rear spec={spec} z={rear} paint={paint} />

      <Wheels track={spec.W - 0.25} front={spec.wb / 2} rear={-spec.wb / 2} radius={spec.wheel} vehicle={vehicle} dark={spec.darkWheels} />
      {vehicle && <TurnSignals vehicle={vehicle} width={spec.W} front={front + 0.01} rear={rear - 0.01} y={spec.hood - 0.12} />}
      {plate && <Plates plate={plate} country={country} front={front + 0.012} rear={rear - 0.012} y={0.47} rearY={spec.style === 'm2' || spec.style === 'model3' ? 0.62 : 0.56} />}
    </>
  );
}

export function Car({ vehicle, open }: { vehicle: SimVehicle; open?: boolean }) {
  return <CarBody model={vehicle.model} color={vehicle.color} plate={vehicle.plate} country={vehicle.country} vehicle={vehicle} open={open} />;
}
