// people.js — the player character (Reyes), pedestrians, on-foot movement
// and the revolver: hitscan shooting, reload, damage and wanted heat.

import { PLAYER, clamp, dist2 } from './state.js';
import { resolveCircle } from './world.js';

const SHIRT_COLORS = [0xd2d2d2, 0x3c7bd2, 0xd23c6a, 0x37b06a, 0xe8c33a, 0x8a5ec4, 0x2ad2c4, 0xff7a2a];
const SKIN_TONES = [0xe8b98a, 0xc98a5a, 0x8a5a34, 0xf0c8a0];

// Low-poly person: torso, head, legs that swing while walking, simple arms.
export function makePersonMesh(shirt, skin, scale) {
  const g = new THREE.Group();
  const s = scale || 1;
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a3242 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.72 * s, 0.34 * s), shirtMat);
  torso.position.y = 1.15 * s; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.42 * s, 0.38 * s), skinMat);
  head.position.y = 1.75 * s; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.14 * s, 0.4 * s),
    new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
  hair.position.y = 1.98 * s; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.8 * s, 0.26 * s), pantsMat);
  legL.position.set(-0.17 * s, 0.4 * s, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.17 * s; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.68 * s, 0.2 * s), shirtMat);
  armL.position.set(-0.42 * s, 1.15 * s, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42 * s; g.add(armR);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export function makePlayer(state, scene) {
  const mesh = makePersonMesh(0xd23c3c, 0xe8b98a, 1.05);
  // Reyes wears a red jacket and dark cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x8a1a1a }));
  cap.position.y = 2.02; mesh.add(cap);
  mesh.position.set(state.player.x, 0, state.player.z);
  scene.add(mesh);
  return mesh;
}

// Walk / sprint the player on foot. Camera-relative movement.
export function movePlayerOnFoot(state, input, dt) {
  const p = state.player;
  const sprint = input.sprint;
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  // camera yaw defines forward
  const cy = state.camera.yaw;
  let fx = 0, fz = 0;
  if (input.forward) { fx += -Math.sin(cy); fz += -Math.cos(cy); }
  if (input.back) { fx -= -Math.sin(cy); fz -= -Math.cos(cy); }
  if (input.left) { fx += -Math.cos(cy); fz += Math.sin(cy); }
  if (input.right) { fx -= -Math.cos(cy); fz += -Math.sin(cy); }
  const len = Math.hypot(fx, fz);
  p.moving = len > 0.01;
  p.sprinting = sprint && p.moving;
  if (len > 0.01) {
    fx /= len; fz /= len;
    const nx = p.x + fx * speed * dt;
    const nz = p.z + fz * speed * dt;
    const solved = resolveCircle(state, nx, nz, PLAYER.radius);
    p.x = clamp(solved.x, -CITY_HALF(), CITY_SEA());
    p.z = clamp(solved.z, -170, 170);
    p.heading = Math.atan2(fx, fz);
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  return p.moving;
}

function CITY_HALF() { return 200; }
function CITY_SEA() { return 190; }

// Animate the walk cycle (legs + arms swing, slight bob).
export function animatePerson(mesh, moving, sprinting, time) {
  const u = mesh.userData;
  if (!u.legL) return;
  const rate = sprinting ? 13 : 9;
  const amp = moving ? (sprinting ? 0.75 : 0.5) : 0;
  const s = Math.sin(time * rate) * amp;
  u.legL.rotation.x = s;
  u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.7;
  u.armR.rotation.x = s * 0.7;
  mesh.position.y = moving ? Math.abs(Math.sin(time * rate)) * 0.06 : 0;
}

// --- pedestrians ---------------------------------------------------------------
export function populatePedestrians(state, scene, count) {
  for (let i = 0; i < count; i++) {
    const shirt = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    const skin = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    const mesh = makePersonMesh(shirt, skin, 0.92 + Math.random() * 0.18);
    // start on a sidewalk near a street
    const line = [-130, -78, -26, 26, 78, 130][Math.floor(Math.random() * 6)];
    const t = -140 + Math.random() * 280;
    const horizontal = Math.random() < 0.5;
    const x = horizontal ? t : line + 8.5;
    const z = horizontal ? line + 8.5 : t;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    state.pedestrians.push({
      mesh, x, z, heading: Math.random() * Math.PI * 2,
      speed: 1.2 + Math.random() * 1.4,
      walkPhase: Math.random() * 10,
      panic: 0, alive: true,
      targetX: x, targetZ: z,
    });
  }
}

export function updatePedestrians(state, dt) {
  for (const ped of state.pedestrians) {
    if (!ped.alive) continue;
    const d = Math.hypot(ped.targetX - ped.x, ped.targetZ - ped.z);
    if (d < 2 || Math.random() < dt * 0.02) {
      // pick a new sidewalk waypoint
      const line = [-130, -78, -26, 26, 78, 130][Math.floor(Math.random() * 6)];
      const t = -140 + Math.random() * 280;
      const horizontal = Math.random() < 0.5;
      ped.targetX = horizontal ? t : line + 8.5;
      ped.targetZ = horizontal ? line + 8.5 : t;
    }
    const speed = ped.panic > 0 ? ped.speed * 2.6 : ped.speed;
    if (ped.panic > 0) ped.panic -= dt;
    const want = Math.atan2(ped.targetX - ped.x, ped.targetZ - ped.z);
    ped.heading = want;
    ped.x += Math.sin(want) * speed * dt;
    ped.z += Math.cos(want) * speed * dt;
    ped.walkPhase += dt * (ped.panic > 0 ? 12 : 7);
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    animatePerson(ped.mesh, true, ped.panic > 0, ped.walkPhase);
  }
}

// --- shooting ------------------------------------------------------------------
export function tryShoot(state, camera, scene, sounds) {
  if (state.ammoInGun <= 0) { if (sounds) sounds.emptyClick(); return 'empty'; }
  state.ammoInGun--;
  state.stats.shotsFired++;
  if (sounds) sounds.shoot();
  // muzzle flash: a quick point light at the camera
  // hitscan: ray from camera through screen centre
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  ray.far = 90;
  const targets = [];
  for (const ped of state.pedestrians) if (ped.alive) targets.push(ped.mesh);
  for (const car of state.cars) targets.push(car.mesh);
  const hits = ray.intersectObjects(targets, true);
  let hitSomething = false;
  if (hits.length > 0) {
    const hit = hits[0];
    // walk up to the group root to identify the owner
    let obj = hit.object;
    while (obj.parent && obj.parent.type === 'Group') obj = obj.parent;
    const root = obj.parent === scene ? obj : obj;
    // find which pedestrian / car this mesh belongs to
    for (const ped of state.pedestrians) {
      if (ped.alive && ped.mesh === root) {
        ped.alive = false;
        ped.mesh.visible = false;
        state.kills++;
        state.wantedHeat = Math.min(100, state.wantedHeat + 26);
        hitSomething = true;
        if (sounds) sounds.hit();
        break;
      }
    }
    if (!hitSomething) {
      for (const car of state.cars) {
        if (car.mesh === root) {
          hitSomething = true;
          state.stats.shotsHit++;
          if (car.police) state.wantedHeat = Math.min(100, state.wantedHeat + 18);
          else state.wantedHeat = Math.min(100, state.wantedHeat + 6);
          if (sounds) sounds.hit();
          // spark at impact
          spawnSpark(scene, hit.point);
          break;
        }
      }
    }
    if (hitSomething) state.stats.shotsHit++;
  }
  // tracer flash: brief line from player toward the aim point
  spawnTracer(state, scene, camera);
  return hitSomething ? 'hit' : 'miss';
}

function spawnSpark(scene, point) {
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffd76a }));
  spark.position.copy(point);
  scene.add(spark);
  setTimeout(() => scene.remove(spark), 120);
}

function spawnTracer(state, scene, camera) {
  const p = state.player;
  const from = new THREE.Vector3(p.car ? p.car.x : p.x, 1.4, p.car ? p.car.z : p.z);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const to = from.clone().add(dir.multiplyScalar(40));
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 }));
  scene.add(line);
  setTimeout(() => scene.remove(line), 70);
}

export function reloadGun(state, sounds) {
  if (state.ammoInGun >= state.gunSize || state.ammoReserve <= 0) return false;
  const need = state.gunSize - state.ammoInGun;
  const take = Math.min(need, state.ammoReserve);
  state.ammoInGun += take;
  state.ammoReserve -= take;
  if (sounds) sounds.reload();
  return true;
}
