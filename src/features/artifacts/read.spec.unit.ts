import {
  handleArtifactsRequest,
  isArtifactsRequest,
  artifactsTools,
} from './index';

const rest = {
  get: jest.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/feeds')) {
      return {
        statusCode: 200,
        result: {
          value: [{ id: 'f1', name: 'natpos', views: [{ name: 'Release' }] }],
        },
      };
    }
    if (u.pathname.endsWith('/versions')) {
      return {
        statusCode: 200,
        result: {
          value: [{ version: '0.1.47-tfvc.1', isLatest: true, views: [] }],
        },
      };
    }
    return {
      statusCode: 200,
      result: {
        value: [
          {
            id: 'p1',
            name: '@floudworks/mcp-server-azure-devops',
            protocolType: 'Npm',
            versions: [{ version: '0.1.47-tfvc.1' }],
          },
        ],
      },
    };
  }),
  del: jest.fn().mockResolvedValue({ statusCode: 404 }),
  update: jest.fn(),
};
const connection = {
  serverUrl: 'https://works.natpos.local/tfs/NatPOSEnterprise',
  getCoreApi: jest
    .fn()
    .mockResolvedValue({ rest, createRequestOptions: () => ({}) }),
} as never;

const call = async (name: string, args: Record<string, unknown>) => {
  const r = await handleArtifactsRequest(connection, {
    params: { name, arguments: args },
  } as never);
  return JSON.parse((r.content[0] as { text: string }).text);
};

describe('artifacts read tools', () => {
  it('recognises its tools', () => {
    for (const t of artifactsTools)
      expect(isArtifactsRequest({ params: { name: t.name } } as never)).toBe(
        true,
      );
  });

  it('lists feeds, packages and versions', async () => {
    expect((await call('list_feeds', {}))[0]).toMatchObject({
      name: 'natpos',
      views: ['Release'],
    });
    const pk = await call('list_packages', {
      feed: 'natpos',
      protocolType: 'npm',
    });
    expect(pk[0]).toMatchObject({ latestVersion: '0.1.47-tfvc.1' });
    expect(
      new URL(rest.get.mock.calls[1][0]).searchParams.get('protocolType'),
    ).toBe('npm');
    const v = await call('get_package_versions', {
      feed: 'natpos',
      packageName: '@floudworks/mcp-server-azure-devops',
    });
    expect(v.versions[0]).toMatchObject({
      version: '0.1.47-tfvc.1',
      isLatest: true,
    });
    expect(new URL(rest.get.mock.calls.at(-1)![0]).pathname).toContain(
      '/Packages/p1/versions',
    );
  });

  it('reports a missing package and failed delete', async () => {
    await expect(
      call('get_package_versions', { feed: 'natpos', packageName: 'nope' }),
    ).rejects.toThrow(/not found/);
    await expect(
      call('delete_package_version', {
        feed: 'natpos',
        protocolType: 'nuget',
        packageName: 'X',
        version: '1',
      }),
    ).rejects.toThrow(/HTTP 404/);
    await expect(call('nope', {})).rejects.toThrow(/Unknown/);
  });
});
