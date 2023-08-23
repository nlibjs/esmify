#!/usr/bin/env node
import * as fs from 'node:fs';
import { Command } from 'commander';
import type { Options } from './esmify.mjs';
import { esmify } from './esmify.mjs';

const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as unknown as { name: string; version: string; description: string };
const program = new Command();
program.name(packageJson.name);
program.description(packageJson.description);
program.option('--cwd <cwd>', 'A path to the directory passed to fast-glob.');
program.option(
  '--keepSourceMap',
  "If it exists, esmify won't remove sourcemaps.",
);
program.option('--noMjs', "If it exists, esmify won't change *.js to *.mjs.");
program.argument('<patterns...>', 'File patterns passed to fast-glob');
program.version(packageJson.version);
program.action(async (patterns: Array<string>, options: Options) => {
  await esmify(patterns, options);
});
await program.parseAsync();
