import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The math library is only reachable through src/math (see issue #10).
      // Catches value and type imports alike.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'wgpu-matrix',
              message:
                'Import vectors and matrices from "@/math" so the backing library stays swappable.',
            },
          ],
        },
      ],
    },
  },
  {
    // src/math is the chokepoint, so it is allowed to import wgpu-matrix.
    files: ['src/math/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    ...tseslint.configs.disableTypeChecked,
  },
  prettier
);
