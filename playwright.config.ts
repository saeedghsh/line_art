import { defineConfig, devices } from '@playwright/test';

// Serve the production build under a subpath, as GitHub Pages does for a
// project site, to catch root-relative URLs.
const BASE_PATH = '/line-art-playground/';
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  // linedraw downloads Pyodide and OpenCV from the CDN on first use.
  timeout: 300_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Expects a fresh `npm run build`; `npm run test:e2e` does both.
    command: `npx vite preview --base ${BASE_PATH} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: !process.env.CI,
  },
});
