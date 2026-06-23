import { defineConfig } from "vitest/config";
export default defineConfig({
  // Automatic JSX runtime so component tests don't need React in scope.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    setupFiles: ["../../vitest.setup.ts"],
  },
});
