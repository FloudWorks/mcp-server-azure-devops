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
import { buildsReleasesTools } from './tool-definitions';

const NAMES = buildsReleasesTools.map((t) => t.name);

export const isBuildsReleasesRequest: RequestIdentifier = (
  request: CallToolRequest,
) => NAMES.includes(request.params.name);

function project(p?: string): string {
  const v = p ?? defaultProject;
  if (!v || v === 'no default project')
    throw new Error('projectId is required');
  return v;
}

const json = (r: unknown) => ({
  content: [
    {
      type: 'text',
      text: typeof r === 'string' ? r : JSON.stringify(r, null, 2),
    },
  ],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, [any, (c: WebApi, a: any) => Promise<unknown>]> =
  {
    list_build_definitions: [
      S.ListBuildDefinitionsSchema,
      F.listBuildDefinitions,
    ],
    list_builds: [S.ListBuildsSchema, F.listBuilds],
    get_build: [S.GetBuildSchema, F.getBuild],
    queue_build: [S.QueueBuildSchema, F.queueBuild],
    cancel_build: [S.CancelBuildSchema, F.cancelBuild],
    get_build_logs: [S.GetBuildLogsSchema, F.getBuildLogs],
    list_release_definitions: [
      S.ListReleaseDefinitionsSchema,
      F.listReleaseDefinitions,
    ],
    list_releases: [S.ListReleasesSchema, F.listReleases],
    get_release: [S.GetReleaseSchema, F.getRelease],
    create_release: [S.CreateReleaseSchema, F.createRelease],
    deploy_release_environment: [
      S.DeployReleaseEnvironmentSchema,
      F.deployReleaseEnvironment,
    ],
    list_release_approvals: [
      S.ListReleaseApprovalsSchema,
      F.listReleaseApprovals,
    ],
    update_release_approval: [
      S.UpdateReleaseApprovalSchema,
      F.updateReleaseApproval,
    ],
  };

export const handleBuildsReleasesRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
) => {
  const entry = handlers[request.params.name];
  if (!entry)
    throw new Error(`Unknown builds/releases tool: ${request.params.name}`);
  const [schema, fn] = entry;
  const a = schema.parse(request.params.arguments ?? {});
  return json(await fn(connection, { ...a, projectId: project(a.projectId) }));
};
