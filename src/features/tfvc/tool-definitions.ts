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
];
