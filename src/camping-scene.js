import * as THREE from 'three';

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...options });

function box(parent, name, size, position, appearance, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), appearance);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createTextTexture(lines, background, foreground) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 28) {
    context.fillStyle = y % 56 === 0 ? '#ffffff09' : '#0000000c';
    context.fillRect(0, y, canvas.width, 3);
  }
  context.strokeStyle = '#21180d';
  context.lineWidth = 12;
  context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
  context.textAlign = 'center';
  context.fillStyle = foreground;
  context.font = '800 43px system-ui, sans-serif';
  context.fillText(lines[0], canvas.width / 2, 135);
  context.font = '600 23px system-ui, sans-serif';
  context.fillText(lines[1], canvas.width / 2, 193);
  context.font = '600 19px system-ui, sans-serif';
  context.fillText(lines[2], canvas.width / 2, 238);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addTree(scene, x, z, scale, evergreen = false) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const trunk = material('#534331');
  const leaves = material(evergreen ? '#24503a' : '#34643b', { flatShading: true });
  const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 2.2, 6), trunk);
  trunkMesh.position.y = 1.1;
  trunkMesh.castShadow = true;
  group.add(trunkMesh);
  if (evergreen) {
    for (let i = 0; i < 3; i += 1) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.05 - i * 0.19, 2.3, 7), leaves);
      crown.position.y = 2.2 + i * 0.86;
      crown.castShadow = true;
      group.add(crown);
    }
  } else {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.28, 1), leaves);
    crown.position.y = 3.2;
    crown.scale.set(1.12, 0.92, 1);
    crown.castShadow = true;
    group.add(crown);
    const smaller = new THREE.Mesh(new THREE.IcosahedronGeometry(0.86, 1), material('#3d7443', { flatShading: true }));
    smaller.position.set(0.65, 3.1, 0.16);
    smaller.castShadow = true;
    group.add(smaller);
  }
  scene.add(group);
}

function addBush(scene, x, z, scale = 1) {
  const bush = new THREE.Group();
  bush.position.set(x, 0, z);
  bush.scale.setScalar(scale);
  const green = material('#4f823e', { flatShading: true });
  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), green);
    leaf.position.set((i - 2) * 0.52, 0.66 + (i % 2) * 0.16, (i % 2) * 0.29);
    leaf.scale.set(1.18, 0.9, 0.95);
    leaf.castShadow = true;
    bush.add(leaf);
  }
  scene.add(bush);
}

function addFlowers(scene, x, z, color) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const stemMaterial = material('#416742');
  const flowerMaterial = material(color, { roughness: 0.6 });
  for (let i = 0; i < 9; i += 1) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.46 + (i % 3) * 0.13, 5), stemMaterial);
    stem.position.set(((i % 3) - 1) * 0.18, 0.25, (Math.floor(i / 3) - 1) * 0.15);
    group.add(stem);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), flowerMaterial);
    bloom.position.set(stem.position.x, stem.position.y + 0.25 + (i % 3) * 0.06, stem.position.z);
    group.add(bloom);
  }
  scene.add(group);
}

function createBarrier(scene, materials, z, direction, lane, barriers) {
  const housingX = -direction * 5.85;
  const postX = housingX + direction * 0.4;
  box(scene, 'boom-motor-cabinet', [0.85, 1.35, 0.9], [housingX, 0.68, z], materials.controlBox);
  box(scene, 'boom-cabinet-cap', [0.96, 0.11, 0.98], [housingX, 1.4, z], materials.metal);
  box(scene, 'cabinet-indicator', [0.07, 0.2, 0.03], [housingX, 1.05, z + 0.47], materials.greenLight);

  const pivot = new THREE.Group();
  pivot.position.set(postX, 1.9, z);
  pivot.rotation.y = direction < 0 ? Math.PI : 0;
  scene.add(pivot);
  const stripeWidth = 0.35;
  for (let index = 0; index < 13; index += 1) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(stripeWidth + 0.015, 0.19, 0.23),
      index % 2 === 0 ? materials.barrierRed : materials.barrierWhite,
    );
    stripe.position.x = stripeWidth * index + stripeWidth / 2;
    stripe.castShadow = true;
    pivot.add(stripe);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), materials.metal);
  pivot.add(cap);
  barriers.push({ pivot, lane, openRotation: Math.PI / 2 });
  return pivot;
}

function addLamp(scene, x, z) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), material('#343b36'));
  pole.position.set(x, 2.6, z);
  scene.add(pole);
  const arm = box(scene, 'lamp-arm', [0.8, 0.07, 0.07], [x + 0.34, 5.12, z], material('#343b36'));
  arm.castShadow = true;
  const bulbMaterial = material('#d9dcb2', { emissive: '#aba876', emissiveIntensity: 0.3 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), bulbMaterial);
  bulb.position.set(x + 0.67, 5.0, z);
  scene.add(bulb);
  const point = new THREE.PointLight('#f0e5bd', 0.45, 10, 2);
  point.position.copy(bulb.position);
  scene.add(point);
}

export function createCampingScene(canvas, onError = () => {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    onError(`3D-weergave niet beschikbaar: ${error.message}`);
    return { setGateOpen() {}, setView() {}, dispose() {} };
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9c7d7');
  scene.fog = new THREE.Fog('#a9c7d7', 58, 145);
  scene.add(new THREE.HemisphereLight('#e7f2ff', '#737f54', 2.2));

  const sun = new THREE.DirectionalLight('#fff0d6', 3.2);
  sun.position.set(-18, 34, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
  const views = {
    overzicht: { position: new THREE.Vector3(22, 16, 33), target: new THREE.Vector3(0, 1.8, -20) },
    ingang: { position: new THREE.Vector3(0, 8.5, 21), target: new THREE.Vector3(0, 2.4, -7) },
    zijkant: { position: new THREE.Vector3(-17, 6.7, 4), target: new THREE.Vector3(0, 2, -7) },
    slagboom: { position: new THREE.Vector3(12, 5, 9), target: new THREE.Vector3(0, 2.2, -5) },
  };
  camera.position.copy(views.overzicht.position);
  let cameraTarget = views.overzicht.target.clone();
  let desiredPosition = views.overzicht.position.clone();
  let desiredTarget = cameraTarget.clone();

  const grass = material('#718f55');
  const road = material('#343938', { roughness: 1 });
  const roadEdge = material('#e0ddca');
  const lanePaint = material('#eee9d9');
  const gravel = material('#b4a78b');
  const wood = material('#97623a');
  const darkWood = material('#5e422c');
  const controlBox = material('#202725', { roughness: 0.62, metalness: 0.18 });
  const metal = material('#a6aaa0', { metalness: 0.56, roughness: 0.42 });
  const barrierRed = material('#c9332c', { roughness: 0.53 });
  const barrierWhite = material('#f4f0e2', { roughness: 0.58 });
  const redLight = material('#401c19', { emissive: '#f12f23', emissiveIntensity: 0.25 });
  const redLightOn = material('#501d18', { emissive: '#f12f23', emissiveIntensity: 1.2 });
  const greenLight = material('#17291d', { emissive: '#72ee62', emissiveIntensity: 0.15 });
  const greenLightOn = material('#1b2b1d', { emissive: '#72ee62', emissiveIntensity: 1.2 });

  box(scene, 'campground-grass', [110, 0.4, 150], [0, -0.37, -37], grass);
  box(scene, 'entrance-road', [12.4, 0.12, 106], [0, -0.12, -43], road);
  box(scene, 'road-edge-left', [0.16, 0.025, 106], [-6.15, -0.045, -43], roadEdge);
  box(scene, 'road-edge-right', [0.16, 0.025, 106], [6.15, -0.045, -43], roadEdge);
  for (const x of [-0.98, 0.98]) {
    box(scene, 'center-island-edge', [0.12, 0.35, 18], [x, 0, -5], roadEdge);
  }
  box(scene, 'center-island-base', [1.9, 0.28, 18], [0, -0.04, -5], gravel);
  box(scene, 'center-island-grass', [1.68, 0.04, 17.8], [0, 0.12, -5], grass);
  box(scene, 'exit-stop-line', [5.1, 0.035, 0.3], [-3.1, -0.025, -3.6], lanePaint);
  box(scene, 'entry-stop-line', [5.1, 0.035, 0.3], [3.1, -0.025, -3.6], lanePaint);
  box(scene, 'left-road-shoulder', [2.2, 0.14, 106], [-7.3, -0.12, -43], gravel);
  box(scene, 'right-road-shoulder', [2.2, 0.14, 106], [7.3, -0.12, -43], gravel);

  for (const x of [-7.5, 7.5]) {
    box(scene, 'camp-fence', [0.16, 0.9, 92], [x, 0.43, -39], wood);
    for (let z = 8; z >= -84; z -= 4.1) {
      box(scene, 'fence-post', [0.25, 1.25, 0.25], [x, 0.59, z], darkWood);
    }
    for (const y of [0.3, 0.85]) box(scene, 'fence-rail', [0.18, 0.16, 92], [x, y, -39], wood);
  }

  for (let z = 8; z > -80; z -= 9.5) {
    addTree(scene, -10.4 - (z % 3) * 0.3, z, 0.95 + ((z + 80) % 4) * 0.08, Math.abs(z) % 3 === 0);
    addTree(scene, 10.1 + (z % 2) * 0.4, z - 1.5, 1.05, Math.abs(z) % 4 === 0);
  }
  for (const [x, z, scale] of [
    [-8, 2, 1.2], [-9, -1, 0.95], [-8.7, -13, 1.1], [8, 1, 1.2],
    [8.6, -4, 1.15], [8.1, -13, 1.45], [-11.2, -20, 1.3], [10.5, -24, 1.3],
  ]) addBush(scene, x, z, scale);

  const flowers = ['#df5f9a', '#8c68d7', '#e3bd54'];
  for (let i = 0; i < 8; i += 1) {
    addFlowers(scene, -8.6 + (i % 3) * 0.48, -9 - Math.floor(i / 3) * 1.15, flowers[i % flowers.length]);
    addFlowers(scene, 8.25 + (i % 3) * 0.42, -7.5 - Math.floor(i / 3) * 1.05, flowers[(i + 1) % flowers.length]);
  }

  const welcome = new THREE.Group();
  welcome.position.set(-10, 0, -12);
  welcome.rotation.y = Math.PI / 10;
  scene.add(welcome);
  for (const x of [-1.25, 1.25]) box(welcome, 'welcome-sign-post', [0.27, 7.8, 0.3], [x, 3.85, 0], wood);
  const welcomeTexture = createTextTexture(['DE GROENE WEIDE', 'WELKOM OP DE CAMPING', 'NATUUR · RUST · SAMEN'], '#98623a', '#fff1cb');
  const welcomeBoard = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 0.18), new THREE.MeshStandardMaterial({ map: welcomeTexture, roughness: 0.86 }));
  welcomeBoard.position.set(0, 5.3, -0.03);
  welcomeBoard.castShadow = true;
  welcome.add(welcomeBoard);
  const directionBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.7),
    new THREE.MeshStandardMaterial({ map: createTextTexture(['UITGANG | INGANG', 'LINKS | RECHTS', 'AI-CAMERA · HULPDIENST'], '#263832', '#e8f4dc'), roughness: 0.82 }),
  );
  directionBoard.position.set(0, 2.35, -0.14);
  welcome.add(directionBoard);

  const laneSign = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 1.45, 0.16),
    new THREE.MeshStandardMaterial({
      map: createTextTexture(['UITGANG  |  INGANG', 'LINKS          RECHTS', 'DE GROENE WEIDE'], '#263832', '#e8f4dc'),
      roughness: 0.82,
    }),
  );
  laneSign.position.set(0, 4.1, 1.6);
  laneSign.castShadow = true;
  scene.add(laneSign);
  box(scene, 'lane-sign-support', [0.18, 3.35, 0.18], [0, 1.78, 1.6], darkWood);

  const gateZ = -4.8;
  const barrierPivots = [];
  createBarrier(scene, { controlBox, metal, barrierRed, barrierWhite, greenLight }, gateZ, 1, 'uitgang', barrierPivots).rotation.z = Math.PI / 2;
  createBarrier(scene, { controlBox, metal, barrierRed, barrierWhite, greenLight }, gateZ, -1, 'ingang', barrierPivots);

  const signals = [];
  for (const { x, lane } of [{ x: -0.44, lane: 'uitgang' }, { x: 0.44, lane: 'ingang' }]) {
    box(scene, 'traffic-light-pole', [0.14, 3.1, 0.14], [x, 1.55, gateZ - 0.3], controlBox);
    box(scene, 'traffic-light-housing', [0.58, 1.3, 0.4], [x, 3.4, gateZ - 0.3], controlBox);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), redLight);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), greenLight);
    red.position.set(x, 3.72, gateZ - 0.06);
    green.position.set(x, 3.12, gateZ - 0.06);
    scene.add(red, green);
    signals.push({ red, green, lane });
  }

  for (const z of [gateZ]) {
    box(scene, 'ai-camera-mast', [0.12, 2.4, 0.12], [-5.2, 3.05, z - 1.4], controlBox);
    box(scene, 'ai-camera-bracket', [0.65, 0.1, 0.1], [-4.94, 4.12, z - 1.4], metal);
    box(scene, 'cctv-camera', [0.48, 0.26, 0.35], [-4.68, 4.08, z - 1.4], metal);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 12), material('#18272d', { metalness: 0.6 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(-4.68, 4.08, z - 1.19);
    scene.add(lens);
  }

  for (const z of [-19, -36, -54, -72]) addLamp(scene, -7.1, z);
  box(scene, 'campground-reception', [5.8, 4, 3.8], [15.3, 1.95, -19], wood);
  box(scene, 'reception-roof', [6.4, 0.32, 4.4], [15.3, 4.1, -19], darkWood, [0, 0, -0.06]);
  box(scene, 'reception-door', [1.2, 2.3, 0.1], [15.3, 1.18, -16.98], controlBox);

  for (const z of [-26, -48, -70]) {
    box(scene, 'caravan', [3.1, 2.6, 5.5], [12.4, 1.3, z], material('#eee9dc'));
    box(scene, 'caravan-window', [1.2, 0.75, 0.06], [12.4, 1.9, z + 2.79], material('#708992', { metalness: 0.2 }));
    const wheelMat = material('#252729');
    for (const x of [11.4, 13.4]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.42, z + 1.45);
      scene.add(wheel);
    }
  }

  const gateState = { open: false };
  const resizeObserver = new ResizeObserver(() => {
    const width = canvas.clientWidth || canvas.parentElement.clientWidth;
    const height = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(canvas.parentElement);

  let animationId;
  let previousFrame = performance.now();
  const render = () => {
    animationId = requestAnimationFrame(render);
    const now = performance.now();
    const delta = Math.min((now - previousFrame) / 1000, 0.05);
    previousFrame = now;
    camera.position.lerp(desiredPosition, 1 - Math.exp(-1.9 * delta));
    cameraTarget.lerp(desiredTarget, 1 - Math.exp(-1.9 * delta));
    camera.lookAt(cameraTarget);
    for (const { pivot, lane, openRotation } of barrierPivots) {
      const isOpen = lane === 'uitgang' || gateState.open;
      const angle = isOpen ? openRotation : 0;
      pivot.rotation.z += (angle - pivot.rotation.z) * (1 - Math.exp(-2.2 * delta));
    }
    for (const { red, green, lane } of signals) {
      const isOpen = lane === 'uitgang' || gateState.open;
      red.material = isOpen ? redLight : redLightOn;
      green.material = isOpen ? greenLightOn : greenLight;
    }
    renderer.render(scene, camera);
  };
  render();

  return {
    setGateOpen(open) {
      gateState.open = Boolean(open);
    },
    setView(name) {
      const view = views[name];
      if (!view) return;
      desiredPosition = view.position.clone();
      desiredTarget = view.target.clone();
    },
    dispose() {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.dispose();
    },
  };
}
