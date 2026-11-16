// De ingang zoals op de schets van de camping: eiland met stoeprand, houten bord, routebord, zwerfkei
// en beplanting, de paal met camera en intercom, de vlag, het afscheidsbordje en de receptie.
import { useMemo } from 'react';
import { DoubleSide, ExtrudeGeometry, MeshStandardMaterial, Quaternion, Shape, Vector3, type Material } from 'three';
import { Bushes, Instances, natureAssets, seeded, Tufts, type Item, type TuftSpot } from './Nature';
import {
  anprTexture, bannerTexture, campSignTexture, farewellTexture, groundTexture, helpTexture, intercomTexture,
  receptionTexture, routeTexture, woodTexture,
} from './textures2';

type Point = [number, number, number];

const darkMetal = new MeshStandardMaterial({ color: '#25292d', roughness: 0.45, metalness: 0.7 });
const whiteMetal = new MeshStandardMaterial({ color: '#eceeef', roughness: 0.35, metalness: 0.3 });
const lensMaterial = new MeshStandardMaterial({ color: '#0c0f12', roughness: 0.1, metalness: 0.9 });
/** De verwarmde rand om de lens: gloeit als de lensverwarming aan staat (de scène zet de sterkte). */
export const heaterMaterial = new MeshStandardMaterial({ color: '#2a1608', emissive: '#ff7a1a', emissiveIntensity: 0 });

/** Langwerpige vorm met ronde koppen, plat op de grond. */
function stadium(halfWidth: number, halfLength: number, height: number): ExtrudeGeometry {
  const shape = new Shape();
  const straight = halfLength - halfWidth;
  shape.moveTo(-halfWidth, -straight);
  shape.lineTo(-halfWidth, straight);
  shape.absarc(0, straight, halfWidth, Math.PI, 0, true);
  shape.lineTo(halfWidth, -straight);
  shape.absarc(0, -straight, halfWidth, 0, Math.PI, true);
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 16 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function Island() {
  const assets = natureAssets();
  const made = useMemo(() => {
    const wood = woodTexture([1, 2]);
    return {
      kerb: stadium(1.5, 6.6, 0.2),
      bed: stadium(1.3, 6.4, 0.25),
      concrete: new MeshStandardMaterial({ map: groundTexture('beton', 2, 8), roughness: 0.95 }),
      mulch: new MeshStandardMaterial({ map: groundTexture('mulch', 2, 8), roughness: 1 }),
      stone: new MeshStandardMaterial({ map: groundTexture('steen', 2, 1.5), roughness: 0.9 }),
      wood: new MeshStandardMaterial({ map: wood, roughness: 0.85 }),
      sign: campSignTexture(),
      routes: routeTexture(),
    };
  }, []);

  const top = 0.27;
  const tufts = useMemo<TuftSpot[]>(() => [
    { x: 0.85, z: 10.4, size: 1.0, kind: 'gras' }, { x: -0.35, z: 11.0, size: 0.8, kind: 'gras' },
    { x: -0.9, z: 9.6, size: 0.95, kind: 'gras' }, { x: 0.65, z: 8.6, size: 0.75, kind: 'gras' },
    { x: -0.8, z: 8.5, size: 0.85, kind: 'lavendel' }, { x: -0.95, z: 10.5, size: 0.6, kind: 'lavendel' },
    { x: 0.9, z: 6.4, size: 0.85, kind: 'lavendel' }, { x: -0.9, z: 5.8, size: 0.85, kind: 'lavendel' },
    { x: 0.2, z: 5.1, size: 0.75, kind: 'lavendel' }, { x: 0.7, z: 9.5, size: 0.6, kind: 'bloem' },
    { x: -0.5, z: 4.2, size: 0.75, kind: 'bloem' }, { x: 0.75, z: 3.9, size: 0.65, kind: 'bloem' },
    { x: -0.2, z: 2.4, size: 0.7, kind: 'gras' },
  ].map((spot) => ({ ...spot, y: top }) as TuftSpot), []);
  const bushes = useMemo(() => [
    { x: -0.6, z: 6.6, size: 0.5, y: top }, { x: 0.45, z: 3.1, size: 0.55, y: top },
    { x: -0.7, z: 3.3, size: 0.5, y: top }, { x: 0.55, z: 5.6, size: 0.45, y: top }, { x: 0.3, z: 6.9, size: 0.4, y: top },
  ], []);
  const pebbles = useMemo(() => {
    const random = seeded(31);
    return Array.from({ length: 46 }, (): Item => {
      const r = 0.05 + random() * 0.07;
      const z = 9.2 + random() * 2.1;
      const reach = Math.min(1.1, Math.sqrt(Math.max(0, 1.3 ** 2 - Math.max(0, z - 10.1) ** 2)) - 0.15);
      return {
        position: [(random() - 0.5) * 2 * reach, top + r * 0.4, z], scale: [r, r * 0.7, r],
        rotation: [random() * 3, random() * 3, 0], color: ['#c9c6bc', '#a8a59b', '#dedbd0', '#8f8c84'][Math.floor(random() * 4)],
      };
    });
  }, []);

  return (
    <group>
      <group position={[0, 0, 5]}>
        <mesh geometry={made.kerb} material={made.concrete} castShadow receiveShadow />
        <mesh geometry={made.bed} material={made.mulch} receiveShadow />
      </group>

      <Tufts spots={tufts} />
      <Bushes spots={bushes} seed={4} />
      <Instances geometry={assets.rock} material={assets.plain} items={pebbles} castShadow={false} />
      {/* zwerfkei */}
      <mesh geometry={assets.rock} material={made.stone} position={[0.1, top + 0.4, 9.9]} scale={[0.95, 0.62, 0.72]} rotation={[0.2, 0.6, 0.1]} castShadow receiveShadow />
      {/* houten paaltjes */}
      {([[-0.98, 9.0], [0.98, 8.9]] as const).map(([x, z]) => (
        <mesh key={x} position={[x, top + 0.42, z]} material={made.wood} castShadow>
          <cylinderGeometry args={[0.11, 0.12, 0.9, 10]} />
        </mesh>
      ))}

      {/* houten bord met daaronder het routebord */}
      <group position={[-0.3, 0.2, 7.4]} scale={1.2}>
        {[-0.88, 0.88].map((x) => (
          <mesh key={x} position={[x, 2.25, 0]} material={made.wood} castShadow>
            <boxGeometry args={[0.2, 4.5, 0.2]} />
          </mesh>
        ))}
        {[4.28, 2.74].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={made.wood} castShadow>
            <boxGeometry args={[1.98, 0.13, 0.16]} />
          </mesh>
        ))}
        <mesh position={[0, 3.5, 0]} material={made.wood} castShadow>
          <boxGeometry args={[1.6, 1.36, 0.08]} />
        </mesh>
        <mesh position={[0, 3.5, 0.045]}><planeGeometry args={[1.6, 1.33]} /><meshStandardMaterial map={made.sign} roughness={0.85} /></mesh>
        <mesh position={[0, 1.9, 0]} castShadow>
          <boxGeometry args={[1.6, 1.05, 0.06]} />
          <meshStandardMaterial color="#1d2227" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.9, 0.035]}><planeGeometry args={[1.6, 1.05]} /><meshStandardMaterial map={made.routes} roughness={0.6} /></mesh>
      </group>
    </group>
  );
}

/** Bewakingscamera op een beugel, gericht op het kenteken van de wachtende auto. */
function CameraHead({ at, target }: { at: Point; target: Point }) {
  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, 1), new Vector3(...target).sub(new Vector3(...at)).normalize(),
  ), [at, target]);
  return (
    <group position={at} quaternion={quaternion}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={whiteMetal} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.5, 16]} />
      </mesh>
      <mesh position={[0, 0.1, 0.04]} material={whiteMetal}>
        <boxGeometry args={[0.24, 0.02, 0.62]} />
      </mesh>
      <mesh position={[0, 0, 0.26]} rotation={[Math.PI / 2, 0, 0]} material={lensMaterial}>
        <cylinderGeometry args={[0.075, 0.075, 0.03, 16]} />
      </mesh>
      {/* verwarmde rand om de lens, tegen condens en ijs */}
      <mesh position={[0, 0, 0.262]} material={heaterMaterial}>
        <torusGeometry args={[0.085, 0.012, 8, 20]} />
      </mesh>
    </group>
  );
}

export function Poles({ lampMaterial }: { lampMaterial: Material }) {
  const made = useMemo(() => ({ anpr: anprTexture(), intercom: intercomTexture(), help: helpTexture() }), []);
  const poles: { side: 1 | -1; at: Point; target: Point }[] = [
    { side: 1, at: [1.15, 0, 1.15], target: [3.3, 0.5, 2.6] },
    { side: -1, at: [-1.15, 0, -1.15], target: [-3.3, 0.5, -2.6] },
  ];
  return (
    <>
      {poles.map(({ side, at, target }) => (
        <group key={side}>
          <mesh position={[at[0], 1.95, at[2]]} material={darkMetal} castShadow>
            <cylinderGeometry args={[0.075, 0.09, 3.9, 12]} />
          </mesh>
          <mesh position={[at[0], 3.98, at[2]]} material={lampMaterial}>
            <sphereGeometry args={[0.13, 12, 8]} />
          </mesh>
          {/* Alleen de ingang heeft een camera en het bordje "Kentekenherkenning"; bij de uitgang staat alleen de lantaarn. */}
          {side > 0 && (
            <>
              <mesh position={[at[0] + side * 0.14, 3.52, at[2] + side * 0.08]} material={darkMetal}>
                <boxGeometry args={[0.3, 0.06, 0.2]} />
              </mesh>
              <CameraHead at={[at[0] + side * 0.3, 3.62, at[2] + side * 0.18]} target={target} />
              <group position={[at[0], 2.7, at[2] + side * 0.1]}>
                <mesh material={darkMetal}><boxGeometry args={[0.74, 0.74, 0.03]} /></mesh>
                <mesh position={[0, 0, 0.02]}><planeGeometry args={[0.72, 0.72]} /><meshStandardMaterial map={made.anpr} roughness={0.5} /></mesh>
              </group>
            </>
          )}
        </group>
      ))}

      {/* intercom naast het raam van de bestuurder */}
      <group position={[1.22, 0, 4.7]}>
        <mesh position={[0, 0.95, 0]} material={darkMetal} castShadow>
          <boxGeometry args={[0.14, 1.9, 0.18]} />
        </mesh>
        <mesh position={[0.12, 1.38, 0]} material={darkMetal} castShadow>
          <boxGeometry args={[0.12, 0.96, 0.42]} />
        </mesh>
        <mesh position={[0.185, 1.38, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.37, 0.92]} /><meshStandardMaterial map={made.intercom} roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0.08, 0.74, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.4, 0.17]} /><meshStandardMaterial map={made.help} roughness={0.6} />
        </mesh>
      </group>
    </>
  );
}

/** Vlag met "Geniet van de natuur" en het bordje "Tot ziens!". */
export function Welcome() {
  const made = useMemo(() => ({
    banner: bannerTexture(), farewell: farewellTexture(), wood: new MeshStandardMaterial({ map: woodTexture([1, 2]), roughness: 0.85 }),
  }), []);
  return (
    <>
      <group position={[8.6, 0, 3.5]}>
        <mesh position={[0, 3.9, 0]} material={whiteMetal} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 7.8, 10]} />
        </mesh>
        <mesh position={[0.62, 7.55, 0]} material={whiteMetal}><boxGeometry args={[1.3, 0.04, 0.04]} /></mesh>
        <mesh position={[0.7, 5.95, 0]} castShadow>
          <planeGeometry args={[1.25, 3.12]} />
          <meshStandardMaterial map={made.banner} side={DoubleSide} roughness={0.9} />
        </mesh>
      </group>
      <group position={[-7.4, 0, 9]} rotation={[0, 0.25, 0]}>
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} position={[x, 0.8, 0]} material={made.wood} castShadow><boxGeometry args={[0.12, 1.6, 0.12]} /></mesh>
        ))}
        <mesh position={[0, 0.95, 0]} material={made.wood} castShadow><boxGeometry args={[1.12, 1.12, 0.06]} /></mesh>
        <mesh position={[0, 0.95, 0.035]}><planeGeometry args={[1.1, 1.1]} /><meshStandardMaterial map={made.farewell} roughness={0.85} /></mesh>
      </group>
    </>
  );
}

export function Caravan({ position, turn = 0 }: { position: Point; turn?: number }) {
  return (
    <group position={position} rotation={[0, turn, 0]}>
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.25, 2, 4.8]} />
        <meshStandardMaterial color="#eeeeea" roughness={0.55} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <boxGeometry args={[2.05, 0.14, 4.5]} />
        <meshStandardMaterial color="#e2e2dc" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.95, 0]}><boxGeometry args={[2.27, 0.16, 4.82]} /><meshStandardMaterial color="#8d949a" roughness={0.6} /></mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[-1.2, 0.5].map((z) => (
            <mesh key={z} position={[side * 1.131, 1.7, z]} rotation={[0, side * Math.PI / 2, 0]}>
              <planeGeometry args={[1.1, 0.62]} /><meshStandardMaterial color="#1a242c" roughness={0.15} metalness={0.4} />
            </mesh>
          ))}
          <mesh position={[side * 1.05, 0.34, -0.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.34, 0.34, 0.2, 16]} /><meshStandardMaterial color="#17191b" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.75, 2.405]}><planeGeometry args={[1.5, 0.7]} /><meshStandardMaterial color="#1a242c" roughness={0.15} metalness={0.4} /></mesh>
      <mesh position={[0, 0.5, 2.9]}><boxGeometry args={[0.1, 0.1, 1.1]} /><meshStandardMaterial color="#4b5055" /></mesh>
    </group>
  );
}

function Person({ position, shirt, turn = 0 }: { position: Point; shirt: string; turn?: number }) {
  return (
    <group position={position} rotation={[0, turn, 0]}>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.42, 0]} castShadow><capsuleGeometry args={[0.075, 0.7, 4, 8]} /><meshStandardMaterial color="#3b4658" roughness={0.9} /></mesh>
      ))}
      <mesh position={[0, 1.15, 0]} castShadow><capsuleGeometry args={[0.19, 0.36, 4, 10]} /><meshStandardMaterial color={shirt} roughness={0.9} /></mesh>
      <mesh position={[0, 1.66, 0]} castShadow><sphereGeometry args={[0.12, 12, 10]} /><meshStandardMaterial color="#d9a986" roughness={0.8} /></mesh>
    </group>
  );
}

/** Houten receptie met plat dak en een glazen pui, met terras ervoor. */
export function Reception({ windowMaterial }: { windowMaterial: Material }) {
  const made = useMemo(() => {
    const cladding = woodTexture([4, 1], [128, 92, 60]);
    cladding.rotation = Math.PI / 2;
    return {
      cladding: new MeshStandardMaterial({ map: cladding, roughness: 0.85 }),
      deck: new MeshStandardMaterial({ map: woodTexture([3, 4], [150, 118, 84]), roughness: 0.9 }),
      post: new MeshStandardMaterial({ map: woodTexture([1, 2], [140, 104, 66]), roughness: 0.85 }),
      roof: new MeshStandardMaterial({ color: '#2a2d30', roughness: 0.7 }),
      label: receptionTexture(),
    };
  }, []);
  return (
    <group position={[14.5, 0, -15]}>
      <mesh position={[0, 0.08, 1.4]} material={made.deck} receiveShadow><boxGeometry args={[13, 0.16, 10]} /></mesh>
      <mesh position={[0, 1.68, 0]} material={made.cladding} castShadow receiveShadow><boxGeometry args={[10, 3.04, 6]} /></mesh>
      {/* glazen pui met stijlen */}
      <mesh position={[-0.6, 1.5, 3.01]} material={windowMaterial}><planeGeometry args={[7, 2.5]} /></mesh>
      {[-4.1, -2.9, -1.7, -0.5, 0.7, 1.9, 2.9].map((x) => (
        <mesh key={x} position={[x, 1.5, 3.03]} material={made.roof}><boxGeometry args={[0.08, 2.5, 0.06]} /></mesh>
      ))}
      <mesh position={[-0.6, 2.76, 3.03]} material={made.roof}><boxGeometry args={[7.1, 0.08, 0.06]} /></mesh>
      {/* dakrand met de naam, en het overstekende dak */}
      <mesh position={[0, 3.36, 3.5]} material={made.roof}><boxGeometry args={[11.6, 0.5, 0.2]} /></mesh>
      <mesh position={[-0.6, 3.36, 3.605]}><planeGeometry args={[2.5, 0.47]} /><meshBasicMaterial map={made.label} /></mesh>
      <mesh position={[0, 3.72, 0.5]} material={made.roof} castShadow><boxGeometry args={[12, 0.22, 8.6]} /></mesh>
      {[-5.6, 5.6].map((x) => (
        <mesh key={x} position={[x, 1.86, 4.5]} material={made.post} castShadow><boxGeometry args={[0.2, 3.5, 0.2]} /></mesh>
      ))}
      {/* terras: parasol en picknicktafel */}
      <group position={[-8.6, 0, 3.2]}>
        <mesh position={[0, 1.3, 0]} material={made.post}><cylinderGeometry args={[0.04, 0.04, 2.6, 8]} /></mesh>
        <mesh position={[0, 2.5, 0]} castShadow><coneGeometry args={[1.9, 0.6, 8]} /><meshStandardMaterial color="#e6dcc4" roughness={0.9} /></mesh>
        <mesh position={[0, 0.76, 0]} material={made.post} castShadow><boxGeometry args={[1.8, 0.07, 0.8]} /></mesh>
        {[-0.62, 0.62].map((z) => (
          <mesh key={z} position={[0, 0.45, z]} material={made.post} castShadow><boxGeometry args={[1.8, 0.06, 0.28]} /></mesh>
        ))}
        {[-0.7, 0.7].map((x) => (
          <mesh key={x} position={[x, 0.38, 0]} material={made.post}><boxGeometry args={[0.08, 0.76, 1.3]} /></mesh>
        ))}
      </group>
      <Person position={[-3.6, 0.16, 5.4]} shirt="#7d8f9c" turn={0.4} />
      <Person position={[-2.2, 0.16, 6.1]} shirt="#e8e6df" turn={-0.3} />
      <Person position={[-1.3, 0.16, 5.5]} shirt="#5d7a8a" turn={2.8} />
    </group>
  );
}
