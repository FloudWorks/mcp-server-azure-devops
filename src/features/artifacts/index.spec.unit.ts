import { deletePackageVersion, promotePackageVersion } from './index';

function conn() {
  const rest = {
    del: jest.fn().mockResolvedValue({ statusCode: 202, result: null }),
    update: jest.fn().mockResolvedValue({ statusCode: 200, result: {} }),
  };
  const core = { rest, createRequestOptions: jest.fn().mockReturnValue({}) };
  return {
    rest,
    connection: {
      serverUrl: 'https://works.natpos.local/tfs/NatPOSEnterprise/',
      getCoreApi: jest.fn().mockResolvedValue(core),
    } as never,
  };
}

describe('artifacts package routes', () => {
  it('builds the scoped npm delete URL on the collection', async () => {
    const { rest, connection } = conn();
    await deletePackageVersion(connection, {
      feed: 'natpos',
      protocolType: 'npm',
      packageName: '@floudworks/mcp-server-azure-devops',
      version: '0.1.47-tfvc.1',
    });
    const url = new URL(rest.del.mock.calls[0][0]);
    expect(url.pathname).toBe(
      '/tfs/NatPOSEnterprise/_apis/packaging/feeds/natpos/npm/%40floudworks/mcp-server-azure-devops/versions/0.1.47-tfvc.1',
    );
  });

  it('promotes a NuGet version to a view', async () => {
    const { rest, connection } = conn();
    await promotePackageVersion(connection, {
      feed: 'natpos',
      projectId: 'NatPOS Operational',
      protocolType: 'nuget',
      packageName: 'NatPOS.Core',
      version: '1.2.3',
      view: 'Release',
    });
    const [u, body] = rest.update.mock.calls[0];
    expect(new URL(u).pathname).toBe(
      '/tfs/NatPOSEnterprise/NatPOS%20Operational/_apis/packaging/feeds/natpos/nuget/packages/NatPOS.Core/versions/1.2.3',
    );
    expect(body).toEqual({
      views: { op: 'add', path: '/views/-', value: 'Release' },
    });
  });
});
