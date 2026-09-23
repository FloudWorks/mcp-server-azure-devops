import { toJsonSchema } from '../../shared/utils/to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  ListTeamsSchema,
  ListClassificationNodesSchema,
  CreateIterationSchema,
  CreateAreaPathSchema,
  GetTeamSprintsSchema,
  GetSprintWorkItemsSchema,
  ListQueriesSchema,
  RunQuerySchema,
  DeleteWorkItemSchema,
} from './schemas';

export const workTrackingTools: ToolDefinition[] = [
  {
    name: 'list_teams',
    description: 'List teams in a project',
    inputSchema: toJsonSchema(ListTeamsSchema),
  },
  {
    name: 'list_iterations',
    description:
      'Show the project iteration (sprint) tree with start and finish dates',
    inputSchema: toJsonSchema(ListClassificationNodesSchema),
  },
  {
    name: 'list_area_paths',
    description: 'Show the project area path tree',
    inputSchema: toJsonSchema(ListClassificationNodesSchema),
  },
  {
    name: 'create_iteration',
    description:
      'Create an iteration (sprint) with optional dates under a parent iteration',
    inputSchema: toJsonSchema(CreateIterationSchema),
  },
  {
    name: 'create_area_path',
    description: 'Create an area path under a parent area',
    inputSchema: toJsonSchema(CreateAreaPathSchema),
  },
  {
    name: 'get_team_sprints',
    description: "List a team's sprints (current, past, future or all)",
    inputSchema: toJsonSchema(GetTeamSprintsSchema),
  },
  {
    name: 'get_sprint_work_items',
    description:
      "List the work items in a team's sprint (default: current sprint), with parent links",
    inputSchema: toJsonSchema(GetSprintWorkItemsSchema),
  },
  {
    name: 'list_queries',
    description: 'List saved work item queries (My Queries and Shared Queries)',
    inputSchema: toJsonSchema(ListQueriesSchema),
  },
  {
    name: 'run_query',
    description:
      'Run a saved work item query by ID or path and return the matching work items',
    inputSchema: toJsonSchema(RunQuerySchema),
  },
  {
    name: 'delete_work_item',
    description:
      'Delete a work item (moves it to the Recycle Bin, or permanently destroys it if destroy is true)',
    inputSchema: toJsonSchema(DeleteWorkItemSchema),
  },
];
