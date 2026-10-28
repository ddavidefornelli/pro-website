import js from "@eslint/js";
import ts from "typescript-eslint";
import solid from "eslint-plugin-solid";

export default ts.config(
  { ignores: ["dist/**", ".playwright-dist/**", ".vercel/**", "node_modules/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...ts.configs.recommended, solid.configs["flat/typescript"]],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Mutation callbacks poll current values; they do not establish subscriptions.
      "solid/reactivity": ["error", { customReactiveFunctions: ["mutate"] }],
      "solid/no-innerhtml": "error",
    },
  },
);
