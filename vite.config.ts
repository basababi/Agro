import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// /models/* is cached for a year (vercel.json), so the model URL carries a content hash.
function modelVersion(): string {
  const file = fileURLToPath(new URL('./public/models/center.glb', import.meta.url));
  if (!existsSync(file)) return 'missing';
  return createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 10);
}

export default defineConfig({
  plugins: [react()],
  define: {
    __MODEL_VERSION__: JSON.stringify(modelVersion()),
  },
  build: {
    chunkSizeWarningLimit: 1300,
  },
});
