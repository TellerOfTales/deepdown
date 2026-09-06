// Keyboard + mouse + touch, normalised to named actions.
// Digging is 90% of the input in this game, so DIG gets the biggest, most comfortable buttons
// on every device and jump is deliberately secondary.

export const MAP = {
  left:    ['ArrowLeft', 'KeyA'],
  right:   ['ArrowRight', 'KeyD'],
  up:      ['ArrowUp', 'KeyW'],
  down:    ['ArrowDown', 'KeyS'],
  dig:     ['Space', 'KeyJ', 'KeyZ'],
  jump:    ['KeyK', 'KeyX', 'ShiftLeft', 'ShiftRight'],
  util:    ['KeyL', 'KeyC', 'ControlLeft'],
  sonar:   ['KeyV'],
  interact:['KeyE', 'Enter', 'NumpadEnter'],
  confirm: ['Enter', 'NumpadEnter', 'KeyE'],
  cancel:  ['Escape', 'Backspace'],
  journal: ['Tab', 'KeyB'],
  pause:   ['Escape'],
  restart: ['KeyR'],
  dim:     ['KeyF'],
  abandon: ['KeyQ'],
  mute:    ['KeyM'],
  next:    ['Tab'],
};

export class Input {
  constructor() {
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mx = 0; this.my = 0; this.mouseInside = false; this.mouseMoved = 0;
    this.mdown = false; this.mpressed = false;
    this.rdown = false; this.rpressed = false;
    this.anyPressed = false;
    this.touch = { active: false, dx: 0, dy: 0, dig: false, jump: false, util: false, id: -1 };
    this.touchButtons = [];   // filled by the renderer so we can hit-test in virtual coords
    this.lastDevice = 'key';
    // While a full-screen UI owns the frame, every touch is a pointer tap: the virtual stick
    // and the DIG button are run-mode concepts and must not swallow taps meant for a menu.
    this.uiPointer = false;
  }

  attach(canvas, toVirtual) {
    this._toVirtual = toVirtual;
    const kd = (e) => {
      if (e.repeat) { e.preventDefault(); return; }
      if (!this.down.has(e.code)) { this.pressedSet.add(e.code); this.anyPressed = true; }
      this.down.add(e.code);
      this.lastDevice = 'key';
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    };
    const ku = (e) => { this.down.delete(e.code); this.releasedSet.add(e.code); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => { this.down.clear(); this.mdown = false; });

    const mm = (e) => {
      const p = this._toVirtual(e.clientX, e.clientY);
      if (Math.abs(p.x - this.mx) + Math.abs(p.y - this.my) > 1.5) { this.mouseMoved = 1; this.lastDevice = 'mouse'; }
      this.mx = p.x; this.my = p.y; this.mouseInside = true;
    };
    canvas.addEventListener('mousemove', mm);
    canvas.addEventListener('mouseleave', () => { this.mouseInside = false; });
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.button === 2) { if (!this.rdown) this.rpressed = true; this.rdown = true; }
      else { if (!this.mdown) this.mpressed = true; this.mdown = true; }
      this.anyPressed = true; this.lastDevice = 'mouse';
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rdown = false; else this.mdown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const tstart = (e) => {
      this.lastDevice = 'touch';
      for (const t of e.changedTouches) this._touchDown(t);
      e.preventDefault();
    };
    const tmove = (e) => { for (const t of e.changedTouches) this._touchMove(t); e.preventDefault(); };
    const tend = (e) => { for (const t of e.changedTouches) this._touchUp(t); e.preventDefault(); };
    canvas.addEventListener('touchstart', tstart, { passive: false });
    canvas.addEventListener('touchmove', tmove, { passive: false });
    canvas.addEventListener('touchend', tend, { passive: false });
    canvas.addEventListener('touchcancel', tend, { passive: false });
    this._touches = new Map();
  }

  _touchDown(t) {
    const p = this._toVirtual(t.clientX, t.clientY);
    this.mx = p.x; this.my = p.y;          // a tap is a pointer position, same as a click
    this.lastDevice = 'touch';
    if (this.uiPointer) {
      this._touches.set(t.identifier, { tap: true });
      this.touch._ptap = true;
      this.anyPressed = true;
      return;
    }
    const btn = this._hitButton(p.x, p.y);
    if (btn) { this._touches.set(t.identifier, { btn: btn.id }); this.touch[btn.id] = true; this.touch['_p' + btn.id] = true; this.anyPressed = true; return; }
    if (p.x < 200) {
      this._touches.set(t.identifier, { stick: true, ox: p.x, oy: p.y });
      this.touch.active = true; this.touch.dx = 0; this.touch.dy = 0;
    } else {
      this._touches.set(t.identifier, { btn: 'dig' });
      this.touch.dig = true; this.touch._pdig = true; this.anyPressed = true;
    }
  }
  _touchMove(t) {
    const rec = this._touches.get(t.identifier);
    const pm = this._toVirtual(t.clientX, t.clientY);
    this.mx = pm.x; this.my = pm.y;
    if (!rec || !rec.stick) return;
    const p = pm;
    const dx = p.x - rec.ox, dy = p.y - rec.oy;
    const dead = 5;
    this.touch.dx = Math.abs(dx) > dead ? Math.sign(dx) : 0;
    this.touch.dy = Math.abs(dy) > dead ? Math.sign(dy) : 0;
    if (Math.abs(dx) > 26) rec.ox = p.x - Math.sign(dx) * 26;
    if (Math.abs(dy) > 26) rec.oy = p.y - Math.sign(dy) * 26;
  }
  _touchUp(t) {
    const rec = this._touches.get(t.identifier);
    if (!rec) return;
    this._touches.delete(t.identifier);
    if (rec.stick) { this.touch.active = false; this.touch.dx = 0; this.touch.dy = 0; }
    else if (rec.btn) this.touch[rec.btn] = false;
  }
  _hitButton(x, y) {
    for (const b of this.touchButtons) {
      if (b.on === false) continue;   // a contextual button must not steal a DIG tap while it is hidden
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return b;
    }
    return null;
  }

  /** True only for a real keyboard edge on one of these codes — never a mouse or touch alias. */
  pressedKey(codes) {
    for (const k of codes) if (this.pressedSet.has(k)) return true;
    return false;
  }

  held(a) {
    const keys = MAP[a];
    if (keys) for (const k of keys) if (this.down.has(k)) return true;
    if (a === 'left') return this.touch.dx < 0;
    if (a === 'right') return this.touch.dx > 0;
    if (a === 'up') return this.touch.dy < 0;
    if (a === 'down') return this.touch.dy > 0;
    if (a === 'dig') return this.touch.dig || this.mdown;
    if (a === 'jump') return this.touch.jump;
    if (a === 'util') return this.touch.util || this.rdown;
    return false;
  }
  pressed(a) {
    const keys = MAP[a];
    if (keys) for (const k of keys) if (this.pressedSet.has(k)) return true;
    if (a === 'dig' && (this.mpressed || this.touch._pdig)) return true;
    if (a === 'jump' && this.touch._pjump) return true;
    if (a === 'util' && (this.rpressed || this.touch._putil)) return true;
    if (a === 'confirm' && (this.mpressed || this.touch._pdig || this.touch._ptap)) return true;
    if (a === 'interact' && (this.mpressed || this.touch._ptap || this.touch._puse)) return true;
    return false;
  }
  released(a) {
    const keys = MAP[a];
    if (keys) for (const k of keys) if (this.releasedSet.has(k)) return true;
    return false;
  }

  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mpressed = false; this.rpressed = false;
    this.anyPressed = false;
    this.mouseMoved = 0;
    this.touch._pdig = false; this.touch._pjump = false; this.touch._putil = false;
    this.touch._ptap = false; this.touch._puse = false;
  }
}
