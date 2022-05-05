import fg from 'fast-glob';
import * as path from 'path';

export const glob = async (patterns: Array<string>, options: fg.Options) => {
    return await fg(
        patterns.map((pattern) => pattern.split(path.sep).join('/')),
        {absolute: true, ...options},
    );
};
