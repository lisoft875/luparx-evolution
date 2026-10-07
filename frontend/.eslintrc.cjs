/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: { version: 'detect' },
  },
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  /*
    Los `.cjs` siguen fuera salvo los scripts de pruebas (07-10-2026).

    Ese `*.cjs` a secas costó un ciclo entero de despliegue: `inicio-admin.cjs` llamaba a
    `comprobar(...)` cuando en ese archivo el ayudante se llama `okInicio(...)`, el script pasó
    `node --check` sin una palabra —valida sintaxis, no nombres—, se desplegó, y murió con
    `ReferenceError` a mitad de una corrida contra staging, después de diez comprobaciones en
    verde. `no-undef` lo habría dicho en un segundo.
  */
  ignorePatterns: ['dist', 'node_modules', '*.cjs', '!tests/**/*.cjs', 'android', 'ios'],
  overrides: [
    {
      /*
        Los scripts de Playwright: CommonJS, y con código de navegador dentro de `page.evaluate`
        en el mismo archivo, así que llevan los dos entornos. Se enciende lo que de verdad atrapa
        errores que `node --check` no ve —un nombre que no existe, una promesa sin esperar— y se
        apaga el resto: acá no hay TypeScript ni React que comprobar, y una regla de estilo que
        grite en 21 archivos de pruebas enseña a correr el linter con los ojos cerrados.
      */
      files: ['tests/**/*.cjs'],
      parserOptions: { sourceType: 'script' },
      env: { node: true, browser: true, es2022: true },
      rules: {
        'no-undef': 'error',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
