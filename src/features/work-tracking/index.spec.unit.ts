import {
  handleWorkTrackingRequest,
  isWorkTrackingRequest,
  workTrackingTools,
} from './index';

const wit = {
  getClassificationNode: jest.fn().mockResolvedValue({
    id: 1,
    name: 'P',
    path: '\\P\\Iteration',
    children: [
      { id: 2, name: 'R2', attributes: { startDate: 's', finishDate: 'f' } },
    ],
  }),
  createOrUpdateClassificationNode: jest
    .fn()
    .mockResolvedValue({ id: 3, name: 'S1' }),
  getWorkItems: jest.fn(async (ids: number[]) =>
    ids.map((id) => ({
      id,
      fields: {
        'System.Title': `T${id}`,
        'System.State': 'New',
        'System.AssignedTo': { displayName: 'A' },
      },
    })),
  ),
  getQueries: jest
    .fn()
    .mockResolvedValue([
      {
        id: 'f',
        name: 'Shared Queries',
        isFolder: true,
        children: [{ id: 'q', name: 'Bugs', wiql: 'SELECT' }],
      },
    ]),
  getQuery: jest
    .fn()
    .mockResolvedValue({ id: 'q', name: 'Bugs', path: 'Shared Queries/Bugs' }),
  queryById: jest
    .fn()
    .mockResolvedValue({ queryType: 1, workItems: [{ id: 5 }, { id: 6 }] }),
  deleteWorkItem: jest.fn().mockResolvedValue({ id: 9, deletedBy: 'A' }),
};
const work = {
  getTeamIterations: jest
    .fn()
    .mockResolvedValue([
      {
        id: 'it1',
        name: 'Sprint 1',
        path: 'P\\Sprint 1',
        attributes: { timeFrame: 1 },
      },
    ]),
  getIterationWorkItems: jest.fn().mockResolvedValue({
    workItemRelations: [
      { target: { id: 10 } },
      {
        rel: 'System.LinkTypes.Hierarchy-Forward',
        source: { id: 10 },
        target: { id: 11 },
      },
    ],
  }),
};
const core = {
  getTeams: jest.fn().mockResolvedValue([{ id: 't', name: 'Team' }]),
};
const connection = {
  getWorkItemTrackingApi: jest.fn().mockResolvedValue(wit),
  getWorkApi: jest.fn().mockResolvedValue(work),
  getCoreApi: jest.fn().mockResolvedValue(core),
} as never;

const call = async (name: string, args: Record<string, unknown>) => {
  const r = await handleWorkTrackingRequest(connection, {
    params: { name, arguments: { projectId: 'P', ...args } },
  } as never);
  return JSON.parse((r.content[0] as { text: string }).text);
};

describe('work tracking tools', () => {
  it('recognises its tools', () => {
    for (const t of workTrackingTools)
      expect(isWorkTrackingRequest({ params: { name: t.name } } as never)).toBe(
        true,
      );
  });

  it('lists teams, iterations and areas', async () => {
    expect((await call('list_teams', {}))[0]).toMatchObject({ name: 'Team' });
    const it = await call('list_iterations', { path: 'P\\Iteration\\R2' });
    expect(wit.getClassificationNode.mock.calls[0][1]).toBe(1);
    expect(wit.getClassificationNode.mock.calls[0][2]).toBe('R2');
    expect(it.children[0]).toMatchObject({ name: 'R2', startDate: 's' });
    await call('list_area_paths', {});
    expect(wit.getClassificationNode.mock.calls[1][1]).toBe(0);
  });

  it('creates iterations with dates and areas', async () => {
    await call('create_iteration', {
      name: 'S1',
      parentPath: 'Release 2',
      startDate: '2026-10-01',
      finishDate: '2026-10-14',
    });
    expect(wit.createOrUpdateClassificationNode.mock.calls[0]).toEqual([
      {
        name: 'S1',
        attributes: { startDate: '2026-10-01', finishDate: '2026-10-14' },
      },
      'P',
      1,
      'Release 2',
    ]);
    await call('create_area_path', { name: 'Web' });
    expect(wit.createOrUpdateClassificationNode.mock.calls[1][2]).toBe(0);
  });

  it('gets sprints and current sprint work items with parents', async () => {
    expect(
      (await call('get_team_sprints', { timeframe: 'current' }))[0],
    ).toMatchObject({ id: 'it1' });
    const r = await call('get_sprint_work_items', {});
    expect(r).toMatchObject({
      iterationId: 'it1',
      sprintName: 'Sprint 1',
      count: 2,
    });
    expect(r.workItems.find((w: { id: number }) => w.id === 11).parentId).toBe(
      10,
    );
  });

  it('lists and runs queries', async () => {
    const q = await call('list_queries', { includeWiql: true });
    expect(q[0].children[0]).toMatchObject({ name: 'Bugs', wiql: 'SELECT' });
    const r = await call('run_query', { query: 'Shared Queries/Bugs' });
    expect(r).toMatchObject({ count: 2 });
    expect(r.workItems[0]).toMatchObject({
      id: 5,
      title: 'T5',
      assignedTo: 'A',
    });
  });

  it('deletes work items', async () => {
    expect(await call('delete_work_item', { workItemId: 9 })).toMatchObject({
      status: 'moved to Recycle Bin',
    });
    expect(
      await call('delete_work_item', { workItemId: 9, destroy: true }),
    ).toMatchObject({ status: 'destroyed' });
  });

  it('rejects unknown tools and folders as queries', async () => {
    await expect(call('nope', {})).rejects.toThrow(/Unknown/);
    wit.getQuery.mockResolvedValueOnce({ id: 'f', isFolder: true });
    await expect(
      call('run_query', { query: 'Shared Queries' }),
    ).rejects.toThrow(/folder/);
  });
});
