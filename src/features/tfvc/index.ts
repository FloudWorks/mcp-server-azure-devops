export * from './schemas';
export * from './feature';
export * from './tool-definitions';

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

const TFVC_TOOL_NAMES = tfvcTools.map((t) => t.name);

export const isTfvcRequest: RequestIdentifier = (request: CallToolRequest) =>
  TFVC_TOOL_NAMES.includes(request.params.name);

function requireProject(projectId?: string): string {
  const p = projectId ?? defaultProject;
  if (!p) {
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
    default:
      throw new Error(`Unknown TFVC tool: ${request.params.name}`);
  }
};
