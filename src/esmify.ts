import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import * as console from 'console';
import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';

interface Options {
    /** (default: `process.cwd()`) A path to the directory passed to fast-glob. */
    cwd?: string,
    /** (default: `false`) If true, esmify won't remove sourcemaps. */
    keepSourceMap?: boolean,
}

export const esmify = async (
    patterns: Array<string>,
    {cwd = process.cwd(), keepSourceMap = false}: Options = {},
) => {
    console.info('esmify:start', {patterns, cwd, keepSourceMap});
    const renames = await getRenameMapping(patterns, cwd);
    const sourceMapFiles = new Set<string>();
    for (const [absoluteFilePath, renamed] of renames) {
        const baseDir = path.dirname(absoluteFilePath);
        console.info(`esmify:parsing:${absoluteFilePath}`);
        for (const node of parseCode(renamed.code, absoluteFilePath)) {
            if ('comment' in node) {
                if (!keepSourceMap) {
                    /** Remove sourcemap comments */
                    const matched = (/#\s*sourceMappingURL\s*=\s*(\S*)/).exec(node.comment);
                    if (matched) {
                        sourceMapFiles.add(path.join(baseDir, matched[1]));
                        renamed.code = replaceCode(renamed.code, node);
                    }
                }
            } else if (node.value.startsWith('.')) {
                const resolvedAbsoluteFilePath = await resolveLocalSource(node.value, absoluteFilePath);
                const localDependency = renames.get(resolvedAbsoluteFilePath) || {path: resolvedAbsoluteFilePath};
                const relativePath = getRelativeImportSourceValue(localDependency.path, absoluteFilePath);
                renamed.code = replaceCode(renamed.code, node, JSON.stringify(relativePath));
            }
        }
    }
    console.info(`esmify:writing ${renames.size} files`);
    for (const [absoluteFilePath, renamed] of renames) {
        await fs.writeFile(renamed.path, renamed.code);
        if (absoluteFilePath !== renamed.path) {
            await fs.unlink(absoluteFilePath);
        }
    }
    if (!keepSourceMap) {
        console.info(`esmify:deleting ${sourceMapFiles.size} sourcemaps`);
        for (const sourceMapFile of sourceMapFiles) {
            await fs.unlink(sourceMapFile);
        }
    }
};

const getRenameMapping = async (patterns: Array<string>, cwd: string) => {
    const renames = new Map<string, {path: string, code: string}>();
    const targetExtensions = ['.js', '.mjs', '.cjs'];
    for (const absoluteFilePath of await glob(patterns, {cwd, absolute: true})) {
        if (targetExtensions.includes(path.extname(absoluteFilePath))) {
            let renamedPath = absoluteFilePath;
            if (absoluteFilePath.endsWith('.js')) {
                renamedPath = `${absoluteFilePath.slice(0, -3)}.mjs`;
            }
            const code = await fs.readFile(absoluteFilePath, 'utf-8');
            renames.set(absoluteFilePath, {path: renamedPath, code});
        }
    }
    for (const [absoluteFilePath, renamed] of renames) {
        if (absoluteFilePath !== renamed.path && renames.has(renamed.path)) {
            await fs.unlink(renamed.path);
            renames.delete(renamed.path);
        }
    }
    return renames;
};

const glob = async (patterns: Array<string>, options: fg.Options) => {
    return await fg(
        patterns.map((pattern) => pattern.split(path.sep).join('/')),
        {absolute: true, ...options},
    );
};

interface Comment {
    start: number,
    end: number,
    block: boolean,
    comment: string,
}
const parseCode = (code: string, sourceFile: string) => {
    const nodes: Array<Comment | StringLiteral> = [];
    const onComment = (block: boolean, comment: string, start: number, end: number) => {
        nodes.push({block, comment: comment.trim(), start, end});
    };
    const tree = acorn.parse(code, {
        sourceFile,
        sourceType: 'module',
        ecmaVersion: 'latest',
        allowAwaitOutsideFunction: true,
        allowHashBang: true,
        allowImportExportEverywhere: true,
        allowReserved: true,
        allowReturnOutsideFunction: true,
        allowSuperOutsideMethod: true,
        onComment,
    });
    const checkSource = (node: acorn.Node) => {
        if (isNodeWithSource(node) && isStringLiteral(node.source)) {
            nodes.push(node.source);
        }
    };
    walk.simple(tree, {
        ImportDeclaration: checkSource,
        ImportExpression: checkSource,
        ExportNamedDeclaration: checkSource,
        ExportAllDeclaration: checkSource,
    });
    return nodes.sort(byStartIndexDesc);
};

const byStartIndexDesc = (a: {start: number}, b: {start: number}) => b.start - a.start;

interface NodeWithSource extends acorn.Node {
    source: acorn.Node,
}
const isNodeWithSource = (node: acorn.Node): node is NodeWithSource => isNode(node) && isNode(node.source);

interface Literal extends acorn.Node {
    value: number | string,
    raw: string,
}
interface StringLiteral extends Literal {
    value: string,
}
const isStringLiteral = (node: acorn.Node): node is StringLiteral => isNode(node) && isString(node.value);

const isNode = (input: unknown): input is acorn.Node & Record<string, unknown> => {
    return isRecord(input) && isString(input.type) && isInteger(input.start) && isInteger(input.end);
};

const isRecord = (input: unknown): input is Record<string, unknown> => {
    const type = typeof input;
    return (type === 'object' || type === 'function') && input !== null;
};

const isString = (input: unknown): input is string => typeof input === 'string';

const isInteger = (input: unknown): input is number => Number.isInteger(input);

const resolveLocalSource = async (source: string, importer: string) => {
    const cwd = path.dirname(importer);
    const found = await glob(getRequirePatterns(source), {cwd});
    if (found.length === 0) {
        throw new Error(`Can't Resolve ${source} from ${importer}`);
    }
    if (1 < found.length) {
        throw new Error(`There's multiple choices for ${source} from ${importer}\n${found.map((x) => `  - ${x}`).join('\n')}`);
    }
    return found[0];
};

const getRequirePatterns = (source: string) => [
    source,
    `${source}.js`,
    `${source}.json`,
    `${source}.mjs`,
    `${source}.cjs`,
    `${source}/index.js`,
    `${source}/index.json`,
    `${source}/index.mjs`,
    `${source}/index.cjs`,
];

const getRelativeImportSourceValue = (
    absoluteImporteePath: string,
    absoluteImporterPath: string,
) => {
    let relativePath = path.relative(path.dirname(absoluteImporterPath), absoluteImporteePath);
    if (!relativePath.startsWith('.')) {
        relativePath = `./${relativePath}`;
    }
    return relativePath.split(path.sep).join('/');
};

const replaceCode = (
    code: string,
    {start, end}: {start: number, end: number},
    replacement = '',
) => `${code.slice(0, start)}${replacement}${code.slice(end)}`;
