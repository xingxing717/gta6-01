// missions.js — Marisol's four-job story chain. Each mission is a list of
// steps (go to a marker, pick something up, deliver, survive, escape).
// The HUD banner, dialogue box, minimap marker and the 3D beacon all follow
// the active step. Completing a mission pays cash and advances the chain.

import { clamp } from './state.js';

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'JOB 1 — HARBOR PICKUP',
    pay: 500,
    intro: [
      ['Marisol', 'Reyes. You\'re out. Good — I need a runner. A package is waiting at the old pier, east end of the boardwalk. Bring it to my office in the plaza. No detours, no heroes.'],
    ],
    steps: [
      { type: 'goto', x: 176, z: 60, radius: 6, text: 'Pick up the package at the pier' },
      { type: 'interact', x: 176, z: 60, radius: 6, prompt: 'Press E to grab the package', text: 'Grab the package' },
      { type: 'goto', x: 0, z: 4, radius: 8, text: 'Deliver the package to Marisol\'s office' },
    ],
    outro: [['Marisol', 'Clean. You still remember how this works. There\'s more where that came from — check your phone.']],
  },
  {
    id: 'hotwheels',
    title: 'JOB 2 — HOT WHEELS',
    pay: 800,
    timeLimit: 100,
    intro: [
      ['Marisol', 'A client wants a Comet — the red one parked by the marina garage, south side. Lift it, bring it to the lockup on 78th. You have 100 seconds before the owner walks out.'],
    ],
    steps: [
      { type: 'steal', x: 130, z: -26, radius: 10, carName: 'Comet', text: 'Steal the red Comet by the marina' },
      { type: 'deliverCar', x: 78, z: 130, radius: 9, text: 'Deliver the Comet to the lockup' },
    ],
    outro: [['Marisol', 'The client is thrilled. The owner, less so. Keep the engine warm, Reyes — the next one is loud.']],
  },
  {
    id: 'thechase',
    title: 'JOB 3 — THE CHASE',
    pay: 1200,
    intro: [
      ['Marisol', 'The harbor crew tipped the cops. I need you to draw them off — get their attention, then lose it. Get to three stars, then vanish. The safehouse is on the north beach road.'],
    ],
    steps: [
      { type: 'wanted', stars: 3, text: 'Get the police on you — reach 3 stars' },
      { type: 'escape', x: 170, z: -120, radius: 12, text: 'Lose the heat, then reach the safehouse' },
    ],
    outro: [['Marisol', 'Beautiful. They\'re chasing ghosts now. One job left, and it\'s the big one.']],
  },
  {
    id: 'finaljob',
    title: 'JOB 4 — THE FINAL JOB',
    pay: 2500,
    intro: [
      ['Marisol', 'Last one. A briefcase is waiting on the beach by the palms. The harbor crew will be on you the second you touch it — take it to the yacht at the pier and don\'t stop for anyone.'],
    ],
    steps: [
      { type: 'goto', x: 168, z: -40, radius: 6, text: 'Pick up the briefcase on the beach' },
      { type: 'interact', x: 168, z: -40, radius: 6, prompt: 'Press E to take the briefcase', text: 'Take the briefcase' },
      { type: 'deliverHot', x: 176, z: 60, radius: 8, text: 'Deliver the briefcase to the yacht — cops incoming!' },
    ],
    outro: [['Marisol', 'It\'s done. The bay is yours, Reyes. Spend it loud.'],
      ['Reyes', 'Loud is the only way I know.']],
  },
];

export function createMissionRuntime(state) {
  const def = MISSIONS[state.missionIndex];
  if (!def) return null;
  return {
    def,
    stepIndex: 0,
    timer: def.timeLimit || 0,
    failed: false,
    done: false,
    dialogue: null,       // {name, text} currently shown
    dialogueQueue: def.intro.slice(),
    started: false,
  };
}

export function currentStep(mission) {
  if (!mission) return null;
  return mission.def.steps[mission.stepIndex] || null;
}

export function missionMarker(state) {
  const m = state.mission;
  if (!m || m.done) return null;
  const step = currentStep(m);
  if (!step || step.x === undefined) return null;
  return { x: step.x, z: step.z };
}

// Advance the mission state machine. Returns an event string or null:
// 'step' | 'done' | 'failed' | 'dialogue' — main.js turns these into HUD/sound.
export function updateMission(state, dt, api) {
  const m = state.mission;
  if (!m || m.done || m.failed) return null;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;

  if (!m.started) {
    m.started = true;
    if (api && api.onMissionStart) api.onMissionStart(m.def);
  }

  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.failed = true;
      if (api && api.onMissionFailed) api.onMissionFailed(m.def, 'Out of time.');
      return 'failed';
    }
  }

  const step = currentStep(m);
  if (!step) return null;

  const near = (x, z, r) => Math.hypot(px - x, pz - z) < r;

  switch (step.type) {
    case 'goto':
      if (near(step.x, step.z, step.radius)) return advanceStep(state, api);
      break;
    case 'interact':
      if (near(step.x, step.z, step.radius)) {
        if (api) api.showPrompt(step.prompt || 'Press E');
        if (api && api.consumeInteract()) return advanceStep(state, api);
      }
      break;
    case 'steal': {
      // complete when the player is driving a car of the named model
      if (p.car && p.car.name === step.carName) return advanceStep(state, api);
      break;
    }
    case 'deliverCar':
      if (p.car && near(step.x, step.z, step.radius)) return advanceStep(state, api);
      break;
    case 'deliverHot':
      if (near(step.x, step.z, step.radius)) return advanceStep(state, api);
      break;
    case 'wanted':
      if (state.wanted >= step.stars) return advanceStep(state, api);
      break;
    case 'escape':
      if (state.wanted === 0 && near(step.x, step.z, step.radius)) return advanceStep(state, api);
      break;
  }
  return null;
}

function advanceStep(state, api) {
  const m = state.mission;
  m.stepIndex++;
  if (api && api.onStep) api.onStep(m.def, m.stepIndex);
  if (m.stepIndex >= m.def.steps.length) {
    m.done = true;
    state.cash += m.def.pay;
    state.missionsDone++;
    state.missionIndex++;
    if (api && api.onMissionDone) api.onMissionDone(m.def);
    // queue the outro dialogue, then the next mission's intro
    const next = MISSIONS[state.missionIndex];
    const queue = m.def.outro.slice();
    if (next) queue.push(...next.intro);
    state.pendingDialogue = queue;
    state.mission = null;
    return 'done';
  }
  return 'step';
}

export function startNextMission(state) {
  if (state.missionIndex >= MISSIONS.length) {
    state.mission = null;
    return null;
  }
  const m = createMissionRuntime(state);
  state.mission = m;
  state.pendingDialogue = m.def.intro.slice();
  return m;
}

export function failMission(state, reason) {
  const m = state.mission;
  if (!m) return;
  m.failed = true;
  state.mission = null;
  // retry the same job after a short breather
  setTimeout(() => {
    if (state.mode === 'playing') startNextMission(state);
  }, 2500);
}
