import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Test configuration, separate from the dev server config.
 *
 * jsdom and testing-library were already dependencies but nothing selected the
 * environment, so any test that rendered a component failed on `document is
 * not defined`. Tailwind is left out deliberately: nothing here asserts on
 * styling, and the plugin is the slowest part of the build.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Only the files that render need a DOM; the rest are pure functions and
    // pay nothing for this beyond setup.
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: false,
    restoreMocks: true,
  },
});
