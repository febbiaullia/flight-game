// Keyboard and pointer input. Held keys give a stick (climb and throttle axes);
// one-shot presses (confirm, pause, mute) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice.
// On touch screens, dragging up or down steers the climb and a tap confirms.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const CLIMB = new Set(['ArrowUp', 'KeyW']);
const DIVE = new Set(['ArrowDown', 'KeyS']);
const FASTER = new Set(['ArrowRight', 'KeyD']);
const SLOWER = new Set(['ArrowLeft', 'KeyA']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let climbKey = false;
  let diveKey = false;
  let fasterKey = false;
  let slowerKey = false;
  let actions = 0;
  // Pointer steering: while pressed, the drag offset from the press point steers.
  let pointerId = null;
  let pointerStartY = 0;
  let pointerClimb = 0;
  let pointerMoved = false;

  window.addEventListener('keydown', (event) => {
    if (CLIMB.has(event.code)) climbKey = true;
    else if (DIVE.has(event.code)) diveKey = true;
    else if (FASTER.has(event.code)) fasterKey = true;
    else if (SLOWER.has(event.code)) slowerKey = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (MUTE.has(event.code)) { if (!event.repeat) actions |= ACTION_MUTE; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (CLIMB.has(event.code)) climbKey = false;
    else if (DIVE.has(event.code)) diveKey = false;
    else if (FASTER.has(event.code)) fasterKey = false;
    else if (SLOWER.has(event.code)) slowerKey = false;
  });

  target.addEventListener('pointerdown', (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    pointerStartY = event.clientY;
    pointerClimb = 0;
    pointerMoved = false;
    target.setPointerCapture(event.pointerId);
  });
  target.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const dy = pointerStartY - event.clientY; // drag up = climb
    if (Math.abs(dy) > 6) pointerMoved = true;
    pointerClimb = Math.max(-1, Math.min(1, dy / 110));
  });
  const endPointer = (event) => {
    if (event.pointerId !== pointerId) return;
    if (!pointerMoved) actions |= ACTION_CONFIRM; // a tap confirms
    pointerId = null;
    pointerClimb = 0;
  };
  target.addEventListener('pointerup', endPointer);
  target.addEventListener('pointercancel', endPointer);

  /** The current stick: climb -1..1 (positive climbs), throttle -1..1. */
  function stick() {
    let climb = (climbKey ? 1 : 0) - (diveKey ? 1 : 0);
    if (pointerId !== null && pointerClimb !== 0) climb = pointerClimb;
    const throttle = (fasterKey ? 1 : 0) - (slowerKey ? 1 : 0);
    return { climb, throttle };
  }

  /** Take (and clear) the queued one-shot actions. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { stick, takeActions };
}
