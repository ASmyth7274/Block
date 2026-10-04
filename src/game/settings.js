'use strict';
// ---------------------------------------------------------------------------
// Options (persisted to localStorage)
// ---------------------------------------------------------------------------
const IS_TOUCH = (() => {
  try { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
})();
const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 900;

const DEFAULT_SETTINGS = {
  renderDistance: IS_MOBILE ? 4 : 8,
  fov: 70,
  sensitivity: 0.5,
  invertMouse: false,
  brightness: 0.5,
  graphics: 'fancy',
  smoothLighting: true,
  clouds: 'fancy',
  particles: 'all',
  viewBobbing: true,
  guiScale: 0,
  mipmaps: true,
  music: 0.55,
  sound: 0.9,
  renderScale: IS_MOBILE ? 0.75 : 1,
  maxFps: 0,
  touchControls: IS_TOUCH,
  touchSensitivity: 0.5,
  showFps: false,
  skin: 'wanderer',
  customSkin: null,
  lastWorld: null,
  splitTouchTarget: true,
  autoJump: IS_TOUCH,
  combat: 'classic',
  username: 'Wanderer',
};

const Settings = {
  load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('blocklands.settings') || '{}'); } catch (e) { s = {}; }
    return Object.assign({}, DEFAULT_SETTINGS, s);
  },
  save(s) {
    try { localStorage.setItem('blocklands.settings', JSON.stringify(s)); } catch (e) { /* storage may be unavailable */ }
  },
};

const KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
  inventory: 'KeyE', drop: 'KeyQ', chat: 'KeyT', command: 'Slash', swapHands: 'KeyF', journal: 'KeyJ',
  hideHud: 'F1', screenshot: 'F2', debug: 'F3', perspective: 'F5', fullscreen: 'F11', pick: 'Mouse1',
};
