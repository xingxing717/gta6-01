// pickups.js — street cash: bundles of bills left around Aurelia Bay for
// Reyes to scoop up. A small side activity between jobs: each bundle pays
// $50, then another one appears somewhere else in the city.

import { CITY } from './state.js';

const BUNDLE_VALUE = 50;
const BUNDLE_COUNT = 10;

function makeBundleMesh() {
  const g = new THREE.Group();
  // a stack of bills
  const bills = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x2e8b57, emissive: 0x0a3a1a }));
  bills.position.y = 0.5; g.add(bills);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.2),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
  band.position.y = 0.5; g.add(band);
  // a gold coin spinning above it
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 14),
    new THREE.MeshLambertMaterial({ color: 0xffd23d, emissive: 0x8a6a00 }));
  coin.position.y = 1.1; coin.rotation.x = Math.PI / 2;
  g.add(coin);
  g.userData.coin = coin;
  return g;
}

function randomSpot(state) {
  for (let tries = 0; tries < 30; tries++) {
    const x = -145 + Math.random() * 290;
    const z = -145 + Math.random() * 290;
    // keep bundles out of buildings and off the roads: sidewalks + beach
    let inside = false;
    for (const b of state.colliders) {
      if (x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1) { inside = true; break; }
    }
    if (inside) continue;
    const onRoad = CITY.streetLines.some((s) => Math.abs(x - s) < 5 || Math.abs(z - s) < 5);
    if (onRoad) continue;
    return { x, z };
  }
  return { x: 160 + Math.random() * 20, z: -100 + Math.random() * 200 }; // beach fallback
}

export function createPickups(state, scene) {
  const list = [];
  for (let i = 0; i < BUNDLE_COUNT; i++) {
    const spot = randomSpot(state);
    const mesh = makeBundleMesh();
    mesh.position.set(spot.x, 0, spot.z);
    scene.add(mesh);
    list.push({ mesh, x: spot.x, z: spot.z, phase: Math.random() * 6, active: true });
  }
  state.pickups = list;
  return list;
}

// Spin + bob the bundles; collect any the player touches. Returns the
// number of bundles collected this frame.
export function updatePickups(state, dt, sounds) {
  let collected = 0;
  const p = state.player;
  for (const b of state.pickups) {
    if (!b.active) continue;
    b.phase += dt;
    b.mesh.rotation.y += dt * 1.6;
    b.mesh.position.y = Math.sin(b.phase * 2.4) * 0.18;
    b.mesh.userData.coin.rotation.z += dt * 4;
    const dx = p.x - b.x, dz = p.z - b.z;
    if (dx * dx + dz * dz < 2.4 * 2.4) {
      b.active = false;
      b.mesh.visible = false;
      state.cash += BUNDLE_VALUE;
      collected++;
      if (sounds) sounds.cash();
      // a fresh bundle appears elsewhere after a short breather
      setTimeout(() => {
        if (state.mode !== 'playing') return;
        const spot = randomSpot(state);
        b.x = spot.x; b.z = spot.z;
        b.mesh.position.set(spot.x, 0, spot.z);
        b.mesh.visible = true;
        b.active = true;
      }, 20000);
    }
  }
  return collected;
}
