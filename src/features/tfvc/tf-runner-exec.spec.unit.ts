jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

let execMock: jest.Mock;

function respond(
  handler: (args: string[]) => {
    code?: number;
    stdout?: string;
    stderr?: string;
  },
) {
  execMock.mockImplementation(
    (_f: string, args: string[], _o: unknown, cb: Function) => {
      const r = handler(args);
      const err = r.code
        ? Object.assign(new Error('fail'), { code: r.code })
        : null;
      cb(err, r.stdout ?? '', r.stderr ?? '');
    },
  );
}

describe('tf runner execution', () => {
  const env = { ...process.env };
  let runner: typeof import('./tf-runner');

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    execMock = require('child_process').execFile as jest.Mock;
    execMock.mockReset();
    process.env = {
      ...env,
      AZURE_DEVOPS_TF_PATH: 'C:\\TF.exe',
      AZURE_DEVOPS_ORG_URL: 'https://works.local/tfs/Coll/',
      AZURE_DEVOPS_PAT: 'pat123',
      AZURE_DEVOPS_TFVC_WORKDIR: '/ws',
      AZURE_DEVOPS_TFVC_WORKSPACE: 'mcp',
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    runner = require('./tf-runner');
  });
  afterAll(() => {
    process.env = env;
  });

  it('adds /noprompt, /collection and a redacted /login', async () => {
    respond(() => ({ stdout: 'used pat123 ok' }));
    const r = await runner.tf('workspaces', ['mcp'], { collection: true });
    const args = execMock.mock.calls[0][1];
    expect(execMock.mock.calls[0][0]).toBe('C:\\TF.exe');
    expect(args).toEqual([
      'workspaces',
      'mcp',
      '/noprompt',
      '/collection:https://works.local/tfs/Coll',
      '/login:pat,pat123',
    ]);
    expect(r.stdout).toBe('used *** ok');
  });

  it('throws on failure unless partial success is allowed', async () => {
    respond(() => ({ code: 1, stdout: 'conflict' }));
    await expect(runner.tf('merge', [])).rejects.toThrow(/exit 1/);
    await expect(
      runner.tf('merge', [], { allowPartial: true }),
    ).resolves.toMatchObject({ exitCode: 1 });
    respond(() => ({ code: 100, stderr: 'boom' }));
    await expect(
      runner.tf('get', [], { noThrow: true }),
    ).resolves.toMatchObject({ exitCode: 100 });
  });

  it('uses Windows auth when requested', async () => {
    process.env.AZURE_DEVOPS_TF_AUTH = 'windows';
    respond(() => ({}));
    await runner.tf('status', []);
    expect(execMock.mock.calls[0][1]).not.toContainEqual(
      expect.stringContaining('/login'),
    );
  });

  it('creates the workspace and maps $/ when missing', async () => {
    respond((args) =>
      args[0] === 'workspaces' ? { stdout: 'No workspace matching mcp' } : {},
    );
    await runner.ensureWorkspace();
    const cmds = execMock.mock.calls.map((c) => c[1][0]);
    expect(cmds).toEqual(['workspaces', 'workspace', 'workfold']);
    expect(execMock.mock.calls[1][1]).toContain('/location:server');
    expect(execMock.mock.calls[2][1].slice(0, 4)).toEqual([
      'workfold',
      '/map',
      '$/',
      '/ws',
    ]);
  });

  it('reuses an existing workspace', async () => {
    respond((args) =>
      args[0] === 'workspaces'
        ? { stdout: 'Collection: x\nmcp   user  PC\n' }
        : {},
    );
    await runner.ensureWorkspace();
    expect(execMock.mock.calls.map((c) => c[1][0])).toEqual([
      'workspaces',
      'workfold',
    ]);
  });

  it('lists conflicts and pending changes', async () => {
    respond(() => ({ stdout: 'There are no conflicts to resolve.' }));
    expect(await runner.listConflicts('$/P/Master')).toEqual([]);
    respond(() => ({
      code: 1,
      stdout: '/ws/P/Master/a.cs: The item content has changed',
    }));
    expect(await runner.listConflicts('$/P/Master')).toHaveLength(1);
    respond(() => ({ stdout: 'a.cs  edit\n' }));
    expect(await runner.pendingChanges('$/P/Master')).toBe('a.cs  edit');
    await runner.getPaths(['$/P/Master'], 'C5');
    expect(execMock.mock.calls.at(-1)[1]).toContain('/version:C5');
    await runner.undoAll();
    expect(execMock.mock.calls.at(-1)[1].slice(0, 3)).toEqual([
      'undo',
      '$/',
      '/recursive',
    ]);
  });

  it('serialises workspace operations', async () => {
    const order: number[] = [];
    await Promise.all([
      runner.withWorkspaceLock(async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(1);
      }),
      runner.withWorkspaceLock(async () => {
        order.push(2);
      }),
    ]);
    expect(order).toEqual([1, 2]);
  });

  it('reports a missing configured TF path', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
    await expect(runner.findTfExe()).rejects.toThrow(/missing file/);
  });
});
