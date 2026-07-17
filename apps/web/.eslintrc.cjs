module.exports = {
  extends: ["@opssphere/eslint-config", "plugin:react-hooks/recommended"],
  parserOptions: {
    project: "./tsconfig.json",
    ecmaFeatures: { jsx: true },
  },
  env: {
    browser: true,
  },
  settings: {
    react: { version: "19.0" },
  },
};
