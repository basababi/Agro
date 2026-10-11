import { useStore } from './store';

/** Live walk-mode input: written by keyboard, mouse and touch handlers, read once per frame. */
export const walkInput = {
  /** Pressed keys as KeyboardEvent.code, so a Cyrillic keyboard layout works too. */
  keys: new Set<string>(),
  /** Virtual joystick, each −1…1 (stickY > 0 is forward). */
  stickX: 0,
  stickY: 0,
  /** Look rotation collected since the last frame, radians. */
  lookYaw: 0,
  lookPitch: 0,
  /** On-screen fly buttons being held. */
  up: false,
  down: false,
};

export function clearWalkInput() {
  walkInput.keys.clear();
  walkInput.stickX = 0;
  walkInput.stickY = 0;
  walkInput.lookYaw = 0;
  walkInput.lookPitch = 0;
  walkInput.up = false;
  walkInput.down = false;
}

/** Browsers refuse to capture the mouse again for about a second after Esc released it. */
const LOCK_COOLDOWN = 1300;
let unlockedAt = -Infinity;
let lockFailures = 0;
let retryTimer = 0;

function fallBackToTouch() {
  const { setControlScheme, setWalkPaused } = useStore.getState();
  setControlScheme('touch');
  setWalkPaused(false);
}

function requestLock() {
  const { mode, walkPaused, controlScheme } = useStore.getState();
  if (mode !== 'walk' || !walkPaused || controlScheme !== 'pointerlock') return;
  const canvas = document.querySelector<HTMLCanvasElement>('.scene canvas');
  if (!canvas || typeof canvas.requestPointerLock !== 'function') {
    fallBackToTouch();
    return;
  }
  // Walking starts when the lock is granted (see the pointerlockchange handler in WalkController).
  // Older browsers return nothing here and report failures through the pointerlockerror event.
  const pending = canvas.requestPointerLock() as Promise<void> | undefined;
  pending?.catch(() => {});
}

export function pointerLockChanged(locked: boolean) {
  if (locked) lockFailures = 0;
  else unlockedAt = performance.now();
}

export function pointerLockFailed() {
  const sinceUnlock = performance.now() - unlockedAt;
  if (sinceUnlock < LOCK_COOLDOWN) {
    // Clicked "continue" too soon after Esc: try once more when the cool-down is over.
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(requestLock, LOCK_COOLDOWN - sinceUnlock + 100);
    return;
  }
  // The mouse cannot be captured here at all: use the on-screen controls instead.
  lockFailures += 1;
  if (lockFailures >= 2) fallBackToTouch();
}

/** Leaves the walk menu and starts (or continues) walking. Must be called from a click or tap. */
export function resumeWalk() {
  if (useStore.getState().controlScheme === 'touch') useStore.getState().setWalkPaused(false);
  else requestLock();
}
