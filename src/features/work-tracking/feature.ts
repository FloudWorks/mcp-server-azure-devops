import { WebApi } from 'azure-devops-node-api';
import {
  QueryExpand,
  TreeStructureGroup,
  WorkItemClassificationNode,
  QueryHierarchyItem,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { z } from 'zod';
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

type P<T> = T & { projectId: string };

const SUMMARY_FIELDS = [
  'System.Id',
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'System.AssignedTo',
  'System.IterationPath',
  'Microsoft.VSTS.Common.Priority',
];

/** Normalise "Project\\Iteration\\Release 2" / "Release 2" to "Release 2". */
export function relativeNodePath(
  path: string | undefined,
  project: string,
  group: 'Iteration' | 'Area',
): string | undefined {
  if (!path) return undefined;
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts[0]?.toLowerCase() === project.toLowerCase()) parts.shift();
  if (parts[0]?.toLowerCase() === group.toLowerCase()) parts.shift();
  return parts.length ? parts.join('/') : undefined;
}

function simplifyNode(n: WorkItemClassificationNode): Record<string, unknown> {
  return {
    id: n.id,
    name: n.name,
    path: n.path,
    startDate: n.attributes?.startDate,
    finishDate: n.attributes?.finishDate,
    children: n.children?.length ? n.children.map(simplifyNode) : undefined,
  };
}

async function summarizeWorkItems(connection: WebApi, ids: number[]) {
  if (!ids.length) return [];
  const wit = await connection.getWorkItemTrackingApi();
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const items = await wit.getWorkItems(ids.slice(i, i + 200), SUMMARY_FIELDS);
    for (const w of items ?? []) {
      const f = w.fields ?? {};
      out.push({
        id: w.id,
        type: f['System.WorkItemType'],
        title: f['System.Title'],
        state: f['System.State'],
        assignedTo:
          f['System.AssignedTo']?.displayName ?? f['System.AssignedTo'],
        iterationPath: f['System.IterationPath'],
        priority: f['Microsoft.VSTS.Common.Priority'],
      });
    }
  }
  return out;
}

export async function listTeams(
  connection: WebApi,
  a: P<z.infer<typeof ListTeamsSchema>>,
) {
  const core = await connection.getCoreApi();
  const teams = await core.getTeams(a.projectId, a.mine, a.top ?? 100);
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description || undefined,
  }));
}

export async function listClassificationNodes(
  connection: WebApi,
  a: P<z.infer<typeof ListClassificationNodesSchema>>,
  group: 'Iteration' | 'Area',
) {
  const wit = await connection.getWorkItemTrackingApi();
  const node = await wit.getClassificationNode(
    a.projectId,
    group === 'Iteration'
      ? TreeStructureGroup.Iterations
      : TreeStructureGroup.Areas,
    relativeNodePath(a.path, a.projectId, group),
    a.depth ?? 5,
  );
  return simplifyNode(node);
}

export async function createIteration(
  connection: WebApi,
  a: P<z.infer<typeof CreateIterationSchema>>,
) {
  const wit = await connection.getWorkItemTrackingApi();
  const attributes: Record<string, string> = {};
  if (a.startDate) attributes.startDate = a.startDate;
  if (a.finishDate) attributes.finishDate = a.finishDate;
  const node = await wit.createOrUpdateClassificationNode(
    { name: a.name, ...(Object.keys(attributes).length ? { attributes } : {}) },
    a.projectId,
    TreeStructureGroup.Iterations,
    relativeNodePath(a.parentPath, a.projectId, 'Iteration'),
  );
  return simplifyNode(node);
}

export async function createAreaPath(
  connection: WebApi,
  a: P<z.infer<typeof CreateAreaPathSchema>>,
) {
  const wit = await connection.getWorkItemTrackingApi();
  const node = await wit.createOrUpdateClassificationNode(
    { name: a.name },
    a.projectId,
    TreeStructureGroup.Areas,
    relativeNodePath(a.parentPath, a.projectId, 'Area'),
  );
  return simplifyNode(node);
}

export async function getTeamSprints(
  connection: WebApi,
  a: P<z.infer<typeof GetTeamSprintsSchema>>,
) {
  const work = await connection.getWorkApi();
  const sprints = await work.getTeamIterations(
    { project: a.projectId, team: a.team },
    a.timeframe && a.timeframe !== 'all' ? a.timeframe : undefined,
  );
  return sprints.map((s) => ({
    id: s.id,
    name: s.name,
    path: s.path,
    startDate: s.attributes?.startDate,
    finishDate: s.attributes?.finishDate,
    timeFrame: s.attributes?.timeFrame,
  }));
}

export async function getSprintWorkItems(
  connection: WebApi,
  a: P<z.infer<typeof GetSprintWorkItemsSchema>>,
) {
  const work = await connection.getWorkApi();
  const ctx = { project: a.projectId, team: a.team };
  let iterationId = a.iterationId;
  let sprintName: string | undefined;
  if (!iterationId) {
    const current = await work.getTeamIterations(ctx, 'current');
    if (!current?.length) throw new Error('The team has no current sprint');
    iterationId = current[0].id!;
    sprintName = current[0].name;
  }
  const result = await work.getIterationWorkItems(ctx, iterationId);
  const ids = Array.from(
    new Set(
      (result.workItemRelations ?? [])
        .map((r) => r.target?.id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );
  const parentOf = new Map<number, number>();
  for (const r of result.workItemRelations ?? []) {
    if (
      r.rel === 'System.LinkTypes.Hierarchy-Forward' &&
      r.source?.id &&
      r.target?.id
    ) {
      parentOf.set(r.target.id, r.source.id);
    }
  }
  const items = await summarizeWorkItems(connection, ids);
  return {
    iterationId,
    sprintName,
    count: items.length,
    workItems: items.map((w) => ({
      ...w,
      parentId: parentOf.get(w.id as number),
    })),
  };
}

function simplifyQuery(
  q: QueryHierarchyItem,
  includeWiql: boolean,
): Record<string, unknown> {
  return {
    id: q.id,
    name: q.name,
    path: q.path,
    isFolder: q.isFolder || undefined,
    queryType: q.isFolder ? undefined : q.queryType,
    wiql: includeWiql ? q.wiql : undefined,
    children: q.children?.length
      ? q.children.map((c) => simplifyQuery(c, includeWiql))
      : undefined,
  };
}

export async function listQueries(
  connection: WebApi,
  a: P<z.infer<typeof ListQueriesSchema>>,
) {
  const wit = await connection.getWorkItemTrackingApi();
  const queries = await wit.getQueries(
    a.projectId,
    a.includeWiql ? QueryExpand.Wiql : QueryExpand.None,
    Math.min(a.depth ?? 2, 2),
  );
  return queries.map((q) => simplifyQuery(q, !!a.includeWiql));
}

export async function runQuery(
  connection: WebApi,
  a: P<z.infer<typeof RunQuerySchema>>,
) {
  const wit = await connection.getWorkItemTrackingApi();
  const query = await wit.getQuery(a.projectId, a.query);
  if (!query?.id) throw new Error(`Query '${a.query}' not found`);
  if (query.isFolder) throw new Error(`'${a.query}' is a folder, not a query`);
  const result = await wit.queryById(
    query.id,
    { project: a.projectId, team: a.team },
    undefined,
    a.top ?? 200,
  );
  const ids = [
    ...(result.workItems ?? []).map((w) => w.id!),
    ...(result.workItemRelations ?? [])
      .map((r) => r.target?.id)
      .filter((id): id is number => !!id),
  ];
  const unique = Array.from(new Set(ids)).slice(0, a.top ?? 200);
  return {
    query: {
      id: query.id,
      name: query.name,
      path: query.path,
      type: result.queryType,
    },
    count: unique.length,
    workItems: await summarizeWorkItems(connection, unique),
  };
}

export async function deleteWorkItem(
  connection: WebApi,
  a: P<z.infer<typeof DeleteWorkItemSchema>>,
) {
  const wit = await connection.getWorkItemTrackingApi();
  const r = await wit.deleteWorkItem(
    a.workItemId,
    a.projectId,
    a.destroy ?? false,
  );
  return {
    id: r.id ?? a.workItemId,
    status: a.destroy ? 'destroyed' : 'moved to Recycle Bin',
    deletedBy: r.deletedBy,
    deletedDate: r.deletedDate,
  };
}
