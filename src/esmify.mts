import * as console from 'node:console';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fg from 'fast-glob';
import { parseJsCode } from './parseJsCode.mjs';
import { parseTsCode } from './parseTsCode.mjs';
import { forwardSlash } from './util.mjs';

export interface Options {
  /** (default: `process.cwd()`) A path to the directory passed to fast-glob. */
  cwd?: string;
  /** (default: `false`) If true, esmify won't remove sourcemaps. */
  keepSourceMap?: boolean;
  /** (defualt: `false`) If it exists, esmify won\'t change *.js to *.mjs. */
  noMjs?: boolean;
}

export const esmify = async (
  patterns: Array<string>,
  { cwd = process.cwd(), keepSourceMap = false, noMjs = false }: Options = {},
) => {
  console.info('esmify:start', { patterns, cwd, keepSourceMap });
  const renames = await renameFiles(patterns, cwd, noMjs);
  const sourceMapFiles = new Set<string>();
  for (const [, renamed] of renames) {
    const baseDir = path.dirname(renamed.dest);
    console.info(`esmify:parsing:${renamed.dest}`);
    for (const node of parseCode(renamed.code, renamed.dest)) {
      if ('comment' in node) {
        if (!keepSourceMap) {
          /** Remove sourcemap comments */
          const matched = /#\s*sourceMappingURL\s*=\s*(\S*)/.exec(node.comment);
          if (matched) {
            sourceMapFiles.add(path.join(baseDir, matched[1]));
            renamed.code = replaceCode(renamed.code, node);
          }
        }
      } else if (node.value.startsWith('.')) {
        const resolvedAbsoluteFilePath = await resolveLocalSource(
          node.value,
          renamed.dest,
        );
        const localDependency = renames.get(resolvedAbsoluteFilePath) || {
          dest: resolvedAbsoluteFilePath,
        };
        const relativePath = getRelativeImportSourceValue(
          localDependency.dest,
          renamed.dest,
        );
        renamed.code = replaceCode(
          renamed.code,
          node,
          JSON.stringify(relativePath),
        );
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
  const renames = new Map<string, { dest: string; code: string }>();
  for await (const absoluteFilePath of listTargetFiles(patterns, { cwd })) {
    let renamedPath = absoluteFilePath;
    if (!noMjs) {
      if (absoluteFilePath.endsWith('.ts')) {
        renamedPath = `${absoluteFilePath.slice(0, -3)}.mts`;
      } else if (absoluteFilePath.endsWith('.js')) {
        renamedPath = `${absoluteFilePath.slice(0, -3)}.mjs`;
      }
    }
    const code = await fs.readFile(absoluteFilePath, 'utf-8');
    renames.set(absoluteFilePath, { dest: renamedPath, code });
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

const listTargetExtensions = function* () {
  for (const prefix of ['', 'm', 'c']) {
    for (const lang of ['js', 'ts']) {
      for (const suffix of ['', 'x']) {
        yield `.${prefix}${lang}${suffix}`;
      }
    }
  }
};

const listTargetFiles = async function* (
  patterns: Array<string>,
  options: fg.Options,
  targetExtensions = [...listTargetExtensions()],
) {
  for (const absoluteFilePath of await fg(patterns.map(forwardSlash), {
    absolute: true,
    ...options,
  })) {
    if (targetExtensions.includes(path.extname(absoluteFilePath))) {
      yield absoluteFilePath;
    }
  }
};

const parseCode = (code: string, sourceFile: string) => {
  if (/\.[mc]?tsx?$/.test(sourceFile)) {
    return parseTsCode(code, sourceFile);
  }
  return parseJsCode(code, sourceFile);
};

const resolveLocalSource = async (source: string, importer: string) => {
  for (const candidate of listRequirePatterns(source, importer)) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat && stat.isFile()) {
      return candidate;
    }
  }
  throw new Error(`Can't Resolve ${source} from ${importer}`);
};

const listRequirePatterns = function* (source: string, importer: string) {
  const absoluteSource = path.resolve(path.dirname(importer), source);
  yield absoluteSource;
  yield `${absoluteSource}.js`;
  yield `${absoluteSource}.json`;
  yield `${absoluteSource}.mjs`;
  yield `${absoluteSource}.cjs`;
  yield `${absoluteSource}/index.js`;
  yield `${absoluteSource}/index.json`;
  yield `${absoluteSource}/index.mjs`;
  yield `${absoluteSource}/index.cjs`;
};

const getRelativeImportSourceValue = (
  absoluteImporteePath: string,
  absoluteImporterPath: string,
) => {
  let relativePath = path.relative(
    path.dirname(absoluteImporterPath),
    absoluteImporteePath,
  );
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }
  return relativePath.split(path.sep).join('/');
};

const replaceCode = (
  code: string,
  { start, end }: { start: number; end: number },
  replacement = '',
) => `${code.slice(0, start)}${replacement}${code.slice(end)}`;
