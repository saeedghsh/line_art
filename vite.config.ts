import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs let the same build run from any GitHub Pages subpath.
  base: './',
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
