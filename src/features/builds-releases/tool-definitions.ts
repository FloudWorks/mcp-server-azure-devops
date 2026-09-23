import { toJsonSchema } from '../../shared/utils/to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import * as S from './schemas';

export const buildsReleasesTools: ToolDefinition[] = [
  {
    name: 'list_build_definitions',
    description:
      'List build definitions (classic and YAML), optionally filtered by name or folder',
    inputSchema: toJsonSchema(S.ListBuildDefinitionsSchema),
  },
  {
    name: 'list_builds',
    description:
      'List builds (newest first), filtered by definition, status, result, branch or requester',
    inputSchema: toJsonSchema(S.ListBuildsSchema),
  },
  {
    name: 'get_build',
    description:
      'Get a build with its status, result, source version and associated changesets/commits',
    inputSchema: toJsonSchema(S.GetBuildSchema),
  },
  {
    name: 'queue_build',
    description:
      'Queue a build of a definition, optionally for a TFVC branch/changeset (e.g. "$/Project/Master", "C1234") or Git branch/commit, with queue-time variables',
    inputSchema: toJsonSchema(S.QueueBuildSchema),
  },
  {
    name: 'cancel_build',
    description: 'Cancel a queued or running build',
    inputSchema: toJsonSchema(S.CancelBuildSchema),
  },
  {
    name: 'get_build_logs',
    description: "List a build's logs, or read lines from one log",
    inputSchema: toJsonSchema(S.GetBuildLogsSchema),
  },
  {
    name: 'list_release_definitions',
    description: 'List classic release definitions',
    inputSchema: toJsonSchema(S.ListReleaseDefinitionsSchema),
  },
  {
    name: 'list_releases',
    description: 'List releases (newest first), optionally for one definition',
    inputSchema: toJsonSchema(S.ListReleasesSchema),
  },
  {
    name: 'get_release',
    description:
      'Get a release with its artifacts, stages (environments), deployment status and approvals',
    inputSchema: toJsonSchema(S.GetReleaseSchema),
  },
  {
    name: 'create_release',
    description:
      'Create a release from a release definition, optionally choosing artifact versions and variables',
    inputSchema: toJsonSchema(S.CreateReleaseSchema),
  },
  {
    name: 'deploy_release_environment',
    description:
      'Start (or cancel) deployment of a release to one stage (environment)',
    inputSchema: toJsonSchema(S.DeployReleaseEnvironmentSchema),
  },
  {
    name: 'list_release_approvals',
    description:
      'List release approvals (default: pending), optionally for an approver or releases',
    inputSchema: toJsonSchema(S.ListReleaseApprovalsSchema),
  },
  {
    name: 'update_release_approval',
    description: 'Approve or reject a release approval with a comment',
    inputSchema: toJsonSchema(S.UpdateReleaseApprovalSchema),
  },
];
