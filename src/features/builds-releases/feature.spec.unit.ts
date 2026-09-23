import { listBuilds, updateReleaseApproval } from './feature';

describe('builds & releases', () => {
  it('maps status filters and enum values', async () => {
    const getBuilds = jest.fn().mockResolvedValue([
      {
        id: 1,
        buildNumber: '20260923.1',
        status: 2,
        result: 8,
        definition: { id: 3, name: 'CI' },
      },
    ]);
    const connection = {
      getBuildApi: jest.fn().mockResolvedValue({ getBuilds }),
    } as never;
    const r = await listBuilds(connection, {
      projectId: 'P',
      status: 'completed',
      result: 'failed',
      top: 5,
      branch: '$/P/Master',
    });
    const args = getBuilds.mock.calls[0];
    expect(args[8]).toBe(2); // Completed
    expect(args[9]).toBe(8); // Failed
    expect(args[12]).toBe(5);
    expect(args[17]).toBe('$/P/Master');
    expect(r[0]).toMatchObject({
      status: 'completed',
      result: 'failed',
      definition: 'CI',
    });
  });

  it('approves a release approval', async () => {
    const updateReleaseApproval_ = jest
      .fn()
      .mockResolvedValue({ id: 9, status: 2, comments: 'ok' });
    const connection = {
      getReleaseApi: jest
        .fn()
        .mockResolvedValue({ updateReleaseApproval: updateReleaseApproval_ }),
    } as never;
    const r = await updateReleaseApproval(connection, {
      projectId: 'P',
      approvalId: 9,
      status: 'approved',
      comments: 'ok',
    });
    expect(updateReleaseApproval_.mock.calls[0][0]).toEqual({
      status: 2,
      comments: 'ok',
    });
    expect(r).toMatchObject({ id: 9, status: 'approved' });
  });
});
