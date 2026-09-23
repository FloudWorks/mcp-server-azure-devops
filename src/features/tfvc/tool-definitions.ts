import { toJsonSchema } from '../../shared/utils/to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
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
import { TfvcCreateChangesetSchema } from './checkin';
import {
  TfvcBranchSchema,
  TfvcMergeCandidatesSchema,
  TfvcMergeSchema,
  TfvcShelveSchema,
  TfvcCheckinShelvesetSchema,
  TfvcDeleteShelvesetSchema,
  TfvcCreateLabelSchema,
  TfvcDeleteLabelSchema,
  TfvcRollbackSchema,
  TfvcRenameSchema,
  TfvcWorkspaceSchema,
} from './tf-tools';

export const tfvcTools: ToolDefinition[] = [
  {
    name: 'tfvc_get_items',
    description:
      'List files and folders under a TFVC (Team Foundation Version Control) server path such as "$/Project/Main". Optionally at a past changeset, date or shelveset.',
    inputSchema: toJsonSchema(TfvcGetItemsSchema),
  },
  {
    name: 'tfvc_get_file_content',
    description:
      'Get the text content of a file in TFVC by server path ("$/Project/..."), at latest or a specific changeset, date or shelveset.',
    inputSchema: toJsonSchema(TfvcGetFileContentSchema),
  },
  {
    name: 'tfvc_list_changesets',
    description:
      'List TFVC changesets (check-in history), newest first. Filter by path, author, date range or changeset ID range.',
    inputSchema: toJsonSchema(TfvcListChangesetsSchema),
  },
  {
    name: 'tfvc_get_changeset',
    description:
      'Get a TFVC changeset with its comment, changed files (with change types) and associated work items.',
    inputSchema: toJsonSchema(TfvcGetChangesetSchema),
  },
  {
    name: 'tfvc_list_branches',
    description:
      'List TFVC branches (root branches with their child hierarchy), or inspect one branch path.',
    inputSchema: toJsonSchema(TfvcListBranchesSchema),
  },
  {
    name: 'tfvc_list_shelvesets',
    description: 'List TFVC shelvesets, optionally filtered by owner or name.',
    inputSchema: toJsonSchema(TfvcListShelvesetsSchema),
  },
  {
    name: 'tfvc_get_shelveset',
    description:
      'Get a TFVC shelveset with its comment, changed files and associated work items. Read file contents with tfvc_get_file_content using versionType "shelveset".',
    inputSchema: toJsonSchema(TfvcGetShelvesetSchema),
  },
  {
    name: 'tfvc_list_labels',
    description:
      'List TFVC labels, optionally filtered by name, owner or scope path.',
    inputSchema: toJsonSchema(TfvcListLabelsSchema),
  },
  {
    name: 'tfvc_create_changeset',
    description:
      'Check in file changes to TFVC directly on the server (no workspace needed). Each change is add, edit or delete; edits can send the whole new content or a search/replace. File encodings are preserved. Use dryRun to preview the diff first. Optionally links work items.',
    inputSchema: toJsonSchema(TfvcCreateChangesetSchema),
  },
  {
    name: 'tfvc_branch',
    description:
      'Create a TFVC branch from a source path (optionally at a changeset/date/label), then preview, check in or shelve it. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcBranchSchema),
  },
  {
    name: 'tfvc_merge_candidates',
    description:
      'List changesets in a source branch that have not yet been merged into a target branch. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcMergeCandidatesSchema),
  },
  {
    name: 'tfvc_merge',
    description:
      'Merge between TFVC branches: everything, a changeset range, or cherry-picked changesets. Auto-merges conflicts where possible; otherwise aborts and reports them, or keeps target/takes source if asked. Then preview, check in or shelve. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcMergeSchema),
  },
  {
    name: 'tfvc_shelve',
    description:
      'Create or replace a shelveset from file changes (add/edit/delete, same format as tfvc_create_changeset) for review before check-in. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcShelveSchema),
  },
  {
    name: 'tfvc_checkin_shelveset',
    description:
      'Check in an existing shelveset as a changeset, optionally linking work items. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcCheckinShelvesetSchema),
  },
  {
    name: 'tfvc_delete_shelveset',
    description:
      'Delete a shelveset. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcDeleteShelvesetSchema),
  },
  {
    name: 'tfvc_create_label',
    description:
      'Apply (or move) a TFVC label on a path at a version. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcCreateLabelSchema),
  },
  {
    name: 'tfvc_delete_label',
    description:
      'Delete a TFVC label. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcDeleteLabelSchema),
  },
  {
    name: 'tfvc_rollback',
    description:
      'Roll back (undo) one changeset or a range within a branch/folder by creating a new changeset, then preview, check in or shelve. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcRollbackSchema),
  },
  {
    name: 'tfvc_rename',
    description:
      'Rename or move a TFVC file or folder, then preview, check in or shelve. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcRenameSchema),
  },
  {
    name: 'tfvc_workspace',
    description:
      'Show the dedicated TFVC workspace used by the write tools (name, local folder, pending changes); optionally reset it by undoing all pending changes. Runs Visual Studio TF.exe on this computer in a dedicated MCP workspace.',
    inputSchema: toJsonSchema(TfvcWorkspaceSchema),
  },
];
