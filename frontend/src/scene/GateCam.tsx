// De AI-camera bij de ingang: tekent de 3D-wereld vanaf de camerapaal in een klein beeld, een paar keer per
// seconde, en rekent uit waar het kenteken van de naderende auto in dat beeld staat.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { PerspectiveCamera, SRGBColorSpace, Vector3, WebGLRenderTarget } from 'three';
import { hasCarBody, playerPose, useGame, VEHICLE_LENGTH, type SimVehicle } from '../sim/engine';
import { specOf } from './Car';
import { feed, FEED_HEIGHT, FEED_WIDTH, LAYER, type FeedPlate } from './feed';

const FRAME_EVERY = 0.12; // seconden tussen twee beelden
const LANE_IN = 3.3;
/** De camera op de paal links van de inrijbaan, gericht op de oprit waar de auto's aankomen. */
const CAMERA_AT = new Vector3(1.45, 3.62, 1.33);
const LOOKS_AT = new Vector3(3.3, 0.6, 9);

/** Waar het voorste kenteken van een voertuig zit: midden, richting van de auto en hoe breed. */
function frontPlate(vehicle: SimVehicle) {
  const pose = vehicle.player
    ? playerPose(vehicle)
    : { x: LANE_IN + (vehicle.offset ?? 0), z: vehicle.z, heading: 0 };
  const forward = new Vector3(-Math.sin(pose.heading), 0, -Math.cos(pose.heading));
  const side = new Vector3(-Math.cos(pose.heading), 0, Math.sin(pose.heading));
  const car = hasCarBody(vehicle.type);
  const half = car ? specOf(vehicle.model).L / 2 + 0.012 : VEHICLE_LENGTH[vehicle.type] / 2 + 0.03;
  const center = new Vector3(pose.x, car ? 0.47 : 0.52, pose.z).addScaledVector(forward, half);
  return { center, forward, side };
}

export function GateCam() {
  const { gl, scene } = useThree();
  const camera = useMemo(() => {
    const view = new PerspectiveCamera(34, FEED_WIDTH / FEED_HEIGHT, 0.3, 180);
    view.position.copy(CAMERA_AT);
    view.lookAt(LOOKS_AT);
    view.layers.enable(LAYER.onlyGateCamera);
    view.updateMatrixWorld();
    return view;
  }, []);
  const target = useMemo(() => {
    const made = new WebGLRenderTarget(FEED_WIDTH, FEED_HEIGHT);
    made.texture.colorSpace = SRGBColorSpace;
    return made;
  }, []);
  const pixels = useMemo(() => new Uint8Array(FEED_WIDTH * FEED_HEIGHT * 4), []);
  const image = useMemo(() => new ImageData(FEED_WIDTH, FEED_HEIGHT), []);
  const last = useRef(0);
  useEffect(() => () => target.dispose(), [target]);

  useFrame(({ clock }) => {
    const canvas = feed.canvas;
    if (!canvas || clock.elapsedTime - last.current < FRAME_EVERY) return;
    last.current = clock.elapsedTime;

    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.setRenderTarget(previous);
    gl.readRenderTargetPixels(target, 0, 0, FEED_WIDTH, FEED_HEIGHT, pixels);
    // WebGL leest van onder naar boven; een canvas tekent van boven naar onder.
    const row = FEED_WIDTH * 4;
    for (let y = 0; y < FEED_HEIGHT; y++) image.data.set(pixels.subarray((FEED_HEIGHT - 1 - y) * row, (FEED_HEIGHT - y) * row), y * row);
    canvas.getContext('2d')?.putImageData(image, 0, 0);

    feed.plate = findPlate(useGame.getState().vehicles, camera);
  });
  return null;
}

/** Het kenteken dat de camera nu het best ziet: van een voertuig op de inrijbaan, met de neus naar de camera. */
function findPlate(vehicles: SimVehicle[], camera: PerspectiveCamera): FeedPlate | null {
  let best: FeedPlate | null = null;
  for (const vehicle of vehicles) {
    if (!vehicle.player && vehicle.lane !== 'in') continue;
    const { center, forward, side } = frontPlate(vehicle);
    const toCamera = CAMERA_AT.clone().sub(center);
    const distance = toCamera.length();
    // Alleen een plaat die naar de camera kijkt en niet te ver weg is.
    if (distance > 45 || forward.dot(toCamera.normalize()) < 0.25) continue;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => center.clone()
      .addScaledVector(side, sx * 0.29).add(new Vector3(0, sy * 0.0725, 0)).project(camera));
    if (corners.some((p) => p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05)) continue;
    const xs = corners.map((p) => ((p.x + 1) / 2) * FEED_WIDTH);
    const ys = corners.map((p) => ((1 - p.y) / 2) * FEED_HEIGHT);
    const found: FeedPlate = {
      x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
      plate: vehicle.plate, country: vehicle.country, distance, player: Boolean(vehicle.player),
    };
    if (!best || found.distance < best.distance) best = found;
  }
  return best;
}
