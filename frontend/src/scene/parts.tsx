// Onderdelen die alle voertuigen delen: materialen, wielen, kentekenplaten en richtingaanwijzers.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { DoubleSide, MeshStandardMaterial, type Group } from 'three';
import type { SimVehicle } from '../sim/engine';
import { plateTexture } from './textures';

// De koplampen worden 's nachts feller gezet door de scène.
export const headlightMaterial = new MeshStandardMaterial({ color: '#fff6c9', emissive: '#fff1a8', emissiveIntensity: 0.4 });
export const taillightMaterial = new MeshStandardMaterial({ color: '#b3161a', emissive: '#ff2a2a', emissiveIntensity: 0.6 });
export const glassMaterial = new MeshStandardMaterial({ color: '#0e151b', roughness: 0.12, metalness: 0.1, envMapIntensity: 0.5, side: DoubleSide });
/** Helder glas: bij de auto die je zelf bestuurt kijk je van buiten naar binnen. */
export const clearGlassMaterial = new MeshStandardMaterial({
  color: '#a9c9d8', transparent: true, opacity: 0.26, roughness: 0.05, metalness: 0.3, envMapIntensity: 0.9, side: DoubleSide, depthWrite: false,
});
export const tyreMaterial = new MeshStandardMaterial({ color: '#16181a', roughness: 0.92 });
export const rimMaterial = new MeshStandardMaterial({ color: '#c4c8cd', roughness: 0.3, metalness: 0.85 });
export const darkRimMaterial = new MeshStandardMaterial({ color: '#2a2d31', roughness: 0.35, metalness: 0.8 });
export const trimMaterial = new MeshStandardMaterial({ color: '#101214', roughness: 0.55, metalness: 0.2 });
export const chromeMaterial = new MeshStandardMaterial({ color: '#d9dcdf', roughness: 0.18, metalness: 0.95 });

interface WheelProps {
  position: [number, number, number];
  radius: number;
  /** Zonder voertuig staat het wiel stil (geparkeerde auto). */
  vehicle?: SimVehicle;
  dark?: boolean;
  width?: number;
}

export function Wheel({ position, radius, vehicle, dark, width = 0.24 }: WheelProps) {
  const wheel = useRef<Group>(null);
  // De zelf bestuurde auto kan alle kanten op; daar telt de afgelegde weg in plaats van de plek op de oprit.
  const travel = () => (vehicle?.player ? -(vehicle.odo ?? 0) : vehicle?.z ?? 0);
  const previous = useRef(travel());
  useFrame(() => {
    if (!wheel.current || !vehicle) return;
    const now = travel();
    wheel.current.rotation.x += (now - previous.current) / radius;
    previous.current = now;
  });
  const rim = dark ? darkRimMaterial : rimMaterial;
  return (
    <group ref={wheel} position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={tyreMaterial} castShadow>
        <cylinderGeometry args={[radius, radius, width, 24]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} material={rim}>
        <cylinderGeometry args={[radius * 0.68, radius * 0.68, width + 0.012, 20]} />
      </mesh>
      {/* spaken: zo zie je het wiel draaien */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} rotation={[(i * Math.PI) / 5, 0, 0]} material={trimMaterial}>
          <boxGeometry args={[width + 0.02, radius * 1.3, radius * 0.07]} />
        </mesh>
      ))}
      <mesh rotation={[0, 0, Math.PI / 2]} material={rim}>
        <cylinderGeometry args={[radius * 0.2, radius * 0.2, width + 0.03, 10]} />
      </mesh>
    </group>
  );
}

export function Wheels({ track, front, rear, radius = 0.36, vehicle, dark, width }: {
  track: number; front: number; rear: number; radius?: number; vehicle?: SimVehicle; dark?: boolean; width?: number;
}) {
  return (
    <>
      {[front, rear].flatMap((z) => [-1, 1].map((side) => (
        <Wheel key={`${z}${side}`} position={[(side * track) / 2, radius, z]} radius={radius} vehicle={vehicle} dark={dark} width={width} />
      )))}
    </>
  );
}

export function Plates({ plate, country, front, rear, y, rearY = y }: {
  plate: string; country: SimVehicle['country']; front: number; rear: number; y: number; rearY?: number;
}) {
  const map = useMemo(() => plateTexture(plate, country), [plate, country]);
  return (
    <>
      <mesh position={[0, y, front]}>
        <planeGeometry args={[0.58, 0.145]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      <mesh position={[0, rearY, rear]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.58, 0.145]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </>
  );
}

export function TurnSignals({ vehicle, width, front, rear, y }: { vehicle: SimVehicle; width: number; front: number; rear: number; y: number }) {
  const material = useMemo(() => new MeshStandardMaterial({ color: '#ff9d2e', emissive: '#ff7a00', emissiveIntensity: 0.1 }), []);
  const lamps = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    // De stand van de hendel wordt elk beeld gelezen, zodat de lampen direct reageren.
    lamps.current.forEach((lamp, i) => { if (lamp) lamp.visible = vehicle.indicator === (i === 0 ? 'left' : 'right'); });
    const blinking = Boolean(vehicle.indicator) && Math.floor(clock.elapsedTime * 2) % 2 === 0;
    material.emissiveIntensity = blinking ? 4 : 0.1;
  });
  return (
    <>
      {([-1, 1] as const).map((side) => (
        <group key={side} ref={(group) => { lamps.current[side < 0 ? 0 : 1] = group; }} visible={false}>
          <mesh position={[side * (width / 2 - 0.12), y, front]} material={material}>
            <boxGeometry args={[0.12, 0.08, 0.05]} />
          </mesh>
          <mesh position={[side * (width / 2 - 0.12), y, rear]} material={material}>
            <boxGeometry args={[0.12, 0.08, 0.05]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
