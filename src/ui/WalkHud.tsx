import { useStore } from '../store';
import { TouchControls } from './TouchControls';

/** What is on screen while walking: a crosshair, plus a key hint or the touch controls. */
export function WalkHud() {
  const walking = useStore((s) => s.started && s.mode === 'walk' && !s.walkPaused);
  const scheme = useStore((s) => s.controlScheme);
  const flying = useStore((s) => s.flying);
  if (!walking) return null;

  return (
    <>
      <div className="crosshair" aria-hidden="true" />
      {scheme === 'touch' ? (
        <TouchControls />
      ) : (
        <p className="hint panel">
          {flying
            ? 'Нисэх горим · E / Q — дээш / доош · F — буух · Esc — цэс'
            : 'W A S D — алхах · Shift — гүйх · Space — үсрэх · F — нисэх · Esc — цэс'}
        </p>
      )}
    </>
  );
}
