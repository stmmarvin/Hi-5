import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide, Color, CylinderGeometry, DoubleSide, Fog, MeshBasicMaterial, MeshStandardMaterial, PMREMGenerator,
  Quaternion, ShaderMaterial, Vector3,
  type AmbientLight, type DirectionalLight, type PerspectiveCamera, type Group, type HemisphereLight, type Mesh, type PointLight,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { daylight } from '../sim/clock';
import { playerPose, useGame, world } from '../sim/engine';
import type { Direction } from '../types';
import { CarBody } from './Car';
import { eyeOf } from './Cockpit';
import { headlightMaterial } from './parts';
import { Caravan, heaterMaterial, Island, Poles, Reception, Welcome } from './Entrance';
import { campLayout, CARAVANS, LAMP_POSTS, PARKED, PARKING, PARKING_SIGN } from './layout';
import { Bushes, seeded, Trees, Tufts } from './Nature';
import { boardTexture, roadMarkTexture } from './textures';
import { groundTexture } from './textures2';
import { Vehicle } from './Vehicle';
import { Bert } from './Bert';
import { GateCam } from './GateCam';
import { LAYER } from './feed';
import { Precipitation, SnowCover, SnowDrift } from './Weather';
import { WEATHER } from '../sim/weather';
import { DrivingControls } from '../ui/DrivingControls';

const DAY_SKY = new Color('#a9d3ee');
const DUSK_SKY = new Color('#f0a770');
const NIGHT_SKY = new Color('#0b1430');
const windowMaterial = new MeshStandardMaterial({ color: '#1b262e', roughness: 0.08, metalness: 0.5, emissive: '#ffd98a', emissiveIntensity: 0 });
const SUN_DAY = new Color('#fff1d8');
const lampMaterial = new MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffe9a3', emissiveIntensity: 0 });
const cloudMaterial = new MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, opacity: 0.92 });
const SKY_TOP_DAY = new Color('#4d95d8');
const SKY_TOP_NIGHT = new Color('#050a1c');
const WHITE = new Color('#ffffff');
const OVERCAST = new Color('#7d8791');

// Luchtkoepel: aan de horizon licht, naar boven toe dieper blauw.
const skyMaterial = new ShaderMaterial({
  side: BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new Color('#3f8fd6') }, horizon: { value: new Color('#a9d3ee') } },
  vertexShader: 'varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying float h;
    void main() {
      gl_FragColor = vec4(mix(horizon, top, pow(clamp(h * 1.15, 0.0, 1.0), 0.8)), 1.0);
      #include <colorspace_fragment>
    }`,
});

/** Zon, lucht en lampen volgen de klok van de simulatie. */
function Atmosphere() {
  const { scene, gl } = useThree();
  const sun = useRef<DirectionalLight>(null);
  const ambient = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const lampIn = useRef<PointLight>(null);
  const lampOut = useRef<PointLight>(null);
  const sky = useMemo(() => new Color(), []);
  const grey = useMemo(() => new Color(), []);

  useEffect(() => {
    scene.background = new Color('#a9d3ee');
    scene.fog = new Fog('#a9d3ee', 90, 260);
    // Neutrale omgeving om in te spiegelen: daardoor glimmen lak, glas en chroom.
    const pmrem = new PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    return () => {
      scene.environment = null;
      environment.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);

  useFrame(() => {
    const d = daylight(world.minute);
    const night = 1 - d;
    // Rond zonsopkomst en zonsondergang kleurt de lucht oranje.
    const glow = Math.max(0, 1 - Math.abs(d - 0.45) / 0.45);
    // Slecht weer: een grijze lucht, minder zon en minder zicht.
    const dim = WEATHER[world.weather].dim;
    grey.copy(OVERCAST).multiplyScalar(0.25 + 0.75 * d);
    sky.lerpColors(NIGHT_SKY, DAY_SKY, d).lerp(DUSK_SKY, glow * 0.45 * (1 - dim)).lerp(grey, dim);
    (scene.background as Color).copy(sky);
    scene.fog?.color.copy(sky);
    if (scene.fog instanceof Fog) {
      scene.fog.near = 90 - 65 * dim;
      scene.fog.far = 260 - 150 * dim;
    }
    skyMaterial.uniforms.horizon.value.copy(sky);
    skyMaterial.uniforms.top.value.lerpColors(SKY_TOP_NIGHT, SKY_TOP_DAY, d).lerp(grey, dim);
    // De lensverwarming van de camera gloeit zacht als hij aan staat.
    heaterMaterial.emissiveIntensity = world.heater ? 1.6 : 0;
    cloudMaterial.color.copy(sky).lerp(WHITE, 0.25 + 0.6 * d);
    scene.environmentIntensity = 0.06 + 0.34 * d;

    const hour = (world.minute % 1440) / 60;
    const angle = (Math.min(Math.max(hour, 5), 21.5) - 5) / 16.5 * Math.PI;
    if (sun.current) {
      sun.current.position.set(Math.cos(angle) * 70, Math.sin(angle) * 55 + 8, 42);
      sun.current.intensity = (0.05 + 2.9 * d) * (1 - 0.75 * dim);
      sun.current.color.copy(SUN_DAY).lerp(DUSK_SKY, glow * 0.6);
    }
    if (ambient.current) ambient.current.intensity = 0.1 + 0.1 * d;
    if (hemi.current) hemi.current.intensity = 0.1 + 0.32 * d;
    if (lampIn.current) lampIn.current.intensity = night * 90;
    if (lampOut.current) lampOut.current.intensity = night * 60;
    lampMaterial.emissiveIntensity = night * 3;
    windowMaterial.emissiveIntensity = night * 1.8;
    headlightMaterial.emissiveIntensity = 0.4 + night * 3;
  });

  return (
    <>
      <mesh material={skyMaterial} renderOrder={-1}><sphereGeometry args={[390, 24, 12]} /></mesh>
      <Clouds />
      <ambientLight ref={ambient} />
      <hemisphereLight ref={hemi} args={['#cfe8ff', '#4d7a3c', 0.5]} />
      <directionalLight
        ref={sun} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45}
        shadow-camera-far={220} shadow-bias={-0.0004}
      />
      {/* Lichtbron bij de camera's, zodat kentekens ook 's nachts leesbaar zijn. */}
      <pointLight ref={lampIn} position={[1.6, 3.9, 2.2]} color="#ffe9b0" distance={26} decay={1.6} />
      <pointLight ref={lampOut} position={[-1.6, 3.9, -2.2]} color="#ffe9b0" distance={22} decay={1.6} />
    </>
  );
}

function Clouds() {
  const group = useRef<Group>(null);
  const clouds = useMemo(() => {
    const random = seeded(11);
    return Array.from({ length: 12 }, () => ({
      x: (random() - 0.5) * 560, y: 42 + random() * 40, z: -330 + random() * 170,
      puffs: Array.from({ length: 5 }, (_, i) => ({ x: (i - 2) * 9 + random() * 4, y: random() * 3, z: random() * 6, r: 7 + random() * 7 })),
    }));
  }, []);
  useFrame((_, delta) => {
    if (!group.current) return;
    for (const cloud of group.current.children) {
      cloud.position.x += delta * 0.9 * world.speed;
      if (cloud.position.x > 280) cloud.position.x = -280;
    }
  });
  return (
    <group ref={group}>
      {clouds.map((cloud, i) => (
        <group key={i} position={[cloud.x, cloud.y, cloud.z]} scale={[1, 0.42, 1]}>
          {cloud.puffs.map((puff, j) => (
            <mesh key={j} position={[puff.x, puff.y, puff.z]} material={cloudMaterial}><sphereGeometry args={[puff.r, 12, 8]} /></mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Controls() {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls>(null);
  const playerVehicle = useGame((s) => s.playerVehicle);
  const view = useGame((s) => s.view);
  useEffect(() => {
    // De bestuurder ziet het dashboard van de eigen auto (laag 2); de buitenkant daarvan alleen de slagboomcamera.
    camera.layers.enable(LAYER.onlyDriver);
    const instance = new OrbitControls(camera, gl.domElement);
    instance.target.set(0.3, 1.9, 3);
    instance.enablePan = false;
    instance.minDistance = 7;
    instance.maxDistance = 60;
    instance.maxPolarAngle = Math.PI / 2.12;
    instance.update();
    controls.current = instance;
    return () => {
      instance.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  // Buiten de auto draai je de camera met slepen om de auto heen en zoom je met het scrollwiel.
  const around = useRef({ yaw: 0, pitch: 0.24, distance: 10 });
  const outside = Boolean(playerVehicle) && view === 'buiten';
  useEffect(() => {
    around.current = { yaw: 0, pitch: 0.24, distance: 10 };
    if (!outside) return;
    const element = gl.domElement;
    let pointer: number | null = null;
    const down = (event: PointerEvent) => {
      pointer = event.pointerId;
      element.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const look = around.current;
      look.yaw -= event.movementX * 0.006;
      look.pitch = Math.min(1.35, Math.max(0.04, look.pitch + event.movementY * 0.005));
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointer) pointer = null;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const look = around.current;
      look.distance = Math.min(32, Math.max(4, look.distance * Math.exp(event.deltaY * 0.001)));
    };
    const reset = () => { around.current = { yaw: 0, pitch: 0.24, distance: 10 }; };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('dblclick', reset);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('dblclick', reset);
    };
  }, [outside, gl]);

  // Zonder eigen auto kijk je vrij rond; met een auto volgt de camera die, van binnen of van buiten.
  const following = useRef(false);
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit) return;
    const perspective = camera as PerspectiveCamera;
    const lens = (fov: number, near: number) => {
      if (perspective.fov === fov && perspective.near === near) return;
      perspective.fov = fov;
      perspective.near = near;
      perspective.updateProjectionMatrix();
    };
    if (!playerVehicle) {
      if (following.current) {
        following.current = false;
        orbit.enabled = true;
        lens(40, 0.5);
        camera.position.set(0.9, 4.2, 26.5);
        orbit.target.set(0.3, 1.9, 3);
        orbit.update();
      }
      return;
    }
    following.current = true;
    const pose = playerPose(playerVehicle);
    const forward = new Vector3(-Math.sin(pose.heading), 0, -Math.cos(pose.heading));
    const leftward = new Vector3(forward.z, 0, -forward.x);
    const car = new Vector3(pose.x, 0, pose.z);
    if (view === 'binnen') {
      orbit.enabled = false;
      lens(62, 0.08);
      const [side, height, along] = eyeOf(playerVehicle.model);
      const steer = playerVehicle.steer ?? 0;
      camera.position.copy(car).addScaledVector(leftward, side).addScaledVector(forward, along);
      camera.position.y = height;
      // De bestuurder kijkt de bocht in.
      const look = camera.position.clone().addScaledVector(forward, 12).addScaledVector(leftward, -steer * 3.2);
      look.y = height - 1.9; // iets omlaag, zodat je het stuur en de tellers ziet
      camera.lookAt(look);
      return;
    }
    orbit.enabled = false;
    lens(55, 0.5);
    const blend = Math.min(1, delta * 4);
    const { yaw, pitch, distance } = around.current;
    const look = car.clone().addScaledVector(forward, 2);
    look.y = 1.1;
    const flat = Math.cos(pitch) * distance;
    const wanted = look.clone()
      .addScaledVector(forward, -Math.cos(yaw) * flat)
      .addScaledVector(leftward, -Math.sin(yaw) * flat);
    wanted.y = look.y + Math.sin(pitch) * distance;
    camera.position.lerp(wanted, blend);
    orbit.target.lerp(look, Math.min(1, delta * 8));
    camera.lookAt(orbit.target);
  });

  return null;
}

function Ground() {
  const markIn = useMemo(() => roadMarkTexture('IN', true), []);
  const markOut = useMemo(() => roadMarkTexture('UIT', false), []);
  const grass = useMemo(() => groundTexture('gras', 24, 24), []);
  const driveway = useMemo(() => groundTexture('asfalt', 2, 30), []);
  const road = useMemo(() => groundTexture('asfalt', 110, 2), []);
  const flat: [number, number, number] = [-Math.PI / 2, 0, 0];
  const dashes = useMemo(() => [
    ...Array.from({ length: 10 }, (_, i) => 15 + i * 4),
    ...Array.from({ length: 26 }, (_, i) => -6 - i * 4),
  ], []);
  return (
    <>
      <mesh rotation={flat} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial map={grass} roughness={1} />
      </mesh>
      {/* oprit van de openbare weg tot op het terrein */}
      <mesh rotation={flat} position={[0, 0.02, -27]} receiveShadow>
        <planeGeometry args={[10.8, 164]} />
        <meshStandardMaterial map={driveway} roughness={0.92} />
      </mesh>
      {[-5.2, 5.2].map((x) => (
        <mesh key={x} rotation={flat} position={[x, 0.03, -27]}>
          <planeGeometry args={[0.14, 164]} />
          <meshBasicMaterial color="#dfe3d8" />
        </mesh>
      ))}
      {dashes.map((z) => (
        <mesh key={z} rotation={flat} position={[0, 0.03, z]}>
          <planeGeometry args={[0.12, 2]} />
          <meshBasicMaterial color="#dfe3d8" />
        </mesh>
      ))}
      {/* openbare weg */}
      <mesh rotation={flat} position={[0, 0.025, 59.5]} receiveShadow>
        <planeGeometry args={[600, 9]} />
        <meshStandardMaterial map={road} roughness={0.92} />
      </mesh>
      {Array.from({ length: 60 }, (_, i) => (
        <mesh key={i} rotation={flat} position={[-295 + i * 10, 0.035, 59.5]}>
          <planeGeometry args={[3, 0.14]} />
          <meshBasicMaterial color="#dfe3d8" />
        </mesh>
      ))}
      {/* stopstrepen */}
      <mesh rotation={flat} position={[3.3, 0.03, 2.2]}><planeGeometry args={[3.5, 0.3]} /><meshBasicMaterial color="#e9ede2" /></mesh>
      <mesh rotation={flat} position={[-3.3, 0.03, -2.2]}><planeGeometry args={[3.5, 0.3]} /><meshBasicMaterial color="#e9ede2" /></mesh>
      <mesh rotation={flat} position={[3.3, 0.035, 22]}>
        <planeGeometry args={[2.4, 4.8]} /><meshBasicMaterial map={markIn} transparent />
      </mesh>
      <mesh rotation={flat} position={[-3.3, 0.035, 22]}>
        <planeGeometry args={[2.4, 4.8]} /><meshBasicMaterial map={markOut} transparent />
      </mesh>
      {/* houten hek langs de oprit en lantaarnpalen */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {Array.from({ length: 13 }, (_, i) => (
            <mesh key={i} position={[side * 6.1, 0.55, 6 + i * 4]} castShadow>
              <boxGeometry args={[0.14, 1.1, 0.14]} />
              <meshStandardMaterial color="#8a6238" roughness={0.95} />
            </mesh>
          ))}
          {[0.45, 0.85].map((y) => (
            <mesh key={y} position={[side * 6.1, y, 30]} castShadow>
              <boxGeometry args={[0.06, 0.1, 48]} />
              <meshStandardMaterial color="#9b7446" roughness={0.95} />
            </mesh>
          ))}
          {/* lantaarnpalen */}
          {LAMP_POSTS.z.map((z) => (
            <group key={z} position={[side * LAMP_POSTS.x, 0, z]}>
              <mesh position={[0, 2.3, 0]} castShadow><cylinderGeometry args={[0.05, 0.08, 4.6, 8]} /><meshStandardMaterial color="#2b2f34" roughness={0.5} metalness={0.6} /></mesh>
              <mesh position={[-side * 0.35, 4.6, 0]}><boxGeometry args={[0.9, 0.06, 0.12]} /><meshStandardMaterial color="#2b2f34" roughness={0.5} metalness={0.6} /></mesh>
              <mesh position={[-side * 0.7, 4.54, 0]} material={lampMaterial}><boxGeometry args={[0.3, 0.06, 0.16]} /></mesh>
            </group>
          ))}
        </group>
      ))}
    </>
  );
}

function Barrier({ lane }: { lane: Direction }) {
  const arm = useRef<Group>(null);
  const light = useRef<MeshStandardMaterial>(null);
  const ice = useRef<Mesh>(null);
  const snow = useRef<Mesh>(null);
  const side = lane === 'in' ? 1 : -1;
  const segments = 6;
  const length = 4.1;

  useFrame((_, delta) => {
    if (!arm.current) return;
    const open = world.barrier[lane];
    const target = open ? side * 1.42 : 0;
    arm.current.rotation.z += (target - arm.current.rotation.z) * Math.min(1, delta * 4.5 * world.speed);
    // Vergrendeld door ijzel of sneeuw: het lampje knippert oranje.
    const alarm = world.locked || world.fault;
    const warning = alarm && Math.floor(performance.now() / 400) % 2 === 0;
    light.current?.emissive.set(alarm ? (warning ? '#ff9d2e' : '#3a2000') : open ? '#3fd16b' : '#ff3b30');
    if (ice.current) ice.current.visible = world.ice;
    if (snow.current) {
      snow.current.visible = world.snow > 0.5;
      snow.current.scale.y = Math.min(1.6, world.snow / 5);
    }
  });

  return (
    <group position={[side * 1.1, 0, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.46, 1.3, 0.46]} />
        <meshStandardMaterial color="#24282c" roughness={0.45} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.57, 0]} castShadow>
        <boxGeometry args={[0.52, 0.05, 0.52]} />
        <meshStandardMaterial color="#1a1d20" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 1.3, lane === 'in' ? 0.24 : -0.24]}>
        <boxGeometry args={[0.3, 0.08, 0.02]} />
        <meshStandardMaterial ref={light} color="#111" emissive="#ff3b30" emissiveIntensity={2.5} />
      </mesh>
      <group ref={arm} position={[side * 0.25, 1.15, 0]}>
        {Array.from({ length: segments }, (_, i) => (
          <mesh key={i} position={[side * (i + 0.5) * (length / segments), 0, 0]} castShadow>
            <boxGeometry args={[length / segments, 0.14, 0.1]} />
            <meshStandardMaterial color={i % 2 ? '#c8281e' : '#f4f4f0'} roughness={0.5} />
          </mesh>
        ))}
        {/* ijslaag om de slagboom en sneeuw die erop blijft liggen */}
        <mesh ref={ice} position={[side * length / 2, 0, 0]} visible={false}>
          <boxGeometry args={[length + 0.04, 0.2, 0.16]} />
          <meshStandardMaterial color="#cfe9f7" transparent opacity={0.55} roughness={0.05} metalness={0.3} />
        </mesh>
        <mesh ref={snow} position={[side * length / 2, 0.075, 0]} visible={false}>
          <boxGeometry args={[length, 0.08, 0.13]} />
          <meshStandardMaterial color="#f6f8fb" roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
}

/** Lichtbundel van de camera naar het kenteken tijdens het lezen. */
function Beam({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const mesh = useRef<Mesh>(null);
  const { position, quaternion, length } = useMemo(() => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), a.clone().sub(b).normalize()),
      length: a.distanceTo(b),
    };
  }, [from, to]);
  const geometry = useMemo(() => new CylinderGeometry(0.03, 0.55, length, 16, 1, true), [length]);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    mesh.current.visible = world.beam.in;
    (mesh.current.material as MeshBasicMaterial).opacity = 0.22 + 0.16 * Math.sin(clock.elapsedTime * 16);
  });

  return (
    <mesh ref={mesh} geometry={geometry} position={position} quaternion={quaternion} visible={false}>
      <meshBasicMaterial color="#7fd0ff" transparent opacity={0.3} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

type Point = [number, number, number];
/** Alleen de ingang heeft een camera; de uitgang leest geen kentekens. */
const BEAM: { from: Point; to: Point } = { from: [1.35, 3.4, 1.3], to: [3.3, 0.5, 2.5] };

function Roof({ width, depth, height, y, color }: { width: number; depth: number; height: number; y: number; color: string }) {
  // Driehoekig prisma met de nok bovenaan, langs de x-as.
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(1, 1, 1, 3);
    g.rotateZ(Math.PI / 2);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const sy = height / 1.5;
  return (
    <mesh geometry={geometry} position={[0, y + sy * 0.5, 0]} scale={[width, sy, depth / 2 / 0.866]} castShadow>
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh>
  );
}

function Camp() {
  const parking = useMemo(() => boardTexture(['P'], '#1b4fa0', '#ffffff', 110), []);
  const gravel = useMemo(() => groundTexture('grind', 18, 7), []);
  const { trees, tents, hedge, shrubs, flowers } = campLayout();

  return (
    <>
      <Reception windowMaterial={windowMaterial} />
      {CARAVANS.map((caravan) => (
        <Caravan key={caravan.x} position={[caravan.x, 0, caravan.z]} turn={caravan.turn} />
      ))}
      <Trees spots={trees} />
      <Bushes spots={hedge} seed={12} />
      <Bushes spots={shrubs} seed={14} />
      <Tufts spots={flowers} seed={8} />

      {/* parkeerplaats */}
      <group position={[PARKING.x, 0, PARKING.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
          <planeGeometry args={[PARKING.width, PARKING.depth]} />
          <meshStandardMaterial map={gravel} roughness={1} />
        </mesh>
        {/* twee rijen parkeervakken met een rijbaan ertussen */}
        {[-8.5, 8.5].flatMap((row) => Array.from({ length: 17 }, (_, i) => (
          <mesh key={`${row}:${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[-27 + i * 3, 0.03, row]}>
            <planeGeometry args={[0.12, 5]} /><meshBasicMaterial color="#f1f4ea" />
          </mesh>
        )))}
        <mesh position={[PARKING_SIGN.x, 1.5, PARKING_SIGN.z]} castShadow><cylinderGeometry args={[0.06, 0.06, 3, 8]} /><meshStandardMaterial color="#3a3f45" /></mesh>
        <mesh position={[PARKING_SIGN.x, 2.7, PARKING_SIGN.z + 0.07]}><planeGeometry args={[0.9, 0.9]} /><meshBasicMaterial map={parking} /></mesh>
        {PARKED.map((car) => (
          <group key={car.plate} position={[car.x, 0, car.z]}>
            <CarBody model={car.model} color={car.color} plate={car.plate} />
          </group>
        ))}
      </group>

      {/* kampeervelden */}
      {tents.map((tent, i) => tent.camper ? (
        <Caravan key={i} position={[tent.x, 0, tent.z]} turn={tent.turn} />
      ) : (
        <group key={i} position={[tent.x, 0, tent.z]} rotation={[0, tent.turn, 0]}>
          <Roof width={3.4} depth={3} height={1.9} y={0} color={tent.color} />
        </group>
      ))}

    </>
  );
}

export function Scene() {
  const vehicles = useGame((s) => s.vehicles);
  // Gepauzeerd voor het overzichtsportaal: niets opnieuw tekenen.
  const paused = useGame((s) => s.portal);
  return (
    <Canvas frameloop={paused ? 'never' : 'always'} shadows="soft" dpr={[1, 2]} camera={{ position: [0.9, 4.2, 26.5], fov: 40, near: 0.5, far: 420 }}>
      <Atmosphere />
      <DrivingControls />
      <Controls />
      <Ground />
      <Island />
      <Barrier lane="in" />
      <Barrier lane="out" />
      <Bert />
      <Poles lampMaterial={lampMaterial} />
      <Welcome />
      <Beam from={BEAM.from} to={BEAM.to} />
      <Precipitation />
      <GateCam />
      <SnowDrift />
      <SnowCover />
      <Camp />
      {vehicles.map((vehicle) => <Vehicle key={vehicle.id} vehicle={vehicle} />)}
    </Canvas>
  );
}
