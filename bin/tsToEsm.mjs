#!/usr/bin/env node
import {Command} from 'commander';
import * as console from 'console';
import * as fs from 'fs';

/** @type {{name: string, version: string, description: string}} */
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const program = new Command();
program.name(packageJson.name);
program.description(packageJson.description);
program.option('--cwd <cwd>', 'A path to the directory passed to fast-glob.');
program.option('--keepSourceMap', 'If it exists, ts-to-esm won\'t remove sourcemaps.');
program.argument('<patterns...>', 'File patterns passed to fast-glob');
program.version(packageJson.version);
program.action(
    /** @param {Array<string>} patterns */
    async (patterns, options) => {
        /** @type {{tsToEsm: (...patterns: Array<string>) => Promise<void>}} */
        const {tsToEsm} = await import(new URL('../lib/tsToEsm.mjs', import.meta.url));
        await tsToEsm(patterns, options);
    },
);
program.parseAsync()
.catch((error) => {
    console.error(error);
    process.exit(1);
});
