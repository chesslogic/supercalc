import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('tracked symlinks use existing targets within the repository', () => {
  const trackedSymlinks = runGit(['ls-files', '--stage'])
    .split(/\r?\n/)
    .filter((line) => line.startsWith('120000 '))
    .map((line) => line.slice(line.indexOf('\t') + 1));

  for (const linkPath of trackedSymlinks) {
    const target = runGit(['show', `:${linkPath}`]);
    assert.equal(
      path.win32.isAbsolute(target) || path.posix.isAbsolute(target),
      false,
      `${linkPath} must not point to an absolute machine-specific path`
    );

    const resolvedTarget = path.resolve(
      REPO_ROOT,
      ...linkPath.split('/').slice(0, -1),
      target
    );
    const relativeTarget = path.relative(REPO_ROOT, resolvedTarget);
    assert.equal(
      relativeTarget === '..'
        || relativeTarget.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativeTarget),
      false,
      `${linkPath} must point within the repository`
    );
    assert.ok(existsSync(resolvedTarget), `${linkPath} points to missing target ${target}`);
  }
});
