export * from './schemas';
export * from './feature';
export * from './tool-definitions';
export * from './checkin';
export * from './tf-tools';

import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject } from '../../utils/environment';
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
import {
  tfvcGetItems,
  tfvcGetFileContent,
  tfvcListChangesets,
  tfvcGetChangeset,
  tfvcListBranches,
  tfvcListShelvesets,
  tfvcGetShelveset,
  tfvcListLabels,
} from './feature';
import { tfvcTools } from './tool-definitions';
import { TfvcCreateChangesetSchema, tfvcCreateChangeset } from './checkin';
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
  tfvcBranch,
  tfvcMergeCandidates,
  tfvcMerge,
  tfvcShelve,
  tfvcCheckinShelveset,
  tfvcDeleteShelveset,
  tfvcCreateLabel,
  tfvcDeleteLabel,
  tfvcRollback,
  tfvcRename,
  tfvcWorkspace,
} from './tf-tools';

const TFVC_TOOL_NAMES = tfvcTools.map((t) => t.name);

export const isTfvcRequest: RequestIdentifier = (request: CallToolRequest) =>
  TFVC_TOOL_NAMES.includes(request.params.name);

function requireProject(projectId?: string): string {
  const p = projectId ?? defaultProject;
  if (!p || p === 'no default project') {
    throw new Error(
      'projectId is required (no AZURE_DEVOPS_DEFAULT_PROJECT is configured)',
    );
  }
  return p;
}

const json = (result: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
});

export const handleTfvcRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
) => {
  const raw = request.params.arguments ?? {};
  switch (request.params.name) {
    case 'tfvc_get_items': {
      const a = TfvcGetItemsSchema.parse(raw);
      return json(
        await tfvcGetItems(connection, {
          ...a,
          projectId: requireProject(a.projectId),
        }),
      );
    }
    case 'tfvc_get_file_content': {
      const a = TfvcGetFileContentSchema.parse(raw);
      const r = await tfvcGetFileContent(connection, {
        ...a,
        projectId: requireProject(a.projectId),
      });
      const { content, ...meta } = r;
      return {
        content: [
          { type: 'text', text: JSON.stringify(meta, null, 2) },
          { type: 'text', text: content },
        ],
      };
    }
    case 'tfvc_list_changesets': {
      const a = TfvcListChangesetsSchema.parse(raw);
      return json(
        await tfvcListChangesets(connection, {
          ...a,
          projectId: requireProject(a.projectId),
        }),
      );
    }
    case 'tfvc_get_changeset': {
      const a = TfvcGetChangesetSchema.parse(raw);
      return json(
        await tfvcGetChangeset(connection, {
          ...a,
          projectId: requireProject(a.projectId),
        }),
      );
    }
    case 'tfvc_list_branches': {
      const a = TfvcListBranchesSchema.parse(raw);
      return json(
        await tfvcListBranches(connection, {
          ...a,
          projectId: requireProject(a.projectId),
        }),
      );
    }
    case 'tfvc_list_shelvesets': {
      const a = TfvcListShelvesetsSchema.parse(raw);
      return json(await tfvcListShelvesets(connection, a));
    }
    case 'tfvc_get_shelveset': {
      const a = TfvcGetShelvesetSchema.parse(raw);
      return json(await tfvcGetShelveset(connection, a));
    }
    case 'tfvc_list_labels': {
      const a = TfvcListLabelsSchema.parse(raw);
      return json(
        await tfvcListLabels(connection, {
          ...a,
          projectId: requireProject(a.projectId),
        }),
      );
    }
    case 'tfvc_create_changeset': {
      const a = TfvcCreateChangesetSchema.parse(raw);
      return json(
        await tfvcCreateChangeset(connection, {
          ...a,
          projectId: requireProject(a.projectId),
        }),
      );
    }
    case 'tfvc_branch':
      return json(await tfvcBranch(connection, TfvcBranchSchema.parse(raw)));
    case 'tfvc_merge_candidates':
      return json(
        await tfvcMergeCandidates(TfvcMergeCandidatesSchema.parse(raw)),
      );
    case 'tfvc_merge':
      return json(await tfvcMerge(connection, TfvcMergeSchema.parse(raw)));
    case 'tfvc_shelve': {
      const a = TfvcShelveSchema.parse(raw);
      return json(
        await tfvcShelve(connection, {
          ...a,
          projectId: requireProject(a.projectId),
        }),
      );
    }
    case 'tfvc_checkin_shelveset':
      return json(
        await tfvcCheckinShelveset(
          connection,
          TfvcCheckinShelvesetSchema.parse(raw),
        ),
      );
    case 'tfvc_delete_shelveset':
      return json(
        await tfvcDeleteShelveset(TfvcDeleteShelvesetSchema.parse(raw)),
      );
    case 'tfvc_create_label':
      return json(await tfvcCreateLabel(TfvcCreateLabelSchema.parse(raw)));
    case 'tfvc_delete_label':
      return json(await tfvcDeleteLabel(TfvcDeleteLabelSchema.parse(raw)));
    case 'tfvc_rollback':
      return json(
        await tfvcRollback(connection, TfvcRollbackSchema.parse(raw)),
      );
    case 'tfvc_rename':
      return json(await tfvcRename(connection, TfvcRenameSchema.parse(raw)));
    case 'tfvc_workspace':
      return json(await tfvcWorkspace(TfvcWorkspaceSchema.parse(raw)));
    default:
      throw new Error(`Unknown TFVC tool: ${request.params.name}`);
  }
};
