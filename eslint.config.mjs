import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';

// Flat config mirroring the original project's setup (js.recommended +
// react-hooks), minus the Vite-only react-refresh plugin. Next-specific
// linting is handled by `next build` itself.
export default defineConfig([
  globalIgnores(['.next', 'out', 'node_modules', 'public/uploads']),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // The original components import `React` in the classic style even though
      // the automatic JSX runtime makes it unused — keep that tolerated.
      'no-unused-vars': ['error', { varsIgnorePattern: '^React$', argsIgnorePattern: '^_' }],
      // The original code uses empty `catch {}` around localStorage access.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Deferring persisted (localStorage) state into an effect for SSR/hydration
      // safety is the intended Next.js pattern here.
      'react-hooks/set-state-in-effect': 'off',
      // The original FAQ component measures scrollHeight off a ref during render;
      // preserved as-is. (New rule in react-hooks 7.)
      'react-hooks/refs': 'off',
    },
  },
]);
