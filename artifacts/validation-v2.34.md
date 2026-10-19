# v2.34 validation — 2026-10-19

## Changes
- Workstream keeps its name and uses project cards with progress, nearest deadline, two pending tasks, expandable remaining tasks, direct completion and task creation.
- The summary shows active projects, tasks due today and overdue tasks. The AI briefing stays compact and opens the full saved note.
- Calendar list search previously requested 425 days, exceeding the server's 400-day limit. Requests now split into bounded date ranges, with deduplication and stale-response guards.
- Search matches normalized title/location/notes across multiple words. Default range is one year before/after today; the user can expand it.

## Automated
Passed all seven suites: run, google, spaces, workstream, assistant, briefing-style, search.
Search regression reproduces the old range rejection, validates contiguous bounded batches, finds a 120-day-old event, and checks Korean Unicode normalization, case/full-width matching, multiple terms and no matches.
`git diff --check` passed.

## Browser, 390 × 844
Used an isolated seeded demo at localhost:3217, with no real calendar credentials.
- Workstream heading, three project cards, progress and overdue badges rendered correctly; dark-mode badge contrast adjusted.
- Expanded a card and verified undated tasks are included.
- Completed a task directly: progress changed 3/7 → 4/7 and the due/overdue summary updated.
- Added a task with no deadline: sheet closed, card displayed the task and progress changed 4/7 → 4/8.
- Searched “강남 예산”: found the 120-day-old event using its location and notes.
- Changed queries and confirmed the displayed result corresponds to the latest query.
- No-match query displayed the empty-result message; clearing restored upcoming events.
- Reloaded and captured final project-card screenshot.

Screenshots contain sample data. Real iCloud persistence and external AI scheduled execution are outside this change's validation.
