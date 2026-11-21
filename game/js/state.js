// state.js — shared game state, constants, save/load, deterministic RNG.
// Every other module reads and mutates this one object, so the whole game
// stays in sync (HUD, missions, police, save file).

export const SAVE_KEY = 'neon-harbor-save-v1';

// City layout: 6x6 blocks. Streets run on a 52-unit grid; street centrelines sit
// at -130, -78, -26, 26, 78, 130 on both axes. Blocks fill the gaps between them.
// East of x = +156 is sand, then the sea.
export const CITY = {
  half: 156,          // playable city half-extent (streets end here)
  streetStep: 52,
  streetLines: [-130, -78, -26, 26, 78, 130],
  streetHalfWidth: 6,
  beachX: 156,        // sand starts here
  seaX: 196,          // water starts here
  worldHalf: 300,     // far edge of the sea / skybox ground
};

export const PLAYER = {
  walkSpeed: 7,
  sprintSpeed: 12,
  radius: 0.7,
  maxHealth: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,       // ~150 km/h at the top end
  maxReverse: 10,
  steer: 1.9,
  grip: 6.5,
};

// Mulberry32 — tiny deterministic RNG so the city layout is identical every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function createState() {
  return {
    mode: 'menu',           // menu | playing | paused | dead
    paused: false,
    muted: false,
    time: 0,
    cash: 0,
    health: PLAYER.maxHealth,
    wanted: 0,
    wantedHeat: 0,          // 0..100; drives star changes
    heatCooldown: 0,        // seconds of laying low before stars decay
    ammoInGun: 6,
    ammoReserve: 24,
    gunSize: 6,
    missionIndex: 0,        // 0..3 active, 4 = all done
    missionsDone: 0,
    kills: 0,
    carsStolen: 0,
    // player transform
    player: {
      x: -8, z: 8, heading: 0, speed: 0,
      onFoot: true, car: null, moving: false, sprinting: false,
    },
    camera: { yaw: 0.6, pitch: 0.42, dist: 9 },
    shotMode: null,         // null | start | play | chase | mission
    shotReady: false,
    // runtime registries (filled by world/vehicles/people)
    buildings: [],          // {minX,maxX,minZ,maxZ,h}
    colliders: [],          // same shape, includes props
    cars: [],               // vehicle objects
    police: [],
    pedestrians: [],
    pickups: [],
    beacon: null,           // {x,z} mission marker, or null
    mission: null,          // active mission runtime object
    stats: { shotsFired: 0, shotsHit: 0, distanceDriven: 0 },
  };
}

export function saveGame(state) {
  try {
    const data = {
      cash: state.cash,
      health: state.health,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      ammoReserve: state.ammoReserve,
      kills: state.kills,
      carsStolen: state.carsStolen,
      player: { x: state.player.x, z: state.player.z, heading: state.player.heading },
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch (e) { return null; }
}

export function hasSave() { return loadGame() !== null; }

export function applySave(state, data) {
  state.cash = data.cash | 0;
  state.health = clamp(data.health ?? 100, 1, 100);
  state.missionIndex = data.missionIndex | 0;
  state.missionsDone = data.missionsDone | 0;
  state.ammoReserve = data.ammoReserve ?? 24;
  state.kills = data.kills | 0;
  state.carsStolen = data.carsStolen | 0;
  if (data.player) {
    state.player.x = data.player.x ?? -8;
    state.player.z = data.player.z ?? 8;
    state.player.heading = data.player.heading ?? 0;
  }
}
