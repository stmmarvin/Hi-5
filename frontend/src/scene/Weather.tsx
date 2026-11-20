// Het weer in de 3D-wereld: regen, sneeuw en hagel die rond de camera vallen, en de sneeuw die zich
// bij de slagboom ophoopt. De regels staan in sim/weather.ts.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BufferAttribute, BufferGeometry, Mesh as MeshObject,
  type LineSegments, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type Points, type PointsMaterial,
} from 'three';
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

/** Hoe wit de wereld is: 0 zonder sneeuw, 1 als alles onder een sneeuwlaag ligt. Gedeeld door alle materialen. */
const snowCover = { value: 0 };
/** Zo snel valt de laag (per seconde) en zo snel smelt hij weer weg. */
const SNOW_IN = 1 / 6;
const SNOW_OUT = 1 / 10;

/** Leert een materiaal om wit te worden waar het naar boven wijst: gras, wegen, daken, bomen en auto's. */
function coverWithSnow(material: Material) {
  const standard = material as MeshStandardMaterial;
  if (!standard.isMeshStandardMaterial || material.userData.snow) return;
  material.userData.snow = true;
  const before = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.snowCover = snowCover;
    shader.fragmentShader = `uniform float snowCover;
${shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
        float amount = snowCover * smoothstep(0.1, 0.55, up);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), amount);
        roughnessFactor = mix(roughnessFactor, 0.85, amount);
        metalnessFactor = mix(metalnessFactor, 0.0, amount);
      }`)}`;
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|sneeuw`;
  material.needsUpdate = true;
}

/** Loopt de scène door; wat met `userData.noSnow` is gemarkeerd (het interieur van de auto) blijft schoon. */
function coverScene(object: Object3D) {
  if (object.userData.noSnow) return;
  if (object instanceof MeshObject) {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) coverWithSnow(material);
  }
  for (const child of object.children) coverScene(child);
}

/** Bij sneeuw wordt de hele wereld langzaam wit; als het ophoudt, smelt de laag weer weg. */
export function SnowCover() {
  const frames = useRef(0);
  useFrame(({ scene }, delta) => {
    // Nieuwe voertuigen en bomen krijgen ook een sneeuwlaag: af en toe de scène nalopen is genoeg.
    if (frames.current++ % 30 === 0) coverScene(scene);
    const target = WEATHER[world.weather].falls === 'sneeuw' ? 1 : 0;
    const step = Math.min(delta, 0.1) * world.speed * (target > snowCover.value ? SNOW_IN : SNOW_OUT);
    snowCover.value = target > snowCover.value ? Math.min(target, snowCover.value + step) : Math.max(target, snowCover.value - step);
  });
  return null;
}
