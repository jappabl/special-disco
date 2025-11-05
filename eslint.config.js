import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        chrome: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        URL: "readonly",
        Date: "readonly",
        Array: "readonly",
        Map: "readonly",
        Set: "readonly",
        Promise: "readonly",
        Infinity: "readonly",
        alert: "readonly",
        confirm: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "no-console": "off",
      "no-undef": "off", // TypeScript handles this
    },
  },
  prettierConfig,
  {
    ignores: ["dist/**", "node_modules/**", "*.config.js", "*.config.ts", "vite.config.ts"],
  },
];
