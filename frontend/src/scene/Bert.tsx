// Boer Bert, de beheerder van de camping, staat bij de slagboom met een bedieningskast.
// Hij kijkt naar het voertuig dat aankomt, drukt op de knop als de slagboom opengaat, zwaait de bestuurder
// door en knikt mee als hij aan de intercom praat.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Group } from 'three';
import { useGame, world } from '../sim/engine';
import { BERT } from './layout';

/** Geruit flanellen overhemd. */
function flannel(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#a3282a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(25, 18, 20, .55)';
  for (const at of [0, 32]) {
    ctx.fillRect(at, 0, 12, 64);
    ctx.fillRect(0, at, 64, 12);
  }
  ctx.fillStyle = 'rgba(240, 220, 200, .35)';
  for (const at of [20, 52]) {
    ctx.fillRect(at, 0, 2, 64);
    ctx.fillRect(0, at, 64, 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function Bert() {
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const right = useRef<Group>(null);
  const left = useRef<Group>(null);
  const made = useMemo(() => ({
    shirt: new MeshStandardMaterial({ map: flannel(), roughness: 0.95 }),
    overall: new MeshStandardMaterial({ color: '#34557f', roughness: 0.9 }),
    skin: new MeshStandardMaterial({ color: '#d9a07a', roughness: 0.75 }),
    beard: new MeshStandardMaterial({ color: '#8a7a68', roughness: 1 }),
    cap: new MeshStandardMaterial({ color: '#5a5a3c', roughness: 0.95 }),
    boot: new MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.8 }),
    metal: new MeshStandardMaterial({ color: '#2b3036', roughness: 0.5, metalness: 0.6 }),
    box: new MeshStandardMaterial({ color: '#f2c230', roughness: 0.6 }),
    green: new MeshStandardMaterial({ color: '#1f9d4c', emissive: '#3fd16b', emissiveIntensity: 0.2 }),
    red: new MeshStandardMaterial({ color: '#b3261e', emissive: '#ff3b30', emissiveIntensity: 0.2 }),
  }), []);
  const state = useRef({ wasOpen: false, since: -10, yaw: 0 });

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const s = state.current;
    const open = world.barrier.in;
    if (open && !s.wasOpen) s.since = t;
    s.wasOpen = open;
    const sinceOpen = (t - s.since) * world.speed;

    // Kijk naar het voertuig dat het dichtst bij de slagboom aankomt; anders naar de oprit.
    const { vehicles, chat, call } = useGame.getState();
    let target = { x: 3.3, z: 7 };
    let nearest = Infinity;
    for (const vehicle of vehicles) {
      if (vehicle.parked) continue;
      const x = vehicle.pose?.x ?? (vehicle.player ? 3.3 + (vehicle.offset ?? 0) : vehicle.lane === 'in' ? 3.3 : -3.3);
      const distance = Math.hypot(x - BERT.x, vehicle.z - BERT.z);
      if (distance < 26 && distance < nearest && vehicle.z > -12) {
        nearest = distance;
        target = { x, z: vehicle.z };
      }
    }
    const wanted = Math.atan2(target.x - BERT.x, target.z - BERT.z);
    let turn = wanted - s.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    s.yaw += turn * Math.min(1, delta * 3);
    if (body.current) {
      // Het lijf draait half mee, het hoofd doet de rest.
      body.current.rotation.y = s.yaw * 0.6;
      body.current.position.y = Math.sin(t * 1.6) * 0.008;
    }
    const talking = Boolean(chat && !chat.done) || Boolean(call);
    if (head.current) {
      head.current.rotation.y = (s.yaw - (body.current?.rotation.y ?? 0)) * 0.9;
      head.current.rotation.x = talking ? Math.sin(t * 7) * 0.07 : Math.sin(t * 0.7) * 0.03;
    }

    // Rechterarm: eerst op de knop drukken, dan de bestuurder doorzwaaien; daarna weer langs het lijf.
    if (right.current) {
      const press = ease(sinceOpen / 0.35) * (1 - ease((sinceOpen - 0.6) / 0.3));
      const wave = open || sinceOpen < 3.6 ? ease((sinceOpen - 0.8) / 0.4) * (1 - ease((sinceOpen - 3.2) / 0.4)) : 0;
      right.current.rotation.x = -1.15 * press;
      right.current.rotation.z = -2.5 * wave + (wave > 0.5 ? Math.sin(t * 9) * 0.35 : 0);
      made.green.emissiveIntensity = press > 0.6 ? 2.2 : 0.2;
    }
    // Linkerarm: hand aan de bovenkant van de bedieningskast, of los langs het lijf.
    if (left.current) left.current.rotation.x = -0.08 + Math.sin(t * 1.6 + 1) * 0.02;
  });

  return (
    <group position={[BERT.x, 0, BERT.z]}>
      {/* bedieningskast op een paal */}
      <group position={[BERT.post.x - BERT.x, 0, BERT.post.z - BERT.z]} rotation={[0, 0.5, 0]}>
        <mesh position={[0, 0.5, 0]} material={made.metal} castShadow><boxGeometry args={[0.1, 1, 0.1]} /></mesh>
        <mesh position={[0, 1.1, 0]} material={made.box} castShadow><boxGeometry args={[0.32, 0.26, 0.2]} /></mesh>
        <mesh position={[-0.07, 1.13, -0.105]} rotation={[Math.PI / 2, 0, 0]} material={made.green}><cylinderGeometry args={[0.045, 0.045, 0.03, 16]} /></mesh>
        <mesh position={[0.07, 1.13, -0.105]} rotation={[Math.PI / 2, 0, 0]} material={made.red}><cylinderGeometry args={[0.045, 0.045, 0.03, 16]} /></mesh>
      </group>

      <group ref={body}>
        {/* laarzen en benen in een tuinbroek */}
        {[-0.11, 0.11].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.1, 0.04]} material={made.boot} castShadow><boxGeometry args={[0.15, 0.2, 0.3]} /></mesh>
            <mesh position={[x, 0.55, 0]} material={made.overall} castShadow><capsuleGeometry args={[0.085, 0.62, 4, 8]} /></mesh>
          </group>
        ))}
        {/* romp: overhemd met de bovenkant van de tuinbroek ervoor, en een buikje */}
        <mesh position={[0, 1.18, 0]} material={made.shirt} castShadow><capsuleGeometry args={[0.21, 0.34, 4, 12]} /></mesh>
        <mesh position={[0, 1.02, 0.035]} material={made.overall} castShadow><capsuleGeometry args={[0.215, 0.12, 4, 12]} /></mesh>
        <mesh position={[0, 1.24, 0.18]} material={made.overall}><boxGeometry args={[0.24, 0.24, 0.05]} /></mesh>
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 1.42, 0.12]} rotation={[0.35, 0, 0]} material={made.overall}><boxGeometry args={[0.045, 0.24, 0.03]} /></mesh>
        ))}

        {/* armen: draaien om de schouder (Bert kijkt naar +z, dus zijn rechterarm zit aan de -x-kant) */}
        {([[0.27, left], [-0.27, right]] as const).map(([x, ref]) => (
          <group key={x} ref={ref} position={[x, 1.43, 0]}>
            <mesh position={[0, -0.27, 0]} material={made.shirt} castShadow><capsuleGeometry args={[0.065, 0.42, 4, 8]} /></mesh>
            <mesh position={[0, -0.56, 0]} material={made.skin}><sphereGeometry args={[0.065, 10, 8]} /></mesh>
          </group>
        ))}

        {/* hoofd met baard, neus en een platte pet */}
        <group ref={head} position={[0, 1.62, 0]}>
          <mesh position={[0, 0.07, 0]} material={made.skin} castShadow><sphereGeometry args={[0.125, 16, 12]} /></mesh>
          <mesh position={[0, 0.0, 0.035]} scale={[1, 0.85, 0.95]} material={made.beard}><sphereGeometry args={[0.122, 14, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48]} /></mesh>
          <mesh position={[0, 0.065, 0.122]} material={made.skin}><sphereGeometry args={[0.028, 8, 6]} /></mesh>
          {[-0.045, 0.045].map((x) => (
            <mesh key={x} position={[x, 0.1, 0.112]}><sphereGeometry args={[0.012, 6, 6]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
          ))}
          <mesh position={[0, 0.17, -0.005]} scale={[1, 0.38, 1.08]} material={made.cap} castShadow><sphereGeometry args={[0.14, 14, 10]} /></mesh>
          <mesh position={[0, 0.155, 0.13]} rotation={[0.18, 0, 0]} material={made.cap}><boxGeometry args={[0.2, 0.018, 0.09]} /></mesh>
          {/* strootje in de mondhoek */}
          <mesh position={[0.05, 0.02, 0.15]} rotation={[1.2, 0, -0.5]}><cylinderGeometry args={[0.005, 0.005, 0.16, 5]} /><meshStandardMaterial color="#e2c25a" /></mesh>
        </group>
      </group>
    </group>
  );
}
