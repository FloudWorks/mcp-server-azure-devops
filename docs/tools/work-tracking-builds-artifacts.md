# Work Tracking, Builds & Releases, and Artifacts Tools

## Work tracking
- `list_teams` – teams in a project
- `list_iterations` / `list_area_paths` – iteration (sprint) and area trees, with sprint dates
- `create_iteration` / `create_area_path` – add a sprint (with dates) or area under a parent
- `get_team_sprints` – a team's current, past, future or all sprints
- `get_sprint_work_items` – work items in a sprint (default: current), with parent links
- `list_queries` / `run_query` – saved queries, run by ID or path (e.g. `Shared Queries/Active Bugs`)
- `delete_work_item` – move to the Recycle Bin, or `destroy: true` to delete permanently

## Builds (classic and YAML)
- `list_build_definitions`, `list_builds`, `get_build` (with associated changesets/commits)
- `queue_build` – optionally for a TFVC branch/changeset (`$/Project/Master`, `C1234`) or Git branch/commit, with queue-time variables and demands
- `cancel_build`, `get_build_logs`

## Classic releases
- `list_release_definitions`, `list_releases`, `get_release` (stages, status and approvals)
- `create_release` – choose artifact versions and release-time variables
- `deploy_release_environment` – start or cancel deployment to a stage
- `list_release_approvals`, `update_release_approval` – approve or reject with a comment

## Azure Artifacts
- `list_feeds`, `list_packages`, `get_package_versions`
- `delete_package_version` – unpublish an npm or NuGet version (goes to the feed Recycle Bin)
- `promote_package_version` – promote an npm or NuGet version to a view such as `Release`

Packaging calls use REST api-version `AZURE_DEVOPS_PACKAGING_API_VERSION` (default `5.0-preview.1`, which
Azure DevOps Server 2019 and later accept). Project-scoped feeds need `projectId`.
