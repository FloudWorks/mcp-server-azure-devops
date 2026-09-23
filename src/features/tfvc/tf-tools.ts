import { mkdirSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { dirname } from 'path';
import { WebApi } from 'azure-devops-node-api';
import { z } from 'zod';
import { prepareChanges, TfvcChangeSchema } from './checkin';
import {
  ensureWorkspace,
  getPaths,
  listConflicts,
  parseChangesetId,
  pendingChanges,
  tf,
  toLocalPath,
  undoAll,
  withWorkspaceLock,
  workspaceName,
  workspaceRoot,
  collectionUrl,
} from './tf-runner';
import { linkChangesetToWorkItems } from './work-item-links';

// ---------- shared schema pieces ----------

const mode = z
  .enum(['preview', 'checkin', 'shelve'])
  .describe(
    'preview = show what would change and undo; checkin = check in immediately; shelve = save as a shelveset for review',
  );
const comment = z.string().describe('Check-in / shelveset comment');
const shelvesetName = z
  .string()
  .optional()
  .describe(
    'Shelveset name (required when mode is "shelve"; replaces an existing one with the same name)',
  );
const workItemIds = z
  .array(z.number())
  .optional()
  .describe('Work items to link to the resulting changeset (checkin mode)');
const conflictResolution = z
  .enum(['abort', 'keepTarget', 'takeSource'])
  .optional()
  .default('abort')
  .describe(
    'What to do with conflicts that cannot be auto-merged: abort = undo everything and report them (default), keepTarget = keep the target version, takeSource = take the source version',
  );

export const TfvcBranchSchema = z.object({
  sourcePath: z
    .string()
    .describe('Existing server path to branch from, e.g. "$/Project/Main"'),
  targetPath: z
    .string()
    .describe('New branch server path, e.g. "$/Project/Development/Feature-X"'),
  version: z
    .string()
    .optional()
    .describe(
      'Source version: "C1234" (changeset), "D2026-09-01" (date), "Lmylabel" (label). Default latest.',
    ),
  mode,
  comment,
  shelvesetName,
  workItemIds,
});

export const TfvcMergeCandidatesSchema = z.object({
  sourcePath: z.string().describe('Source branch server path'),
  targetPath: z.string().describe('Target branch server path'),
});

export const TfvcMergeSchema = z.object({
  sourcePath: z.string().describe('Source branch (or folder) server path'),
  targetPath: z.string().describe('Target branch (or folder) server path'),
  changesets: z
    .array(z.number())
    .optional()
    .describe(
      'Cherry-pick only these changesets (merged in ascending order). Omit to merge everything up to toChangeset/latest.',
    ),
  fromChangeset: z
    .number()
    .optional()
    .describe('Merge a range starting at this changeset'),
  toChangeset: z
    .number()
    .optional()
    .describe('Merge up to this changeset (default latest)'),
  baseless: z
    .boolean()
    .optional()
    .default(false)
    .describe('Baseless merge (no branch relationship)'),
  discard: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Record the merge without taking content (mark changesets as merged)',
    ),
  conflictResolution,
  mode,
  comment,
  shelvesetName,
  workItemIds,
});

export const TfvcShelveSchema = z.object({
  projectId: z.string().optional().describe('The ID or name of the project'),
  shelvesetName: z
    .string()
    .describe('Shelveset name (replaces an existing one with the same name)'),
  comment,
  changes: z
    .array(TfvcChangeSchema)
    .min(1)
    .describe('Files to add, edit or delete in the shelveset'),
});

export const TfvcCheckinShelvesetSchema = z.object({
  shelvesetName: z.string().describe('Shelveset name'),
  owner: z
    .string()
    .optional()
    .describe(
      'Shelveset owner (DOMAIN\\user). Default: the authenticated user',
    ),
  comment: z
    .string()
    .optional()
    .describe('Override the check-in comment (default: shelveset comment)'),
  workItemIds,
});

export const TfvcDeleteShelvesetSchema = z.object({
  shelvesetName: z.string().describe('Shelveset name'),
  owner: z
    .string()
    .optional()
    .describe(
      'Shelveset owner (DOMAIN\\user). Default: the authenticated user',
    ),
});

export const TfvcCreateLabelSchema = z.object({
  name: z.string().describe('Label name'),
  scope: z
    .string()
    .optional()
    .describe('Label scope server path (default: the project root of "path")'),
  path: z.string().describe('Server path to label (file or folder)'),
  version: z
    .string()
    .optional()
    .describe(
      'Version to label, e.g. "C1234" or "D2026-09-01". Default latest.',
    ),
  recursive: z
    .boolean()
    .optional()
    .default(true)
    .describe('Label everything under the folder'),
  comment: z.string().optional().describe('Label comment'),
  replace: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If the label already has these items, move it to the new version (/child:replace)',
    ),
});

export const TfvcDeleteLabelSchema = z.object({
  name: z.string().describe('Label name'),
  scope: z.string().describe('Label scope server path, e.g. "$/Project"'),
});

export const TfvcRollbackSchema = z.object({
  fromChangeset: z.number().describe('First changeset to roll back'),
  toChangeset: z
    .number()
    .optional()
    .describe('Last changeset to roll back (default: same as fromChangeset)'),
  path: z
    .string()
    .describe(
      'Branch or folder to roll back within, e.g. "$/Project/Master" (limits the rollback to this path)',
    ),
  keepMergeHistory: z
    .boolean()
    .optional()
    .default(false)
    .describe('Keep merge history (/keepmergehistory)'),
  conflictResolution,
  mode,
  comment,
  shelvesetName,
  workItemIds,
});

export const TfvcRenameSchema = z.object({
  path: z.string().describe('Existing server path (file or folder)'),
  newPath: z.string().describe('New server path (rename or move)'),
  mode,
  comment,
  shelvesetName,
  workItemIds,
});

export const TfvcWorkspaceSchema = z.object({
  reset: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Undo all pending changes in the MCP workspace (recovery after a failed operation)',
    ),
});

// ---------- helpers ----------

async function finish(
  connection: WebApi,
  targets: string[],
  opts: {
    mode: 'preview' | 'checkin' | 'shelve';
    comment: string;
    shelvesetName?: string;
    workItemIds?: number[];
  },
) {
  const pending = (await Promise.all(targets.map(pendingChanges)))
    .filter(Boolean)
    .join('\n');
  if (!pending || /no pending changes/i.test(pending)) {
    await undoAll();
    return { status: 'nothing-to-do', message: 'No changes were pending.' };
  }
  const locals = targets.map(toLocalPath);

  if (opts.mode === 'preview') {
    await undoAll();
    return { status: 'preview', pendingChanges: pending };
  }

  if (opts.mode === 'shelve') {
    if (!opts.shelvesetName)
      throw new Error('shelvesetName is required when mode is "shelve"');
    const r = await tf(
      'shelve',
      [
        opts.shelvesetName,
        ...locals,
        '/recursive',
        '/replace',
        `/comment:${opts.comment}`,
      ],
      { allowPartial: true },
    );
    await undoAll();
    return {
      status: 'shelved',
      shelveset: opts.shelvesetName,
      pendingChanges: pending,
      output: r.stdout.trim(),
    };
  }

  const r = await tf(
    'checkin',
    [...locals, '/recursive', `/comment:${opts.comment}`],
    {
      allowPartial: true,
    },
  );
  const changesetId = parseChangesetId(`${r.stdout}\n${r.stderr}`);
  if (!changesetId) {
    const rest = await pendingChanges(targets[0]);
    await undoAll();
    throw new Error(
      `Check-in did not complete: ${(r.stderr || r.stdout).trim()}\n${rest}`,
    );
  }
  const links = await linkChangesetToWorkItems(
    connection,
    changesetId,
    opts.workItemIds,
  );
  await undoAll();
  return {
    status: 'checked-in',
    changesetId,
    pendingChanges: pending,
    workItemsLinked: links.linked,
    workItemLinkErrors: links.failed.length ? links.failed : undefined,
  };
}

async function resolveConflicts(
  targetPath: string,
  strategy: 'abort' | 'keepTarget' | 'takeSource',
): Promise<string[] | undefined> {
  const local = toLocalPath(targetPath);
  await tf('resolve', [local, '/recursive', '/auto:AutoMerge'], {
    noThrow: true,
  });
  let conflicts = await listConflicts(targetPath);
  if (!conflicts.length) return undefined;
  if (strategy === 'abort') {
    await undoAll();
    return conflicts;
  }
  await tf(
    'resolve',
    [
      local,
      '/recursive',
      `/auto:${strategy === 'keepTarget' ? 'KeepYours' : 'TakeTheirs'}`,
    ],
    { noThrow: true },
  );
  conflicts = await listConflicts(targetPath);
  if (conflicts.length) {
    await undoAll();
    return conflicts;
  }
  return undefined;
}

function run<T>(fn: () => Promise<T>): Promise<T> {
  return withWorkspaceLock(async () => {
    await ensureWorkspace();
    await undoAll();
    try {
      return await fn();
    } catch (e) {
      await undoAll().catch(() => undefined);
      throw e;
    }
  });
}

// ---------- operations ----------

export function tfvcBranch(
  connection: WebApi,
  a: z.infer<typeof TfvcBranchSchema>,
) {
  return run(async () => {
    await tf('branch', [
      toLocalPath(a.sourcePath),
      toLocalPath(a.targetPath),
      '/noget',
      ...(a.version ? [`/version:${a.version}`] : []),
    ]);
    return finish(connection, [a.targetPath], a);
  });
}

export function tfvcMergeCandidates(
  a: z.infer<typeof TfvcMergeCandidatesSchema>,
) {
  return run(async () => {
    const r = await tf(
      'merge',
      [
        '/candidate',
        toLocalPath(a.sourcePath),
        toLocalPath(a.targetPath),
        '/recursive',
      ],
      { allowPartial: true },
    );
    const changesets = r.stdout
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*(\d+)\*?\s+(\S.*?)\s{2,}(\S.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({
        changesetId: Number(m[1]),
        user: m[2].trim(),
        date: m[3].trim(),
      }));
    return {
      sourcePath: a.sourcePath,
      targetPath: a.targetPath,
      changesets,
      output: r.stdout.trim(),
    };
  });
}

export function tfvcMerge(
  connection: WebApi,
  a: z.infer<typeof TfvcMergeSchema>,
) {
  return run(async () => {
    await getPaths([a.targetPath]);
    const src = toLocalPath(a.sourcePath);
    const tgt = toLocalPath(a.targetPath);
    const flags = [
      '/recursive',
      ...(a.baseless ? ['/baseless'] : []),
      ...(a.discard ? ['/discard'] : []),
    ];
    const versions: (string | undefined)[] = a.changesets?.length
      ? [...a.changesets].sort((x, y) => x - y).map((c) => `C${c}~C${c}`)
      : a.fromChangeset
        ? [`C${a.fromChangeset}~${a.toChangeset ? `C${a.toChangeset}` : 'T'}`]
        : [a.toChangeset ? `C${a.toChangeset}` : undefined];

    const outputs: string[] = [];
    for (const v of versions) {
      const r = await tf(
        'merge',
        [src, tgt, ...flags, ...(v ? [`/version:${v}`] : [])],
        {
          allowPartial: true,
        },
      );
      outputs.push(r.stdout.trim());
    }

    const conflicts = await resolveConflicts(
      a.targetPath,
      a.conflictResolution ?? 'abort',
    );
    if (conflicts) {
      return {
        status: 'conflicts',
        message:
          'Merge undone because of unresolved conflicts. Retry with conflictResolution keepTarget/takeSource, or resolve in Visual Studio.',
        conflicts,
        mergeOutput: outputs.join('\n'),
      };
    }
    return {
      ...(await finish(connection, [a.targetPath], a)),
      mergeOutput: outputs.join('\n'),
    };
  });
}

export function tfvcShelve(
  connection: WebApi,
  a: z.infer<typeof TfvcShelveSchema> & { projectId: string },
) {
  return run(async () => {
    const prepared = await prepareChanges(connection, a.projectId, a.changes);
    const existing = prepared
      .filter((p) => p.changeType !== 'add')
      .map((p) => p.path);
    await getPaths(existing);
    for (const p of prepared) {
      const local = toLocalPath(p.path);
      if (p.changeType === 'delete') {
        await tf('delete', [local]);
      } else if (p.changeType === 'edit') {
        await tf('checkout', [local]);
        if (existsSync(local)) chmodSync(local, 0o666);
        writeFileSync(local, p.bytes!);
      } else {
        mkdirSync(dirname(local), { recursive: true });
        writeFileSync(local, p.bytes!);
        await tf('add', [local]);
      }
    }
    const locals = prepared.map((p) => toLocalPath(p.path));
    const r = await tf(
      'shelve',
      [a.shelvesetName, ...locals, '/replace', `/comment:${a.comment}`],
      {
        allowPartial: true,
      },
    );
    await undoAll();
    return {
      status: 'shelved',
      shelveset: a.shelvesetName,
      changes: prepared.map(({ path, changeType, diff }) => ({
        path,
        changeType,
        diff,
      })),
      output: r.stdout.trim(),
    };
  });
}

export function tfvcCheckinShelveset(
  connection: WebApi,
  a: z.infer<typeof TfvcCheckinShelvesetSchema>,
) {
  return run(async () => {
    const spec = a.owner ? `${a.shelvesetName};${a.owner}` : a.shelvesetName;
    const r = await tf(
      'checkin',
      [`/shelveset:${spec}`, ...(a.comment ? [`/comment:${a.comment}`] : [])],
      { allowPartial: true },
    );
    const changesetId = parseChangesetId(`${r.stdout}\n${r.stderr}`);
    if (!changesetId)
      throw new Error(
        `Check-in did not complete: ${(r.stderr || r.stdout).trim()}`,
      );
    const links = await linkChangesetToWorkItems(
      connection,
      changesetId,
      a.workItemIds,
    );
    return {
      status: 'checked-in',
      changesetId,
      workItemsLinked: links.linked,
      workItemLinkErrors: links.failed.length ? links.failed : undefined,
      output: r.stdout.trim(),
    };
  });
}

export function tfvcDeleteShelveset(
  a: z.infer<typeof TfvcDeleteShelvesetSchema>,
) {
  return run(async () => {
    const spec = a.owner ? `${a.shelvesetName};${a.owner}` : a.shelvesetName;
    const r = await tf('shelve', ['/delete', spec], { collection: true });
    return { status: 'deleted', shelveset: spec, output: r.stdout.trim() };
  });
}

function projectRoot(serverPath: string): string {
  const parts = serverPath.slice(2).split('/');
  return `$/${parts[0]}`;
}

export function tfvcCreateLabel(a: z.infer<typeof TfvcCreateLabelSchema>) {
  return run(async () => {
    const scope = a.scope ?? projectRoot(a.path);
    const r = await tf(
      'label',
      [
        `${a.name}@${scope}`,
        a.path,
        ...(a.recursive ? ['/recursive'] : []),
        ...(a.version ? [`/version:${a.version}`] : []),
        ...(a.comment ? [`/comment:${a.comment}`] : []),
        ...(a.replace ? ['/child:replace'] : []),
      ],
      { collection: true },
    );
    return {
      status: 'labelled',
      label: `${a.name}@${scope}`,
      output: r.stdout.trim(),
    };
  });
}

export function tfvcDeleteLabel(a: z.infer<typeof TfvcDeleteLabelSchema>) {
  return run(async () => {
    const r = await tf('label', ['/delete', `${a.name}@${a.scope}`], {
      collection: true,
    });
    return {
      status: 'deleted',
      label: `${a.name}@${a.scope}`,
      output: r.stdout.trim(),
    };
  });
}

export function tfvcRollback(
  connection: WebApi,
  a: z.infer<typeof TfvcRollbackSchema>,
) {
  return run(async () => {
    await getPaths([a.path]);
    const to = a.toChangeset ?? a.fromChangeset;
    const r = await tf(
      'rollback',
      [
        `/changeset:C${a.fromChangeset}~C${to}`,
        toLocalPath(a.path),
        '/recursive',
        ...(a.keepMergeHistory ? ['/keepmergehistory'] : []),
      ],
      { allowPartial: true },
    );
    const conflicts = await resolveConflicts(
      a.path,
      a.conflictResolution ?? 'abort',
    );
    if (conflicts) {
      return {
        status: 'conflicts',
        message: 'Rollback undone because of unresolved conflicts.',
        conflicts,
        rollbackOutput: r.stdout.trim(),
      };
    }
    return {
      ...(await finish(connection, [a.path], a)),
      rollbackOutput: r.stdout.trim(),
    };
  });
}

export function tfvcRename(
  connection: WebApi,
  a: z.infer<typeof TfvcRenameSchema>,
) {
  return run(async () => {
    await getPaths([a.path]);
    const newLocal = toLocalPath(a.newPath);
    mkdirSync(dirname(newLocal), { recursive: true });
    await tf('rename', [toLocalPath(a.path), newLocal]);
    return finish(connection, [a.newPath], a);
  });
}

export function tfvcWorkspace(a: z.infer<typeof TfvcWorkspaceSchema>) {
  return run(async () => {
    if (a.reset) await undoAll();
    const info = await tf('workspaces', [workspaceName(), '/format:detailed'], {
      collection: true,
      noThrow: true,
    });
    const pending = await pendingChanges('$/');
    return {
      workspace: workspaceName(),
      localRoot: workspaceRoot(),
      collection: collectionUrl(),
      pendingChanges: pending || 'none',
      details: info.stdout.trim(),
    };
  });
}
