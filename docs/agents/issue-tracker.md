# Issue tracker: GitHub

Issues and specs live in GitHub Issues in `zekeadam/orca`. Use the `gh` CLI.

## Repository scope

Follow the Repository Scope section in `AGENTS.md`. Pass `--repo zekeadam/orca` to every supported `gh` command. For `gh api`, use an explicit `repos/zekeadam/orca/...` endpoint. Verify the target before every write.

## Conventions

- Create: `gh issue create --repo zekeadam/orca --title "..." --body-file <file>`.
- Read: `gh issue view <number> --repo zekeadam/orca --json number,title,body,labels,comments`.
- List: `gh issue list --repo zekeadam/orca --state open --limit 100 --json number,title,body,labels,comments`. Apply relevant label filters and paginate when a complete result is required.
- Comment: `gh issue comment <number> --repo zekeadam/orca --body-file <file>`.
- Label: `gh issue edit <number> --repo zekeadam/orca --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --repo zekeadam/orca`.

Write multiline bodies to UTF-8 files and pass `--body-file`; preserve literal text and newlines.

When a skill says "publish to the issue tracker", create a GitHub issue. When it says "fetch the relevant ticket", read the issue body, labels and comments.

## Pull requests as a triage surface

**PRs as a request surface: no.**

If enabled later, use the corresponding `gh pr` commands with the same explicit repository. Include only external authors with `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` or `NONE` association. Resolve ambiguous bare numbers as PRs first, then issues; distinguish a missing PR from an access or network failure.

## Wayfinding operations

- Map: an issue labelled `wayfinder:map` with Notes / Decisions-so-far / Fog sections.
- Child: link a ticket as a GitHub sub-issue. If unavailable, list it in the map's task list and add `Part of #<map>` to the child body. Use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task` as appropriate.
- Blocking: use native issue dependencies. Add an edge with `gh api --method POST repos/zekeadam/orca/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. Read the numeric database ID from `gh api repos/zekeadam/orca/issues/<blocker> --jq .id`. If dependencies are unavailable, record `Blocked by: #<number>` in the child body and resolve blocker states explicitly.
- Frontier: inspect the map's open children in map order; choose the first unassigned child with no open blockers. Native `issue_dependencies_summary.blocked_by` counts open blockers.
- Claim: `gh issue edit <number> --repo zekeadam/orca --add-assignee @me`.
- Resolve: post the answer, close the child and add a concise result and link to the map's Decisions-so-far section.
