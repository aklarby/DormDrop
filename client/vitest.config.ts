// Minimal vitest config. The actual tests live under client/tests/ and use
// jsdom + React Testing Library. Running tests requires dev deps that
// aren't in the default install — see tests/README for the one-liner:
//   npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
