import { lazy, Suspense } from 'react';
import { useStore } from './store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Loading } from './ui/Loading';
import { StartScreen } from './ui/StartScreen';
import { Toolbar } from './ui/Toolbar';

// three.js and the scene are a separate chunk, so the loading screen paints immediately.
const Scene = lazy(() => import('./scene/Scene'));

function Brand() {
  return (
    <header className="brand panel">
      <strong>Агро-ойн сургалт судалгааны төв</strong>
      <span>Agro-Forest Learning Center</span>
    </header>
  );
}

/** Phase 1 only: walk mode is not built yet. */
function WalkNotice() {
  const visible = useStore((s) => s.started && s.mode === 'walk');
  if (!visible) return null;
  return (
    <p className="notice panel" role="status">
      Алхах горим удахгүй нэмэгдэнэ. Одоогоор гол хаалганы өмнөөс харж байна.
    </p>
  );
}

export default function App() {
  const started = useStore((s) => s.started);

  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      {started && <Brand />}
      <WalkNotice />
      <Toolbar />
      <StartScreen />
      <Loading />
    </ErrorBoundary>
  );
}
