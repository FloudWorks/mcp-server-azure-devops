import { WebApi } from 'azure-devops-node-api';
import {
  TfvcBranch,
  TfvcChange,
  TfvcVersionDescriptor,
  TfvcVersionType,
  VersionControlChangeType,
  VersionControlRecursionType,
} from 'azure-devops-node-api/interfaces/TfvcInterfaces';
import { z } from 'zod';
import { AzureDevOpsResourceNotFoundError } from '../../shared/errors';
import {
  TfvcGetItemsSchema,
  TfvcGetFileContentSchema,
  TfvcListChangesetsSchema,
  TfvcGetChangesetSchema,
  TfvcListBranchesSchema,
  TfvcListShelvesetsSchema,
  TfvcGetShelvesetSchema,
  TfvcListLabelsSchema,
} from './schemas';

type WithProject<T> = T & { projectId: string };

const VERSION_TYPES: Record<string, TfvcVersionType> = {
  changeset: TfvcVersionType.Changeset,
  shelveset: TfvcVersionType.Shelveset,
  date: TfvcVersionType.Date,
  latest: TfvcVersionType.Latest,
  tip: TfvcVersionType.Tip,
};

const RECURSION: Record<string, VersionControlRecursionType> = {
  none: VersionControlRecursionType.None,
  oneLevel: VersionControlRecursionType.OneLevel,
  full: VersionControlRecursionType.Full,
};

function toVersionDescriptor(
  version?: string,
  versionType?: string,
): TfvcVersionDescriptor | undefined {
  if (!version && (!versionType || versionType === 'latest')) return undefined;
  return {
    version,
    versionType: VERSION_TYPES[versionType ?? 'changeset'],
  };
}

/** Turn the ChangeType bit flags into readable names, e.g. "edit, merge". */
function describeChangeType(changeType?: number): string | undefined {
  if (changeType === undefined) return undefined;
  const names = Object.entries(VersionControlChangeType)
    .filter(
      ([, v]) =>
        typeof v === 'number' && v !== 0 && (changeType & (v as number)) === v,
    )
    .map(([k]) => k.toLowerCase());
  return names.length ? names.join(', ') : 'none';
}

function simplifyChange(c: TfvcChange) {
  return {
    path: c.item?.path,
    changeType: describeChangeType(c.changeType),
    isFolder: c.item?.isFolder || undefined,
    version: c.item?.version,
    sourceServerItem: c.sourceServerItem,
  };
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

export async function tfvcGetItems(
  connection: WebApi,
  args: WithProject<z.infer<typeof TfvcGetItemsSchema>>,
) {
  const tfvc = await connection.getTfvcApi();
  const scopePath = args.scopePath ?? `$/${args.projectId}`;
  const items = await tfvc.getItems(
    args.projectId,
    scopePath,
    RECURSION[args.recursionLevel ?? 'oneLevel'],
    false,
    toVersionDescriptor(args.version, args.versionType),
  );
  return {
    scopePath,
    count: items.length,
    items: items.map((i) => ({
      path: i.path,
      isFolder: i.isFolder || false,
      isBranch: i.isBranch || undefined,
      size: i.size,
      changesetVersion: i.version,
      changeDate: i.changeDate,
    })),
  };
}

export async function tfvcGetFileContent(
  connection: WebApi,
  args: WithProject<z.infer<typeof TfvcGetFileContentSchema>>,
) {
  const tfvc = await connection.getTfvcApi();
  const descriptor = toVersionDescriptor(args.version, args.versionType);
  const meta = await tfvc.getItem(
    args.path,
    args.projectId,
    undefined,
    false,
    undefined,
    VersionControlRecursionType.None,
    descriptor,
    false,
  );
  if (!meta) {
    throw new AzureDevOpsResourceNotFoundError(
      `TFVC path '${args.path}' not found`,
    );
  }
  if (meta.isFolder) {
    throw new Error(
      `'${args.path}' is a folder. Use tfvc_get_items to list it.`,
    );
  }
  const stream = await tfvc.getItemContent(
    args.path,
    args.projectId,
    undefined,
    false,
    undefined,
    VersionControlRecursionType.None,
    descriptor,
    true,
  );
  const content = await streamToString(stream);
  return {
    path: meta.path,
    changesetVersion: meta.version,
    changeDate: meta.changeDate,
    size: meta.size,
    isBinary: meta.contentMetadata?.isBinary,
    content,
  };
}

export async function tfvcListChangesets(
  connection: WebApi,
  args: WithProject<z.infer<typeof TfvcListChangesetsSchema>>,
) {
  const tfvc = await connection.getTfvcApi();
  const changesets = await tfvc.getChangesets(
    args.projectId,
    args.maxCommentLength ?? 500,
    args.skip,
    args.top ?? 25,
    'id desc',
    {
      itemPath: args.itemPath,
      author: args.author,
      fromDate: args.fromDate,
      toDate: args.toDate,
      fromId: args.fromId,
      toId: args.toId,
    },
  );
  return changesets.map((c) => ({
    changesetId: c.changesetId,
    author: c.author?.displayName,
    checkedInBy:
      c.checkedInBy?.displayName !== c.author?.displayName
        ? c.checkedInBy?.displayName
        : undefined,
    createdDate: c.createdDate,
    comment: c.comment,
    commentTruncated: c.commentTruncated || undefined,
  }));
}

export async function tfvcGetChangeset(
  connection: WebApi,
  args: WithProject<z.infer<typeof TfvcGetChangesetSchema>>,
) {
  const tfvc = await connection.getTfvcApi();
  const cs = await tfvc.getChangeset(
    args.changesetId,
    args.projectId,
    0,
    true,
    args.includeWorkItems ?? true,
  );
  if (!cs) {
    throw new AzureDevOpsResourceNotFoundError(
      `Changeset ${args.changesetId} not found`,
    );
  }
  let changes: ReturnType<typeof simplifyChange>[] | undefined;
  if (args.includeChanges ?? true) {
    const paged = await tfvc.getChangesetChanges(
      args.changesetId,
      0,
      args.maxChangeCount ?? 200,
    );
    changes = (paged ?? []).map(simplifyChange);
  }
  return {
    changesetId: cs.changesetId,
    author: cs.author?.displayName,
    checkedInBy: cs.checkedInBy?.displayName,
    createdDate: cs.createdDate,
    comment: cs.comment,
    policyOverride: cs.policyOverride?.comment ? cs.policyOverride : undefined,
    checkinNotes: cs.checkinNotes?.length ? cs.checkinNotes : undefined,
    workItems: cs.workItems?.map((w) => ({
      id: w.id,
      title: w.title,
      type: w.workItemType,
      state: w.state,
      assignedTo: w.assignedTo,
    })),
    changeCount: changes?.length,
    changes,
  };
}

export async function tfvcListBranches(
  connection: WebApi,
  args: WithProject<z.infer<typeof TfvcListBranchesSchema>>,
) {
  const tfvc = await connection.getTfvcApi();
  const simplify = (b: TfvcBranch): Record<string, unknown> => ({
    path: b.path,
    owner: b.owner?.displayName,
    createdDate: b.createdDate,
    description: b.description || undefined,
    parent: b.parent?.path,
    isDeleted: b.isDeleted || undefined,
    children: b.children?.length ? b.children.map(simplify) : undefined,
  });
  if (args.path) {
    const branch = await tfvc.getBranch(
      args.path,
      args.projectId,
      true,
      args.includeChildren ?? true,
    );
    return simplify(branch);
  }
  const branches = await tfvc.getBranches(
    args.projectId,
    true,
    args.includeChildren ?? true,
    args.includeDeleted ?? false,
    false,
  );
  return branches.map(simplify);
}

export async function tfvcListShelvesets(
  connection: WebApi,
  args: z.infer<typeof TfvcListShelvesetsSchema>,
) {
  const tfvc = await connection.getTfvcApi();
  const shelvesets = await tfvc.getShelvesets(
    { owner: args.owner, name: args.name, maxCommentLength: 500 },
    args.top ?? 50,
    args.skip,
  );
  return shelvesets.map((s) => ({
    id: s.id,
    name: s.name,
    owner: s.owner?.displayName,
    createdDate: s.createdDate,
    comment: s.comment,
  }));
}

export async function tfvcGetShelveset(
  connection: WebApi,
  args: z.infer<typeof TfvcGetShelvesetSchema>,
) {
  const tfvc = await connection.getTfvcApi();
  const s = await tfvc.getShelveset(args.shelvesetId, {
    includeDetails: true,
    includeWorkItems: args.includeWorkItems ?? true,
    maxChangeCount: 0,
  });
  if (!s) {
    throw new AzureDevOpsResourceNotFoundError(
      `Shelveset '${args.shelvesetId}' not found`,
    );
  }
  let changes: ReturnType<typeof simplifyChange>[] | undefined;
  if (args.includeChanges ?? true) {
    const raw = await tfvc.getShelvesetChanges(
      args.shelvesetId,
      args.maxChangeCount ?? 200,
    );
    changes = (raw ?? []).map(simplifyChange);
  }
  return {
    id: s.id,
    name: s.name,
    owner: s.owner?.displayName,
    createdDate: s.createdDate,
    comment: s.comment,
    policyOverride: s.policyOverride?.comment ? s.policyOverride : undefined,
    notes: s.notes?.length ? s.notes : undefined,
    workItems: s.workItems?.map((w) => ({
      id: w.id,
      title: w.title,
      type: w.workItemType,
      state: w.state,
      assignedTo: w.assignedTo,
    })),
    changeCount: changes?.length,
    changes,
  };
}

export async function tfvcListLabels(
  connection: WebApi,
  args: WithProject<z.infer<typeof TfvcListLabelsSchema>>,
) {
  const tfvc = await connection.getTfvcApi();
  const labels = await tfvc.getLabels(
    {
      name: args.name,
      owner: args.owner,
      labelScope: args.labelScope,
      itemLabelFilter: args.itemLabelFilter,
    },
    args.projectId,
    args.top ?? 50,
    args.skip,
  );
  return labels.map((l) => ({
    id: l.id,
    name: l.name,
    labelScope: l.labelScope,
    owner: l.owner?.displayName,
    modifiedDate: l.modifiedDate,
    description: l.description || undefined,
  }));
}
