import { useStore } from '../store';

export function StartScreen() {
  const ready = useStore((s) => s.modelReady);
  const started = useStore((s) => s.started);
  const start = useStore((s) => s.start);
  const visible = ready && !started;

  return (
    <div className={`overlay start${visible ? '' : ' is-hidden'}`} aria-hidden={!visible}>
      <div className="card">
        <p className="eyebrow">Agro-Forest Learning Center · Design Hackathon 2026</p>
        <h1>Агро-ойн сургалт судалгааны төв</h1>
        <div className="start-actions">
          <button className="btn btn-primary" disabled={!visible} onClick={() => start('overview')}>
            Тойм харах
          </button>
          <button className="btn" disabled={!visible} onClick={() => start('walk')}>
            Дотор нь алхах
          </button>
        </div>
      </div>
    </div>
  );
}
