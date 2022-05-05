# @nlib/ts-to-esm

[![Test](https://github.com/nlibjs/ts-to-esm/actions/workflows/test.yml/badge.svg)](https://github.com/nlibjs/ts-to-esm/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/nlibjs/ts-to-esm/branch/master/graph/badge.svg)](https://codecov.io/gh/nlibjs/ts-to-esm)

A command line tool to change file extensions.

## Usage

```
npx @nlib/ts-to-esm --directory path/to/dir --mapping js/cjs [--mapping mjs/js]

  --directory, -d [string]       A directory replaceExt processes
  --mapping, -m [string]         Specify a mapping in the format from/to (e.g. js/mjs).
  --help, -h                     Show help
  --version, -v                  Output the version number
```
