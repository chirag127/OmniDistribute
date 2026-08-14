import { defineConfig } from "vitest/config";

// Inline tsconfig for the transform so the Vite/oxc loader does NOT walk up and
// pick the parent workspace tsconfig (which extends `astro/tsconfigs/strict` —
// astro isn't installed here, so resolution fails). Inlining short-circuits
// file discovery entirely.
const tsconfigRaw = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    esModuleInterop: true,
    verbatimModuleSyntax: false,
  },
} as const;

export default defineConfig({
  esbuild: { tsconfigRaw },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Scope coverage to the deterministic logic under test: the transform
      // utils and the adapters whose request-shaping/canonical logic is worth
      // asserting. The other 27 adapters are thin wrappers over distinct
      // third-party SDKs/APIs (no local transform) and are intentionally not
      // unit-tested per the testing playbook (don't test framework glue).
      include: [
        "src/utils/hash.ts",
        "src/utils/markdown.ts",
        "src/utils/message-template.ts",
        "src/utils/retry.ts",
        "src/utils/state.ts",
        "src/utils/telegraph-converter.ts",
        "src/adapters/devto.ts",
        "src/adapters/hashnode.ts",
        "src/adapters/medium.ts",
        "src/adapters/blogger.ts",
      ],
      exclude: ["src/**/*.test.ts", "src/declarations.d.ts"],
    },
  },
});
