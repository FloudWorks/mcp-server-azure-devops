import { z } from 'zod';
import { defaultProject } from '../../utils/environment';

const projectId = z
  .string()
  .optional()
  .describe(`The ID or name of the project (Default: ${defaultProject})`);

export const ListBuildDefinitionsSchema = z.object({
  projectId,
  name: z
    .string()
    .optional()
    .describe('Filter by name (wildcards allowed, e.g. "natPOS*")'),
  path: z
    .string()
    .optional()
    .describe('Filter by folder path, e.g. "\\\\Cloud"'),
  top: z
    .number()
    .optional()
    .default(100)
    .describe('Maximum definitions to return'),
});

export const ListBuildsSchema = z.object({
  projectId,
  definitionId: z
    .number()
    .optional()
    .describe('Only builds of this definition'),
  status: z
    .enum([
      'inProgress',
      'completed',
      'cancelling',
      'postponed',
      'notStarted',
      'all',
    ])
    .optional()
    .describe('Filter by status'),
  result: z
    .enum(['succeeded', 'partiallySucceeded', 'failed', 'canceled'])
    .optional()
    .describe('Filter by result (completed builds)'),
  branch: z
    .string()
    .optional()
    .describe(
      'Filter by source branch, e.g. "$/Project/Master" or "refs/heads/main"',
    ),
  requestedFor: z
    .string()
    .optional()
    .describe('Filter by who the build was requested for'),
  top: z
    .number()
    .optional()
    .default(25)
    .describe('Maximum builds to return (newest first)'),
});

export const GetBuildSchema = z.object({
  projectId,
  buildId: z.number().describe('Build ID'),
  includeChanges: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include associated changes/changesets'),
});

export const QueueBuildSchema = z.object({
  projectId,
  definitionId: z.number().describe('Build definition ID'),
  sourceBranch: z
    .string()
    .optional()
    .describe(
      'Branch to build, e.g. "$/Project/Master" (TFVC) or "refs/heads/main" (Git). Default: definition default',
    ),
  sourceVersion: z
    .string()
    .optional()
    .describe(
      'Version to build, e.g. "C1234" (TFVC changeset) or a Git commit SHA. Default: latest',
    ),
  parameters: z
    .record(z.string(), z.string())
    .optional()
    .describe('Queue-time variables, e.g. {"BuildConfiguration":"Release"}'),
  demands: z
    .array(z.string())
    .optional()
    .describe('Agent demands, e.g. ["Agent.Name -equals BUILD01"]'),
});

export const CancelBuildSchema = z.object({
  projectId,
  buildId: z.number().describe('Build ID to cancel'),
});

export const GetBuildLogsSchema = z.object({
  projectId,
  buildId: z.number().describe('Build ID'),
  logId: z
    .number()
    .optional()
    .describe("Log ID to read. Omit to list the build's logs"),
  startLine: z.number().optional().describe('First line to return'),
  endLine: z.number().optional().describe('Last line to return'),
});

export const ListReleaseDefinitionsSchema = z.object({
  projectId,
  searchText: z.string().optional().describe('Filter by name'),
  top: z
    .number()
    .optional()
    .default(100)
    .describe('Maximum definitions to return'),
});

export const ListReleasesSchema = z.object({
  projectId,
  definitionId: z
    .number()
    .optional()
    .describe('Only releases of this definition'),
  status: z
    .enum(['draft', 'active', 'abandoned'])
    .optional()
    .describe('Filter by release status'),
  top: z
    .number()
    .optional()
    .default(25)
    .describe('Maximum releases to return (newest first)'),
});

export const GetReleaseSchema = z.object({
  projectId,
  releaseId: z.number().describe('Release ID'),
});

export const CreateReleaseSchema = z.object({
  projectId,
  definitionId: z.number().describe('Release definition ID'),
  description: z.string().optional().describe('Release description'),
  artifacts: z
    .array(
      z.object({
        alias: z
          .string()
          .describe('Artifact alias as named in the release definition'),
        versionId: z
          .string()
          .describe('Artifact version ID, e.g. the build ID'),
        versionName: z
          .string()
          .optional()
          .describe('Artifact version name, e.g. the build number'),
      }),
    )
    .optional()
    .describe(
      "Artifact versions to use. Omit to use each artifact's default (usually latest)",
    ),
  variables: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      'Release-time variable values (must be settable at release time)',
    ),
  isDraft: z.boolean().optional().default(false).describe('Create as a draft'),
});

export const DeployReleaseEnvironmentSchema = z.object({
  projectId,
  releaseId: z.number().describe('Release ID'),
  environmentId: z
    .number()
    .describe('Release environment (stage) ID, from get_release'),
  comment: z.string().optional().describe('Deployment comment'),
  cancel: z
    .boolean()
    .optional()
    .default(false)
    .describe('Cancel an in-progress deployment instead of starting one'),
});

export const ListReleaseApprovalsSchema = z.object({
  projectId,
  status: z
    .enum([
      'pending',
      'approved',
      'rejected',
      'canceled',
      'skipped',
      'reassigned',
    ])
    .optional()
    .default('pending')
    .describe('Approval status'),
  assignedTo: z
    .string()
    .optional()
    .describe('Approver (name or email). Default: all'),
  releaseIds: z
    .array(z.number())
    .optional()
    .describe('Only approvals for these releases'),
  top: z
    .number()
    .optional()
    .default(50)
    .describe('Maximum approvals to return'),
});

export const UpdateReleaseApprovalSchema = z.object({
  projectId,
  approvalId: z
    .number()
    .describe('Approval ID (from list_release_approvals or get_release)'),
  status: z.enum(['approved', 'rejected']).describe('Approve or reject'),
  comments: z.string().optional().describe('Approval comment'),
});
