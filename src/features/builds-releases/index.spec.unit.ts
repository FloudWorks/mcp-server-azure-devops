import {
  handleBuildsReleasesRequest,
  isBuildsReleasesRequest,
  buildsReleasesTools,
} from './index';

const build = {
  getDefinitions: jest
    .fn()
    .mockResolvedValue([{ id: 1, name: 'CI', path: '\\', type: 2 }]),
  getBuild: jest
    .fn()
    .mockResolvedValue({ id: 3, status: 1, definition: { id: 1, name: 'CI' } }),
  getBuildChanges: jest
    .fn()
    .mockResolvedValue([
      { id: 'C5', message: 'm', author: { displayName: 'A' } },
    ]),
  queueBuild: jest.fn().mockResolvedValue({ id: 4, status: 32 }),
  updateBuild: jest.fn().mockResolvedValue({ id: 4, status: 4 }),
  getBuildLogs: jest.fn().mockResolvedValue([{ id: 1, lineCount: 10 }]),
  getBuildLogLines: jest.fn().mockResolvedValue(['a', 'b']),
};
const rm = {
  getReleaseDefinitions: jest
    .fn()
    .mockResolvedValue([{ id: 2, name: 'Deploy' }]),
  getReleases: jest
    .fn()
    .mockResolvedValue([{ id: 7, name: 'Release-7', status: 2 }]),
  getRelease: jest.fn().mockResolvedValue({
    id: 7,
    name: 'Release-7',
    status: 2,
    artifacts: [
      {
        alias: 'drop',
        definitionReference: { version: { id: '4', name: '20260923.1' } },
      },
    ],
    environments: [
      {
        id: 11,
        name: 'UAT',
        status: 1,
        preDeployApprovals: [
          {
            id: 99,
            approvalType: 1,
            status: 1,
            approver: { displayName: 'Arif' },
          },
          { id: 98, isAutomated: true },
        ],
      },
    ],
  }),
  createRelease: jest.fn().mockResolvedValue({ id: 7 }),
  updateReleaseEnvironment: jest
    .fn()
    .mockResolvedValue({ id: 11, name: 'UAT', status: 32 }),
  getApprovals: jest
    .fn()
    .mockResolvedValue([
      {
        id: 99,
        approvalType: 1,
        status: 1,
        release: { id: 7, name: 'Release-7' },
        releaseEnvironment: { id: 11, name: 'UAT' },
      },
    ]),
};
const connection = {
  getBuildApi: jest.fn().mockResolvedValue(build),
  getReleaseApi: jest.fn().mockResolvedValue(rm),
} as never;

const call = async (name: string, args: Record<string, unknown>) => {
  const r = await handleBuildsReleasesRequest(connection, {
    params: { name, arguments: { projectId: 'P', ...args } },
  } as never);
  const text = (r.content[0] as { text: string }).text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

describe('builds & releases routing', () => {
  it('recognises its tools', () => {
    for (const t of buildsReleasesTools)
      expect(
        isBuildsReleasesRequest({ params: { name: t.name } } as never),
      ).toBe(true);
  });

  it('handles build tools', async () => {
    expect(
      (await call('list_build_definitions', { name: 'CI' }))[0],
    ).toMatchObject({ id: 1, type: 'build' });
    expect(await call('get_build', { buildId: 3 })).toMatchObject({
      status: 'inProgress',
      changes: [{ id: 'C5', author: 'A' }],
    });
    await call('queue_build', {
      definitionId: 1,
      sourceBranch: '$/P/Master',
      sourceVersion: 'C5',
      parameters: { Config: 'Release' },
      demands: ['Agent.Name -equals B1'],
    });
    expect(build.queueBuild.mock.calls[0][0]).toMatchObject({
      definition: { id: 1 },
      sourceBranch: '$/P/Master',
      sourceVersion: 'C5',
      parameters: '{"Config":"Release"}',
    });
    expect(await call('cancel_build', { buildId: 4 })).toMatchObject({
      status: 'cancelling',
    });
    expect((await call('get_build_logs', { buildId: 4 }))[0]).toMatchObject({
      id: 1,
      lineCount: 10,
    });
    expect(await call('get_build_logs', { buildId: 4, logId: 1 })).toBe('a\nb');
  });

  it('handles release tools', async () => {
    expect((await call('list_release_definitions', {}))[0]).toMatchObject({
      name: 'Deploy',
    });
    expect(
      (await call('list_releases', { status: 'active' }))[0],
    ).toMatchObject({ status: 'active' });
    expect(rm.getReleases.mock.calls[0][5]).toBe(2);
    const rel = await call('get_release', { releaseId: 7 });
    expect(rel.environments[0].approvals).toEqual([
      expect.objectContaining({
        id: 99,
        type: 'preDeploy',
        status: 'pending',
        approver: 'Arif',
      }),
    ]);
    await call('create_release', {
      definitionId: 2,
      artifacts: [{ alias: 'drop', versionId: '4' }],
      variables: { Env: 'uat' },
    });
    expect(rm.createRelease.mock.calls[0][0]).toMatchObject({
      definitionId: 2,
      artifacts: [{ alias: 'drop', instanceReference: { id: '4' } }],
      variables: { Env: { value: 'uat' } },
    });
    expect(
      await call('deploy_release_environment', {
        releaseId: 7,
        environmentId: 11,
      }),
    ).toMatchObject({ status: 'queued' });
    expect(rm.updateReleaseEnvironment.mock.calls[0][0].status).toBe(2);
    await call('deploy_release_environment', {
      releaseId: 7,
      environmentId: 11,
      cancel: true,
    });
    expect(rm.updateReleaseEnvironment.mock.calls[1][0].status).toBe(8);
    expect((await call('list_release_approvals', {}))[0]).toMatchObject({
      id: 99,
      environment: 'UAT',
    });
    expect(rm.getApprovals.mock.calls[0][2]).toBe(1);
  });

  it('rejects unknown tools', async () => {
    await expect(call('nope', {})).rejects.toThrow(/Unknown/);
  });
});
