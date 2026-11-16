import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, MeshStandardMaterial } from 'three';
import { playerPose, useGame, VEHICLE_LENGTH, type SimVehicle } from '../sim/engine';
import { Cockpit, Interior } from './Cockpit';
import { Car } from './Car';
import { glassMaterial, headlightMaterial, Plates, taillightMaterial, TurnSignals, Wheels } from './parts';

const LANE_X = { in: 3.3, out: -3.3 };

function Lights({ width, length, y }: { width: number; length: number; y: number }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (width / 2 - 0.28), y, length / 2 + 0.01]} material={headlightMaterial}>
            <boxGeometry args={[0.34, 0.16, 0.04]} />
          </mesh>
          <mesh position={[side * (width / 2 - 0.26), y, -length / 2 - 0.01]} material={taillightMaterial}>
            <boxGeometry args={[0.3, 0.14, 0.04]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Boxy({ vehicle }: { vehicle: SimVehicle }) {
  const length = VEHICLE_LENGTH[vehicle.type];
  const truck = vehicle.type === 'vrachtwagen';
  const ambulance = vehicle.type === 'ambulance';
  const width = truck ? 2.4 : 2.05;
  const cabLength = truck ? 2 : 1.5;
  const boxHeight = truck ? 2.7 : vehicle.type === 'camper' ? 2.3 : 1.9;
  const boxLength = length - cabLength - 0.1;
  const body = ambulance ? '#f4d21f' : truck ? '#d9dce0' : '#f4f3ec';
  const cab = truck ? '#2f5d8a' : body;
  const stripe = ambulance ? '#c8281e' : vehicle.type === 'camper' ? '#5aa0c8' : truck ? '#2f5d8a' : '#c9772b';
  const beacon = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (beacon.current) beacon.current.emissiveIntensity = Math.sin(clock.elapsedTime * 14) > 0 ? 3 : 0.1;
  });

  return (
    <>
      {/* laadruimte */}
      <mesh position={[0, 0.5 + boxHeight / 2, -cabLength / 2]} castShadow>
        <boxGeometry args={[width, boxHeight, boxLength]} />
        <meshStandardMaterial color={body} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.25, -cabLength / 2]}>
        <boxGeometry args={[width + 0.02, 0.22, boxLength - 0.3]} />
        <meshStandardMaterial color={stripe} roughness={0.6} />
      </mesh>
      {/* cabine */}
      <mesh position={[0, 0.5 + (truck ? 1.05 : 0.8), length / 2 - cabLength / 2]} castShadow>
        <boxGeometry args={[width - 0.1, truck ? 2.1 : 1.6, cabLength]} />
        <meshStandardMaterial color={cab} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, truck ? 2 : 1.65, length / 2 - 0.02]} scale={[1, vehicle.windowsOpen ? 0.7 : 1, 1]} material={glassMaterial}>
        <boxGeometry args={[width - 0.4, 0.6, 0.1]} />
      </mesh>
      {ambulance && (
        <mesh position={[0, 0.5 + boxHeight + 0.12, 0.6]}>
          <boxGeometry args={[1.1, 0.22, 0.34]} />
          <meshStandardMaterial ref={beacon} color="#2b6fe0" emissive="#3d8bff" />
        </mesh>
      )}
      <Wheels track={width - 0.2} front={length / 2 - 1} rear={-length / 2 + 1.3} radius={truck ? 0.5 : 0.4} width={0.3} vehicle={vehicle} />
      <Lights width={width - 0.1} length={length} y={0.82} />
      <TurnSignals vehicle={vehicle} width={width - 0.1} front={length / 2 + 0.02} rear={-length / 2 - 0.02} y={0.84} />
      <Plates plate={vehicle.plate} country={vehicle.country} front={length / 2 + 0.03} rear={-length / 2 - 0.03} y={0.52} />
    </>
  );
}

export function Vehicle({ vehicle }: { vehicle: SimVehicle }) {
  const group = useRef<Group>(null);
  const inside = useGame((s) => s.view === 'binnen' && s.playerVehicle === vehicle);
  useFrame(({ clock }) => {
    if (!group.current) return;
    if (vehicle.player) {
      // De gebruiker stuurt zelf: plek en richting komen uit de rijsimulatie.
      const pose = playerPose(vehicle);
      group.current.position.set(pose.x, 0, pose.z);
      group.current.rotation.y = Math.PI + pose.heading;
      group.current.rotation.z = (vehicle.steer ?? 0) * (vehicle.speed ?? 0) * 0.003;
      return;
    }
    group.current.position.z = vehicle.z;
    group.current.rotation.z = Math.sin(clock.elapsedTime * 10 + vehicle.id) * 0.004;
  });
  return (
    // De modellen wijzen naar +z; inrijdende voertuigen rijden richting -z.
    <group ref={group} position={[LANE_X[vehicle.lane] + (vehicle.offset ?? 0), 0, vehicle.z]} rotation={[0, vehicle.lane === 'in' ? Math.PI : 0, 0]}>
      {inside ? <Cockpit vehicle={vehicle} /> : vehicle.type !== 'auto' ? <Boxy vehicle={vehicle} /> : vehicle.player ? (
        // Je eigen auto heeft heldere ruiten: van buiten zie je het interieur.
        <>
          <Car vehicle={vehicle} open />
          <Interior vehicle={vehicle} full />
        </>
      ) : <Car vehicle={vehicle} />}
    </group>
  );
}
