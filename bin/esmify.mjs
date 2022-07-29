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
program.option('--keepSourceMap', 'If it exists, esmify won\'t remove sourcemaps.');
program.option('--noMjs', 'If it exists, esmify won\'t change *.js to *.mjs.');
program.argument('<patterns...>', 'File patterns passed to fast-glob');
program.version(packageJson.version);
program.action(
    /** @param {Array<string>} patterns */
    async (patterns, options) => {
        const extensions = ['.mjs', '.js'];
        while (0 < extensions.length) {
            const extension = extensions.shift();
            const file = new URL(`../lib/esmify${extension}`, import.meta.url);
            const stats = await fs.promises.stat(file).catch((error) => {
                if (error && error.code === 'ENOENT') {
                    return null;
                }
                throw error;
            });
            if ((stats && stats.isFile()) || extensions.length === 0) {
                /** @type {{esmify: (...patterns: Array<string>) => Promise<void>}} */
                const {esmify} = await import(file);
                await esmify(patterns, options);
                return;
            }
        }
    },
);
program.parseAsync()
.catch((error) => {
    console.error(error);
    process.exit(1);
});
