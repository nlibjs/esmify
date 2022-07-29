import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import * as console from 'console';
import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import ts from 'typescript';

interface Options {
    /** (default: `process.cwd()`) A path to the directory passed to fast-glob. */
    cwd?: string,
    /** (default: `false`) If true, esmify won't remove sourcemaps. */
    keepSourceMap?: boolean,
    /** (defualt: `false`) If it exists, esmify won\'t change *.js to *.mjs. */
    noMjs?: boolean,
}

export const esmify = async (
    patterns: Array<string>,
    {cwd = process.cwd(), keepSourceMap = false, noMjs = false}: Options = {},
) => {
    console.info('esmify:start', {patterns, cwd, keepSourceMap});
    const renames = await renameFiles(patterns, cwd, noMjs);
    const sourceMapFiles = new Set<string>();
    for (const [, renamed] of renames) {
        const baseDir = path.dirname(renamed.dest);
        console.info(`esmify:parsing:${renamed.dest}`);
        for (const node of parseCode(renamed.code, renamed.dest)) {
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
                const resolvedAbsoluteFilePath = await resolveLocalSource(node.value, renamed.dest);
                const localDependency = renames.get(resolvedAbsoluteFilePath) || {dest: resolvedAbsoluteFilePath};
                const relativePath = getRelativeImportSourceValue(localDependency.dest, renamed.dest);
                renamed.code = replaceCode(renamed.code, node, JSON.stringify(relativePath));
            }
        }
    }
    for (const [, renamed] of renames) {
        console.info(`esmify:writing ${renamed.dest}`);
        await fs.writeFile(renamed.dest, renamed.code);
    }
    if (!keepSourceMap) {
        console.info(`esmify:deleting ${sourceMapFiles.size} sourcemaps`);
        for (const sourceMapFile of sourceMapFiles) {
            await fs.unlink(sourceMapFile);
        }
    }
};

const renameFiles = async (
    patterns: Array<string>,
    cwd: string,
    noMjs: boolean,
) => {
    const renames = new Map<string, {dest: string, code: string}>();
    for await (const absoluteFilePath of listTargetFiles(patterns, {cwd})) {
        let renamedPath = absoluteFilePath;
        if (!noMjs) {
            if (absoluteFilePath.endsWith('.ts')) {
                renamedPath = `${absoluteFilePath.slice(0, -3)}.mts`;
            } else if (absoluteFilePath.endsWith('.js')) {
                renamedPath = `${absoluteFilePath.slice(0, -3)}.mjs`;
            }
        }
        const code = await fs.readFile(absoluteFilePath, 'utf-8');
        renames.set(absoluteFilePath, {dest: renamedPath, code});
    }
    for (const [absoluteFilePath, renamed] of renames) {
        const renameIsRequired = absoluteFilePath !== renamed.dest;
        const thereIsSomething = renames.has(renamed.dest);
        if (renameIsRequired && thereIsSomething) {
            await fs.unlink(renamed.dest);
            renames.delete(renamed.dest);
        }
    }
    for (const [absoluteFilePath, renamed] of renames) {
        await fs.rename(absoluteFilePath, renamed.dest);
    }
    return renames;
};

const listTargetFiles = async function* (
    patterns: Array<string>,
    options: fg.Options,
    targetExtensions = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'],
) {
    for (const absoluteFilePath of await fg(
        patterns.map(forwardSlash),
        {absolute: true, ...options},
    )) {
        if (targetExtensions.includes(path.extname(absoluteFilePath))) {
            yield absoluteFilePath;
        }
    }
};

interface Comment {
    start: number,
    end: number,
    block: boolean,
    comment: string,
}
const parseCode = (code: string, sourceFile: string) => {
    if ((/\.[mc]?ts$/).test(sourceFile)) {
        return parseTsCode(code, sourceFile);
    }
    return parseJsCode(code, sourceFile);
};

const parseJsCode = (code: string, sourceFile: string) => {
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

const parseTsCode = (code: string, sourceFile: string) => {
    const nodes: Array<StringLiteral> = [];
    const tsSource = ts.createSourceFile(sourceFile, code, ts.ScriptTarget.ESNext);
    for (const tsLiteral of listTsSourceStringLiterals(tsSource)) {
        nodes.push({
            type: 'Literal',
            start: tsLiteral.getStart(tsSource),
            end: tsLiteral.getEnd(),
            value: tsLiteral.text,
            raw: tsLiteral.getText(tsSource),
        });
    }
    return nodes.sort(byStartIndexDesc);
};

const listTsSourceStringLiterals = function* (tsSource: ts.SourceFile): Generator<ts.StringLiteral> {
    for (const [node] of walkTsSource(tsSource, tsSource)) {
        if (ts.isImportDeclaration(node)) {
            let checking = false;
            for (const [n] of walkTsSource(node, tsSource)) {
                if (checking) {
                    if (ts.isStringLiteral(n)) {
                        yield n;
                        break;
                    }
                } else if (n.kind === ts.SyntaxKind.FromKeyword) {
                    checking = true;
                }
            }
        } else if (ts.isImportTypeNode(node)) {
            let checking = false;
            for (const [n] of walkTsSource(node, tsSource)) {
                if (checking) {
                    if (ts.isStringLiteral(n)) {
                        yield n;
                        break;
                    }
                } else if (n.kind === ts.SyntaxKind.OpenParenToken) {
                    checking = true;
                }
            }
        }
    }
};

const walkTsSource = function* (node: ts.Node, tsSource: ts.SourceFile, depth = 0): Generator<[ts.Node, number]> {
    yield [node, depth];
    for (const child of node.getChildren(tsSource)) {
        yield* walkTsSource(child, tsSource, depth + 1);
    }
};

// const kindMap = new Map(
//     Object.keys(ts.SyntaxKind).map(
//         (name) => [(ts.SyntaxKind as unknown as Record<string, number>)[name], name],
//     ),
// );
// const kind = (k: ts.SyntaxKind) => kindMap.get(k) || 'Unknown';

// const printTree = (node: ts.Node, tsSource: ts.SourceFile, startDepth = 0) => {
//     for (const [n, depth] of walkTsSource(node, tsSource, startDepth)) {
//         let suffix = '';
//         if (ts.isStringLiteralLike(n)) {
//             suffix += ` ${n.getFullText(tsSource)}`;
//         }
//         console.info(`${'|  '.repeat(depth)}${kind(n.kind)}${suffix}`);
//     }
// };

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

const forwardSlash = (input: string) => input.split(path.sep).join('/');

const resolveLocalSource = async (source: string, importer: string) => {
    const cwd = path.dirname(importer);
    const found = await fg(getRequirePatterns(source).map(forwardSlash), {cwd, absolute: true});
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
