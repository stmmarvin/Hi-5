// Het weer in de 3D-wereld: regen, sneeuw en hagel die rond de camera vallen, en de sneeuw die zich
// bij de slagboom ophoopt. De regels staan in sim/weather.ts.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, type LineSegments, type Mesh, type MeshStandardMaterial, type Points, type PointsMaterial } from 'three';
import { world } from '../sim/engine';
import { SNOW_LOCK_CM, WEATHER } from '../sim/weather';

const COUNT = 1400;
const REACH = 34;   // de neerslag valt in een blok van deze breedte rond de camera
const HEIGHT = 22;

/** Valsnelheid (m/s), zijwind (m/s) en lengte van de streep per soort neerslag. */
const FALL = {
  regen: { speed: 19, wind: 2.5, streak: 0.55 },
  sneeuw: { speed: 1.8, wind: 0.9, streak: 0 },
  hagel: { speed: 15, wind: 1.2, streak: 0 },
};

export function Precipitation() {
  const lines = useRef<LineSegments>(null);
  const dots = useRef<Points>(null);
  const made = useMemo(() => {
    const drops = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      drops[i * 3] = (Math.random() - 0.5) * REACH;
      drops[i * 3 + 1] = Math.random() * HEIGHT;
      drops[i * 3 + 2] = (Math.random() - 0.5) * REACH;
    }
    const streaks = new BufferGeometry();
    streaks.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 6), 3));
    const flakes = new BufferGeometry();
    flakes.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 3), 3));
    return { drops, streaks, flakes };
  }, []);

  useFrame(({ camera }, delta) => {
    const info = WEATHER[world.weather];
    const rain = info.falls === 'regen';
    const solid = info.falls === 'sneeuw' || info.falls === 'hagel';
    if (lines.current) lines.current.visible = rain;
    if (dots.current) dots.current.visible = solid;
    if (info.falls === 'niets') return;

    const fall = FALL[info.falls];
    // Bij noodweer waait het hard.
    const wind = fall.wind * (world.weather === 'noodweer' ? 4 : 1);
    const dt = Math.min(delta, 0.05) * world.speed;
    const { drops } = made;
    const target = (rain ? made.streaks : made.flakes).attributes.position as BufferAttribute;
    const out = target.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const at = i * 3;
      drops[at] += wind * dt;
      drops[at + 1] -= fall.speed * dt;
      if (drops[at + 1] < 0) drops[at + 1] += HEIGHT;
      if (drops[at] > REACH / 2) drops[at] -= REACH;
      const x = camera.position.x + drops[at];
      const y = drops[at + 1];
      const z = camera.position.z + drops[at + 2];
      if (rain) {
        out.set([x, y, z, x - (wind / fall.speed) * fall.streak, y + fall.streak, z], i * 6);
      } else {
        // Sneeuw dwarrelt een beetje heen en weer.
        out.set([x + (info.falls === 'sneeuw' ? Math.sin(y * 1.7 + i) * 0.25 : 0), y, z], at);
      }
    }
    target.needsUpdate = true;
    if (dots.current) (dots.current.material as PointsMaterial).size = info.falls === 'hagel' ? 0.09 : 0.13;
  });

  return (
    <>
      <lineSegments ref={lines} geometry={made.streaks} visible={false} frustumCulled={false}>
        <lineBasicMaterial color="#c9d8e6" transparent opacity={0.45} fog={false} />
      </lineSegments>
      <points ref={dots} geometry={made.flakes} visible={false} frustumCulled={false}>
        <pointsMaterial color="#ffffff" size={0.13} sizeAttenuation transparent opacity={0.9} fog={false} />
      </points>
    </>
  );
}

/** Sneeuw die bij de slagboom blijft liggen: hoe meer er ligt, hoe witter en dikker de laag. */
export function SnowDrift() {
  const drift = useRef<Mesh>(null);
  useFrame(() => {
    if (!drift.current) return;
    const depth = Math.min(1, world.snow / SNOW_LOCK_CM);
    drift.current.visible = world.snow > 0.2;
    drift.current.scale.y = 0.2 + depth;
    (drift.current.material as MeshStandardMaterial).opacity = 0.35 + 0.6 * depth;
  });
  return (
    <mesh ref={drift} position={[0, 0.03, 1]} scale={[1, 0.2, 1]} visible={false} receiveShadow>
      <boxGeometry args={[13, 0.1, 9]} />
      <meshStandardMaterial color="#f4f7fa" roughness={0.95} transparent opacity={0.4} />
    </mesh>
  );
}
