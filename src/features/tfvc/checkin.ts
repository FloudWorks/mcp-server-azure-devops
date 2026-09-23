import { WebApi } from 'azure-devops-node-api';
import { VersionControlRecursionType } from 'azure-devops-node-api/interfaces/TfvcInterfaces';
import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';
import {
  CP_BINARY,
  CP_UTF8,
  decodeText,
  detectBom,
  encodeText,
} from './encoding';
import { linkChangesetToWorkItems } from './work-item-links';

export const TfvcChangeSchema = z
  .object({
    path: z
      .string()
      .describe('Full TFVC server path, e.g. "$/Project/Master/src/File.cs"'),
    changeType: z
      .enum(['add', 'edit', 'delete'])
      .describe(
        'add = new file, edit = change existing file, delete = remove file',
      ),
    content: z
      .string()
      .optional()
      .describe(
        'Full new text content (add, or edit replacing the whole file)',
      ),
    contentBase64: z
      .string()
      .optional()
      .describe('Full new content as base64 (for binary files)'),
    search: z
      .string()
      .optional()
      .describe(
        'edit only: exact text to find in the current file (must match exactly once unless replaceAll)',
      ),
    replace: z
      .string()
      .optional()
      .describe('edit only: replacement for "search"'),
    replaceAll: z
      .boolean()
      .optional()
      .describe(
        'edit only: replace every occurrence of "search" instead of requiring exactly one',
      ),
    expectedVersion: z
      .number()
      .optional()
      .describe(
        'edit/delete only: the changeset version you based the change on. The check-in is refused if the file changed since (optimistic locking).',
      ),
  })
  .describe('One file change');

export const TfvcCreateChangesetSchema = z.object({
  projectId: z.string().optional().describe('The ID or name of the project'),
  comment: z.string().describe('Check-in comment'),
  changes: z
    .array(TfvcChangeSchema)
    .min(1)
    .describe('Files to add, edit or delete'),
  workItemIds: z
    .array(z.number())
    .optional()
    .describe('Work items to link to the changeset ("Fixed in Changeset")'),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe('Validate and return a diff preview without checking in'),
});

export type ChangeInput = z.infer<typeof TfvcChangeSchema>;

interface CurrentItem {
  version: number;
  codePage: number;
  exists: boolean;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

async function getCurrentItems(
  connection: WebApi,
  projectId: string,
  paths: string[],
): Promise<Map<string, CurrentItem>> {
  const tfvc = await connection.getTfvcApi();
  const result = new Map<string, CurrentItem>();
  if (!paths.length) return result;
  const batches = await tfvc.getItemsBatch(
    {
      includeContentMetadata: true,
      itemDescriptors: paths.map((path) => ({
        path,
        recursionLevel: VersionControlRecursionType.None,
      })),
    },
    projectId,
  );
  paths.forEach((path, i) => {
    const item = batches?.[i]?.[0];
    if (item && !item.isFolder) {
      result.set(path.toLowerCase(), {
        version: item.version ?? 0,
        codePage: item.contentMetadata?.encoding ?? CP_UTF8,
        exists: true,
      });
    }
  });
  return result;
}

async function readBytes(
  connection: WebApi,
  projectId: string,
  path: string,
): Promise<Buffer> {
  const tfvc = await connection.getTfvcApi();
  const stream = await tfvc.getItemContent(
    path,
    projectId,
    undefined,
    false,
    undefined,
    VersionControlRecursionType.None,
    undefined,
    true,
  );
  return streamToBuffer(stream);
}

function applySearchReplace(text: string, c: ChangeInput): string {
  const search = c.search!;
  const replace = c.replace ?? '';
  // Tolerate CRLF files when the caller sent LF text
  const variants =
    text.includes('\r\n') && !search.includes('\r\n')
      ? [search, search.replace(/\n/g, '\r\n')]
      : [search];
  for (const s of variants) {
    const count = text.split(s).length - 1;
    if (count === 0) continue;
    if (count > 1 && !c.replaceAll) {
      throw new Error(
        `"search" text matches ${count} places in ${c.path}. Make it more specific or set replaceAll.`,
      );
    }
    const r = s === search ? replace : replace.replace(/\n/g, '\r\n');
    return text.split(s).join(r);
  }
  throw new Error(`"search" text was not found in ${c.path}`);
}

export interface PreparedChange {
  path: string;
  changeType: 'add' | 'edit' | 'delete';
  /** Current server version (edit/delete) */
  baseVersion?: number;
  codePage?: number;
  /** New file bytes (add/edit) */
  bytes?: Buffer;
  diff?: string;
}

/**
 * Validate the requested changes against the server and compute the new file
 * bytes (preserving each file's encoding). Shared by the REST check-in and
 * the tf.exe shelve tool.
 */
export async function prepareChanges(
  connection: WebApi,
  projectId: string,
  changes: ChangeInput[],
): Promise<PreparedChange[]> {
  const seen = new Set<string>();
  for (const c of changes) {
    const key = c.path.toLowerCase();
    if (seen.has(key)) throw new Error(`${c.path} appears more than once`);
    seen.add(key);
    if (!c.path.startsWith('$/')) {
      throw new Error(`${c.path} must be a TFVC server path starting with $/`);
    }
    if (
      c.changeType === 'add' &&
      c.content === undefined &&
      c.contentBase64 === undefined
    ) {
      throw new Error(`add ${c.path}: provide content or contentBase64`);
    }
    if (
      c.changeType === 'edit' &&
      c.content === undefined &&
      c.contentBase64 === undefined &&
      c.search === undefined
    ) {
      throw new Error(
        `edit ${c.path}: provide content, contentBase64 or search/replace`,
      );
    }
  }

  const current = await getCurrentItems(
    connection,
    projectId,
    changes.map((c) => c.path),
  );
  const prepared: PreparedChange[] = [];

  for (const c of changes) {
    const cur = current.get(c.path.toLowerCase());
    if (c.changeType === 'add') {
      if (cur) {
        throw new Error(
          `add ${c.path}: file already exists (version ${cur.version}). Use edit.`,
        );
      }
      const isBinary = c.contentBase64 !== undefined;
      const bytes = isBinary
        ? Buffer.from(c.contentBase64!, 'base64')
        : Buffer.from(c.content!, 'utf8');
      prepared.push({
        path: c.path,
        changeType: 'add',
        codePage: isBinary ? CP_BINARY : CP_UTF8,
        bytes,
        diff: isBinary
          ? `(binary, ${bytes.length} bytes)`
          : createTwoFilesPatch('/dev/null', c.path, '', c.content!),
      });
      continue;
    }

    if (!cur) throw new Error(`${c.changeType} ${c.path}: file not found`);
    if (c.expectedVersion !== undefined && c.expectedVersion !== cur.version) {
      throw new Error(
        `${c.path} has changed since version ${c.expectedVersion} (now ${cur.version}). Re-read it and try again.`,
      );
    }

    if (c.changeType === 'delete') {
      prepared.push({
        path: c.path,
        changeType: 'delete',
        baseVersion: cur.version,
      });
      continue;
    }

    let bytes: Buffer;
    let diff: string;
    if (c.contentBase64 !== undefined) {
      bytes = Buffer.from(c.contentBase64, 'base64');
      diff = `(binary, ${bytes.length} bytes)`;
    } else {
      const oldBytes = await readBytes(connection, projectId, c.path);
      const codePage =
        cur.codePage === CP_BINARY
          ? (detectBom(oldBytes) ?? CP_UTF8)
          : cur.codePage;
      const decoded = decodeText(oldBytes, codePage);
      const newText =
        c.search !== undefined
          ? applySearchReplace(decoded.text, c)
          : c.content!;
      if (newText === decoded.text)
        throw new Error(`edit ${c.path}: no changes`);
      bytes = encodeText(newText, decoded.codePage, decoded.bom);
      diff = createTwoFilesPatch(
        c.path,
        c.path,
        decoded.text,
        newText,
        `C${cur.version}`,
        'pending',
      );
    }
    prepared.push({
      path: c.path,
      changeType: 'edit',
      baseVersion: cur.version,
      codePage: cur.codePage,
      bytes,
      diff,
    });
  }
  return prepared;
}

export async function tfvcCreateChangeset(
  connection: WebApi,
  args: z.infer<typeof TfvcCreateChangesetSchema> & { projectId: string },
) {
  const prepared = await prepareChanges(
    connection,
    args.projectId,
    args.changes,
  );

  if (args.dryRun) {
    return {
      dryRun: true,
      comment: args.comment,
      changes: prepared.map(({ path, changeType, baseVersion, diff }) => ({
        path,
        changeType,
        baseVersion,
        diff,
      })),
    };
  }

  const restChanges = prepared.map((p) => {
    if (p.changeType === 'delete') {
      return {
        changeType: 'delete',
        item: { path: p.path, version: p.baseVersion },
      };
    }
    return {
      changeType: p.changeType,
      item: {
        path: p.path,
        ...(p.baseVersion !== undefined ? { version: p.baseVersion } : {}),
        contentMetadata: { encoding: p.codePage },
      },
      newContent: {
        content: p.bytes!.toString('base64'),
        contentType: 'base64Encoded',
      },
    };
  });

  const tfvc = await connection.getTfvcApi();
  // Enum values are sent as their REST names ("add", "edit", ...).
  const ref = await tfvc.createChangeset(
    { comment: args.comment, changes: restChanges } as never,
    args.projectId,
  );
  const changesetId = ref.changesetId!;
  const links = await linkChangesetToWorkItems(
    connection,
    changesetId,
    args.workItemIds,
  );
  return {
    changesetId,
    comment: args.comment,
    changes: prepared.map(({ path, changeType }) => ({ path, changeType })),
    workItemsLinked: links.linked,
    workItemLinkErrors: links.failed.length ? links.failed : undefined,
  };
}
