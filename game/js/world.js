// world.js — builds procedural Aurelia Bay: streets, buildings with lit
// windows, beach + sea, palms, lamps and props. All textures are generated
// on canvas at runtime, so the game ships no image files at all.

import { CITY, mulberry32, clamp } from './state.js';

// Make a canvas texture of a building facade: dark wall, grid of windows,
// some lit warm, some lit cool, some dark. Seeded per building for variety.
export function makeFacadeTexture(rng, hue) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const base = `hsl(${hue}, 22%, ${14 + rng() * 10}%)`;
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  // subtle vertical shading strips
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + rng() * 0.03})`;
    g.fillRect(i * 16, 0, 8, 256);
  }
  const cols = 5, rows = 11;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = rng();
      const wx = 10 + x * 23, wy = 12 + y * 21;
      if (r < 0.42) g.fillStyle = '#ffd27a';          // warm lit
      else if (r < 0.55) g.fillStyle = '#9fd8ff';     // cool lit
      else if (r < 0.62) g.fillStyle = '#ff9ad5';     // neon lit
      else g.fillStyle = 'rgba(8,10,18,0.9)';        // dark
      g.fillRect(wx, wy, 14, 12);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(wx, wy, 14, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#232833'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 200; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.fillStyle = '#e8c33a';
  g.fillRect(0, 62, 128, 4); // centre line runs along the road's length
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSandTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d9b77c'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 80 | 0},${90 + Math.random() * 60 | 0},40,0.25)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Point-in-AABB test against every registered collider; returns the collider hit.
export function collideCircle(state, x, z, radius) {
  for (const b of state.colliders) {
    const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return b;
  }
  return null;
}

// Push a circle out of colliders (simple slide: resolve the deepest axis).
export function resolveCircle(state, x, z, radius) {
  for (const b of state.colliders) {
    const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
    let dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-6) {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - (b.minX - radius), pr = (b.maxX + radius) - x;
        const pt = z - (b.minZ - radius), pb = (b.maxZ + radius) - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.minX - radius;
        else if (m === pr) x = b.maxX + radius;
        else if (m === pt) z = b.minZ - radius;
        else z = b.maxZ + radius;
      } else {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      }
    }
  }
  return { x, z };
}

export function isOnRoad(x, z) {
  for (const s of CITY.streetLines) {
    if (Math.abs(x - s) < CITY.streetHalfWidth) return true;
    if (Math.abs(z - s) < CITY.streetHalfWidth) return true;
  }
  return false;
}

export function buildWorld(state, scene) {
  const rng = mulberry32(20261121);
  const add = (mesh) => { scene.add(mesh); return mesh; };

  // --- sky, sun, fog -------------------------------------------------------
  scene.background = new THREE.Color(0x87b5e0);
  scene.fog = new THREE.Fog(0x9fc3e8, 180, 520);
  const sun = new THREE.DirectionalLight(0xffe7b8, 2.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbdd8ff, 0x3a2f28, 0.9));

  // --- ground: city slab ---------------------------------------------------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x8a8f98 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.worldHalf * 2, CITY.worldHalf * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, 0, 0);
  add(ground);

  // --- roads: dark strips along every street line --------------------------
  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const s of CITY.streetLines) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2 + 24, CITY.streetHalfWidth * 2), roadMat.clone());
      road.material.map = roadTex.clone();
      road.material.map.needsUpdate = true;
      road.material.map.repeat.set((CITY.half * 2 + 24) / 12, 1);
      road.rotation.x = -Math.PI / 2;
      if (horizontal) { road.position.set(0, 0.02, s); }
      else { road.rotation.z = Math.PI / 2; road.position.set(s, 0.02, 0); }
      add(road);
    }
  }

  // --- sidewalks: lighter strips flanking the roads ------------------------
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0ab });
  for (const s of CITY.streetLines) {
    for (const off of [-8.5, 8.5]) {
      const w1 = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2, 5), walkMat);
      w1.rotation.x = -Math.PI / 2; w1.position.set(0, 0.01, s + off); add(w1);
      const w2 = new THREE.Mesh(new THREE.PlaneGeometry(5, CITY.half * 2), walkMat);
      w2.rotation.x = -Math.PI / 2; w2.position.set(s + off, 0.01, 0); add(w2);
    }
  }

  // --- buildings: one or two per block, heights 10..42 ----------------------
  const hues = [210, 265, 190, 330, 30, 160];
  const blockCentres = [];
  for (let i = 0; i < 5; i++) blockCentres.push(-104 + i * 52);
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      // skip the central plaza block (Marisol's office square) and the
      // office block just north of it
      if ((bx === 0 && bz === 0) || (bx === 0 && bz === -52)) continue;
      const n = rng() < 0.55 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        // Keep every facade at most 16 units from the block centre, so no
        // building ever juts past the sidewalk into a street.
        const w = 14 + rng() * 8, d = 14 + rng() * 8;
        const h = 10 + rng() * rng() * 34;
        const ox = n === 2 ? (k === 0 ? -5 : 5) : 0;
        const oz = n === 2 ? (k === 0 ? 5 : -5) : 0;
        const x = bx + ox, z = bz + oz;
        const hue = hues[Math.floor(rng() * hues.length)];
        const tex = makeFacadeTexture(rng, hue);
        const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        add(b);
        // roof rim
        const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
          new THREE.MeshLambertMaterial({ color: 0x2a2f3a }));
        rim.position.set(x, h + 0.4, z); add(rim);
        // rooftop AC box on tall towers
        if (h > 26) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4),
            new THREE.MeshLambertMaterial({ color: 0x6a707c }));
          ac.position.set(x + w * 0.2, h + 1.6, z - d * 0.2); add(ac);
        }
        const box = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h };
        state.buildings.push(box);
        state.colliders.push(box);
      }
    }
  }

  // --- central plaza: Marisol's office tower + fountain ----------------------
  const plazaTex = makeFacadeTexture(rng, 330);
  const office = new THREE.Mesh(new THREE.BoxGeometry(30, 46, 30),
    new THREE.MeshLambertMaterial({ map: plazaTex, emissive: 0xffffff, emissiveMap: plazaTex, emissiveIntensity: 0.6 }));
  office.position.set(0, 23, -48); add(office);
  state.buildings.push({ minX: -15, maxX: 15, minZ: -63, maxZ: -33, h: 46 });
  state.colliders.push({ minX: -15, maxX: 15, minZ: -63, maxZ: -33, h: 46 });
  // neon sign strip on the office
  const sign = new THREE.Mesh(new THREE.BoxGeometry(20, 2.4, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xff5ec4 }));
  sign.position.set(0, 40, -32.6); add(sign);
  const sign2 = new THREE.Mesh(new THREE.BoxGeometry(20, 2.4, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x4de3ff }));
  sign2.position.set(0, 36.5, -32.6); add(sign2);
  // fountain
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x7a8899 }));
  fountain.position.set(0, 0.6, 8); add(fountain);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x3fa7d6, emissive: 0x1a5a80 }));
  water.position.set(0, 1.1, 8); add(water);
  state.colliders.push({ minX: -7, maxX: 7, minZ: 1, maxZ: 15, h: 2 });

  // --- beach + sea (east side) ----------------------------------------------
  const sandTex = makeSandTexture();
  sandTex.repeat.set(8, 8);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(60, CITY.half * 2 + 40),
    new THREE.MeshLambertMaterial({ map: sandTex }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachX + 30, 0.03, 0);
  add(sand);
  // boardwalk edge
  const board = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, CITY.half * 2),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  board.position.set(CITY.beachX + 1, 0.3, 0); add(board);
  // sea: animated in main loop via userData
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(220, CITY.half * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0x1e7fa8, emissive: 0x0a3a55, transparent: true, opacity: 0.94 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY.seaX + 110, 0.06, 0);
  sea.userData.isSea = true;
  add(sea);
  state.sea = sea;

  // --- palms along the beach and plaza ---------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57, emissive: 0x0a3a1a });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5; trunk.rotation.z = (rng() - 0.5) * 0.2; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    add(g);
    state.colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6, h: 7 });
  }
  for (let z = -140; z <= 140; z += 28) palm(CITY.beachX + 12 + rng() * 8, z + rng() * 8);
  for (let z = -140; z <= 140; z += 56) palm(-150 + rng() * 6, z);

  // --- street lamps -----------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  state.lamps = [];
  for (const s of CITY.streetLines) {
    for (let t = -130; t <= 130; t += 52) {
      // lamps stand on sidewalk corners: 7 units off BOTH street centrelines,
      // never in the middle of a crossing street
      for (const [lx, lz] of [[s + 7, t + 7], [s - 7, t - 7]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
        pole.position.set(lx, 3, lz); add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat);
        bulb.position.set(lx, 6.2, lz); add(bulb);
        state.lamps.push(bulb);
        state.colliders.push({ minX: lx - 0.25, maxX: lx + 0.25, minZ: lz - 0.25, maxZ: lz + 0.25, h: 6 });
      }
    }
  }

  // --- scattered props: crates, dumpsters, benches ---------------------------
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a3a });
  const dumpMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
  for (let i = 0; i < 26; i++) {
    const x = -140 + rng() * 280, z = -140 + rng() * 280;
    if (isOnRoad(x, z)) continue;
    if (Math.abs(x) < 20 && Math.abs(z + 30) < 30) continue;
    const s = 1.4 + rng() * 1.6;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), rng() < 0.5 ? crateMat : dumpMat);
    crate.position.set(x, s / 2, z); crate.rotation.y = rng() * Math.PI;
    add(crate);
    state.colliders.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2, h: s });
  }

  // --- harbour pier + yacht (east, in the sea) --------------------------------
  const pier = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 6),
    new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
  pier.position.set(CITY.seaX + 6, 0.5, 60); add(pier);
  const yacht = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 5),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
  hull.position.y = 1.2; yacht.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 4),
    new THREE.MeshLambertMaterial({ color: 0xdfeaf2 }));
  cabin.position.y = 3.6; yacht.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x888888 }));
  mast.position.y = 7; yacht.add(mast);
  yacht.position.set(CITY.seaX + 30, 0, 60);
  add(yacht);

  // --- distant skyline silhouettes (cheap depth cue) --------------------------
  const farMat = new THREE.MeshLambertMaterial({ color: 0x5a7396 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 380 + rng() * 60;
    const h = 50 + rng() * 90;
    const b = new THREE.Mesh(new THREE.BoxGeometry(24, h, 24), farMat);
    b.position.set(Math.cos(a) * r + 40, h / 2, Math.sin(a) * r);
    add(b);
  }
}
