import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import * as prettier from 'prettier';
// Focused formatting only: files owned by this uncommitted construction.
const changed = execFileSync('git', ['diff', '--name-only', '-z'], {
  encoding: 'utf8',
}).split('\0');
const added = execFileSync(
  'git',
  ['ls-files', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
).split('\0');
const files = [...new Set([...changed, ...added])].filter(
  (f) =>
    /\.(js|mjs|css|json|md)$/.test(f) && !f.startsWith('docs/superpowers/'),
);
for (const file of files) {
  const info = await prettier.getFileInfo(file, {
    ignorePath: '.prettierignore',
  });
  if (info.ignored || !info.inferredParser) continue;
  const config = await prettier.resolveConfig(file);
  const before = await fs.readFile(file, 'utf8');
  const after = await prettier.format(before, { ...config, filepath: file });
  if (before !== after) await fs.writeFile(file, after);
}
console.log(`Focused formatting: ${files.length} files considered.`);
