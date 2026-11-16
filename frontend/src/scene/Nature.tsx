// Bomen, struiken en planten. Alles wat vaak voorkomt wordt als één groep getekend (instancing),
// zodat honderden bladerbollen de computer nauwelijks belasten.
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color, ConeGeometry, CylinderGeometry, Euler, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3,
  type BufferGeometry, type InstancedMesh, type Material,
} from 'three';
import { foliageTexture } from './textures2';

export interface Item {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
}

export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Instances({ geometry, material, items, castShadow = true, receiveShadow = false }: {
  geometry: BufferGeometry; material: Material; items: Item[]; castShadow?: boolean; receiveShadow?: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const euler = new Euler();
    const color = new Color();
    items.forEach((item, i) => {
      euler.set(...(item.rotation ?? [0, 0, 0]));
      matrix.compose(new Vector3(...item.position), quaternion.setFromEuler(euler), new Vector3(...item.scale));
      target.setMatrixAt(i, matrix);
      target.setColorAt(i, color.set(item.color ?? '#ffffff'));
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

/** Bol met deuken en bulten: van een afstand een bladerdek. */
function lumpy(detail: number, amount: number): BufferGeometry {
  const geometry = new SphereGeometry(1, detail, Math.round(detail * 0.7));
  const position = geometry.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const bump = Math.sin(v.x * 4.1 + 1.3) * Math.sin(v.y * 3.7 + 0.5) * Math.sin(v.z * 4.3 + 2.1)
      + 0.5 * Math.sin(v.x * 9.3 + v.y * 7.1) * Math.sin(v.z * 8.7 + v.y * 3.3);
    v.multiplyScalar(1 + bump * amount);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

let shared: {
  blob: BufferGeometry; rock: BufferGeometry; trunk: BufferGeometry; cone: BufferGeometry; blade: BufferGeometry;
  leaves: MeshStandardMaterial; bark: MeshStandardMaterial; plain: MeshStandardMaterial;
} | null = null;

export function natureAssets() {
  if (!shared) {
    const blade = new ConeGeometry(0.5, 1, 4, 1);
    blade.translate(0, 0.5, 0);
    shared = {
      blob: lumpy(14, 0.16),
      rock: lumpy(12, 0.1),
      trunk: new CylinderGeometry(0.72, 1, 1, 9),
      cone: new ConeGeometry(1, 1, 10),
      blade,
      leaves: new MeshStandardMaterial({ map: foliageTexture(), roughness: 0.95 }),
      bark: new MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
      plain: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    };
  }
  return shared;
}

const LEAF_GREENS = ['#4f7f38', '#44702f', '#5b8c3e', '#3b652b', '#679645', '#4a7a3a'];
const BUSH_GREENS = ['#3f6e33', '#4b7c38', '#35602c', '#57873c'];

export interface TreeSpot { x: number; z: number; size: number; pine?: boolean }

/** Loofbomen met een hoge kruin en dennen, zoals rond de camping. */
export function Trees({ spots, seed = 5 }: { spots: TreeSpot[]; seed?: number }) {
  const assets = natureAssets();
  const { trunks, leaves, needles } = useMemo(() => {
    const random = seeded(seed);
    const trunks: Item[] = [];
    const leaves: Item[] = [];
    const needles: Item[] = [];
    for (const spot of spots) {
      const s = spot.size;
      if (spot.pine) {
        const height = 2.2 * s;
        trunks.push({ position: [spot.x, height / 2, spot.z], scale: [0.2 * s, height, 0.2 * s], color: '#4f3d2c' });
        [[1.9, 3.4, 3], [1.45, 3, 4.9], [0.95, 2.6, 6.5]].forEach(([r, h, y], i) => needles.push({
          position: [spot.x, y * s, spot.z], scale: [r * s, h * s, r * s], rotation: [0, random() * 3, 0],
          color: ['#2c5233', '#325c39', '#3a6840'][i],
        }));
        continue;
      }
      const height = (3.6 + random() * 1.4) * s;
      trunks.push({ position: [spot.x, height / 2, spot.z], scale: [0.2 * s, height, 0.2 * s], color: random() < 0.3 ? '#b9b3a4' : '#6a5744' });
      const crown = height + 1.5 * s;
      const count = 8 + Math.floor(random() * 4);
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const reach = (i === 0 ? 0 : 0.5 + random() * 1.3) * s;
        const r = (1.25 + random() * 0.9) * s;
        leaves.push({
          position: [spot.x + Math.cos(angle) * reach, crown + (random() - 0.45) * 2.6 * s, spot.z + Math.sin(angle) * reach],
          scale: [r, r * (0.8 + random() * 0.3), r],
          rotation: [random() * 3, random() * 3, random() * 3],
          color: LEAF_GREENS[Math.floor(random() * LEAF_GREENS.length)],
        });
      }
    }
    return { trunks, leaves, needles };
  }, [spots, seed]);
  return (
    <>
      <Instances geometry={assets.trunk} material={assets.bark} items={trunks} />
      <Instances geometry={assets.blob} material={assets.leaves} items={leaves} receiveShadow />
      <Instances geometry={assets.cone} material={assets.leaves} items={needles} />
    </>
  );
}

export interface BushSpot { x: number; z: number; size: number; y?: number }

/** Struiken: een paar lage bladerbollen tegen elkaar aan. */
export function Bushes({ spots, seed = 9, colors = BUSH_GREENS }: { spots: BushSpot[]; seed?: number; colors?: string[] }) {
  const assets = natureAssets();
  const items = useMemo(() => {
    const random = seeded(seed);
    return spots.flatMap((spot) => Array.from({ length: 3 }, (_, i): Item => {
      const r = spot.size * (0.55 + random() * 0.45);
      return {
        position: [spot.x + (random() - 0.5) * spot.size, (spot.y ?? 0) + r * 0.62, spot.z + (random() - 0.5) * spot.size],
        scale: [r, r * (0.75 + random() * 0.3), r],
        rotation: [random() * 3, random() * 3, i],
        color: colors[Math.floor(random() * colors.length)],
      };
    }));
  }, [spots, seed, colors]);
  return <Instances geometry={assets.blob} material={assets.leaves} items={items} receiveShadow />;
}

export interface TuftSpot { x: number; z: number; y?: number; size: number; kind: 'gras' | 'lavendel' | 'bloem' }

/** Siergras en lavendel: bosjes dunne halmen die naar buiten waaieren. */
export function Tufts({ spots, seed = 3 }: { spots: TuftSpot[]; seed?: number }) {
  const assets = natureAssets();
  const { blades, tips } = useMemo(() => {
    const random = seeded(seed);
    const blades: Item[] = [];
    const tips: Item[] = [];
    for (const spot of spots) {
      const y = spot.y ?? 0;
      const count = spot.kind === 'gras' ? 26 : 16;
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const lean = random() * (spot.kind === 'gras' ? 0.75 : 0.45);
        const length = spot.size * (0.6 + random() * 0.55);
        const rotation: [number, number, number] = [Math.cos(angle) * lean, 0, -Math.sin(angle) * lean];
        const base: [number, number, number] = [spot.x + Math.sin(angle) * 0.08 * spot.size, y, spot.z + Math.cos(angle) * 0.08 * spot.size];
        blades.push({
          position: base, scale: [0.05 * spot.size, length, 0.05 * spot.size], rotation,
          color: spot.kind === 'gras' ? ['#8fa35a', '#a9b56c', '#6f8a45', '#c2bd7c'][i % 4] : ['#5d7a4a', '#6c8754'][i % 2],
        });
        if (spot.kind !== 'gras') {
          // De bloei zit bovenaan de steel.
          const up = new Vector3(0, length, 0).applyEuler(new Euler(...rotation));
          tips.push({
            position: [base[0] + up.x, base[1] + up.y, base[2] + up.z],
            scale: [0.045 * spot.size, 0.11 * spot.size, 0.045 * spot.size], rotation,
            color: spot.kind === 'lavendel' ? ['#7d62b8', '#8f76c9', '#6a52a6'][i % 3] : ['#c45a7a', '#d98aa0', '#b04468'][i % 3],
          });
        }
      }
    }
    return { blades, tips };
  }, [spots, seed]);
  return (
    <>
      <Instances geometry={assets.blade} material={assets.plain} items={blades} castShadow={false} />
      <Instances geometry={assets.blob} material={assets.plain} items={tips} castShadow={false} />
    </>
  );
}
