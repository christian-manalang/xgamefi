import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: "Use @xgamefi/shared/ssrf safeFetch for studio URLs." }],
    },
  },
  { ignores: ["**/dist/**", "**/.next/**", "**/generated/**", "**/node_modules/**"] },
];
