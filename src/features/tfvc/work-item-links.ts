import { WebApi } from 'azure-devops-node-api';

/**
 * Link a TFVC changeset to work items ("Fixed in Changeset" artifact link),
 * the same link Visual Studio creates when associating work items on check-in.
 * Returns the IDs that failed, with the error message.
 */
export async function linkChangesetToWorkItems(
  connection: WebApi,
  changesetId: number,
  workItemIds: number[] | undefined,
): Promise<{ linked: number[]; failed: { id: number; error: string }[] }> {
  const linked: number[] = [];
  const failed: { id: number; error: string }[] = [];
  if (!workItemIds?.length) return { linked, failed };
  const wit = await connection.getWorkItemTrackingApi();
  for (const id of workItemIds) {
    try {
      await wit.updateWorkItem(
        undefined,
        [
          {
            op: 'add',
            path: '/relations/-',
            value: {
              rel: 'ArtifactLink',
              url: `vstfs:///VersionControl/Changeset/${changesetId}`,
              attributes: { name: 'Fixed in Changeset' },
            },
          },
        ],
        id,
      );
      linked.push(id);
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { linked, failed };
}
