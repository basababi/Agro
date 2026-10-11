import { lazy, Suspense } from 'react';
import { useStore } from './store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Loading } from './ui/Loading';
import { StartScreen } from './ui/StartScreen';
import { Toolbar } from './ui/Toolbar';
import { WalkHud } from './ui/WalkHud';
import { WalkMenu } from './ui/WalkMenu';

// three.js and the scene are a separate chunk, so the loading screen paints immediately.
const Scene = lazy(() => import('./scene/Scene'));

function Brand() {
  // With on-screen walk controls the whole screen is needed for the view.
  const hidden = useStore((s) => !s.started || (s.mode === 'walk' && s.controlScheme === 'touch'));
  if (hidden) return null;
  return (
    <header className="brand panel">
      <strong>Агро-ойн сургалт судалгааны төв</strong>
      <span>Agro-Forest Learning Center</span>
    </header>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <Brand />
      <Toolbar />
      <WalkHud />
      <WalkMenu />
      <StartScreen />
      <Loading />
    </ErrorBoundary>
  );
}
