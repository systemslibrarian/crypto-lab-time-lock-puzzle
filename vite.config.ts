import { defineConfig } from 'vite';

// base must match the GitHub Pages project subpath. The Parts 0 + A–E
// standardization pass (Part C) re-verifies this against the repo name.
export default defineConfig({
  base: '/crypto-lab-time-lock-puzzle/',
  worker: {
    format: 'es',
  },
});
