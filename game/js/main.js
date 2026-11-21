// main.js — bootstrap and game loop for Neon Harbor.
// Wires together world, vehicles, people, missions, HUD and audio; owns the
// camera, input, wanted level, car enter/exit, saving and the ?shot= modes.

import { createState, saveGame, loadGame, applySave, hasSave, clamp, lerp } from './state.js';
import { buildWorld } from './world.js';
import { SoundBank } from './audio.js';
import { makeCar, populateCars, updateTraffic, updatePolice, drivePlayerCar, nearestStealableCar, spawnPolice } from './vehicles.js';
import { makePlayer, populatePedestrians, updatePedestrians, movePlayerOnFoot, animatePerson, tryShoot, reloadGun } from './people.js';
import { MISSIONS, createMissionRuntime, updateMission, startNextMission, failMission, missionMarker } from './missions.js';
import { createPickups, updatePickups } from './pickups.js';
import { HUD } from './hud.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // start | play | chase | mission | null

const state = createState();
state.shotMode = SHOT;
const sounds = new SoundBank();
const hud = new HUD(state);

// --- renderer / scene ---------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 30, 60);

buildWorld(state, scene);
populateCars(state, scene);
populatePedestrians(state, scene, 16);
createPickups(state, scene);
const playerMesh = makePlayer(state, scene);

// mission beacon: a glowing cylinder + light pillar at the objective
const beaconGroup = new THREE.Group();
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.75 });
const beaconPillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beaconMat);
beaconPillar.position.y = 30;
beaconGroup.add(beaconPillar);
const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.28, 8, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd23d }));
beaconRing.rotation.x = Math.PI / 2; beaconRing.position.y = 0.3;
beaconGroup.add(beaconRing);
beaconGroup.visible = false;
scene.add(beaconGroup);

// --- input --------------------------------------------------------------------
const input = {
  forward: false, back: false, left: false, right: false,
  sprint: false, handbrake: false,
};
let interactQueued = false;
let dragging = false, lastMX = 0, lastMY = 0;

const KEYMAP = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'handbrake' };

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (KEYMAP[e.code] !== undefined) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyE') { interactQueued = true; advanceDialogue(); }
  if (e.code === 'KeyR') { if (state.mode === 'playing') reloadGun(state, sounds); }
  if (e.code === 'KeyM') { toggleMute(); }
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] !== undefined) input[KEYMAP[e.code]] = false;
});
canvas.addEventListener('mousedown', (e) => {
  sounds.ensure();
  dragging = true; lastMX = e.clientX; lastMY = e.clientY;
  if (state.mode === 'playing' && state.player.onFoot && !dialogueOpen()) {
    tryShoot(state, camera, scene, sounds);
  }
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  lastMX = e.clientX; lastMY = e.clientY;
  state.camera.yaw -= dx * 0.005;
  state.camera.pitch = clamp(state.camera.pitch + dy * 0.004, 0.08, 1.25);
});
window.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  state.camera.dist = clamp(state.camera.dist + (e.deltaY > 0 ? 1 : -1) * 1.5, 5, 16);
  e.preventDefault();
}, { passive: false });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- menus ----------------------------------------------------------------------
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const deadScreen = document.getElementById('dead-screen');
const btnNew = document.getElementById('btn-new');
const btnContinue = document.getElementById('btn-continue');
const btnResume = document.getElementById('btn-resume');
const btnQuit = document.getElementById('btn-quit');
const btnRetry = document.getElementById('btn-retry');

function refreshMenuButtons() {
  btnContinue.disabled = !hasSave();
  btnContinue.textContent = hasSave() ? 'CONTINUE' : 'CONTINUE (NO SAVE)';
}
refreshMenuButtons();

function showOnly(el) {
  startScreen.classList.toggle('hidden', el !== startScreen);
  pauseScreen.classList.toggle('hidden', el !== pauseScreen);
  deadScreen.classList.toggle('hidden', el !== deadScreen);
}

function startGame(fromSave) {
  sounds.ensure();
  sounds.uiClick();
  if (fromSave) {
    const data = loadGame();
    if (data) applySave(state, data);
  } else {
    state.cash = 0; state.health = 100; state.missionIndex = 0; state.missionsDone = 0;
    state.wanted = 0; state.wantedHeat = 0; state.ammoReserve = 24; state.ammoInGun = 6;
    state.player.x = -8; state.player.z = 8; state.player.heading = 0;
    state.player.onFoot = true; state.player.car = null;
    try { localStorage.removeItem('neon-harbor-save-v1'); } catch (e) {}
  }
  state.mode = 'playing';
  state.paused = false;
  showOnly(null);
  hud.hideDialogue();
  if (!state.mission && state.missionIndex < MISSIONS.length) {
    startNextMission(state);
    sounds.missionStart();
  }
  saveGame(state);
}

btnNew.addEventListener('click', () => startGame(false));
btnContinue.addEventListener('click', () => { if (hasSave()) startGame(true); });
btnResume.addEventListener('click', () => togglePause());
btnQuit.addEventListener('click', () => {
  saveGame(state);
  state.mode = 'menu';
  showOnly(startScreen);
  refreshMenuButtons();
});
btnRetry.addEventListener('click', () => {
  sounds.uiClick();
  state.health = 100;
  state.wanted = 0; state.wantedHeat = 0;
  state.player.x = -8; state.player.z = 8;
  state.player.onFoot = true; state.player.car = null;
  state.mode = 'playing';
  showOnly(null);
  hud.showToast('Marisol posted bail. Back on the streets.');
});

function togglePause() {
  if (state.mode !== 'playing' && state.mode !== 'paused') return;
  if (state.mode === 'playing') {
    state.mode = 'paused'; state.paused = true;
    showOnly(pauseScreen);
  } else {
    state.mode = 'playing'; state.paused = false;
    showOnly(null);
  }
}

function toggleMute() {
  state.muted = !state.muted;
  sounds.setMuted(state.muted);
  hud.showToast(state.muted ? 'Sound muted (M to unmute)' : 'Sound on');
}

// --- dialogue -------------------------------------------------------------------
let dialogueQueue = [];
function dialogueOpen() {
  return document.getElementById('dialogue').style.display === 'block';
}
function advanceDialogue() {
  if (dialogueQueue.length > 0) {
    const [name, text] = dialogueQueue.shift();
    hud.showDialogue(name, text, 9000);
    sounds.uiClick();
  } else {
    hud.hideDialogue();
  }
}
// called every frame: drain state.pendingDialogue into the visible queue
function pumpDialogue() {
  if (state.pendingDialogue && state.pendingDialogue.length > 0) {
    dialogueQueue = state.pendingDialogue.slice();
    state.pendingDialogue = null;
    advanceDialogue();
  }
}

// --- wanted level -----------------------------------------------------------------
function updateWanted(dt) {
  // heat 0..100 maps to stars: 0, 1-20, 21-45, 46-70, 71-90, 91+
  const thresholds = [0, 1, 21, 46, 71, 91];
  let stars = 0;
  for (let i = 5; i >= 1; i--) if (state.wantedHeat >= thresholds[i]) { stars = i; break; }
  if (stars > state.wanted) {
    state.wanted = stars;
    sounds.wantedUp();
    hud.showToast(stars >= 3 ? 'The whole bay is looking for you!' : 'The police are onto you!');
    sounds.setSiren(true);
  } else if (stars < state.wanted) {
    state.wanted = stars;
    if (stars === 0) {
      hud.showToast('You lost the heat. For now.');
      sounds.setSiren(false);
    }
  }
  // decay: only while the player is not committing crimes and not in police sight
  const nearCop = state.police.some((c) => Math.hypot(c.x - state.player.x, c.z - state.player.z) < 28);
  if (state.wantedHeat > 0) {
    if (nearCop) state.heatCooldown = 4;
    else state.heatCooldown -= dt;
    if (state.heatCooldown <= 0) state.wantedHeat = Math.max(0, state.wantedHeat - dt * 3.2);
  }
  // keep police numbers matched to stars
  const wantCount = state.wanted >= 4 ? 4 : state.wanted >= 2 ? 3 : state.wanted >= 1 ? 2 : 0;
  if (state.police.length < wantCount) spawnPolice(state, scene, wantCount - state.police.length);
}

// --- car enter / exit ---------------------------------------------------------------
function tryEnterExitCar() {
  const p = state.player;
  if (p.onFoot) {
    const car = nearestStealableCar(state, 5);
    if (car) {
      p.car = car;
      p.onFoot = false;
      car.parked = false;
      car.ai = null;
      state.carsStolen++;
      sounds.carDoor();
      if (!car.police && Math.random() < 0.5) {
        state.wantedHeat = Math.min(100, state.wantedHeat + 8);
        hud.showToast(`Stole a ${car.name}. Someone saw that.`);
      } else {
        hud.showToast(`Driving the ${car.name}.`);
      }
    }
  } else if (p.car) {
    const car = p.car;
    // step out to the side
    p.x = car.x - Math.sin(car.heading + Math.PI / 2) * 2.2;
    p.z = car.z - Math.cos(car.heading + Math.PI / 2) * 2.2;
    p.heading = car.heading;
    p.car = null;
    p.onFoot = true;
    car.speed = 0;
    car.parked = true; // stays where you left it instead of driving off
    sounds.carDoor();
  }
}

// --- mission API hooks ---------------------------------------------------------------
const missionApi = {
  showPrompt: (html) => hud.showPrompt(html),
  consumeInteract: () => {
    if (interactQueued) { interactQueued = false; return true; }
    return false;
  },
  onMissionStart: (def) => { sounds.missionStart(); hud.showToast(def.title + ' — ' + def.pay + ' on completion'); },
  onStep: () => { sounds.pickup(); },
  onMissionDone: (def) => {
    sounds.missionDone();
    hud.showToast(`JOB COMPLETE — +$${def.pay.toLocaleString('en-US')}`);
    saveGame(state);
  },
  onMissionFailed: (def, reason) => {
    hud.showToast(`JOB FAILED — ${reason} Marisol will give you another shot.`);
    failMission(state, reason);
  },
};

// --- camera ---------------------------------------------------------------------------
function updateCamera(dt) {
  const p = state.player;
  const cam = state.camera;
  let tx, tz, ty;
  if (p.car) {
    const c = p.car;
    const back = 10.5, height = 4.6;
    tx = c.x - Math.sin(c.heading) * back;
    tz = c.z - Math.cos(c.heading) * back;
    ty = height;
    const lookX = c.x + Math.sin(c.heading) * 12;
    const lookZ = c.z + Math.cos(c.heading) * 12;
    camera.position.x = lerp(camera.position.x, tx, Math.min(1, dt * 5));
    camera.position.y = lerp(camera.position.y, ty, Math.min(1, dt * 5));
    camera.position.z = lerp(camera.position.z, tz, Math.min(1, dt * 5));
    camera.lookAt(lookX, 1.6, lookZ);
  } else {
    // orbit camera: yaw/pitch around the player
    const dist = cam.dist;
    const cx = p.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
    const cz = p.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
    const cy = 1.6 + Math.sin(cam.pitch) * dist;
    camera.position.x = lerp(camera.position.x, cx, Math.min(1, dt * 10));
    camera.position.y = lerp(camera.position.y, cy, Math.min(1, dt * 10));
    camera.position.z = lerp(camera.position.z, cz, Math.min(1, dt * 10));
    camera.lookAt(p.x, 1.7, p.z);
    // keep the camera out of buildings
    if (camera.position.y < 1.2) camera.position.y = 1.2;
  }
}

// menu orbit camera for the title screen / shot=start
function updateMenuCamera(dt) {
  const t = state.time * 0.08;
  camera.position.set(Math.sin(t) * 120, 55, Math.cos(t) * 120);
  camera.lookAt(0, 8, 0);
}

// --- ?shot= setups ---------------------------------------------------------------------
function applyShotMode() {
  if (!SHOT) return;
  state.mode = 'playing';
  showOnly(null);
  if (SHOT === 'start') {
    state.mode = 'menu';
    showOnly(startScreen);
    return;
  }
  if (SHOT === 'play' || SHOT === 'chase' || SHOT === 'mission') {
    startNextMission(state);
    state.cash = 1250;
  }
  if (SHOT === 'play') {
    // put Reyes in a car mid-drive on a main street
    const car = makeCar(state, scene, { x: -26, z: 60, heading: 0, name: 'Stallion' });
    state.player.car = car; state.player.onFoot = false; car.parked = false;
    car.speed = 18;
  }
  if (SHOT === 'chase') {
    const car = makeCar(state, scene, { x: 26, z: -26, heading: Math.PI / 2, name: 'Comet' });
    state.player.car = car; state.player.onFoot = false; car.parked = false;
    car.speed = 24;
    state.wantedHeat = 62;
    state.wanted = 3;
    spawnPolice(state, scene, 3);
    sounds.setSiren(true);
  }
  if (SHOT === 'mission') {
    state.player.x = 162; state.player.z = 52;
    state.player.heading = Math.PI / 2;
    state.camera.yaw = -Math.PI / 2;
  }
  state.shotReady = true;
}

// --- main loop ---------------------------------------------------------------------------
let lastT = performance.now();
let saveTimer = 0;
let firstFrame = true;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  state.time += dt;

  if (state.mode === 'menu') {
    updateMenuCamera(dt);
    updateTraffic(state, dt);
    updatePedestrians(state, dt);
    if (state.sea) state.sea.position.y = 0.06 + Math.sin(state.time * 0.7) * 0.05;
    renderer.render(scene, camera);
    if (firstFrame) { firstFrame = false; window.__gameReady = true; }
    return;
  }
  if (state.mode === 'paused' || state.mode === 'dead') {
    renderer.render(scene, camera);
    return;
  }

  // --- playing ---
  pumpDialogue();
  const p = state.player;

  if (p.onFoot) {
    movePlayerOnFoot(state, input, dt);
    playerMesh.position.set(p.x, 0, p.z);
    playerMesh.rotation.y = p.heading;
    animatePerson(playerMesh, p.moving, p.sprinting, state.time);
    playerMesh.visible = true;
  } else if (p.car) {
    drivePlayerCar(state, p.car, input, dt, sounds);
    playerMesh.visible = false;
    p.x = p.car.x; p.z = p.car.z;
  }

  if (interactQueued) {
    interactQueued = false;
    const m = state.mission;
    const step = m ? m.def.steps[m.stepIndex] : null;
    if (step && step.type === 'interact') {
      // consumed inside updateMission via the flag we just cleared — re-queue
      interactQueued = true;
    } else {
      tryEnterExitCar();
    }
  }

  updateTraffic(state, dt);
  updatePedestrians(state, dt);
  updatePolice(state, dt, sounds);
  updateWanted(dt);
  if (updatePickups(state, dt, sounds) > 0) {
    hud.showToast('Street cash +$50');
  }

  // mission step machine (auto-start the next job when the last one ends)
  if (!state.mission && state.missionIndex < MISSIONS.length && state.mode === 'playing') {
    startNextMission(state);
    sounds.missionStart();
  }
  if (state.mission) {
    const evt = updateMission(state, dt, {
      ...missionApi,
      consumeInteract: () => {
        if (interactQueued) { interactQueued = false; return true; }
        return false;
      },
    });
    if (evt === 'done' || evt === 'failed') hud.hidePrompt();
  } else {
    hud.hidePrompt();
  }
  // beacon follows the current marker
  const marker = missionMarker(state);
  state.beacon = marker;
  if (marker) {
    beaconGroup.visible = true;
    beaconGroup.position.set(marker.x, 0, marker.z);
    beaconRing.scale.setScalar(1 + Math.sin(state.time * 4) * 0.12);
    beaconMat.opacity = 0.55 + Math.sin(state.time * 4) * 0.2;
  } else {
    beaconGroup.visible = false;
  }

  // health regen when calm, death when empty
  if (state.wanted === 0 && state.health < 100) state.health = Math.min(100, state.health + dt * 2.5);
  if (state.health <= 0) {
    state.health = 0;
    state.mode = 'dead';
    showOnly(deadScreen);
    sounds.setSiren(false);
  }

  // engine + siren audio follow the car
  const speedNorm = p.car ? Math.abs(p.car.speed) / 42 : 0;
  sounds.setEngine(speedNorm, p.onFoot);
  sounds.setSiren(state.wanted > 0);

  // sea bobbing
  if (state.sea) state.sea.position.y = 0.06 + Math.sin(state.time * 0.7) * 0.05;

  // periodic autosave
  saveTimer += dt;
  if (saveTimer > 15) { saveTimer = 0; saveGame(state); }

  updateCamera(dt);
  hud.update();
  renderer.render(scene, camera);
  if (firstFrame) { firstFrame = false; window.__gameReady = true; }
}

applyShotMode();
if (!SHOT) showOnly(startScreen);
requestAnimationFrame(frame);
window.__neonHarbor = { state, sounds, hud };
