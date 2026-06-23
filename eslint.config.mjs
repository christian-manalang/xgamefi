import preset from "@xgamefi/config/eslint";

export default [
  ...preset,
  { ignores: ["**/generated/**", "**/.next/**", "**/dist/**", "**/node_modules/**"] },
];
