# @nlib/esmify

## Maintenance ended

`@nlib/esmify` is retired as of October 11, 2026. No further releases, bug fixes,
security fixes, or dependency updates are planned. Existing npm versions will
remain available for compatibility. Please migrate to TypeScript's native ESM
output using the guide below.

esmify was a post-processing tool for JavaScript already using ESM syntax. It
resolved relative import paths and optionally renamed output files; it did not
convert CommonJS syntax to ESM.

## Migration

For a Node.js ESM project, emit runnable modules directly with `tsc`:

1. Set `"type": "module"` in your package's `package.json` when using `.ts` sources
   and `.js` output.
2. Use matching Node.js module settings in `tsconfig.json`, for example:

   ```json
   {
     "compilerOptions": {
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "outDir": "./dist",
       "declaration": true
     },
     "include": ["src/**/*.ts"]
   }
   ```

3. Write relative imports using the output file's extension. For example, import
   `src/foo.ts` as `import {foo} from './foo.js'`. Use the same explicit paths in
   re-exports and string-literal dynamic imports. Replace directory imports such
   as `./foo` with `./foo/index.js` when appropriate.
4. If you need `.mjs` and `.d.mts` output, use `.mts` sources and `.mjs` import
   paths instead. TypeScript emits both extensions directly. Adjust your source
   include patterns if necessary.
5. Remove `esmify` / `nlib-esmify` from build scripts and uninstall the dependency
   with `npm uninstall --save-dev @nlib/esmify` (or `npm uninstall @nlib/esmify`
   for a production dependency).
6. Update `main`, `types`, `exports`, and any executable or deployment paths to
   match the files emitted by `tsc`. Clean the old build output, rebuild, and
   verify runtime imports and declaration files from a consuming project.

If your sources already import `.ts` or `.mts` files, TypeScript 5.7+ also offers
[`rewriteRelativeImportExtensions`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-7.html#path-rewriting-for-relative-paths).
It rewrites eligible relative TypeScript extensions in emitted JavaScript; it
does **not** add extensions to imports such as `./foo`, resolve directory imports,
or rewrite `paths` aliases. For those inputs, update the source paths explicitly.

Generate source maps with `tsc` if needed; no esmify post-processing step is
required. For bundler projects, follow your bundler's module-resolution settings
instead of assuming the Node.js configuration above applies.

See [TypeScript's module configuration guide](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
for further details.

## Legacy documentation

The documentation below describes the retired tool for existing users.

A command line tool converts tsc output to ESM modules.

## What does it do?

Assume you have file1.js and file2.js.

```javascript
// file1.js
import { v2 } from './file2';
const f2 = import('./file2');

// file2.js
import { external } from '../extenal/file';
import { v1 } from './file1';
const f1 = import('./file1');
```

esmify disambiguates import sources in the code.

```javascript
// file1.js
import { v2 } from './file2.js';
const f2 = import('./file2.js');

// file2.js
import { external } from '../extenal/file.js';
import { v1 } from './file1.js';
const f1 = import('./file1.js');
```

## Usage

```
Usage: @nlib/esmify [options] <patterns...>

Arguments:
  patterns         File patterns passed to fast-glob

Options:
  --cwd <cwd>      A path to the directory passed to fast-glob.
  --keepSourceMap  If it exists, esmify won't remove sourcemaps.
  --noMjs          If it exists, esmify won't change *.js to *.mjs.
  -V, --version    output the version number
  -h, --help       display help for command
```
