# @nlib/esmify

[![Test](https://github.com/nlibjs/esmify/actions/workflows/test.yml/badge.svg)](https://github.com/nlibjs/esmify/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/nlibjs/esmify/branch/master/graph/badge.svg)](https://codecov.io/gh/nlibjs/esmify)

A command line tool converts tsc output to ESM modules.

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
