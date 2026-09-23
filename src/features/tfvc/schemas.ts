import { z } from 'zod';
import { defaultProject } from '../../utils/environment';

const projectId = z
  .string()
  .optional()
  .describe(`The ID or name of the project (Default: ${defaultProject})`);

const versionFields = {
  version: z
    .string()
    .optional()
    .describe(
      'Version to read. Changeset number (e.g. "12345"), shelveset "name;owner", or date (e.g. "2026-01-31"). Omit for latest.',
    ),
  versionType: z
    .enum(['changeset', 'shelveset', 'date', 'latest', 'tip'])
    .optional()
    .describe(
      'How to interpret "version". Defaults to "changeset" when a version is given, otherwise latest.',
    ),
};

export const TfvcGetItemsSchema = z.object({
  projectId,
  scopePath: z
    .string()
    .optional()
    .describe(
      'TFVC server path to list, e.g. "$/NatPOS Suite Development/Main". Defaults to the project root "$/<project>".',
    ),
  recursionLevel: z
    .enum(['none', 'oneLevel', 'full'])
    .optional()
    .default('oneLevel')
    .describe(
      'none = the item only, oneLevel = direct children (default), full = everything below (can be very large)',
    ),
  ...versionFields,
});

export const TfvcGetFileContentSchema = z.object({
  projectId,
  path: z
    .string()
    .describe(
      'Full TFVC server path of the file, e.g. "$/Project/Main/src/Program.cs"',
    ),
  ...versionFields,
});

export const TfvcListChangesetsSchema = z.object({
  projectId,
  itemPath: z
    .string()
    .optional()
    .describe('Only changesets touching this TFVC path (file or folder)'),
  author: z
    .string()
    .optional()
    .describe('Filter by author (display name or DOMAIN\\user)'),
  fromDate: z
    .string()
    .optional()
    .describe('Only changesets on or after this date (ISO 8601)'),
  toDate: z
    .string()
    .optional()
    .describe('Only changesets on or before this date (ISO 8601)'),
  fromId: z.number().optional().describe('Lowest changeset ID to include'),
  toId: z.number().optional().describe('Highest changeset ID to include'),
  top: z
    .number()
    .optional()
    .default(25)
    .describe('Maximum number of changesets (default 25)'),
  skip: z.number().optional().describe('Number of changesets to skip'),
  maxCommentLength: z
    .number()
    .optional()
    .default(500)
    .describe(
      'Truncate check-in comments to this many characters (default 500)',
    ),
});

export const TfvcGetChangesetSchema = z.object({
  projectId,
  changesetId: z.number().describe('The changeset ID'),
  includeChanges: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include the list of changed files (default true)'),
  maxChangeCount: z
    .number()
    .optional()
    .default(200)
    .describe('Maximum number of changed files to return (default 200)'),
  includeWorkItems: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include associated work items (default true)'),
});

export const TfvcListBranchesSchema = z.object({
  projectId,
  path: z
    .string()
    .optional()
    .describe(
      'A specific branch path to inspect (returns it with its children). Omit to list all root branches.',
    ),
  includeChildren: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include child branches (default true)'),
  includeDeleted: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include deleted branches'),
});

export const TfvcListShelvesetsSchema = z.object({
  owner: z
    .string()
    .optional()
    .describe('Filter by owner (display name or DOMAIN\\user)'),
  name: z.string().optional().describe('Filter by shelveset name'),
  top: z
    .number()
    .optional()
    .default(50)
    .describe('Maximum number of shelvesets (default 50)'),
  skip: z.number().optional().describe('Number of shelvesets to skip'),
});

export const TfvcGetShelvesetSchema = z.object({
  shelvesetId: z
    .string()
    .describe(
      'Shelveset ID in the form "name;owner", as returned by tfvc_list_shelvesets',
    ),
  includeChanges: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include changed files (default true)'),
  includeWorkItems: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include associated work items (default true)'),
  maxChangeCount: z
    .number()
    .optional()
    .default(200)
    .describe('Maximum changed files to return (default 200)'),
});

export const TfvcListLabelsSchema = z.object({
  projectId,
  name: z
    .string()
    .optional()
    .describe('Label name filter (wildcards allowed, e.g. "Release*")'),
  owner: z.string().optional().describe('Filter by owner'),
  labelScope: z
    .string()
    .optional()
    .describe('Only labels scoped under this TFVC path'),
  itemLabelFilter: z
    .string()
    .optional()
    .describe('Only labels that include this item path'),
  top: z
    .number()
    .optional()
    .default(50)
    .describe('Maximum number of labels (default 50)'),
  skip: z.number().optional().describe('Number of labels to skip'),
});
