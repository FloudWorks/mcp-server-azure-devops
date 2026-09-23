jest.mock('./tf-runner', () => {
  const actual = jest.requireActual('./tf-runner');
  return {
    ...actual,
    ensureWorkspace: jest.fn().mockResolvedValue(undefined),
    undoAll: jest.fn().mockResolvedValue(undefined),
    getPaths: jest.fn().mockResolvedValue(undefined),
    listConflicts: jest.fn(),
    pendingChanges: jest.fn(),
    tf: jest.fn(),
    toLocalPath: (p: string) => `L:${p}`,
  };
});

import * as runner from './tf-runner';
import { tfvcMerge } from './tf-tools';

const tf = runner.tf as jest.Mock;
const listConflicts = runner.listConflicts as jest.Mock;
const pendingChanges = runner.pendingChanges as jest.Mock;
const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' });

const updateWorkItem = jest.fn().mockResolvedValue({});
const connection = {
  getWorkItemTrackingApi: jest.fn().mockResolvedValue({ updateWorkItem }),
} as never;

const base = {
  sourcePath: '$/P/Main',
  targetPath: '$/P/Master',
  comment: 'Merge Main to Master',
  baseless: false,
  discard: false,
};

describe('tfvcMerge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cherry-picks changesets in order, auto-resolves and checks in', async () => {
    tf.mockImplementation(async (cmd: string) =>
      cmd === 'checkin' ? ok('Changeset #900 checked in.') : ok(),
    );
    listConflicts.mockResolvedValue([]);
    pendingChanges.mockResolvedValue('merge, edit  a.cs');

    const r = await tfvcMerge(connection, {
      ...base,
      changesets: [30, 10],
      conflictResolution: 'abort',
      mode: 'checkin',
      workItemIds: [7],
    });

    const merges = tf.mock.calls
      .filter((c) => c[0] === 'merge')
      .map((c) => c[1]);
    expect(merges[0]).toEqual([
      'L:$/P/Main',
      'L:$/P/Master',
      '/recursive',
      '/version:C10~C10',
    ]);
    expect(merges[1]).toContain('/version:C30~C30');
    expect(
      tf.mock.calls.some(
        (c) => c[0] === 'resolve' && c[1].includes('/auto:AutoMerge'),
      ),
    ).toBe(true);
    expect(r).toMatchObject({
      status: 'checked-in',
      changesetId: 900,
      workItemsLinked: [7],
    });
  });

  it('aborts and reports conflicts by default', async () => {
    tf.mockResolvedValue(ok());
    listConflicts.mockResolvedValue(['a.cs: The item content has changed']);

    const r = await tfvcMerge(connection, {
      ...base,
      conflictResolution: 'abort',
      mode: 'checkin',
    });

    expect(r).toMatchObject({
      status: 'conflicts',
      conflicts: ['a.cs: The item content has changed'],
    });
    expect(tf.mock.calls.some((c) => c[0] === 'checkin')).toBe(false);
    expect(runner.undoAll).toHaveBeenCalled();
  });

  it('takes the source version when asked and shelves', async () => {
    tf.mockResolvedValue(ok());
    listConflicts.mockResolvedValueOnce(['a.cs']).mockResolvedValueOnce([]);
    pendingChanges.mockResolvedValue('merge, edit  a.cs');

    const r = await tfvcMerge(connection, {
      ...base,
      fromChangeset: 5,
      conflictResolution: 'takeSource',
      mode: 'shelve',
      shelvesetName: 'merge-review',
    });

    expect(tf.mock.calls.find((c) => c[0] === 'merge')![1]).toContain(
      '/version:C5~T',
    );
    expect(
      tf.mock.calls.some(
        (c) => c[0] === 'resolve' && c[1].includes('/auto:TakeTheirs'),
      ),
    ).toBe(true);
    expect(tf.mock.calls.find((c) => c[0] === 'shelve')![1][0]).toBe(
      'merge-review',
    );
    expect(r).toMatchObject({ status: 'shelved', shelveset: 'merge-review' });
  });
});
