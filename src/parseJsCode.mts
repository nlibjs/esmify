import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import type { StringLiteral, Comment } from './util.mjs';
import {
  byStartIndexDesc,
  isNodeWithSource,
  isStringLiteral,
} from './util.mjs';

export const parseJsCode = (code: string, sourceFile: string) => {
  const nodes: Array<Comment | StringLiteral> = [];
  const onComment = (
    block: boolean,
    comment: string,
    start: number,
    end: number,
  ) => {
    nodes.push({ block, comment: comment.trim(), start, end });
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
