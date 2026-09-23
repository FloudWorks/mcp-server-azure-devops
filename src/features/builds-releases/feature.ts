import { WebApi } from 'azure-devops-node-api';
import {
  BuildResult,
  BuildStatus,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {
  ApprovalStatus,
  EnvironmentStatus,
  ReleaseStatus,
} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import { z } from 'zod';
import * as S from './schemas';

type P<T> = T & { projectId: string };

const camel = (s?: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Numeric enum -> readable name (handles flag enums too). */
function enumName(
  e: Record<string, string | number>,
  v: unknown,
): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return camel(v);
  const name = e[v as number];
  return typeof name === 'string' ? camel(name) : String(v);
}

function enumValue<T>(e: Record<string, unknown>, name: string): T {
  const key = Object.keys(e).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) throw new Error(`Unknown value '${name}'`);
  return e[key] as T;
}

const who = (i?: { displayName?: string }) => i?.displayName;

// ---------- builds ----------

export async function listBuildDefinitions(
  connection: WebApi,
  a: P<z.infer<typeof S.ListBuildDefinitionsSchema>>,
) {
  const build = await connection.getBuildApi();
  const defs = await build.getDefinitions(
    a.projectId,
    a.name,
    undefined,
    undefined,
    undefined,
    a.top ?? 100,
    undefined,
    undefined,
    undefined,
    a.path,
  );
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    path: d.path,
    type: d.type === 1 ? 'xaml' : 'build',
    queueStatus: d.queueStatus,
    revision: d.revision,
  }));
}

function simplifyBuild(
  b: import('azure-devops-node-api/interfaces/BuildInterfaces').Build,
) {
  return {
    id: b.id,
    buildNumber: b.buildNumber,
    definition: b.definition?.name,
    definitionId: b.definition?.id,
    status: enumName(BuildStatus as never, b.status),
    result: enumName(BuildResult as never, b.result),
    sourceBranch: b.sourceBranch,
    sourceVersion: b.sourceVersion,
    requestedFor: who(b.requestedFor),
    reason: b.reason,
    queueTime: b.queueTime,
    startTime: b.startTime,
    finishTime: b.finishTime,
    url: b._links?.web?.href,
  };
}

export async function listBuilds(
  connection: WebApi,
  a: P<z.infer<typeof S.ListBuildsSchema>>,
) {
  const build = await connection.getBuildApi();
  const builds = await build.getBuilds(
    a.projectId,
    a.definitionId ? [a.definitionId] : undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    a.requestedFor,
    undefined,
    a.status
      ? enumValue<BuildStatus>(BuildStatus as never, a.status)
      : undefined,
    a.result
      ? enumValue<BuildResult>(BuildResult as never, a.result)
      : undefined,
    undefined,
    undefined,
    a.top ?? 25,
    undefined,
    undefined,
    undefined,
    undefined,
    a.branch,
  );
  return builds.map(simplifyBuild);
}

export async function getBuild(
  connection: WebApi,
  a: P<z.infer<typeof S.GetBuildSchema>>,
) {
  const build = await connection.getBuildApi();
  const b = await build.getBuild(a.projectId, a.buildId);
  let changes;
  if (a.includeChanges ?? true) {
    const c = await build.getBuildChanges(
      a.projectId,
      a.buildId,
      undefined,
      50,
    );
    changes = c?.map((x) => ({
      id: x.id,
      message: x.message,
      author: who(x.author),
      timestamp: x.timestamp,
      type: x.type,
    }));
  }
  return { ...simplifyBuild(b), changes };
}

export async function queueBuild(
  connection: WebApi,
  a: P<z.infer<typeof S.QueueBuildSchema>>,
) {
  const build = await connection.getBuildApi();
  const b = await build.queueBuild(
    {
      definition: { id: a.definitionId },
      sourceBranch: a.sourceBranch,
      sourceVersion: a.sourceVersion,
      parameters: a.parameters ? JSON.stringify(a.parameters) : undefined,
      demands: a.demands?.map((d) => ({ name: d })) as never,
    },
    a.projectId,
  );
  return simplifyBuild(b);
}

export async function cancelBuild(
  connection: WebApi,
  a: P<z.infer<typeof S.CancelBuildSchema>>,
) {
  const build = await connection.getBuildApi();
  const b = await build.updateBuild(
    { status: BuildStatus.Cancelling },
    a.projectId,
    a.buildId,
  );
  return simplifyBuild(b);
}

export async function getBuildLogs(
  connection: WebApi,
  a: P<z.infer<typeof S.GetBuildLogsSchema>>,
) {
  const build = await connection.getBuildApi();
  if (a.logId === undefined) {
    const logs = await build.getBuildLogs(a.projectId, a.buildId);
    return logs.map((l) => ({
      id: l.id,
      type: l.type,
      lineCount: l.lineCount,
      createdOn: l.createdOn,
    }));
  }
  const lines = await build.getBuildLogLines(
    a.projectId,
    a.buildId,
    a.logId,
    a.startLine,
    a.endLine,
  );
  return lines.join('\n');
}

// ---------- releases ----------

export async function listReleaseDefinitions(
  connection: WebApi,
  a: P<z.infer<typeof S.ListReleaseDefinitionsSchema>>,
) {
  const rm = await connection.getReleaseApi();
  const defs = await rm.getReleaseDefinitions(
    a.projectId,
    a.searchText,
    undefined,
    undefined,
    undefined,
    a.top ?? 100,
  );
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    path: d.path,
    releaseNameFormat: d.releaseNameFormat,
  }));
}

export async function listReleases(
  connection: WebApi,
  a: P<z.infer<typeof S.ListReleasesSchema>>,
) {
  const rm = await connection.getReleaseApi();
  const releases = await rm.getReleases(
    a.projectId,
    a.definitionId,
    undefined,
    undefined,
    undefined,
    a.status
      ? enumValue<ReleaseStatus>(ReleaseStatus as never, a.status)
      : undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    a.top ?? 25,
  );
  return releases.map((r) => ({
    id: r.id,
    name: r.name,
    definition: r.releaseDefinition?.name,
    definitionId: r.releaseDefinition?.id,
    status: enumName(ReleaseStatus as never, r.status),
    createdBy: who(r.createdBy),
    createdOn: r.createdOn,
    description: r.description || undefined,
  }));
}

export async function getRelease(
  connection: WebApi,
  a: P<z.infer<typeof S.GetReleaseSchema>>,
) {
  const rm = await connection.getReleaseApi();
  const r = await rm.getRelease(a.projectId, a.releaseId);
  return {
    id: r.id,
    name: r.name,
    status: enumName(ReleaseStatus as never, r.status),
    definition: r.releaseDefinition?.name,
    description: r.description || undefined,
    createdBy: who(r.createdBy),
    createdOn: r.createdOn,
    artifacts: r.artifacts?.map((x) => ({
      alias: x.alias,
      type: x.type,
      version: x.definitionReference?.version?.name,
      versionId: x.definitionReference?.version?.id,
      branch: x.definitionReference?.branch?.name,
    })),
    environments: r.environments?.map((e) => ({
      id: e.id,
      name: e.name,
      status: enumName(EnvironmentStatus as never, e.status),
      approvals: [
        ...(e.preDeployApprovals ?? []),
        ...(e.postDeployApprovals ?? []),
      ]
        .filter((ap) => !ap.isAutomated)
        .map((ap) => ({
          id: ap.id,
          type: ap.approvalType === 1 ? 'preDeploy' : 'postDeploy',
          status: enumName(ApprovalStatus as never, ap.status),
          approver: who(ap.approver),
          approvedBy: who(ap.approvedBy),
          comments: ap.comments || undefined,
        })),
    })),
  };
}

export async function createRelease(
  connection: WebApi,
  a: P<z.infer<typeof S.CreateReleaseSchema>>,
) {
  const rm = await connection.getReleaseApi();
  const r = await rm.createRelease(
    {
      definitionId: a.definitionId,
      description: a.description,
      isDraft: a.isDraft ?? false,
      artifacts: a.artifacts?.map((x) => ({
        alias: x.alias,
        instanceReference: { id: x.versionId, name: x.versionName },
      })),
      variables: a.variables
        ? Object.fromEntries(
            Object.entries(a.variables).map(([k, v]) => [k, { value: v }]),
          )
        : undefined,
    },
    a.projectId,
  );
  return getRelease(connection, { projectId: a.projectId, releaseId: r.id! });
}

export async function deployReleaseEnvironment(
  connection: WebApi,
  a: P<z.infer<typeof S.DeployReleaseEnvironmentSchema>>,
) {
  const rm = await connection.getReleaseApi();
  const e = await rm.updateReleaseEnvironment(
    {
      status: a.cancel
        ? EnvironmentStatus.Canceled
        : EnvironmentStatus.InProgress,
      comment: a.comment,
    },
    a.projectId,
    a.releaseId,
    a.environmentId,
  );
  return {
    id: e.id,
    name: e.name,
    status: enumName(EnvironmentStatus as never, e.status),
  };
}

export async function listReleaseApprovals(
  connection: WebApi,
  a: P<z.infer<typeof S.ListReleaseApprovalsSchema>>,
) {
  const rm = await connection.getReleaseApi();
  const approvals = await rm.getApprovals(
    a.projectId,
    a.assignedTo,
    enumValue<ApprovalStatus>(ApprovalStatus as never, a.status ?? 'pending'),
    a.releaseIds,
    undefined,
    a.top ?? 50,
  );
  return approvals.map((ap) => ({
    id: ap.id,
    release: ap.release?.name,
    releaseId: ap.release?.id,
    environment: ap.releaseEnvironment?.name,
    environmentId: ap.releaseEnvironment?.id,
    type: ap.approvalType === 1 ? 'preDeploy' : 'postDeploy',
    status: enumName(ApprovalStatus as never, ap.status),
    approver: who(ap.approver),
    createdOn: ap.createdOn,
  }));
}

export async function updateReleaseApproval(
  connection: WebApi,
  a: P<z.infer<typeof S.UpdateReleaseApprovalSchema>>,
) {
  const rm = await connection.getReleaseApi();
  const ap = await rm.updateReleaseApproval(
    {
      status:
        a.status === 'approved'
          ? ApprovalStatus.Approved
          : ApprovalStatus.Rejected,
      comments: a.comments,
    },
    a.projectId,
    a.approvalId,
  );
  return {
    id: ap.id,
    status: enumName(ApprovalStatus as never, ap.status),
    approvedBy: who(ap.approvedBy),
    comments: ap.comments,
  };
}
