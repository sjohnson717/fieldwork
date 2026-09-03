import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      // src/lib was excluded, so scoring.js, personal-scoring.js and
      // token-address.js — the files holding the survey's arithmetic and its
      // credential handling — were never linted at all. Running eslint on one
      // of them printed nothing, which reads exactly like a clean pass.
      "src/lib/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
    ],
    ignores: ["src/components/ui/**/*"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      // Spread inside `rules`, not alongside it. These two presets used to be
      // spread into the config object above, where the `rules` key below then
      // replaced theirs wholesale — so the config named two recommended sets
      // and applied neither, leaving nine rules active out of about a hundred.
      ...pluginJs.configs.recommended.rules,
      ...pluginReact.configs.flat.recommended.rules,

      // The one that was missed and mattered. Blindly rewriting `catch (e)` to
      // `catch` left five blocks referencing an `e` that no longer existed, and
      // a full run reported nothing — a ReferenceError waiting on each error
      // path, which is the worst place to hide one.
      "no-undef": "error",

      // 58 findings, every one an apostrophe in prose — "don't", "you're",
      // "team's". React renders those correctly; the rule exists for `>` and
      // `}`, which are genuinely ambiguous in JSX and which this codebase does
      // not write. Left on, it buries the rules that mean something, and a gate
      // that is always red is a gate nobody reads.
      "react/no-unescaped-entities": "off",

      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
