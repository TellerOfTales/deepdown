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
  // Held in a run to call the winch line up. There is deliberately no key that discards a run:
  // the winch always brings the haul home for a cut, so throwing it away was only ever
  // something a player did by accident.
  exfil:   ['KeyQ'],
  mute:    ['KeyM'],
  next:    ['Tab'],
};

import { L, hitControl } from '../ui/layout.js';

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
    this.lastDevice = 'key';
    // While a full-screen UI owns the frame, every touch is a pointer tap: the virtual stick
    // and the DIG button are run-mode concepts and must not swallow taps meant for a menu.
    this.uiPointer = false;
    this.uiDown = false;   // a pointer is currently down on a full-screen UI
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
    window.addEventListener('blur', () => { this.down.clear(); this.mdown = false; this.uiDown = false; });

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
      // A full-screen UI owns every touch: the d-pad and DIG are run-mode concepts and must
      // not swallow a tap meant for a menu row.
      this._touches.set(t.identifier, { tap: true });
      this.touch._ptap = true;
      this.uiDown = true;
      this.anyPressed = true;
      return;
    }
    const btn = hitControl(p.x, p.y);
    if (btn && btn.kind === 'pad') {
      this._touches.set(t.identifier, { pad: true });
      this._padPoint(p.x, p.y, btn);
      this.touch.active = true;
      return;
    }
    if (btn) {
      this._touches.set(t.identifier, { btn: btn.id });
      this.touch[btn.id] = true;
      this.touch['_p' + btn.id] = true;
      this.anyPressed = true;
      return;
    }
    // Anywhere else on the WORLD is a dig. The deck is not: a thumb that misses a button down
    // there meant to hit one, and swinging a pick because of it is a lie.
    if (L.deck > 0 && p.y >= L.vh - L.deck) {
      this._touches.set(t.identifier, { dead: true });
      return;
    }
    this._touches.set(t.identifier, { btn: 'dig' });
    this.touch.dig = true; this.touch._pdig = true; this.anyPressed = true;
  }

  /**
   * Resolve a point inside the d-pad into a direction. Eight-way with a dead hub: you AIM with
   * this stick as well as walk with it, so a diagonal has to be reachable — but it must not be
   * what you get every time your thumb drifts off centre, so the cardinals take the wider arc.
   */
  _padPoint(x, y, b) {
    const dx = x - b.x, dy = y - b.y;
    if (dx * dx + dy * dy <= b.dead * b.dead) { this.touch.dx = 0; this.touch.dy = 0; return; }
    const ax = Math.abs(dx), ay = Math.abs(dy);
    // A diagonal needs both axes to be genuinely engaged (within a 2.4:1 ratio); anything more
    // lopsided than that is a cardinal the player is holding slightly askew.
    const diag = ax > 0 && ay > 0 && Math.max(ax, ay) / Math.min(ax, ay) < 2.4;
    this.touch.dx = (diag || ax >= ay) ? Math.sign(dx) : 0;
    this.touch.dy = (diag || ay > ax) ? Math.sign(dy) : 0;
  }

  _touchMove(t) {
    const rec = this._touches.get(t.identifier);
    const pm = this._toVirtual(t.clientX, t.clientY);
    this.mx = pm.x; this.my = pm.y;
    if (!rec) return;
    if (rec.pad) {
      const b = L.pad;
      if (b) this._padPoint(pm.x, pm.y, b);
      return;
    }
    // A thumb that slides off DIG has let go of it. Without this the button stayed stuck down
    // and the pick kept swinging at nothing.
    if (rec.btn) {
      const hit = hitControl(pm.x, pm.y);
      const on = !!hit && hit.id === rec.btn;
      if (this.touch[rec.btn] !== on) this.touch[rec.btn] = on;
    }
  }

  _touchUp(t) {
    const rec = this._touches.get(t.identifier);
    if (!rec) return;
    this._touches.delete(t.identifier);
    if (rec.tap) {
      let another = false;
      for (const r of this._touches.values()) if (r.tap) another = true;
      if (!another) this.uiDown = false;
    }
    if (rec.pad) {
      // Only let go of the direction when no other finger is still on the pad.
      let another = false;
      for (const r of this._touches.values()) if (r.pad) another = true;
      if (!another) { this.touch.active = false; this.touch.dx = 0; this.touch.dy = 0; }
    } else if (rec.btn) {
      this.touch[rec.btn] = false;
    }
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
    if (a === 'sonar') return this.touch.sonar;
    if (a === 'interact') return this.touch.use;
    if (a === 'exfil') return !!this.touch.exit;
    return false;
  }
  pressed(a) {
    const keys = MAP[a];
    if (keys) for (const k of keys) if (this.pressedSet.has(k)) return true;
    if (a === 'dig' && (this.mpressed || this.touch._pdig)) return true;
    if (a === 'jump' && this.touch._pjump) return true;
    if (a === 'util' && (this.rpressed || this.touch._putil)) return true;
    if (a === 'sonar' && this.touch._psonar) return true;
    if (a === 'exfil' && this.touch._pexit) return true;
    if (a === 'dim' && this.touch._pdim) return true;
    if (a === 'pause' && this.touch._ppause) return true;
    if (a === 'confirm' && (this.mpressed || this.touch._pdig || this.touch._ptap)) return true;
    if (a === 'interact' && (this.mpressed || this.touch._ptap || this.touch._puse)) return true;
    return false;
  }
  /** A pointer held down anywhere, mouse or finger. Menus use this for hold-to-confirm. */
  pointerHeld() { return this.mdown || this.uiDown; }

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
    this.touch._ptap = false; this.touch._puse = false; this.touch._psonar = false;
    this.touch._pdim = false; this.touch._ppause = false; this.touch._pexit = false;
  }
}
