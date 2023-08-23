import * as path from 'node:path';
import type * as acorn from 'acorn';

export interface NodeWithSource extends acorn.Node {
  source: acorn.Node;
}
export const isNodeWithSource = (node: acorn.Node): node is NodeWithSource =>
  isNode(node) && isNode(node.source);

export interface Literal extends acorn.Node {
  value: number | string;
  raw: string;
}
export interface StringLiteral extends Literal {
  value: string;
}
export const isStringLiteral = (node: acorn.Node): node is StringLiteral =>
  isNode(node) && isString(node.value);
export interface Comment {
  start: number;
  end: number;
  block: boolean;
  comment: string;
}

export const isNode = (
  input: unknown,
): input is acorn.Node & Record<string, unknown> => {
  return (
    isRecord(input) &&
    isString(input.type) &&
    isInteger(input.start) &&
    isInteger(input.end)
  );
};

export const isRecord = (input: unknown): input is Record<string, unknown> => {
  const type = typeof input;
  return (type === 'object' || type === 'function') && input !== null;
};

export const isString = (input: unknown): input is string =>
  typeof input === 'string';

export const isInteger = (input: unknown): input is number =>
  Number.isInteger(input);

export const byStartIndexDesc = (a: { start: number }, b: { start: number }) =>
  b.start - a.start;

export const forwardSlash = (input: string) => input.split(path.sep).join('/');
