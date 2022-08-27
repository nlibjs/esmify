import * as childProcess from 'child_process';
import * as fs from 'fs/promises';
import {createRequire} from 'module';
import * as os from 'os';
import * as path from 'path';
import fg from 'fast-glob';
import test from 'ava';

const require = createRequire(import.meta.url);
const cliFilePath = require.resolve('../bin/esmify.mjs');

type Files = Record<string, string>;

const createTestDirectory = async () => await fs.mkdtemp(path.join(os.tmpdir(), 'esmify-'));
const deployFiles = async (directory: string, files: Files) => {
    for (const [relativePath, body] of Object.entries(files)) {
        const dest = path.join(directory, ...relativePath.split('/'));
        await fs.mkdir(path.dirname(dest), {recursive: true});
        await fs.writeFile(dest, body);
    }
};
const readFiles = async (directory: string) => {
    const files: Files = {};
    for (const file of await fg(['**'], {cwd: directory, absolute: true})) {
        const key = path.relative(directory, file).split(path.sep).join('/');
        files[key] = await fs.readFile(file, 'utf-8');
    }
    return files;
};
const execute = async (cwd: string, ...args: Array<string>) => {
    args.unshift(`--cwd ${cwd}`);
    args.unshift(cliFilePath);
    args.unshift('node');
    await new Promise((resolve, reject) => {
        const p = childProcess.spawn(args.join(' '), {cwd, shell: true, stdio: 'inherit'});
        p.once('error', reject);
        p.once('close', resolve);
    });
};

test('do nothing if there is no .js files', async (t) => {
    const directory = await createTestDirectory();
    await deployFiles(directory, {
        'foo.mjs': 'console.info(123)',
    });
    await execute(directory, path.join(directory, '**'));
    t.deepEqual(await readFiles(directory), {
        'foo.mjs': 'console.info(123)',
    });
});

test('rename .js files', async (t) => {
    const directory = await createTestDirectory();
    await deployFiles(directory, {
        'foo.js': 'console.info(123)',
        'bar.js': 'console.info(456)',
    });
    await execute(directory, path.join(directory, '**'));
    t.deepEqual(await readFiles(directory), {
        'foo.mjs': 'console.info(123)',
        'bar.mjs': 'console.info(456)',
    });
});

test('rename .d.ts files', async (t) => {
    const directory = await createTestDirectory();
    await deployFiles(directory, {
        'foo.js': 'console.info(123)',
        'foo.d.ts': 'console.info(123)',
        'bar.js': 'console.info(456)',
        'bar.d.ts': 'console.info(456)',
    });
    await execute(directory, path.join(directory, '**'));
    t.deepEqual(await readFiles(directory), {
        'foo.mjs': 'console.info(123)',
        'foo.d.mts': 'console.info(123)',
        'bar.mjs': 'console.info(456)',
        'bar.d.mts': 'console.info(456)',
    });
});

test('sync import/export sources', async (t) => {
    const directory = await createTestDirectory();
    await deployFiles(directory, {
        'external/b.js': 'export const b = 1;',
        'foo.js': [
            'import {b} from \'./external/b\';',
            'import {x as y} from \'./bar\';',
            'export * from \'./bar\';',
            'export {z} from \'./baz\';',
        ].join('\n'),
        'bar.js': [
            'import {b} from \'./external/b\';',
            'import {x as y} from \'./foo\';',
            'export * from \'./foo\';',
            'export {z} from \'./baz\';',
        ].join('\n'),
        'baz.mjs': [
            'import {b} from \'./external/b\';',
            'import {x as y} from \'./foo\';',
            'export * from \'./foo\';',
            'export {z} from \'./bar\';',
        ].join('\n'),
    });
    await execute(directory, path.join(directory, '*'));
    t.deepEqual(await readFiles(directory), {
        'external/b.js': 'export const b = 1;',
        'foo.mjs': [
            'import {b} from "./external/b.js";',
            'import {x as y} from "./bar.mjs";',
            'export * from "./bar.mjs";',
            'export {z} from "./baz.mjs";',
        ].join('\n'),
        'bar.mjs': [
            'import {b} from "./external/b.js";',
            'import {x as y} from "./foo.mjs";',
            'export * from "./foo.mjs";',
            'export {z} from "./baz.mjs";',
        ].join('\n'),
        'baz.mjs': [
            'import {b} from "./external/b.js";',
            'import {x as y} from "./foo.mjs";',
            'export * from "./foo.mjs";',
            'export {z} from "./bar.mjs";',
        ].join('\n'),
    });
});

test('support dynamic imports', async (t) => {
    const directory = await createTestDirectory();
    await deployFiles(directory, {
        'external/b.js': 'export const b = 1;',
        'foo.js': [
            'const {b} = await import(\'./external/b\');',
            'const barPromise = import(\'./bar\');',
        ].join('\n'),
        'bar.js': 'export const bar = 123;',
    });
    await execute(directory, path.join(directory, '*'));
    t.deepEqual(await readFiles(directory), {
        'external/b.js': 'export const b = 1;',
        'foo.mjs': [
            'const {b} = await import("./external/b.js");',
            'const barPromise = import("./bar.mjs");',
        ].join('\n'),
        'bar.mjs': 'export const bar = 123;',
    });
});

test('delete sourcemaps', async (t) => {
    const directory = await createTestDirectory();
    await deployFiles(directory, {
        'external/b.js': [
            'export const b = 1;',
            '//# sourceMappingURL=b.js.map',
        ].join('\n'),
        'external/b.js.map': 'b.js.map',
        'foo.js': [
            'const {b} = await import(\'./external/b\');',
            'const barPromise = import(\'./bar\');',
            '//#sourceMappingURL = foo.js.map',
        ].join('\n'),
        'foo.js.map': 'foo.js.map',
        'bar.js': 'export const bar = 123;',
    });
    await execute(directory, path.join(directory, '*'));
    t.deepEqual(await readFiles(directory), {
        'external/b.js': [
            'export const b = 1;',
            '//# sourceMappingURL=b.js.map',
        ].join('\n'),
        'external/b.js.map': 'b.js.map',
        'foo.mjs': [
            'const {b} = await import("./external/b.js");',
            'const barPromise = import("./bar.mjs");',
            '',
        ].join('\n'),
        'bar.mjs': 'export const bar = 123;',
    });
});

test('keep sourcemaps', async (t) => {
    const directory = await createTestDirectory();
    await deployFiles(directory, {
        'external/b.js': [
            'export const b = 1;',
            '//# sourceMappingURL=b.js.map',
        ].join('\n'),
        'external/b.js.map': 'b.js.map',
        'foo.js': [
            'const {b} = await import(\'./external/b\');',
            'const barPromise = import(\'./bar\');',
            '//#sourceMappingURL = foo.js.map',
        ].join('\n'),
        'foo.js.map': 'foo.js.map',
        'bar.js': 'export const bar = 123;',
    });
    await execute(directory, '--keepSourceMap', path.join(directory, '*'));
    t.deepEqual(await readFiles(directory), {
        'external/b.js': [
            'export const b = 1;',
            '//# sourceMappingURL=b.js.map',
        ].join('\n'),
        'external/b.js.map': 'b.js.map',
        'foo.mjs': [
            'const {b} = await import("./external/b.js");',
            'const barPromise = import("./bar.mjs");',
            '//#sourceMappingURL = foo.js.map',
        ].join('\n'),
        'foo.js.map': 'foo.js.map',
        'bar.mjs': 'export const bar = 123;',
    });
});

test('convert .d.ts files', async (t) => {
    const directory = await createTestDirectory();
    await deployFiles(directory, {
        'external/b.js': 'export const b = 1;',
        'foo.js': [
            'const {b} = await import(\'./external/b\');',
            'const barPromise = import(\'./bar\');',
        ].join('\n'),
        'bar.js': 'export const bar = 123;',
        'baz.d.ts': [
            'import * as baz1 from \'./foo\';',
            'export * from \'./foo\';',
            'export default baz1;',
            'export const baz2 = Promise<typeof import(\'./bar\').bar>;',
        ].join('\n'),
    });
    await execute(directory, path.join(directory, '*'));
    t.deepEqual(await readFiles(directory), {
        'external/b.js': 'export const b = 1;',
        'foo.mjs': [
            'const {b} = await import("./external/b.js");',
            'const barPromise = import("./bar.mjs");',
        ].join('\n'),
        'bar.mjs': 'export const bar = 123;',
        'baz.d.mts': [
            'import * as baz1 from "./foo.mjs";',
            'export * from "./foo.mjs";',
            'export default baz1;',
            'export const baz2 = Promise<typeof import("./bar.mjs").bar>;',
        ].join('\n'),
    });
});
