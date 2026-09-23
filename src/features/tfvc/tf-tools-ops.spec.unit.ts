jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  chmodSync: jest.fn(),
}));
jest.mock('./tf-runner', () => {
  const actual = jest.requireActual('./tf-runner');
  return {
    ...actual,
    ensureWorkspace: jest.fn().mockResolvedValue(undefined),
    undoAll: jest.fn().mockResolvedValue(undefined),
    getPaths: jest.fn().mockResolvedValue(undefined),
    listConflicts: jest.fn().mockResolvedValue([]),
    pendingChanges: jest.fn().mockResolvedValue('edit a.cs'),
    tf: jest.fn(),
    toLocalPath: (p: string) => `L:${p}`,
    workspaceName: () => 'ws',
    workspaceRoot: () => '/root',
    collectionUrl: () => 'https://x/tfs/C',
  };
});
jest.mock('./checkin', () => ({
  ...jest.requireActual('./checkin'),
  prepareChanges: jest.fn().mockResolvedValue([
    {
      path: '$/P/a.cs',
      changeType: 'edit',
      baseVersion: 3,
      bytes: Buffer.from('new'),
      diff: 'd',
    },
    { path: '$/P/b.cs', changeType: 'add', bytes: Buffer.from('b'), diff: 'd' },
    { path: '$/P/c.cs', changeType: 'delete', baseVersion: 2 },
  ]),
}));

import { writeFileSync } from 'fs';
import * as runner from './tf-runner';
import {
  tfvcBranch,
  tfvcMergeCandidates,
  tfvcShelve,
  tfvcCheckinShelveset,
  tfvcDeleteShelveset,
  tfvcCreateLabel,
  tfvcDeleteLabel,
  tfvcRollback,
  tfvcRename,
  tfvcWorkspace,
} from './tf-tools';

const tf = runner.tf as jest.Mock;
const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' });
const connection = {
  getWorkItemTrackingApi: jest
    .fn()
    .mockResolvedValue({ updateWorkItem: jest.fn() }),
} as never;
const cmds = () => tf.mock.calls.map((c) => [c[0], ...c[1]].join(' '));

describe('tf.exe operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tf.mockImplementation(async (cmd: string) =>
      cmd === 'checkin' ? ok('Changeset #77 checked in.') : ok('done'),
    );
    (runner.pendingChanges as jest.Mock).mockResolvedValue('edit a.cs');
  });

  it('branches without downloading and checks in', async () => {
    const r = await tfvcBranch(connection, {
      sourcePath: '$/P/Main',
      targetPath: '$/P/Feature',
      version: 'C10',
      mode: 'checkin',
      comment: 'Branch',
    });
    expect(cmds()[0]).toBe(
      'branch L:$/P/Main L:$/P/Feature /noget /version:C10',
    );
    expect(r).toMatchObject({ status: 'checked-in', changesetId: 77 });
  });

  it('previews without checking in and reports nothing-to-do', async () => {
    const r = await tfvcBranch(connection, {
      sourcePath: '$/P/Main',
      targetPath: '$/P/F',
      mode: 'preview',
      comment: 'c',
    });
    expect(r).toMatchObject({ status: 'preview' });
    (runner.pendingChanges as jest.Mock).mockResolvedValue(
      'There are no pending changes.',
    );
    const r2 = await tfvcBranch(connection, {
      sourcePath: '$/P/Main',
      targetPath: '$/P/F',
      mode: 'checkin',
      comment: 'c',
    });
    expect(r2).toMatchObject({ status: 'nothing-to-do' });
  });

  it('requires a shelveset name in shelve mode', async () => {
    await expect(
      tfvcBranch(connection, {
        sourcePath: '$/P/A',
        targetPath: '$/P/B',
        mode: 'shelve',
        comment: 'c',
      }),
    ).rejects.toThrow(/shelvesetName/);
  });

  it('throws when check-in does not produce a changeset', async () => {
    tf.mockResolvedValue(ok('Checkin failed'));
    await expect(
      tfvcBranch(connection, {
        sourcePath: '$/P/A',
        targetPath: '$/P/B',
        mode: 'checkin',
        comment: 'c',
      }),
    ).rejects.toThrow(/did not complete/);
  });

  it('parses merge candidates', async () => {
    tf.mockResolvedValue(
      ok(
        'Changeset Author                 Date\n--------- ---------------------- ----------\n24780     Pavel Asenov           18/09/2026\n24781*    Pavel Asenov           18/09/2026\n',
      ),
    );
    const r = await tfvcMergeCandidates({
      sourcePath: '$/P/Main',
      targetPath: '$/P/Master',
    });
    expect(r.changesets.map((c) => c.changesetId)).toEqual([24780, 24781]);
  });

  it('shelves prepared file changes through the workspace', async () => {
    const r = await tfvcShelve(connection, {
      projectId: 'P',
      shelvesetName: 'review',
      comment: 'c',
      changes: [{ path: '$/P/a.cs', changeType: 'edit', content: 'new' }],
    });
    const c = cmds();
    expect(c).toContain('checkout L:$/P/a.cs');
    expect(c).toContain('add L:$/P/b.cs');
    expect(c).toContain('delete L:$/P/c.cs');
    expect(c.find((x) => x.startsWith('shelve'))).toContain('shelve review');
    expect(writeFileSync).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ status: 'shelved', shelveset: 'review' });
  });

  it('checks in and deletes shelvesets', async () => {
    const r = await tfvcCheckinShelveset(connection, {
      shelvesetName: 's',
      owner: 'DOM\\u',
      workItemIds: [1],
    });
    expect(cmds()[0]).toBe('checkin /shelveset:s;DOM\\u');
    expect(r).toMatchObject({ changesetId: 77, workItemsLinked: [1] });
    await tfvcDeleteShelveset({ shelvesetName: 's' });
    expect(tf.mock.calls.at(-1)).toEqual([
      'shelve',
      ['/delete', 's'],
      { collection: true },
    ]);
  });

  it('creates and deletes labels', async () => {
    await tfvcCreateLabel({
      name: 'v1',
      path: '$/P/Master',
      recursive: true,
      replace: true,
      version: 'C5',
      comment: 'rel',
    });
    expect(cmds()[0]).toBe(
      'label v1@$/P $/P/Master /recursive /version:C5 /comment:rel /child:replace',
    );
    await tfvcDeleteLabel({ name: 'v1', scope: '$/P' });
    expect(cmds()[1]).toBe('label /delete v1@$/P');
  });

  it('rolls back a changeset range', async () => {
    const r = await tfvcRollback(connection, {
      fromChangeset: 10,
      toChangeset: 12,
      path: '$/P/Master',
      keepMergeHistory: true,
      conflictResolution: 'abort',
      mode: 'checkin',
      comment: 'Rollback',
    });
    expect(cmds()[0]).toBe(
      'rollback /changeset:C10~C12 L:$/P/Master /recursive /keepmergehistory',
    );
    expect(r).toMatchObject({ status: 'checked-in' });
  });

  it('reports rollback conflicts', async () => {
    (runner.listConflicts as jest.Mock).mockResolvedValueOnce(['x']);
    const r = await tfvcRollback(connection, {
      fromChangeset: 10,
      path: '$/P/Master',
      keepMergeHistory: false,
      conflictResolution: 'abort',
      mode: 'checkin',
      comment: 'c',
    });
    expect(r).toMatchObject({ status: 'conflicts' });
  });

  it('renames and reports the workspace', async () => {
    await tfvcRename(connection, {
      path: '$/P/a',
      newPath: '$/P/b',
      mode: 'preview',
      comment: 'c',
    });
    expect(cmds()[0]).toBe('rename L:$/P/a L:$/P/b');
    const w = await tfvcWorkspace({ reset: true });
    expect(w).toMatchObject({ workspace: 'ws', localRoot: '/root' });
  });
});
