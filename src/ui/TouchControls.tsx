import { useEffect, useRef, type PointerEvent } from 'react';
import { useStore } from '../store';
import { walkInput } from '../walkInput';

/** How far the joystick knob travels, px. */
const STICK_RADIUS = 52;
/** Tiny movements of a resting thumb do nothing. */
const DEAD_ZONE = 0.12;
/** Look rotation per dragged pixel, radians. */
const LOOK_SENSITIVITY = 0.0045;

interface Touch {
  id: number;
  x: number;
  y: number;
}

/** A button that acts for as long as it is held down. */
function HoldButton({ label, title, onHold }: { label: string; title: string; onHold: (held: boolean) => void }) {
  const release = () => onHold(false);
  return (
    <button
      className="pad-btn"
      aria-label={title}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onHold(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );
}

/** On-screen walk controls: joystick on the left, drag anywhere else to look, buttons on the right. */
export function TouchControls() {
  const flying = useStore((s) => s.flying);
  const running = useStore((s) => s.running);
  const toggleFlying = useStore((s) => s.toggleFlying);
  const toggleRunning = useStore((s) => s.toggleRunning);
  const setWalkPaused = useStore((s) => s.setWalkPaused);

  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const stick = useRef<Touch | null>(null);
  const look = useRef<Touch | null>(null);

  const moveStick = (x: number, y: number) => {
    walkInput.stickX = x;
    walkInput.stickY = y;
    if (knob.current) {
      knob.current.style.transform = `translate(${x * STICK_RADIUS}px, ${-y * STICK_RADIUS}px)`;
    }
  };

  const releaseStick = () => {
    stick.current = null;
    moveStick(0, 0);
    if (base.current) {
      base.current.style.transform = '';
      base.current.classList.remove('is-active');
    }
  };

  useEffect(
    () => () => {
      walkInput.stickX = 0;
      walkInput.stickY = 0;
      walkInput.up = false;
      walkInput.down = false;
    },
    [],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    const onStickSide = touch.x < window.innerWidth * 0.45 && touch.y > window.innerHeight * 0.4;
    if (onStickSide && !stick.current) {
      stick.current = touch;
      // The joystick jumps under the thumb, wherever it lands.
      if (base.current) {
        const home = base.current.getBoundingClientRect();
        const dx = touch.x - (home.left + home.width / 2);
        const dy = touch.y - (home.top + home.height / 2);
        base.current.style.transform = `translate(${dx}px, ${dy}px)`;
        base.current.classList.add('is-active');
      }
    } else if (!look.current) {
      look.current = touch;
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === event.pointerId) {
      const dx = (event.clientX - stick.current.x) / STICK_RADIUS;
      const dy = (event.clientY - stick.current.y) / STICK_RADIUS;
      const length = Math.hypot(dx, dy);
      const strength = Math.min(1, Math.max(0, (length - DEAD_ZONE) / (1 - DEAD_ZONE)));
      const scale = length > 0 ? strength / length : 0;
      moveStick(dx * scale, -dy * scale);
    } else if (look.current?.id === event.pointerId) {
      walkInput.lookYaw -= (event.clientX - look.current.x) * LOOK_SENSITIVITY;
      walkInput.lookPitch -= (event.clientY - look.current.y) * LOOK_SENSITIVITY;
      look.current.x = event.clientX;
      look.current.y = event.clientY;
    }
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === event.pointerId) releaseStick();
    if (look.current?.id === event.pointerId) look.current = null;
  };

  return (
    <>
      <div
        className="touch-layer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div ref={base} className="stick" aria-hidden="true">
        <div ref={knob} className="stick-knob" />
      </div>
      <div className="pad">
        {flying && (
          <div className="pad-row">
            <HoldButton label="▲" title="Дээш" onHold={(held) => (walkInput.up = held)} />
            <HoldButton label="▼" title="Доош" onHold={(held) => (walkInput.down = held)} />
          </div>
        )}
        <div className="pad-row">
          <button className={`pad-btn${running ? ' is-active' : ''}`} aria-pressed={running} onClick={toggleRunning}>
            Гүйх
          </button>
          <button className={`pad-btn${flying ? ' is-active' : ''}`} aria-pressed={flying} onClick={toggleFlying}>
            Нисэх
          </button>
        </div>
      </div>
      <button className="menu-btn panel" onClick={() => setWalkPaused(true)}>
        Цэс
      </button>
    </>
  );
}
