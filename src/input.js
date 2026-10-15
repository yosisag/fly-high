/**
 * Mouse (pointer-lock virtual stick) + gamepad input.
 * Exposes axes in the same convention as the touch stick: x > 0 = right, y > 0 = up/forward.
 */
const DEAD = 0.16;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createInput({ canvas, canLock, onAction, onPadChange, store }) {
  const ctl = { x: 0, y: 0, boost: false, flap: false, mouse: false, pad: null, invert: store.get('flypt.invertY') === '1', sens: +(store.get('flypt.mouseSens') || 1) };
  let vx = 0, vy = 0; // mouse virtual stick, recentres slowly
  let mouseBoost = false, mouseFlap = false;

  // ---------- mouse ----------
  canvas.addEventListener('click', () => { if (!ctl.mouse && canLock()) canvas.requestPointerLock?.({ unadjustedMovement: true })?.catch?.(() => canvas.requestPointerLock()); });
  document.addEventListener('pointerlockchange', () => {
    ctl.mouse = document.pointerLockElement === canvas; vx = vy = 0;
    document.body.classList.toggle('mouse-on', ctl.mouse);
    onAction?.(ctl.mouse ? 'mouse-on' : 'mouse-off');
  });
  document.addEventListener('mousemove', (e) => {
    if (!ctl.mouse) return;
    vx = clamp(vx + e.movementX * 0.0045 * ctl.sens, -1, 1);
    vy = clamp(vy + e.movementY * 0.0045 * ctl.sens * (ctl.invert ? 1 : -1), -1, 1);
  });
  document.addEventListener('mousedown', (e) => {
    if (!ctl.mouse) return;
    if (e.button === 0) { mouseFlap = true; onAction?.('primary'); }
    if (e.button === 2) mouseBoost = true;
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseFlap = false; if (e.button === 2) mouseBoost = false; });
  document.addEventListener('contextmenu', (e) => { if (ctl.mouse) e.preventDefault(); });
  const release = () => { if (ctl.mouse) document.exitPointerLock(); };

  // ---------- gamepad ----------
  let prevBtn = [];
  const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  addEventListener('gamepadconnected', (e) => { ctl.pad = e.gamepad.index; onPadChange?.(e.gamepad.id, true); });
  addEventListener('gamepaddisconnected', (e) => { if (ctl.pad === e.gamepad.index) ctl.pad = null; onPadChange?.(e.gamepad.id, false); });
  const pad = () => (ctl.pad === null ? null : navigator.getGamepads?.()[ctl.pad] || null);
  const rumble = (strong = 0.8, weak = 0.5, ms = 220) => { try { pad()?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch { /* unsupported */ } };

  const update = (dt) => {
    // mouse stick eases back to centre so you don't have to "find" neutral
    if (ctl.mouse) { const k = Math.exp(-dt * 1.4); vx *= k; vy *= k; }
    let x = ctl.mouse ? vx : 0, y = ctl.mouse ? vy : 0, boost = mouseBoost, flap = mouseFlap;
    const p = pad();
    if (p) {
      const b = p.buttons.map((q) => q.pressed || q.value > 0.5);
      x += dz(p.axes[0] || 0) + (b[BTN.RIGHT] ? 1 : 0) - (b[BTN.LEFT] ? 1 : 0);
      y += -dz(p.axes[1] || 0) * (ctl.invert ? -1 : 1) + (b[BTN.UP] ? 1 : 0) - (b[BTN.DOWN] ? 1 : 0);
      boost = boost || b[BTN.RT] || b[BTN.RB];
      flap = flap || b[BTN.A];
      const edge = (i) => b[i] && !prevBtn[i];
      if (edge(BTN.A)) onAction?.('primary');
      if (edge(BTN.B)) onAction?.('land');
      if (edge(BTN.Y)) onAction?.('time');
      if (edge(BTN.X)) onAction?.('photo');
      if (edge(BTN.BACK)) onAction?.('map');
      if (edge(BTN.START)) onAction?.('start');
      prevBtn = b;
    }
    ctl.x = clamp(x, -1, 1); ctl.y = clamp(y, -1, 1); ctl.boost = boost; ctl.flap = flap;
    ctl.vx = vx; ctl.vy = vy;
  };

  const setInvert = (v) => { ctl.invert = v; store.set('flypt.invertY', v ? '1' : '0'); };
  return { ctl, update, release, rumble, setInvert };
}
