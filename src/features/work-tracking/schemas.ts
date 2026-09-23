import { z } from 'zod';
import { defaultProject } from '../../utils/environment';

const projectId = z
  .string()
  .optional()
  .describe(`The ID or name of the project (Default: ${defaultProject})`);
const team = z
  .string()
  .optional()
  .describe("Team name or ID (default: the project's default team)");

export const ListTeamsSchema = z.object({
  projectId,
  mine: z
    .boolean()
    .optional()
    .describe('Only teams the authenticated user belongs to'),
  top: z.number().optional().default(100).describe('Maximum teams to return'),
});

export const ListClassificationNodesSchema = z.object({
  projectId,
  path: z
    .string()
    .optional()
    .describe(
      'Start from this path under the root, e.g. "Release 2" (default: root)',
    ),
  depth: z
    .number()
    .optional()
    .default(5)
    .describe('How many levels of children to include'),
});

export const CreateIterationSchema = z.object({
  projectId,
  name: z.string().describe('New iteration (sprint) name'),
  parentPath: z
    .string()
    .optional()
    .describe(
      'Parent iteration path, e.g. "Release 2" or "Project\\\\Release 2" (default: root)',
    ),
  startDate: z
    .string()
    .optional()
    .describe('Start date (ISO 8601, e.g. 2026-10-01)'),
  finishDate: z.string().optional().describe('Finish date (ISO 8601)'),
});

export const CreateAreaPathSchema = z.object({
  projectId,
  name: z.string().describe('New area name'),
  parentPath: z
    .string()
    .optional()
    .describe('Parent area path (default: root)'),
});

export const GetTeamSprintsSchema = z.object({
  projectId,
  team,
  timeframe: z
    .enum(['current', 'past', 'future', 'all'])
    .optional()
    .default('all')
    .describe('Which sprints to return'),
});

export const GetSprintWorkItemsSchema = z.object({
  projectId,
  team,
  iterationId: z
    .string()
    .optional()
    .describe(
      'Iteration ID (from get_team_sprints). Default: the current sprint',
    ),
});

export const ListQueriesSchema = z.object({
  projectId,
  depth: z
    .number()
    .optional()
    .default(2)
    .describe('Folder depth to include (max 2)'),
  includeWiql: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include each query's WIQL"),
});

export const RunQuerySchema = z.object({
  projectId,
  query: z
    .string()
    .describe(
      'Saved query ID (GUID) or path, e.g. "Shared Queries/Active Bugs"',
    ),
  team,
  top: z
    .number()
    .optional()
    .default(200)
    .describe('Maximum work items to return'),
});

export const DeleteWorkItemSchema = z.object({
  workItemId: z.number().describe('Work item ID'),
  projectId,
  destroy: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Permanently destroy instead of moving to the Recycle Bin (cannot be undone)',
    ),
});
