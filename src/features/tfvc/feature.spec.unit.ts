import { Readable } from 'stream';
import {
  tfvcGetItems,
  tfvcGetFileContent,
  tfvcListChangesets,
  tfvcGetChangeset,
  tfvcListBranches,
  tfvcListShelvesets,
  tfvcGetShelveset,
  tfvcListLabels,
} from './feature';

function conn(api: Record<string, jest.Mock>) {
  return { getTfvcApi: jest.fn().mockResolvedValue(api) } as never;
}

describe('tfvc read tools', () => {
  it('lists items at the project root by default', async () => {
    const getItems = jest
      .fn()
      .mockResolvedValue([
        { path: '$/P/Master', isFolder: true, isBranch: true, version: 5 },
      ]);
    const r = await tfvcGetItems(conn({ getItems }), {
      projectId: 'P',
      recursionLevel: 'oneLevel',
    });
    expect(getItems.mock.calls[0][1]).toBe('$/P');
    expect(r.items[0]).toMatchObject({
      path: '$/P/Master',
      isBranch: true,
      changesetVersion: 5,
    });
  });

  it('passes a changeset version descriptor', async () => {
    const getItems = jest.fn().mockResolvedValue([]);
    await tfvcGetItems(conn({ getItems }), {
      projectId: 'P',
      scopePath: '$/P/Main',
      recursionLevel: 'full',
      version: '123',
    });
    expect(getItems.mock.calls[0][4]).toEqual({
      version: '123',
      versionType: 1,
    });
    expect(getItems.mock.calls[0][2]).toBe(120);
  });

  it('reads file content and rejects folders', async () => {
    const getItem = jest
      .fn()
      .mockResolvedValueOnce({ path: '$/P/a.txt', version: 9, size: 5 })
      .mockResolvedValueOnce({ path: '$/P/dir', isFolder: true });
    const getItemContent = jest
      .fn()
      .mockResolvedValue(Readable.from([Buffer.from('hello')]));
    const c = conn({ getItem, getItemContent });
    const r = await tfvcGetFileContent(c, {
      projectId: 'P',
      path: '$/P/a.txt',
    });
    expect(r).toMatchObject({ content: 'hello', changesetVersion: 9 });
    await expect(
      tfvcGetFileContent(c, { projectId: 'P', path: '$/P/dir' }),
    ).rejects.toThrow(/folder/);
  });

  it('lists changesets newest first with filters', async () => {
    const getChangesets = jest
      .fn()
      .mockResolvedValue([
        {
          changesetId: 2,
          author: { displayName: 'A' },
          checkedInBy: { displayName: 'Build' },
          comment: 'x',
        },
      ]);
    const r = await tfvcListChangesets(conn({ getChangesets }), {
      projectId: 'P',
      itemPath: '$/P/Master',
      author: 'A',
      top: 5,
      maxCommentLength: 100,
    });
    expect(getChangesets.mock.calls[0][4]).toBe('id desc');
    expect(getChangesets.mock.calls[0][5]).toMatchObject({
      itemPath: '$/P/Master',
      author: 'A',
    });
    expect(r[0]).toMatchObject({
      changesetId: 2,
      author: 'A',
      checkedInBy: 'Build',
    });
  });

  it('gets a changeset with readable change types', async () => {
    const getChangeset = jest.fn().mockResolvedValue({
      changesetId: 7,
      author: { displayName: 'A' },
      workItems: [{ id: 1, title: 'T', workItemType: 'Bug', state: 'New' }],
    });
    const getChangesetChanges = jest
      .fn()
      .mockResolvedValue([
        { item: { path: '$/P/a.cs', version: 7 }, changeType: 2 | 128 },
      ]);
    const r = await tfvcGetChangeset(
      conn({ getChangeset, getChangesetChanges }),
      {
        projectId: 'P',
        changesetId: 7,
        includeChanges: true,
        maxChangeCount: 10,
        includeWorkItems: true,
      },
    );
    expect(r.changes![0].changeType).toBe('edit, merge');
    expect(r.workItems![0]).toMatchObject({ id: 1, type: 'Bug' });
  });

  it('lists branches and a single branch', async () => {
    const getBranches = jest
      .fn()
      .mockResolvedValue([
        {
          path: '$/P/Main',
          owner: { displayName: 'O' },
          children: [{ path: '$/P/Dev' }],
        },
      ]);
    const getBranch = jest
      .fn()
      .mockResolvedValue({ path: '$/P/Main', parent: { path: '$/P/X' } });
    const c = conn({ getBranches, getBranch });
    const all = (await tfvcListBranches(c, {
      projectId: 'P',
      includeChildren: true,
      includeDeleted: false,
    })) as Record<string, unknown>[];
    expect(all[0]).toMatchObject({ path: '$/P/Main', owner: 'O' });
    const one = await tfvcListBranches(c, {
      projectId: 'P',
      path: '$/P/Main',
      includeChildren: true,
      includeDeleted: false,
    });
    expect(one).toMatchObject({ parent: '$/P/X' });
  });

  it('lists and gets shelvesets', async () => {
    const getShelvesets = jest
      .fn()
      .mockResolvedValue([
        { id: 's;o', name: 's', owner: { displayName: 'O' } },
      ]);
    const getShelveset = jest
      .fn()
      .mockResolvedValue({ id: 's;o', name: 's', workItems: [] });
    const getShelvesetChanges = jest
      .fn()
      .mockResolvedValue([{ item: { path: '$/P/a' }, changeType: 1 }]);
    const c = conn({ getShelvesets, getShelveset, getShelvesetChanges });
    expect((await tfvcListShelvesets(c, { top: 5 }))[0]).toMatchObject({
      id: 's;o',
      owner: 'O',
    });
    const s = await tfvcGetShelveset(c, {
      shelvesetId: 's;o',
      includeChanges: true,
      includeWorkItems: true,
      maxChangeCount: 5,
    });
    expect(s.changes![0].changeType).toBe('add');
  });

  it('lists labels', async () => {
    const getLabels = jest
      .fn()
      .mockResolvedValue([{ id: 1, name: 'v1', owner: { displayName: 'O' } }]);
    const r = await tfvcListLabels(conn({ getLabels }), {
      projectId: 'P',
      name: 'v*',
      top: 10,
    });
    expect(getLabels.mock.calls[0][0]).toMatchObject({ name: 'v*' });
    expect(r[0]).toMatchObject({ name: 'v1', owner: 'O' });
  });
});
