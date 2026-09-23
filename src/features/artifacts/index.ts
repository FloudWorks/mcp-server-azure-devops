/* eslint-disable @typescript-eslint/no-explicit-any */
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { z } from 'zod';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { ToolDefinition } from '../../shared/types/tool-definition';
import { toJsonSchema } from '../../shared/utils/to-json-schema';

/**
 * Azure Artifacts feeds. azure-devops-node-api has no packaging client, so
 * these call the REST API directly. On Azure DevOps Server the packaging
 * endpoints live on the collection URL itself.
 */
const PKG_API_VERSION =
  process.env.AZURE_DEVOPS_PACKAGING_API_VERSION || '5.0-preview.1';

const feedScope = {
  feed: z.string().describe('Feed name or ID, e.g. "natpos"'),
  projectId: z
    .string()
    .optional()
    .describe(
      'Project name, only for project-scoped feeds (omit for collection feeds)',
    ),
};

export const ListFeedsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe("List a project's feeds instead of collection feeds"),
});

export const ListPackagesSchema = z.object({
  ...feedScope,
  protocolType: z
    .enum(['npm', 'nuget', 'maven', 'pypi', 'upack'])
    .optional()
    .describe('Only this package type'),
  nameQuery: z
    .string()
    .optional()
    .describe('Filter by package name (contains)'),
  top: z
    .number()
    .optional()
    .default(100)
    .describe('Maximum packages to return'),
});

export const GetPackageVersionsSchema = z.object({
  ...feedScope,
  packageName: z
    .string()
    .describe('Package name, e.g. "@floudworks/mcp-server-azure-devops"'),
  protocolType: z
    .enum(['npm', 'nuget', 'maven', 'pypi', 'upack'])
    .optional()
    .describe('Package type (helps when names clash across types)'),
});

export const DeletePackageVersionSchema = z.object({
  ...feedScope,
  protocolType: z.enum(['npm', 'nuget']).describe('Package type'),
  packageName: z.string().describe('Package name'),
  version: z
    .string()
    .describe('Version to delete (moves it to the feed Recycle Bin)'),
});

export const PromotePackageVersionSchema = z.object({
  ...feedScope,
  protocolType: z.enum(['npm', 'nuget']).describe('Package type'),
  packageName: z.string().describe('Package name'),
  version: z.string().describe('Version to promote'),
  view: z
    .string()
    .describe('Feed view to promote to, e.g. "Release" or "Prerelease"'),
});

export const artifactsTools: ToolDefinition[] = [
  {
    name: 'list_feeds',
    description: 'List Azure Artifacts feeds',
    inputSchema: toJsonSchema(ListFeedsSchema),
  },
  {
    name: 'list_packages',
    description:
      'List packages in an Azure Artifacts feed with their latest version',
    inputSchema: toJsonSchema(ListPackagesSchema),
  },
  {
    name: 'get_package_versions',
    description:
      'List all versions of a package in a feed, with publish dates and views',
    inputSchema: toJsonSchema(GetPackageVersionsSchema),
  },
  {
    name: 'delete_package_version',
    description:
      'Delete (unpublish) an npm or NuGet package version from a feed (it goes to the feed Recycle Bin)',
    inputSchema: toJsonSchema(DeletePackageVersionSchema),
  },
  {
    name: 'promote_package_version',
    description:
      'Promote an npm or NuGet package version to a feed view such as Release',
    inputSchema: toJsonSchema(PromotePackageVersionSchema),
  },
];

const NAMES = artifactsTools.map((t) => t.name);
export const isArtifactsRequest: RequestIdentifier = (r: CallToolRequest) =>
  NAMES.includes(r.params.name);

async function client(connection: WebApi) {
  const core = await connection.getCoreApi();
  const base = connection.serverUrl.replace(/\/+$/, '');
  const options = core.createRequestOptions(
    'application/json',
    PKG_API_VERSION,
  );
  const url = (
    project: string | undefined,
    route: string,
    query: Record<string, unknown> = {},
  ) => {
    const u = new URL(
      `${base}/${project ? `${encodeURIComponent(project)}/` : ''}_apis/packaging/${route}`,
    );
    u.searchParams.set('api-version', PKG_API_VERSION);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '')
        u.searchParams.set(k, String(v));
    }
    return u.toString();
  };
  const check = <T>(
    res: { statusCode: number; result: T | null },
    what: string,
  ): T => {
    if (res.statusCode === 404 || res.result === null)
      throw new Error(`${what} not found`);
    return res.result;
  };
  return { rest: core.rest, options, url, check };
}

/** Encode a package name as path segments (keeps "@scope/name" as two segments). */
const nameSegments = (name: string) =>
  name.split('/').map(encodeURIComponent).join('/');

async function findPackage(
  connection: WebApi,
  a: {
    feed: string;
    projectId?: string;
    packageName: string;
    protocolType?: string;
  },
) {
  const c = await client(connection);
  const res = await c.rest.get<{ value: Array<Record<string, unknown>> }>(
    c.url(a.projectId, `Feeds/${encodeURIComponent(a.feed)}/packages`, {
      packageNameQuery: a.packageName,
      protocolType: a.protocolType,
      includeAllVersions: true,
      includeDescription: true,
    }),
    c.options,
  );
  const list = c.check(res, `Feed '${a.feed}'`).value ?? [];
  const pkg = list.find(
    (p) => String(p.name).toLowerCase() === a.packageName.toLowerCase(),
  );
  if (!pkg)
    throw new Error(`Package '${a.packageName}' not found in feed '${a.feed}'`);
  return pkg;
}

export async function listFeeds(
  connection: WebApi,
  a: z.infer<typeof ListFeedsSchema>,
) {
  const c = await client(connection);
  const res = await c.rest.get<{ value: Array<Record<string, any>> }>(
    c.url(a.projectId, 'feeds'),
    c.options,
  );
  return (c.check(res, 'Feeds').value ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description || undefined,
    project: f.project?.name,
    upstreamEnabled: f.upstreamEnabled,
    views: f.views?.map((v: { name: string }) => v.name),
  }));
}

export async function listPackages(
  connection: WebApi,
  a: z.infer<typeof ListPackagesSchema>,
) {
  const c = await client(connection);
  const res = await c.rest.get<{ value: Array<Record<string, any>> }>(
    c.url(a.projectId, `Feeds/${encodeURIComponent(a.feed)}/packages`, {
      protocolType: a.protocolType,
      packageNameQuery: a.nameQuery,
      $top: a.top ?? 100,
    }),
    c.options,
  );
  return (c.check(res, `Feed '${a.feed}'`).value ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    protocolType: p.protocolType,
    latestVersion: p.versions?.[0]?.version,
    publishDate: p.versions?.[0]?.publishDate,
    views: p.versions?.[0]?.views?.map((v: { name: string }) => v.name),
  }));
}

export async function getPackageVersions(
  connection: WebApi,
  a: z.infer<typeof GetPackageVersionsSchema>,
) {
  const pkg = await findPackage(connection, a);
  const c = await client(connection);
  const res = await c.rest.get<{ value: Array<Record<string, any>> }>(
    c.url(
      a.projectId,
      `Feeds/${encodeURIComponent(a.feed)}/Packages/${pkg.id}/versions`,
      {
        includeUrls: false,
      },
    ),
    c.options,
  );
  return {
    name: pkg.name,
    protocolType: pkg.protocolType,
    versions: (c.check(res, 'Package versions').value ?? []).map((v) => ({
      version: v.version,
      isLatest: v.isLatest,
      isListed: v.isListed,
      isDeleted: v.isDeleted || undefined,
      publishDate: v.publishDate,
      views: v.views?.map((x: { name: string }) => x.name),
    })),
  };
}

function versionRoute(a: {
  feed: string;
  protocolType: string;
  packageName: string;
  version: string;
}) {
  const feed = encodeURIComponent(a.feed);
  const version = encodeURIComponent(a.version);
  return a.protocolType === 'npm'
    ? `feeds/${feed}/npm/${nameSegments(a.packageName)}/versions/${version}`
    : `feeds/${feed}/nuget/packages/${encodeURIComponent(a.packageName)}/versions/${version}`;
}

export async function deletePackageVersion(
  connection: WebApi,
  a: z.infer<typeof DeletePackageVersionSchema>,
) {
  const c = await client(connection);
  const res = await c.rest.del(c.url(a.projectId, versionRoute(a)), c.options);
  if (res.statusCode >= 400)
    throw new Error(`Delete failed (HTTP ${res.statusCode})`);
  return { status: 'deleted', package: a.packageName, version: a.version };
}

export async function promotePackageVersion(
  connection: WebApi,
  a: z.infer<typeof PromotePackageVersionSchema>,
) {
  const c = await client(connection);
  const res = await c.rest.update(
    c.url(a.projectId, versionRoute(a)),
    { views: { op: 'add', path: '/views/-', value: a.view } },
    c.options,
  );
  if (res.statusCode >= 400)
    throw new Error(`Promote failed (HTTP ${res.statusCode})`);
  return {
    status: 'promoted',
    package: a.packageName,
    version: a.version,
    view: a.view,
  };
}

const json = (r: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(r, null, 2) }],
});

export const handleArtifactsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
) => {
  const raw = request.params.arguments ?? {};
  switch (request.params.name) {
    case 'list_feeds':
      return json(await listFeeds(connection, ListFeedsSchema.parse(raw)));
    case 'list_packages':
      return json(
        await listPackages(connection, ListPackagesSchema.parse(raw)),
      );
    case 'get_package_versions':
      return json(
        await getPackageVersions(
          connection,
          GetPackageVersionsSchema.parse(raw),
        ),
      );
    case 'delete_package_version':
      return json(
        await deletePackageVersion(
          connection,
          DeletePackageVersionSchema.parse(raw),
        ),
      );
    case 'promote_package_version':
      return json(
        await promotePackageVersion(
          connection,
          PromotePackageVersionSchema.parse(raw),
        ),
      );
    default:
      throw new Error(`Unknown artifacts tool: ${request.params.name}`);
  }
};
