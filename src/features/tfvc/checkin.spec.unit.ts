import { Readable } from 'stream';
import { tfvcCreateChangeset } from './checkin';

function makeConnection(
  files: Record<string, { version: number; bytes: Buffer; encoding?: number }>,
) {
  const createChangeset = jest.fn().mockResolvedValue({ changesetId: 555 });
  const updateWorkItem = jest.fn().mockResolvedValue({});
  const tfvc = {
    getItemsBatch: jest.fn(
      async (req: { itemDescriptors: { path: string }[] }) =>
        req.itemDescriptors.map((d) => {
          const f = files[d.path];
          return f
            ? [
                {
                  path: d.path,
                  version: f.version,
                  contentMetadata: { encoding: f.encoding ?? 65001 },
                },
              ]
            : [];
        }),
    ),
    getItemContent: jest.fn(async (path: string) =>
      Readable.from([files[path].bytes]),
    ),
    createChangeset,
  };
  const connection = {
    getTfvcApi: jest.fn().mockResolvedValue(tfvc),
    getWorkItemTrackingApi: jest.fn().mockResolvedValue({ updateWorkItem }),
  };
  return { connection: connection as never, createChangeset, updateWorkItem };
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

describe('tfvcCreateChangeset', () => {
  it('applies search/replace, preserving BOM and CRLF, and links work items', async () => {
    const path = '$/P/Master/A.cs';
    const original = Buffer.concat([
      BOM,
      Buffer.from('line1\r\nold value\r\nline3\r\n'),
    ]);
    const { connection, createChangeset, updateWorkItem } = makeConnection({
      [path]: { version: 100, bytes: original },
    });

    const r = await tfvcCreateChangeset(connection, {
      projectId: 'P',
      comment: 'Fix',
      changes: [
        {
          path,
          changeType: 'edit',
          search: 'old value\nline3',
          replace: 'new value\nline3',
        },
      ],
      workItemIds: [42],
      dryRun: false,
    });

    expect(r).toMatchObject({ changesetId: 555, workItemsLinked: [42] });
    const body = createChangeset.mock.calls[0][0];
    expect(body.comment).toBe('Fix');
    expect(body.changes[0]).toMatchObject({
      changeType: 'edit',
      item: { path, version: 100, contentMetadata: { encoding: 65001 } },
      newContent: { contentType: 'base64Encoded' },
    });
    const written = Buffer.from(body.changes[0].newContent.content, 'base64');
    expect(
      written.equals(
        Buffer.concat([BOM, Buffer.from('line1\r\nnew value\r\nline3\r\n')]),
      ),
    ).toBe(true);
    expect(updateWorkItem.mock.calls[0][1][0].value.url).toBe(
      'vstfs:///VersionControl/Changeset/555',
    );
  });

  it('refuses an edit when the file changed since expectedVersion', async () => {
    const path = '$/P/Master/A.cs';
    const { connection, createChangeset } = makeConnection({
      [path]: { version: 101, bytes: Buffer.from('x') },
    });
    await expect(
      tfvcCreateChangeset(connection, {
        projectId: 'P',
        comment: 'c',
        changes: [
          { path, changeType: 'edit', content: 'y', expectedVersion: 100 },
        ],
        dryRun: false,
      }),
    ).rejects.toThrow(/changed since version 100/);
    expect(createChangeset).not.toHaveBeenCalled();
  });

  it('rejects ambiguous search text', async () => {
    const path = '$/P/A.txt';
    const { connection } = makeConnection({
      [path]: { version: 1, bytes: Buffer.from('a a') },
    });
    await expect(
      tfvcCreateChangeset(connection, {
        projectId: 'P',
        comment: 'c',
        changes: [{ path, changeType: 'edit', search: 'a', replace: 'b' }],
        dryRun: false,
      }),
    ).rejects.toThrow(/matches 2 places/);
  });

  it('returns a diff preview on dryRun without checking in', async () => {
    const { connection, createChangeset } = makeConnection({});
    const r = await tfvcCreateChangeset(connection, {
      projectId: 'P',
      comment: 'c',
      changes: [{ path: '$/P/New.txt', changeType: 'add', content: 'hello\n' }],
      dryRun: true,
    });
    expect(r).toMatchObject({ dryRun: true });
    expect(JSON.stringify(r)).toContain('+hello');
    expect(createChangeset).not.toHaveBeenCalled();
  });

  it('refuses to add a file that already exists and to delete a missing file', async () => {
    const { connection } = makeConnection({
      '$/P/A.txt': { version: 1, bytes: Buffer.from('a') },
    });
    await expect(
      tfvcCreateChangeset(connection, {
        projectId: 'P',
        comment: 'c',
        changes: [{ path: '$/P/A.txt', changeType: 'add', content: 'a' }],
        dryRun: false,
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      tfvcCreateChangeset(connection, {
        projectId: 'P',
        comment: 'c',
        changes: [{ path: '$/P/Missing.txt', changeType: 'delete' }],
        dryRun: false,
      }),
    ).rejects.toThrow(/not found/);
  });
});
