import * as THREE from "three";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";

// A schematic, hand-built diorama: photo-inspired materials and sketch seating.
// No photograph is used to infer anyone's identity, and dimensions are not surveyed.
export function createLab(
  container,
  { people, extras, landmarks, onSelect, onProject },
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute(
    "aria-label",
    "Rotatable 3D lab model. Use the camera buttons or named desk buttons for keyboard access.",
  );
  renderer.domElement.setAttribute("role", "img");
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 140);
  const target = new THREE.Vector3(0.8, 0, 0.25);
  const room = new THREE.Group();
  scene.add(room);
  scene.add(new THREE.HemisphereLight(0xf5fcff, 0xa7a18a, 2.2));
  const sun = new THREE.DirectionalLight(0xfff3d5, 3.2);
  sun.position.set(-10, 24, 13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -17,
    right: 17,
    top: 20,
    bottom: -20,
    near: 1,
    far: 65,
  });
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.0001;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd8ecff, 1.1);
  fill.position.set(12, 8, -10);
  scene.add(fill);

  const mats = {
    desk: new THREE.MeshStandardMaterial({ color: 0xecebdc, roughness: 0.8 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xc3c8bf, roughness: 0.75 }),
    leg: new THREE.MeshStandardMaterial({
      color: 0xb9c0ba,
      metalness: 0.5,
      roughness: 0.4,
    }),
    partition: new THREE.MeshStandardMaterial({
      color: 0x8c9690,
      roughness: 1,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x252e2d, roughness: 0.7 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x424c4b, roughness: 0.95 }),
    screen: new THREE.MeshStandardMaterial({
      color: 0x1b3137,
      roughness: 0.24,
      metalness: 0.15,
      emissive: 0x102328,
      emissiveIntensity: 0.3,
    }),
    plant: new THREE.MeshStandardMaterial({ color: 0x52744b, roughness: 0.9 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xcfb898, roughness: 0.9 }),
    sofa: new THREE.MeshStandardMaterial({ color: 0xd8d2bc, roughness: 1 }),
    orange: new THREE.MeshStandardMaterial({
      color: 0xc99868,
      roughness: 0.85,
    }),
    white: new THREE.MeshStandardMaterial({ color: 0xe4e6de, roughness: 0.8 }),
  };
  const interactables = [];
  const desks = new Map();
  const highlights = new Map();
  const geometryCache = new Map();
  function box(parent, w, h, d, x, y, z, material, rounded = false) {
    const key = [w, h, d, rounded].join(",");
    if (!geometryCache.has(key))
      geometryCache.set(
        key,
        rounded
          ? new RoundedBoxGeometry(
              w,
              h,
              d,
              2,
              Math.min(0.04, w / 4, h / 4, d / 4),
            )
          : new THREE.BoxGeometry(w, h, d),
      );
    const mesh = new THREE.Mesh(geometryCache.get(key), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent, radius, height, x, y, z, material, radial = 12) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, radial),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function beam(parent, start, end, radius, material) {
    const a = new THREE.Vector3(...start),
      b = new THREE.Vector3(...end),
      delta = b.clone().sub(a);
    const mesh = cylinder(parent, radius, delta.length(), 0, 0, 0, material, 8);
    mesh.position.copy(a.add(b).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  }
  function chair(parent, x, z, angle = 0) {
    const group = new THREE.Group();
    parent.add(group);
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    cylinder(group, 0.05, 0.4, 0, 0.32, 0, mats.leg);
    box(group, 0.61, 0.12, 0.62, 0, 0.59, 0, mats.seat, true);
    const back = box(group, 0.61, 0.65, 0.075, 0, 0.99, 0.28, mats.seat, true);
    back.rotation.x = -0.12;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      beam(
        group,
        [0, 0.15, 0],
        [Math.cos(a) * 0.37, 0.12, Math.sin(a) * 0.37],
        0.025,
        mats.leg,
      );
      cylinder(
        group,
        0.055,
        0.06,
        Math.cos(a) * 0.37,
        0.085,
        Math.sin(a) * 0.37,
        mats.dark,
        8,
      );
    }
    for (const sign of [-1, 1]) {
      box(group, 0.035, 0.27, 0.035, sign * 0.34, 0.78, 0.04, mats.dark);
      box(group, 0.09, 0.045, 0.35, sign * 0.34, 0.9, 0.02, mats.dark, true);
    }
  }
  function desk(item, index) {
    const group = new THREE.Group();
    group.position.set(item.x, 0, item.z);
    group.rotation.y = item.rotation || 0;
    room.add(group);
    desks.set(item.id, group);
    const surface = box(group, 2.08, 0.085, 0.94, 0, 0.82, 0, mats.desk, true);
    for (const x of [-0.87, 0.87]) {
      box(group, 0.075, 0.74, 0.075, x, 0.4, 0, mats.leg);
      box(group, 0.42, 0.055, 0.65, x, 0.055, 0, mats.leg, true);
    }
    box(group, 2.08, 0.67, 0.055, 0, 1.1, -0.48, mats.partition, true);
    box(group, 0.87, 0.51, 0.055, 0.13, 1.12, -0.24, mats.dark, true);
    box(group, 0.78, 0.425, 0.008, 0.13, 1.12, -0.208, mats.screen, true);
    box(group, 0.035, 0.15, 0.04, 0.13, 0.89, -0.25, mats.dark);
    box(group, 0.32, 0.025, 0.23, 0.13, 0.873, -0.22, mats.dark, true);
    box(group, 0.52, 0.025, 0.17, 0.05, 0.88, 0.22, mats.edge, true);
    box(group, 0.09, 0.02, 0.12, 0.51, 0.88, 0.21, mats.dark, true);
    box(group, 0.4, 0.65, 0.44, -0.73, 0.36, 0, mats.white, true);
    box(group, 0.36, 0.015, 0.004, -0.73, 0.44, 0.225, mats.edge);
    if (index % 3 !== 1) {
      const book = box(
        group,
        0.24,
        0.035,
        0.31,
        -0.66,
        0.88,
        0.23,
        new THREE.MeshStandardMaterial({
          color: [0xc7966c, 0x8aaca5, 0xdac9a0][index % 3],
          roughness: 1,
        }),
      );
      book.rotation.y = 0.15;
    }
    cylinder(
      group,
      0.055,
      0.13,
      0.74,
      0.92,
      0.15,
      index % 2 ? mats.white : mats.orange,
      14,
    );
    chair(group, 0, 0.9, index % 2 ? 0.12 : -0.1);
    if (item.shape === "corner") {
      box(group, 1.1, 0.085, 1.05, 1.3, 0.82, 0.43, mats.desk, true);
      box(group, 0.07, 0.74, 0.07, 1.7, 0.4, 0.75, mats.leg);
    }
    const highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.65, 48),
      new THREE.MeshBasicMaterial({
        color: 0x698454,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.set(0, 0.018, 0.75);
    highlight.visible = false;
    group.add(highlight);
    highlights.set(item.id, highlight);
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 1.4, 1.9),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(0, 0.7, 0.35);
    hit.userData.person = item.id;
    group.add(hit);
    interactables.push(hit);
    return surface;
  }
  const carpet = new THREE.MeshStandardMaterial({
    color: 0xa8ada3,
    roughness: 1,
  });
  box(
    room,
    14,
    0.32,
    21.6,
    0.8,
    -0.2,
    0.2,
    new THREE.MeshStandardMaterial({ color: 0xc8c6b6, roughness: 0.9 }),
    true,
  );
  box(room, 13.8, 0.025, 21.4, 0.8, -0.02, 0.2, carpet);
  // Subtle carpet seams, glass facade, and slim mullions from the reference photos.
  const seam = new THREE.MeshStandardMaterial({
    color: 0xa2a99d,
    roughness: 1,
  });
  for (let z = -9.8; z < 10.8; z += 1.1)
    box(room, 13.7, 0.003, 0.009, 0.8, 0.001, z, seam);
  for (let x = -5.5; x < 7.6; x += 1.15)
    box(room, 0.009, 0.003, 21.3, x, 0.002, 0.2, seam);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xb5d9db,
    transparent: true,
    opacity: 0.18,
    roughness: 0.15,
    metalness: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const frame = new THREE.MeshStandardMaterial({
    color: 0xb3c0b9,
    metalness: 0.45,
    roughness: 0.45,
  });
  box(room, 0.06, 2.5, 21.2, -6.02, 1.25, 0.2, glass);
  box(room, 13.65, 2.5, 0.06, 0.8, 1.25, -10.42, glass);
  for (let z = -10.3; z < 10.9; z += 2.15)
    box(room, 0.055, 2.7, 0.07, -6.02, 1.35, z, frame);
  for (let x = -6; x < 7.8; x += 2.25)
    box(room, 0.055, 2.7, 0.07, x, 1.35, -10.42, frame);
  box(room, 0.08, 0.06, 21.3, -6.02, 2.64, 0.2, frame);
  box(room, 13.8, 0.06, 0.08, 0.8, 2.64, -10.42, frame);
  box(room, 0.08, 0.04, 21.3, -6.02, 0.12, 0.2, frame);
  box(room, 13.8, 0.04, 0.08, 0.8, 0.12, -10.42, frame);
  // Cutaway sill keeps the foreground open, rather than hiding the desks.
  box(room, 13.8, 0.12, 0.1, 0.8, 0.06, 10.78, mats.white);
  box(room, 0.1, 0.12, 21.3, 7.66, 0.06, 0.2, mats.white);
  // Structural columns.
  for (const z of [-6.7, 1.2, 8.2])
    cylinder(room, 0.19, 2.65, -5.66, 1.325, z, mats.white, 20);
  people.forEach((person, index) =>
    desk({ ...person.seat, id: person.id }, index),
  );
  extras.forEach((item, index) => desk(item, index + people.length));
  function plant(x, z, size = 1) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(size);
    room.add(group);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.16, 0.38, 16),
      mats.pot,
    );
    pot.position.y = 0.19;
    pot.castShadow = true;
    group.add(pot);
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.4;
      const px = Math.cos(angle) * 0.24,
        pz = Math.sin(angle) * 0.24,
        py = 0.6 + (i % 3) * 0.2;
      beam(group, [0, 0.34, 0], [px, py, pz], 0.018, mats.plant);
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        mats.plant,
      );
      leaf.scale.set(0.45, 1.9, 0.7);
      leaf.position.set(px, py, pz);
      leaf.rotation.z = Math.cos(angle) * 0.6;
      leaf.rotation.x = Math.sin(angle) * 0.6;
      leaf.castShadow = true;
      group.add(leaf);
    }
  }
  for (const [x, z, s] of [
    [-5, -8.8, 1.3],
    [-5.1, -3.9, 1.1],
    [6.7, -8.8, 1.6],
    [6.6, -4, 1.2],
    [-4.4, 6.2, 1],
  ])
    plant(x, z, s);
  // Photo-inspired sofa, orange accent chair, television and low table.
  const lounge = new THREE.Group();
  room.add(lounge);
  lounge.position.set(-3.4, 0, 8.75);
  box(lounge, 3.3, 0.32, 0.91, 0, 0.34, 0, mats.sofa, true);
  box(lounge, 3.3, 0.68, 0.19, 0, 0.78, 0.4, mats.sofa, true);
  for (const x of [-1.57, 1.57])
    box(lounge, 0.2, 0.49, 1.05, x, 0.56, 0, mats.sofa, true);
  for (const x of [-1.01, 0, 1.01])
    box(lounge, 0.94, 0.15, 0.74, x, 0.55, -0.04, mats.sofa, true);
  for (const x of [-1.05, 1.05]) {
    const cushion = box(
      lounge,
      0.55,
      0.42,
      0.2,
      x,
      0.83,
      0.17,
      mats.white,
      true,
    );
    cushion.rotation.z = x * 0.1;
  }
  box(room, 1.45, 0.09, 0.67, -3.4, 0.38, 7.45, mats.pot, true);
  for (const x of [-3.95, -2.85])
    box(room, 0.045, 0.31, 0.045, x, 0.17, 7.45, mats.dark);
  const tv = new THREE.Group();
  room.add(tv);
  tv.position.set(-4.4, 0, 5.25);
  tv.rotation.y = 0.45;
  box(tv, 1.3, 0.78, 0.065, 0, 1.18, 0, mats.dark, true);
  box(tv, 1.21, 0.67, 0.01, 0, 1.18, 0.04, mats.screen);
  cylinder(tv, 0.035, 0.72, 0, 0.41, 0, mats.dark);
  box(tv, 0.68, 0.05, 0.4, 0, 0.055, 0, mats.dark);
  // Storage and coffee shelves along the right edge.
  const shelf = new THREE.Group();
  shelf.position.set(6.8, 0, 6.1);
  room.add(shelf);
  for (const y of [0.12, 0.67, 1.22, 1.77])
    box(shelf, 0.62, 0.04, 1.4, 0, y, 0, mats.pot);
  for (const z of [-0.65, 0.65])
    box(shelf, 0.045, 1.8, 0.045, 0, 0.9, z, mats.leg);
  for (let i = 0; i < 3; i++)
    cylinder(shelf, 0.09, 0.13, 0, 0.76, -0.43 + i * 0.35, mats.white, 12);
  box(shelf, 0.33, 0.33, 0.4, 0, 0.32, 0, mats.dark, true);
  // RENE: two black articulated YAM arms on a pale workbench.
  const robot = new THREE.Group();
  robot.position.set(5.3, 0, 8.4);
  room.add(robot);
  box(robot, 2.25, 0.09, 1.32, 0, 0.85, 0, mats.desk, true);
  for (const x of [-0.94, 0.94])
    for (const z of [-0.48, 0.48])
      box(robot, 0.07, 0.8, 0.07, x, 0.41, z, mats.leg);
  function robotArm(offset, mirror) {
    const points = [
      [offset, 0.94, 0],
      [offset, 1.15, 0],
      [offset + mirror * 0.2, 1.68, -0.15],
      [offset + mirror * 0.53, 1.48, 0.06],
      [offset + mirror * 0.68, 1.24, 0.28],
    ];
    cylinder(robot, 0.13, 0.12, offset, 0.96, 0, mats.dark);
    for (let i = 0; i < points.length - 1; i++)
      beam(robot, points[i], points[i + 1], 0.075, mats.dark);
    for (const point of points.slice(1)) {
      const joint = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 10, 8),
        mats.dark,
      );
      joint.position.set(...point);
      joint.castShadow = true;
      robot.add(joint);
    }
    const end = points.at(-1);
    for (const dx of [-0.055, 0.055])
      box(
        robot,
        0.03,
        0.17,
        0.035,
        end[0] + dx,
        end[1] - 0.1,
        end[2],
        mats.leg,
      );
  }
  robotArm(-0.67, 1);
  robotArm(0.67, -1);
  box(robot, 0.6, 0.43, 0.055, 0.66, 1.21, -0.49, mats.dark);
  box(robot, 0.52, 0.35, 0.012, 0.66, 1.21, -0.455, mats.screen);
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 2, 1.4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = 1;
  hit.userData.person = "rene";
  robot.add(hit);
  interactables.push(hit);
  // Bake static furniture by material so phones render dozens of batches,
  // not thousands of individual chair parts. Keep hitboxes and rings separate.
  room.updateMatrixWorld(true);
  const batches = new Map();
  room.traverse((object) => {
    if (
      !object.isMesh ||
      !object.material.isMeshStandardMaterial ||
      object.material.transparent
    )
      return;
    const material = object.material;
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(object);
  });
  for (const [material, objects] of batches) {
    const geometries = objects.map((object) => {
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      return geometry.applyMatrix4(object.matrixWorld);
    });
    const merged = mergeGeometries(geometries);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    objects.forEach((object) => object.removeFromParent());
    geometries.forEach((geometry) => geometry.dispose());
  }
  // Soft contact shadow beneath the floating architectural model.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.105 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.38;
  ground.receiveShadow = true;
  scene.add(ground);

  const anchors = [
    ...people.map((p) => ({ id: p.id, x: p.seat.x, z: p.seat.z, y: 1.68 })),
    ...extras.map((d) => ({ ...d, y: 1.3 })),
    ...landmarks.map((d) => ({ ...d, y: d.height || 1.7 })),
  ];
  let width = 1,
    height = 1,
    azimuth = 0.58,
    elevation = 0.92,
    zoom = 1,
    view = "3d",
    defaultPose = true,
    dirty = false;
  function updateCamera() {
    const aspect = width / height;
    if (defaultPose) azimuth = width < 500 ? 0.18 : 0.58;
    // Fit the complete room at narrow widths; intentional zoom can crop it.
    const roomWidth =
      3 + 14 * Math.abs(Math.cos(azimuth)) + 21.6 * Math.abs(Math.sin(azimuth));
    const span = Math.max(26, (view === "top" ? 17 : roomWidth) / aspect);
    camera.left = (-span * aspect) / 2;
    camera.right = (span * aspect) / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    if (view === "top") {
      camera.position.set(target.x, 40, target.z + 0.001);
      camera.up.set(0, 0, -1);
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(
        target.x + 32 * Math.sin(azimuth) * Math.cos(elevation),
        32 * Math.sin(elevation),
        target.z + 32 * Math.cos(azimuth) * Math.cos(elevation),
      );
    }
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  function draw() {
    dirty = false;
    updateCamera();
    renderer.render(scene, camera);
    container.dataset.drawCalls = String(renderer.info.render.calls);
    const positions = new Map();
    for (const anchor of anchors) {
      const p = new THREE.Vector3(anchor.x, anchor.y, anchor.z).project(camera);
      positions.set(anchor.id, {
        x: (p.x * 0.5 + 0.5) * width,
        y: (-0.5 * p.y + 0.5) * height,
        visible: Math.abs(p.x) < 1.12 && Math.abs(p.y) < 1.1,
        order: Math.round((1 - p.z) * 50),
      });
    }
    onProject(positions);
  }
  function invalidate() {
    if (!dirty) {
      dirty = true;
      requestAnimationFrame(draw);
    }
  }
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    renderer.setSize(width, height, false);
    invalidate();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5
    )
      drag.moved = true;
    if (drag.moved && view === "3d") {
      defaultPose = false;
      azimuth -= dx * 0.006;
      elevation = THREE.MathUtils.clamp(elevation + dy * 0.004, 0.55, 1.3);
      container.classList.add("dragging");
      invalidate();
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!drag) return;
    if (!drag.moved) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const found = raycaster.intersectObjects(interactables)[0];
      if (found) onSelect(found.object.userData.person);
    }
    drag = null;
    container.classList.remove("dragging");
  });
  renderer.domElement.addEventListener("pointercancel", () => {
    drag = null;
    container.classList.remove("dragging");
  });
  return {
    select(id) {
      for (const [key, ring] of highlights) ring.visible = key === id;
      invalidate();
    },
    setView(next) {
      view = next;
      invalidate();
    },
    rotate(amount) {
      if (view !== "3d") return;
      defaultPose = false;
      azimuth += amount;
      invalidate();
    },
    zoom(factor) {
      zoom = THREE.MathUtils.clamp(zoom * factor, 0.7, 1.75);
      invalidate();
    },
    reset() {
      defaultPose = true;
      azimuth = 0.58;
      elevation = 0.92;
      zoom = 1;
      view = "3d";
      invalidate();
    },
  };
}
