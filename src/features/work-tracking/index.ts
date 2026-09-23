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
import * as S from './schemas';
import * as F from './feature';
import { workTrackingTools } from './tool-definitions';

const NAMES = workTrackingTools.map((t) => t.name);

export const isWorkTrackingRequest: RequestIdentifier = (
  request: CallToolRequest,
) => NAMES.includes(request.params.name);

function project(p?: string): string {
  const v = p ?? defaultProject;
  if (!v || v === 'no default project')
    throw new Error('projectId is required');
  return v;
}

const json = (r: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(r, null, 2) }],
});

export const handleWorkTrackingRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
) => {
  const raw = request.params.arguments ?? {};
  switch (request.params.name) {
    case 'list_teams': {
      const a = S.ListTeamsSchema.parse(raw);
      return json(
        await F.listTeams(connection, {
          ...a,
          projectId: project(a.projectId),
        }),
      );
    }
    case 'list_iterations': {
      const a = S.ListClassificationNodesSchema.parse(raw);
      return json(
        await F.listClassificationNodes(
          connection,
          { ...a, projectId: project(a.projectId) },
          'Iteration',
        ),
      );
    }
    case 'list_area_paths': {
      const a = S.ListClassificationNodesSchema.parse(raw);
      return json(
        await F.listClassificationNodes(
          connection,
          { ...a, projectId: project(a.projectId) },
          'Area',
        ),
      );
    }
    case 'create_iteration': {
      const a = S.CreateIterationSchema.parse(raw);
      return json(
        await F.createIteration(connection, {
          ...a,
          projectId: project(a.projectId),
        }),
      );
    }
    case 'create_area_path': {
      const a = S.CreateAreaPathSchema.parse(raw);
      return json(
        await F.createAreaPath(connection, {
          ...a,
          projectId: project(a.projectId),
        }),
      );
    }
    case 'get_team_sprints': {
      const a = S.GetTeamSprintsSchema.parse(raw);
      return json(
        await F.getTeamSprints(connection, {
          ...a,
          projectId: project(a.projectId),
        }),
      );
    }
    case 'get_sprint_work_items': {
      const a = S.GetSprintWorkItemsSchema.parse(raw);
      return json(
        await F.getSprintWorkItems(connection, {
          ...a,
          projectId: project(a.projectId),
        }),
      );
    }
    case 'list_queries': {
      const a = S.ListQueriesSchema.parse(raw);
      return json(
        await F.listQueries(connection, {
          ...a,
          projectId: project(a.projectId),
        }),
      );
    }
    case 'run_query': {
      const a = S.RunQuerySchema.parse(raw);
      return json(
        await F.runQuery(connection, { ...a, projectId: project(a.projectId) }),
      );
    }
    case 'delete_work_item': {
      const a = S.DeleteWorkItemSchema.parse(raw);
      return json(
        await F.deleteWorkItem(connection, {
          ...a,
          projectId: project(a.projectId),
        }),
      );
    }
    default:
      throw new Error(`Unknown work tracking tool: ${request.params.name}`);
  }
};
