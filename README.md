# @nlib/esmify

[![Test](https://github.com/nlibjs/esmify/actions/workflows/test.yml/badge.svg)](https://github.com/nlibjs/esmify/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/nlibjs/esmify/branch/master/graph/badge.svg)](https://codecov.io/gh/nlibjs/esmify)

A command line tool converts tsc output to ESM modules.

## What does it do?

Assume you have file1.js and file2.js.

```javascript
// file1.js
import {v2} from './file2';
const f2 = import('./file2');

// file2.js
import {external} from '../extenal/file';
import {v1} from './file1';
const f1 = import('./file1');
```

esmify disambiguates import sources in the code.

```javascript
// file1.js
import {v2} from './file2.js';
const f2 = import('./file2.js');

// file2.js
import {external} from '../extenal/file.js';
import {v1} from './file1.js';
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
  -V, --version    output the version number
  -h, --help       display help for command
```
