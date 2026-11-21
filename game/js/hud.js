// hud.js — all DOM HUD updates: health, cash, wanted stars, ammo, speed,
// mission banner, prompts, dialogue box, toasts and the 2D minimap.

import { CITY } from './state.js';
import { currentStep } from './missions.js';

export class HUD {
  constructor(state) {
    this.state = state;
    this.el = {
      healthFill: document.getElementById('health-fill'),
      cashNum: document.getElementById('cash-num'),
      missionTitle: document.getElementById('mission-title'),
      missionObjective: document.getElementById('mission-objective'),
      missionTimer: document.getElementById('mission-timer'),
      stars: document.getElementById('stars'),
      ammoNum: document.getElementById('ammo-num'),
      speedNum: document.getElementById('speed-num'),
      speedo: document.getElementById('speedo'),
      crosshair: document.getElementById('crosshair'),
      prompt: document.getElementById('prompt'),
      dialogue: document.getElementById('dialogue'),
      dialogueName: document.getElementById('dialogue-name'),
      dialogueText: document.getElementById('dialogue-text'),
      toast: document.getElementById('toast'),
      damage: document.getElementById('damage'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.dialogueTimer = null;
    this.lastStars = -1;
  }

  update() {
    const s = this.state;
    // health
    const hp = Math.max(0, Math.round(s.health));
    this.el.healthFill.style.width = hp + '%';
    this.el.healthFill.classList.toggle('low', hp < 35);
    // cash
    this.el.cashNum.textContent = '$' + s.cash.toLocaleString('en-US');
    // stars
    if (s.wanted !== this.lastStars) {
      this.lastStars = s.wanted;
      let html = '';
      for (let i = 0; i < 5; i++) {
        html += i < s.wanted ? '<span>★</span>' : '<span class="off">★</span>';
      }
      this.el.stars.innerHTML = html;
    }
    // ammo
    this.el.ammoNum.textContent = `${s.ammoInGun} / ${s.ammoReserve}`;
    // speed
    const speedKmh = s.player.car ? Math.abs(s.player.car.speed) * 3.6 : Math.abs(s.player.speed) * 3.6;
    this.el.speedNum.textContent = String(Math.round(speedKmh));
    this.el.speedo.style.display = s.player.car ? 'block' : 'none';
    // crosshair only on foot with the gun out
    this.el.crosshair.style.display = (s.mode === 'playing' && s.player.onFoot) ? 'block' : 'none';
    // mission banner
    const m = s.mission;
    if (m) {
      this.el.missionTitle.textContent = m.def.title;
      const step = currentStep(m);
      this.el.missionObjective.textContent = step ? step.text : '';
      this.el.missionTimer.textContent = m.timer > 0 ? 'TIME LEFT: ' + Math.ceil(m.timer) + 's' : '';
    } else if (s.missionIndex >= 4) {
      this.el.missionTitle.textContent = 'KING OF THE BAY';
      this.el.missionObjective.textContent = 'All jobs done. The city is yours — free roam, Reyes.';
      this.el.missionTimer.textContent = '';
    } else {
      this.el.missionTitle.textContent = 'FREE ROAM';
      this.el.missionObjective.textContent = 'Find Marisol to start work — or just enjoy the bay.';
      this.el.missionTimer.textContent = '';
    }
    // damage vignette
    this.el.damage.style.opacity = s.health < 100 ? String(Math.min(1, (100 - s.health) / 90)) : '0';
    this.drawMinimap();
  }

  showPrompt(html) {
    this.el.prompt.innerHTML = html;
    this.el.prompt.style.display = 'block';
  }
  hidePrompt() { this.el.prompt.style.display = 'none'; }

  showToast(text, ms) {
    this.el.toast.textContent = text;
    this.el.toast.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.display = 'none'; }, ms || 2600);
  }

  showDialogue(name, text, ms) {
    this.el.dialogueName.textContent = name;
    this.el.dialogueText.textContent = text;
    this.el.dialogue.style.display = 'block';
    clearTimeout(this.dialogueTimer);
    this.dialogueTimer = setTimeout(() => { this.el.dialogue.style.display = 'none'; }, ms || 7000);
  }
  hideDialogue() {
    clearTimeout(this.dialogueTimer);
    this.el.dialogue.style.display = 'none';
  }

  // --- minimap: streets, beach, buildings, player arrow, cars, mission marker
  drawMinimap() {
    const s = this.state;
    const ctx = this.mapCtx;
    const W = 190, H = 190;
    const scale = W / 420; // world -210..210 maps to 0..190
    const toMap = (x, z) => [(x + 210) * scale, (z + 210) * scale];
    ctx.clearRect(0, 0, W, H);
    // background
    ctx.fillStyle = '#101826'; ctx.fillRect(0, 0, W, H);
    // sea (east)
    ctx.fillStyle = '#1e7fa8';
    const [seaX] = toMap(196, 0);
    ctx.fillRect(seaX, 0, W - seaX, H);
    // sand
    ctx.fillStyle = '#c9a86a';
    const [beachX] = toMap(156, 0);
    ctx.fillRect(beachX, 0, seaX - beachX, H);
    // streets
    ctx.strokeStyle = '#3a4152'; ctx.lineWidth = 5;
    for (const line of CITY.streetLines) {
      const [x0] = toMap(line, 0); const [, y0] = toMap(0, line);
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
    }
    // buildings
    ctx.fillStyle = '#5a6a85';
    for (const b of s.buildings) {
      const [x0, y0] = toMap(b.minX, b.minZ);
      const [x1, y1] = toMap(b.maxX, b.maxZ);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // traffic + police dots
    for (const car of s.cars) {
      const [x, y] = toMap(car.x, car.z);
      ctx.fillStyle = car.police ? '#3a86ff' : '#e8e8e8';
      ctx.beginPath(); ctx.arc(x, y, car.police ? 3.4 : 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // mission marker (pulsing yellow diamond)
    const marker = s.beacon;
    if (marker) {
      const [x, y] = toMap(marker.x, marker.z);
      const pulse = 5 + Math.sin(s.time * 5) * 2;
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.moveTo(x, y - pulse); ctx.lineTo(x + pulse, y); ctx.lineTo(x, y + pulse); ctx.lineTo(x - pulse, y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // player arrow (points along heading, north = up = -z)
    const p = s.player;
    const [px, py] = toMap(p.car ? p.car.x : p.x, p.car ? p.car.z : p.z);
    const heading = p.car ? p.car.heading : p.heading;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - heading); // screen angle: heading 0 (+z) points down
    ctx.fillStyle = '#ff5ec4';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // north indicator
    ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('N', 6, 14);
  }
}
