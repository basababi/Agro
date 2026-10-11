import { useStore } from '../store';
import { resumeWalk } from '../walkInput';

const KEYBOARD_HELP: [control: string, action: string][] = [
  ['Хулгана', 'эргэн харах'],
  ['W A S D / сум', 'алхах'],
  ['Shift', 'гүйх'],
  ['Space', 'үсрэх'],
  ['F', 'нисэх горим (E / Q — дээш / доош)'],
  ['Esc', 'цэс'],
];

const TOUCH_HELP: [control: string, action: string][] = [
  ['Зүүн талын жойстик', 'алхах'],
  ['Баруун талыг чирэх', 'эргэн харах'],
  ['Гүйх', 'хурдан алхах'],
  ['Нисэх', 'нисэх горим (▲ ▼ — дээш / доош)'],
];

/** Shown when walk mode is entered and whenever it is paused: controls, resume, respawn, exit. */
export function WalkMenu() {
  const visible = useStore((s) => s.started && s.mode === 'walk' && s.walkPaused);
  const scheme = useStore((s) => s.controlScheme);
  const begun = useStore((s) => s.walkBegun);
  const respawn = useStore((s) => s.respawn);
  const setMode = useStore((s) => s.setMode);
  const help = scheme === 'touch' ? TOUCH_HELP : KEYBOARD_HELP;

  return (
    <div className={`overlay menu${visible ? '' : ' is-hidden'}`} aria-hidden={!visible} onClick={resumeWalk}>
      <div className="card" role="dialog" aria-label="Дотор нь алхах" onClick={(event) => event.stopPropagation()}>
        <h1>Дотор нь алхах</h1>
        <dl className="keys">
          {help.map(([control, action]) => (
            <div key={control}>
              <dt>{control}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <div className="menu-actions">
          <button className="btn btn-primary" onClick={resumeWalk}>
            {begun ? 'Үргэлжлүүлэх' : 'Эхлэх'}
          </button>
          {begun && (
            <button className="btn" onClick={respawn}>
              Хаалга руу буцах
            </button>
          )}
          <button className="btn" onClick={() => setMode('overview')}>
            Тойм харах
          </button>
        </div>
      </div>
    </div>
  );
}
