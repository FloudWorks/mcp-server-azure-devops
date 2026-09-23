# TFVC Tools

Tools for Team Foundation Version Control (TFVC) on Azure DevOps Server and Azure DevOps Services.

## How they work

| Group | Runs through | Needs |
|---|---|---|
| Read tools | TFVC REST API | Code (Read) |
| `tfvc_create_changeset` | TFVC REST API | Code (Read & write) |
| Branch, merge, shelve, label, rollback, rename, workspace | Visual Studio **TF.exe** on the machine running the MCP server | Windows + Visual Studio with Team Explorer, Code (Read & write) |

The TFVC REST API can only check in adds, edits and deletes. Everything else is done with TF.exe inside a
**dedicated server workspace** that the MCP server creates and owns (it never touches your own Visual Studio
workspaces). Every operation starts and ends with an undo of all pending changes in that workspace, and
operations are serialized.

### TF.exe settings

| Variable | Description | Default |
|---|---|---|
| `AZURE_DEVOPS_TF_PATH` | Full path to `TF.exe` | Auto-detected with vswhere / standard Visual Studio folders |
| `AZURE_DEVOPS_TFVC_WORKDIR` | Local folder for the workspace | `~/.azure-devops-mcp/tfvc/<collection>` |
| `AZURE_DEVOPS_TFVC_WORKSPACE` | Workspace name | `claude-mcp-<computer name>` |
| `AZURE_DEVOPS_TF_AUTH` | `pat` (sign in with `AZURE_DEVOPS_PAT`) or `windows` (current Windows account) | `pat` when a PAT is set |

The workspace maps `$/` to the workspace folder, but only the paths an operation needs are downloaded
(merges and rollbacks get the latest version of the target branch first, which can take a while the first time).

## Read tools

- `tfvc_get_items` – list files/folders under a server path, at latest or a changeset/date/shelveset
- `tfvc_get_file_content` – read a file
- `tfvc_list_changesets` – history filtered by path, author, date or ID range
- `tfvc_get_changeset` – comment, changed files and linked work items
- `tfvc_list_branches`, `tfvc_list_shelvesets`, `tfvc_get_shelveset`, `tfvc_list_labels`

## Write tools

### `tfvc_create_changeset`
Check in adds, edits and deletes directly on the server. Edits send the full new content or a
`search`/`replace` (must match exactly once unless `replaceAll`). Each file keeps its encoding and BOM
(UTF-8, UTF-16 and Windows-125x). `expectedVersion` refuses the edit if someone else changed the file.
`dryRun: true` returns a unified diff without checking in. `workItemIds` adds "Fixed in Changeset" links.

### Mode: preview, checkin or shelve
`tfvc_branch`, `tfvc_merge`, `tfvc_rollback` and `tfvc_rename` take a `mode`:
- `preview` – pend the change, report the pending changes, then undo
- `checkin` – check in and link `workItemIds`
- `shelve` – save as `shelvesetName` (replacing one with the same name) for review

### `tfvc_merge`
Merge everything, a range (`fromChangeset`/`toChangeset`) or cherry-picked `changesets`, optionally
`baseless` or `discard`. Conflicts are auto-merged where possible. Anything left is handled by
`conflictResolution`: `abort` (default – undo and report the conflicts), `keepTarget` or `takeSource`.
Use `tfvc_merge_candidates` first to see which changesets haven't been merged yet.

### Other tools
- `tfvc_branch` – branch from a path at a version (`C1234`, `D2026-09-01`, `Llabel`)
- `tfvc_shelve` – shelve file changes (same change format as `tfvc_create_changeset`)
- `tfvc_checkin_shelveset` / `tfvc_delete_shelveset`
- `tfvc_create_label` / `tfvc_delete_label`
- `tfvc_rollback` – roll back one changeset or a range within a path
- `tfvc_rename` – rename or move a file or folder
- `tfvc_workspace` – show the MCP workspace and pending changes; `reset: true` undoes everything

Note: TFVC check-in policies run inside Visual Studio, so changes made through these tools may not
evaluate client-side policies. Server-side gated check-in builds still apply to TF.exe check-ins.
