/* eslint-disable import/no-named-as-default-member */
// eslint-disable-next-line import/default
import ts from 'typescript';
import type { StringLiteral } from './util.mjs';
import { byStartIndexDesc } from './util.mjs';

export const parseTsCode = (code: string, sourceFile: string) => {
  const nodes: Array<StringLiteral> = [];
  const tsSource = ts.createSourceFile(
    sourceFile,
    code,
    ts.ScriptTarget.ESNext,
  );
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

const listTsSourceStringLiterals = function* (
  tsSource: ts.SourceFile,
): Generator<ts.StringLiteral> {
  for (const [node] of walkTsSource(tsSource, tsSource)) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
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

const walkTsSource = function* (
  node: ts.Node,
  tsSource: ts.SourceFile,
  depth = 0,
): Generator<[ts.Node, number]> {
  yield [node, depth];
  for (const child of node.getChildren(tsSource)) {
    yield* walkTsSource(child, tsSource, depth + 1);
  }
};
