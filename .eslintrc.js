/* global  module */
module.exports = {
    root: true,
    parserOptions: {
        ecmaVersion: 2015,
        sourceType: "script"
    },
    plugins: ["prettier"],
    extends: ["eslint:recommended", "prettier"],
    env: {
        browser: true
    },
    rules: {
        eqeqeq: "error",
        "block-scoped-var": "error",
        "prettier/prettier": "error"
    },
    globals: {
        cf: true,
        ethers: true,
        NodeProvider: true
    }
};
