jest.mock('./feature', () => ({
  tfvcGetItems: jest.fn().mockResolvedValue({ ok: 'items' }),
  tfvcGetFileContent: jest
    .fn()
    .mockResolvedValue({ path: '$/P/a', content: 'body' }),
  tfvcListChangesets: jest.fn().mockResolvedValue([]),
  tfvcGetChangeset: jest.fn().mockResolvedValue({}),
  tfvcListBranches: jest.fn().mockResolvedValue([]),
  tfvcListShelvesets: jest.fn().mockResolvedValue([]),
  tfvcGetShelveset: jest.fn().mockResolvedValue({}),
  tfvcListLabels: jest.fn().mockResolvedValue([]),
}));
jest.mock('./checkin', () => ({
  ...jest.requireActual('./checkin'),
  tfvcCreateChangeset: jest.fn().mockResolvedValue({ changesetId: 1 }),
}));
jest.mock('./tf-tools', () => {
  const actual = jest.requireActual('./tf-tools');
  const stub = () => jest.fn().mockResolvedValue({ status: 'ok' });
  return {
    ...actual,
    tfvcBranch: stub(),
    tfvcMergeCandidates: stub(),
    tfvcMerge: stub(),
    tfvcShelve: stub(),
    tfvcCheckinShelveset: stub(),
    tfvcDeleteShelveset: stub(),
    tfvcCreateLabel: stub(),
    tfvcDeleteLabel: stub(),
    tfvcRollback: stub(),
    tfvcRename: stub(),
    tfvcWorkspace: stub(),
  };
});

import { handleTfvcRequest, isTfvcRequest, tfvcTools } from './index';

const call = (name: string, args: Record<string, unknown>) =>
  handleTfvcRequest(
    {} as never,
    { method: 'tools/call', params: { name, arguments: args } } as never,
  );

describe('tfvc request routing', () => {
  it('recognises every tfvc tool', () => {
    for (const t of tfvcTools) {
      expect(isTfvcRequest({ params: { name: t.name } } as never)).toBe(true);
    }
    expect(isTfvcRequest({ params: { name: 'get_work_item' } } as never)).toBe(
      false,
    );
  });

  const cases: [string, Record<string, unknown>][] = [
    ['tfvc_get_items', { projectId: 'P' }],
    ['tfvc_list_changesets', { projectId: 'P' }],
    ['tfvc_get_changeset', { projectId: 'P', changesetId: 1 }],
    ['tfvc_list_branches', { projectId: 'P' }],
    ['tfvc_list_shelvesets', {}],
    ['tfvc_get_shelveset', { shelvesetId: 's;o' }],
    ['tfvc_list_labels', { projectId: 'P' }],
    [
      'tfvc_create_changeset',
      {
        projectId: 'P',
        comment: 'c',
        changes: [{ path: '$/P/a', changeType: 'delete' }],
      },
    ],
    [
      'tfvc_branch',
      {
        sourcePath: '$/P/A',
        targetPath: '$/P/B',
        mode: 'preview',
        comment: 'c',
      },
    ],
    ['tfvc_merge_candidates', { sourcePath: '$/P/A', targetPath: '$/P/B' }],
    [
      'tfvc_merge',
      {
        sourcePath: '$/P/A',
        targetPath: '$/P/B',
        mode: 'preview',
        comment: 'c',
      },
    ],
    [
      'tfvc_shelve',
      {
        projectId: 'P',
        shelvesetName: 's',
        comment: 'c',
        changes: [{ path: '$/P/a', changeType: 'delete' }],
      },
    ],
    ['tfvc_checkin_shelveset', { shelvesetName: 's' }],
    ['tfvc_delete_shelveset', { shelvesetName: 's' }],
    ['tfvc_create_label', { name: 'L', path: '$/P/A' }],
    ['tfvc_delete_label', { name: 'L', scope: '$/P' }],
    [
      'tfvc_rollback',
      { fromChangeset: 1, path: '$/P/A', mode: 'preview', comment: 'c' },
    ],
    [
      'tfvc_rename',
      { path: '$/P/a', newPath: '$/P/b', mode: 'preview', comment: 'c' },
    ],
    ['tfvc_workspace', {}],
  ];
  it.each(cases)('routes %s', async (name, args) => {
    const r = await call(name, args);
    expect(r.content[0].type).toBe('text');
  });

  it('returns file content as a separate text block', async () => {
    const r = await call('tfvc_get_file_content', {
      projectId: 'P',
      path: '$/P/a',
    });
    expect(r.content[1]).toEqual({ type: 'text', text: 'body' });
  });

  it('throws for unknown tools', async () => {
    await expect(call('tfvc_nope', {})).rejects.toThrow(/Unknown TFVC tool/);
  });
});
