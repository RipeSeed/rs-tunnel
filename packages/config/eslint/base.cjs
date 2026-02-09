module.exports = {
  root: false,
  env: {
    es2022: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  extends: ["eslint:recommended"],
  rules: {
    "no-console": "off"
  }
};
