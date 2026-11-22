import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Served from GitHub Pages at https://alexandernicholasivanov.github.io/ats-simulator/
export default defineConfig({
  base: '/ats-simulator/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
