// vehicles.js — car meshes, arcade driving, traffic AI that follows the
// street grid, and police pursuit / ramming / roadblocks.

import { CITY, CAR, clamp, lerp, angleLerp, dist2 } from './state.js';
import { resolveCircle, isOnRoad } from './world.js';

const CAR_COLORS = [0xd23c3c, 0x3c7bd2, 0xe8c33a, 0x37b06a, 0xe8e8e8, 0x222226,
  0xff7a2a, 0x8a5ec4, 0x2ad2c4, 0xc4c4c4];
const CAR_NAMES = ['Comet', 'Stallion', 'Voyager', 'Prowler', 'Sunset', 'Interceptor',
  'Dune', 'Falcon', 'Harbor', 'Metro'];

// Build a low-poly car mesh. `police` adds a light bar and livery.
export function makeCarMesh(color, police, name) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0x1a1a22 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: police ? 0x222228 : 0x1c2733 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), cabinMat);
  cabin.position.set(0, 1.1, -0.25); g.add(cabin);
  // windshield sheen
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ff, emissive: 0x2a4a66 }));
  glass.position.set(0, 1.05, 0.9); glass.rotation.x = -0.25; g.add(glass);
  // headlights + taillights
  const hl = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xccaa33 });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), hl);
    h.position.set(sx, 0.6, 2.21); g.add(h);
  }
  const tl = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0x881111 });
  for (const sx of [-0.7, 0.7]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tl);
    t.position.set(sx, 0.6, -2.21); g.add(t);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.45, -0.25); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.32, 1.48, -0.25); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    blue.position.set(0.32, 1.48, -0.25); g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.72; g.add(stripe);
  }
  // wheels
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0e });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.name = name;
  return g;
}

export function makeCar(state, scene, opts) {
  const o = opts || {};
  const color = o.color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const name = o.name ?? CAR_NAMES[Math.floor(Math.random() * CAR_NAMES.length)];
  const mesh = makeCarMesh(color, !!o.police, name);
  mesh.position.set(o.x ?? 0, 0, o.z ?? 0);
  mesh.rotation.y = o.heading ?? 0;
  scene.add(mesh);
  const car = {
    mesh, name, police: !!o.police, parked: !!o.parked,
    x: o.x ?? 0, z: o.z ?? 0, heading: o.heading ?? 0,
    speed: 0, steer: 0, color,
    ai: o.ai || null,            // traffic AI state, or null
    target: null,                // police chase target
    roadblock: false,
    flash: 0,
    wheelSpin: 0,
    stuckTimer: 0,
  };
  state.cars.push(car);
  if (o.police) state.police.push(car);
  return car;
}

// --- traffic AI: pick a route along street centrelines -----------------------
function pickRoute(car) {
  const lines = CITY.streetLines;
  const route = [];
  let x = car.x, z = car.z;
  // snap to nearest street line
  let nx = lines[0]; for (const s of lines) if (Math.abs(s - x) < Math.abs(nx - x)) nx = s;
  let nz = lines[0]; for (const s of lines) if (Math.abs(s - z) < Math.abs(nz - z)) nz = s;
  if (Math.abs(x - nx) < Math.abs(z - nz)) x = nx; else z = nz;
  route.push({ x, z });
  let horizontal = Math.abs(x - nx) < 1;
  for (let i = 0; i < 6; i++) {
    const line = lines[Math.floor(Math.random() * lines.length)];
    if (horizontal) { x = line; }
    else { z = line; }
    x = clamp(x, -130, 130); z = clamp(z, -130, 130);
    route.push({ x, z });
    horizontal = !horizontal;
  }
  return route;
}

export function updateTraffic(state, dt) {
  for (const car of state.cars) {
    if (car.police || car.parked || car === state.player.car) continue;
    if (!car.ai) car.ai = { route: pickRoute(car), wp: 0, speed: 9 + Math.random() * 5 };
    const ai = car.ai;
    const wp = ai.route[ai.wp];
    if (!wp) { ai.route = pickRoute(car); ai.wp = 0; continue; }
    const dx = wp.x - car.x, dz = wp.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) { ai.wp++; continue; }
    const wantHeading = Math.atan2(dx, dz);
    car.heading = angleLerp(car.heading, wantHeading, Math.min(1, dt * 4));
    // slow down if a car is right ahead
    let targetSpeed = ai.speed;
    for (const other of state.cars) {
      if (other === car) continue;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const ox = other.x - car.x, oz = other.z - car.z;
      const fwd = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (fwd > 0 && fwd < 9 && side < 2.4) { targetSpeed = 0; break; }
    }
    car.speed = lerp(car.speed, targetSpeed, Math.min(1, dt * 2));
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    car.wheelSpin += car.speed * dt * 2;
    for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
  }
}

// --- player driving -----------------------------------------------------------
export function drivePlayerCar(state, car, input, dt, sounds) {
  const fwd = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  const steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const handbrake = input.handbrake;
  if (fwd) car.speed += CAR.accel * dt;
  if (back) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  }
  if (!fwd && !back) car.speed = lerp(car.speed, 0, Math.min(1, dt * 1.2));
  if (handbrake) car.speed = lerp(car.speed, 0, Math.min(1, dt * 6));
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const steerTarget = steerIn * CAR.steer * (car.speed >= 0 ? 1 : -1);
  car.steer = lerp(car.steer, steerTarget, Math.min(1, dt * 8));
  const turnRate = car.steer * clamp(Math.abs(car.speed) / 10, 0, 1) * 1.35;
  car.heading += turnRate * dt * (car.speed >= 0 ? 1 : -1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  // building collision: treat the car as a circle of radius 1.5 and stop
  // with a thud instead of passing through a facade
  let hit = false;
  for (const b of state.colliders) {
    const cx = clamp(nx, b.minX, b.maxX), cz = clamp(nz, b.minZ, b.maxZ);
    if ((nx - cx) * (nx - cx) + (nz - cz) * (nz - cz) < 1.5 * 1.5) { hit = true; break; }
  }
  if (hit) {
    if (Math.abs(car.speed) > 8 && sounds) sounds.crash();
    car.speed *= -0.25;
  } else {
    car.x = nx; car.z = nz;
  }
  car.x = clamp(car.x, -CITY.worldHalf + 10, CITY.seaX - 6);
  car.z = clamp(car.z, -CITY.half - 20, CITY.half + 20);
  // body roll + wheel spin for feel
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = -car.steer * 0.03 * clamp(Math.abs(car.speed) / 12, 0, 1);
  car.wheelSpin += car.speed * dt * 2;
  for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
  state.stats.distanceDriven += Math.abs(car.speed) * dt;
  return car.speed;
}

// --- police -------------------------------------------------------------------
export function spawnPolice(state, scene, count) {
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * Math.PI * 2 + state.time;
    let px = clamp(state.player.x + Math.cos(a) * 55, -140, 140);
    let pz = clamp(state.player.z + Math.sin(a) * 55, -140, 140);
    // snap the spawn onto the nearest street so cruisers start on a road,
    // not inside a block
    const lines = CITY.streetLines;
    let nx = lines[0]; for (const s of lines) if (Math.abs(s - px) < Math.abs(nx - px)) nx = s;
    let nz = lines[0]; for (const s of lines) if (Math.abs(s - pz) < Math.abs(nz - pz)) nz = s;
    if (Math.abs(px - nx) < Math.abs(pz - nz)) px = nx; else pz = nz;
    const car = makeCar(state, scene, { police: true, x: px, z: pz, name: 'Interceptor' });
    car.ai = { mode: 'chase' };
    spawned++;
  }
  return spawned;
}

export function updatePolice(state, dt, sounds) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  const wantCount = state.wanted >= 4 ? 4 : state.wanted >= 2 ? 3 : state.wanted >= 1 ? 2 : 0;
  // despawn extras when heat drops
  while (state.police.length > wantCount) {
    const car = state.police.pop();
    state.cars.splice(state.cars.indexOf(car), 1);
    car.mesh.parent.remove(car.mesh);
  }
  for (const car of state.police) {
    car.flash += dt;
    const on = Math.floor(car.flash * 6) % 2 === 0;
    if (car.mesh.userData.lightRed) car.mesh.userData.lightRed.visible = on;
    if (car.mesh.userData.lightBlue) car.mesh.userData.lightBlue.visible = !on;
    const d = Math.hypot(px - car.x, pz - car.z);
    // roadblock: at 3+ stars one cruiser parks ahead of the player's path
    if (state.wanted >= 3 && !car.roadblock && d < 45 && Math.random() < dt * 0.15) {
      car.roadblock = true;
      car.ai = { mode: 'block', timer: 6 };
    }
    if (car.ai && car.ai.mode === 'block') {
      car.ai.timer -= dt;
      car.speed = lerp(car.speed, 0, Math.min(1, dt * 3));
      const wantHeading = Math.atan2(px - car.x, pz - car.z) + Math.PI / 2;
      car.heading = angleLerp(car.heading, wantHeading, Math.min(1, dt * 3));
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      if (car.ai.timer <= 0) { car.roadblock = false; car.ai = { mode: 'chase' }; }
      continue;
    }
    const targetSpeed = d > 60 ? 34 : d > 18 ? 30 : 22;
    const wantHeading = Math.atan2(px - car.x, pz - car.z);
    // steer around buildings: if blocked ahead, veer
    car.heading = angleLerp(car.heading, wantHeading, Math.min(1, dt * 2.2));
    car.speed = lerp(car.speed, targetSpeed, Math.min(1, dt * 1.5));
    let nx = car.x + Math.sin(car.heading) * car.speed * dt;
    let nz = car.z + Math.cos(car.heading) * car.speed * dt;
    let blocked = false;
    for (const b of state.colliders) {
      if (nx > b.minX - 1 && nx < b.maxX + 1 && nz > b.minZ - 1 && nz < b.maxZ + 1) { blocked = true; break; }
    }
    if (blocked) {
      car.heading += 0.9 * dt * 4;
      nx = car.x + Math.sin(car.heading) * car.speed * dt * 0.4;
      nz = car.z + Math.cos(car.heading) * car.speed * dt * 0.4;
    }
    car.x = nx; car.z = nz;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    car.wheelSpin += car.speed * dt * 2;
    for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
    // ram the player
    if (d < 3.4) {
      const push = p.car ? 6 : 10;
      if (p.car) {
        p.car.speed = Math.max(p.car.speed, 6);
        p.car.x += Math.sin(car.heading) * push * dt;
        p.car.z += Math.cos(car.heading) * push * dt;
      } else {
        p.x += Math.sin(car.heading) * push * dt;
        p.z += Math.cos(car.heading) * push * dt;
        state.health -= 14 * dt;
        if (sounds && Math.random() < dt * 4) sounds.hurt();
      }
      if (sounds && Math.random() < dt * 2) sounds.crash();
    }
  }
}

// Parked cars the player can steal, plus a few cruising traffic cars.
export function populateCars(state, scene) {
  const spots = [
    [-26, -70], [26, -104], [78, 52], [-78, 26], [130, -26], [-130, 78],
    [26, 130], [-78, -130], [78, -78], [-26, 104], [104, -26], [-104, -52],
  ];
  for (const [x, z] of spots) {
    const onXStreet = CITY.streetLines.includes(z);
    const heading = onXStreet ? Math.PI / 2 : 0;
    // The marina car is the red Comet Marisol's second job needs — always there.
    const isMarina = x === 130 && z === -26;
    makeCar(state, scene, {
      parked: true, x, z, heading,
      color: isMarina ? 0xd23c3c : undefined,
      name: isMarina ? 'Comet' : undefined,
    });
  }
  for (let i = 0; i < 9; i++) {
    const line = CITY.streetLines[Math.floor(Math.random() * CITY.streetLines.length)];
    const t = -130 + Math.random() * 260;
    const horizontal = Math.random() < 0.5;
    makeCar(state, scene, {
      x: horizontal ? t : line, z: horizontal ? line : t,
      heading: horizontal ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI),
    });
  }
}

export function nearestStealableCar(state, maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const car of state.cars) {
    if (car.police) continue;
    if (car === state.player.car) continue;
    const d = dist2(state.player.x, state.player.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
