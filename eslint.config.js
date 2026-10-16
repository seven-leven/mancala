// Linting (npm run lint): ESLint's and typescript-eslint's recommended rules, as deno lint had.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "data/", "node_modules/", ".cache/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // An unused name starting with _ is on purpose (a destructured value left out).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
