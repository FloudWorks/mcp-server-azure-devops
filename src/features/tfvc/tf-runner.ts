import { execFile } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { homedir, hostname } from 'os';
import { join } from 'path';

/**
 * Runs Visual Studio's tf.exe for TFVC operations the REST API does not offer
 * (branch, merge, shelve, label, rollback, rename). All work happens in a
 * dedicated server workspace owned by this MCP server, so it never touches the
 * user's own Visual Studio workspaces.
 *
 * Configuration (environment variables):
 *   AZURE_DEVOPS_TF_PATH         full path to TF.exe (auto-detected if unset)
 *   AZURE_DEVOPS_TFVC_WORKDIR    local folder for the workspace
 *                                (default ~/.azure-devops-mcp/tfvc/<collection>)
 *   AZURE_DEVOPS_TFVC_WORKSPACE  workspace name (default claude-mcp-<hostname>)
 *   AZURE_DEVOPS_TF_AUTH         "pat" (default when AZURE_DEVOPS_PAT is set)
 *                                or "windows" (use the signed-in Windows account)
 */

export interface TfResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class TfError extends Error {
  constructor(
    message: string,
    public readonly result?: TfResult,
  ) {
    super(message);
    this.name = 'TfError';
  }
}

const VS_TF_SUFFIX =
  'Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\TF.exe';

let cachedTfPath: string | undefined;

function run(
  file: string,
  args: string[],
  cwd: string | undefined,
  timeoutMs: number,
): Promise<TfResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const exitCode =
          error &&
          typeof (error as NodeJS.ErrnoException & { code?: unknown }).code ===
            'number'
            ? (error as unknown as { code: number }).code
            : error
              ? -1
              : 0;
        resolve({
          exitCode,
          stdout: String(stdout ?? ''),
          stderr:
            String(stderr ?? '') +
            (error && exitCode === -1 ? error.message : ''),
        });
      },
    );
  });
}

export async function findTfExe(): Promise<string> {
  if (cachedTfPath) return cachedTfPath;
  const configured = process.env.AZURE_DEVOPS_TF_PATH;
  if (configured) {
    if (!existsSync(configured)) {
      throw new TfError(
        `AZURE_DEVOPS_TF_PATH points to a missing file: ${configured}`,
      );
    }
    return (cachedTfPath = configured);
  }
  if (process.platform !== 'win32') {
    throw new TfError(
      'TFVC branch/merge/shelve tools need Visual Studio TF.exe (Windows). Set AZURE_DEVOPS_TF_PATH if it is installed elsewhere.',
    );
  }

  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const vswhere = join(
    pf86,
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  );
  if (existsSync(vswhere)) {
    const r = await run(
      vswhere,
      [
        '-latest',
        '-products',
        '*',
        '-prerelease',
        '-find',
        VS_TF_SUFFIX.replace('TF.exe', '**\\TF.exe'),
      ],
      undefined,
      30_000,
    );
    const hit = r.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().endsWith('tf.exe') && existsSync(l));
    if (hit) return (cachedTfPath = hit);
  }

  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  for (const base of [pf, pf86]) {
    for (const ver of ['18', '2026', '2022', '2019', '2017']) {
      for (const sku of [
        'Enterprise',
        'Professional',
        'Community',
        'BuildTools',
        'TeamExplorer',
      ]) {
        const candidate = join(
          base,
          'Microsoft Visual Studio',
          ver,
          sku,
          VS_TF_SUFFIX,
        );
        if (existsSync(candidate)) return (cachedTfPath = candidate);
      }
    }
  }
  throw new TfError(
    'Could not find TF.exe. Install Visual Studio (with Team Explorer) or set AZURE_DEVOPS_TF_PATH.',
  );
}

export function collectionUrl(): string {
  const url = process.env.AZURE_DEVOPS_ORG_URL;
  if (!url) throw new TfError('AZURE_DEVOPS_ORG_URL is not set');
  return url.replace(/\/+$/, '');
}

function loginArgs(): string[] {
  const mode =
    process.env.AZURE_DEVOPS_TF_AUTH ??
    (process.env.AZURE_DEVOPS_PAT ? 'pat' : 'windows');
  if (mode === 'pat') {
    const pat = process.env.AZURE_DEVOPS_PAT;
    if (!pat)
      throw new TfError(
        'AZURE_DEVOPS_TF_AUTH=pat but AZURE_DEVOPS_PAT is not set',
      );
    return [`/login:pat,${pat}`];
  }
  return [];
}

export function workspaceName(): string {
  const raw =
    process.env.AZURE_DEVOPS_TFVC_WORKSPACE ?? `claude-mcp-${hostname()}`;
  return raw.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 64);
}

export function workspaceRoot(): string {
  const configured = process.env.AZURE_DEVOPS_TFVC_WORKDIR;
  if (configured) return configured;
  const slug = collectionUrl()
    .replace(/^https?:\/\//, '')
    .replace(/[^A-Za-z0-9]+/g, '_');
  return join(homedir(), '.azure-devops-mcp', 'tfvc', slug);
}

/** Map a server path ($/Project/...) to its local path in the MCP workspace. */
export function toLocalPath(serverPath: string): string {
  if (!serverPath.startsWith('$/')) {
    throw new TfError(
      `${serverPath} must be a TFVC server path starting with $/`,
    );
  }
  const parts = serverPath.slice(2).split('/').filter(Boolean);
  return join(workspaceRoot(), ...parts);
}

/** Redact the PAT from anything we echo back. */
export function redact(text: string): string {
  const pat = process.env.AZURE_DEVOPS_PAT;
  return pat ? text.split(pat).join('***') : text;
}

export interface TfOptions {
  /** Add /collection:<url> (for commands not run inside the workspace) */
  collection?: boolean;
  /** Treat exit code 1 (partial success, e.g. merge conflicts) as success */
  allowPartial?: boolean;
  /** Don't throw on failure; return the result */
  noThrow?: boolean;
  timeoutMs?: number;
}

/**
 * Run a tf.exe command inside the MCP workspace folder.
 * Exit codes: 0 = success, 1 = partial success, 100 = failure.
 */
export async function tf(
  command: string,
  args: string[],
  opts: TfOptions = {},
): Promise<TfResult> {
  const exe = await findTfExe();
  const root = workspaceRoot();
  mkdirSync(root, { recursive: true });
  const full = [
    command,
    ...args,
    '/noprompt',
    ...(opts.collection ? [`/collection:${collectionUrl()}`] : []),
    ...loginArgs(),
  ];
  const result = await run(exe, full, root, opts.timeoutMs ?? 30 * 60_000);
  result.stdout = redact(result.stdout);
  result.stderr = redact(result.stderr);
  const ok =
    result.exitCode === 0 || (opts.allowPartial && result.exitCode === 1);
  if (!ok && !opts.noThrow) {
    throw new TfError(
      `tf ${command} failed (exit ${result.exitCode}): ${(result.stderr || result.stdout).trim()}`,
      result,
    );
  }
  return result;
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialize workspace operations; tf.exe workspaces are not safe to share concurrently. */
export function withWorkspaceLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

let workspaceReady = false;

/**
 * Create the dedicated server workspace if needed. It maps $/ to the
 * workspace root so that every server path has a predictable local path;
 * nothing is downloaded until an operation asks for specific paths.
 */
export async function ensureWorkspace(): Promise<void> {
  if (workspaceReady) return;
  const name = workspaceName();
  const root = workspaceRoot();
  mkdirSync(root, { recursive: true });
  const existing = await tf('workspaces', [name, '/format:brief'], {
    collection: true,
    noThrow: true,
  });
  const exists =
    existing.exitCode === 0 &&
    existing.stdout
      .split(/\r?\n/)
      .some((l) => l.trim().toLowerCase().startsWith(name.toLowerCase()));
  if (!exists) {
    await tf(
      'workspace',
      [
        '/new',
        name,
        '/location:server',
        '/permission:Private',
        `/comment:Workspace used by the Azure DevOps MCP server`,
      ],
      { collection: true },
    );
  }
  // Ensure $/ -> root mapping (idempotent)
  await tf('workfold', ['/map', '$/', root, `/workspace:${name}`], {
    collection: true,
  });
  workspaceReady = true;
}

/** Undo every pending change in the MCP workspace (clean slate). */
export async function undoAll(): Promise<void> {
  await tf('undo', ['$/', '/recursive'], { noThrow: true });
}

/** Get latest (or a version) of the given server paths into the workspace. */
export async function getPaths(
  paths: string[],
  version?: string,
): Promise<void> {
  if (!paths.length) return;
  await tf(
    'get',
    [
      ...paths.map(toLocalPath),
      '/recursive',
      ...(version ? [`/version:${version}`] : []),
    ],
    { allowPartial: true },
  );
}

export function parseChangesetId(output: string): number | undefined {
  const m = output.match(/Changeset #(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

/** Return the unresolved conflicts under a path (empty array if none). */
export async function listConflicts(serverPath: string): Promise<string[]> {
  const r = await tf(
    'resolve',
    [toLocalPath(serverPath), '/recursive', '/preview'],
    {
      noThrow: true,
    },
  );
  const text = `${r.stdout}\n${r.stderr}`;
  if (/no conflicts/i.test(text)) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(resolving|conflict|there (is|are))/i.test(l) &&
        l.includes(':'),
    );
}

export async function pendingChanges(serverPath: string): Promise<string> {
  const r = await tf(
    'status',
    [toLocalPath(serverPath), '/recursive', '/format:brief'],
    {
      noThrow: true,
    },
  );
  return r.stdout.trim();
}
