import { useStore, type Mode } from '../store';

const MODES: { id: Mode; label: string }[] = [
  { id: 'overview', label: 'Тойм харах' },
  { id: 'walk', label: 'Дотор нь алхах' },
];

export function Toolbar() {
  const started = useStore((s) => s.started);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  if (!started) return null;

  return (
    <nav className="toolbar panel" aria-label="Горим">
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          className={`tab${mode === id ? ' is-active' : ''}`}
          aria-pressed={mode === id}
          onClick={() => setMode(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
