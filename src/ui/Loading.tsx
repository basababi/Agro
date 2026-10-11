import { useStore } from '../store';

export function Loading() {
  const progress = useStore((s) => s.progress);
  const ready = useStore((s) => s.modelReady);
  const percent = Math.round(progress);

  return (
    <div className={`overlay loading${ready ? ' is-hidden' : ''}`} aria-hidden={ready}>
      <div className="card">
        <p className="eyebrow">Agro-Forest Learning Center</p>
        <h1>Агро-ойн сургалт судалгааны төв</h1>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="progress-bar" style={{ width: `${Math.max(percent, 4)}%` }} />
        </div>
        <p className="status" role="status">
          Загвар ачаалж байна… {percent}%
        </p>
      </div>
    </div>
  );
}
