# Shared engine and independent deployments

This repository serves the Sara application and a Git-installable `@vesper/core` package. Its package allowlist includes server modules, generic browser controllers, search and fonts. App-specific extensions belong to their own repository and never need to be copied here.

## Composition

Import `configureProfile` from `@vesper/core/profile` and configure a trusted application profile before importing engine modules. Profiles can provide default areas, topic classification, storage name, instructions, tool metadata, additional tools and authenticated/public route extensions. These hooks are trusted server code, never browser-controlled configuration. Existing authentication remains in force.

Browser apps share `createPager` and `createSheets`, while their page order, rendering and UI stay app-owned. Font assets and caching logic are also shared. Consumer builds copy only shared static assets into their public output; consumers keep their own frontend, service-worker startup policy and offline data handling.

## Versioned updates

Pin the dependency to an exact public commit, not `main` or a moving tag. Updating/deploying Sara does not modify another application's pinned dependency. An application updates its pin, lockfile and shell version only when intentionally adopting a core change, then runs its own compatibility tests before deployment.

- Sara-only UI: edit `public/app.js`, `public/index.html` or Office styles; deploy this repository only.
- Common engine: edit `src/` or `public/shared/`, run Sara tests, deploy/release the public commit. Consumers can adopt that commit independently.
- Other app-only changes: edit that application's repository; do not send app instructions, features or data to this repository.

Vercel projects retain separate repositories, domains and credentials. A push to one repository does not deploy the other. No consumer private repository access is needed to install this public package.

## Storage compatibility

New Sara installations use `Vesper Office` by default. Existing installations can set `VESPER_CALENDAR` to retain their established storage name. Engine updates do not move calendars or rewrite object identifiers. Known internal storage calendars are excluded from ordinary calendar listings, while the configured storage calendar is used for Tasks/notes.

## Tests

`npm test` uses a runner that removes cloud credentials from child processes, so build tests always operate on isolated demo data. Vercel builds run these checks before publishing. Integration clients should additionally test legacy iCalendar documents, existing MCP contracts and their own extensions.

## Public release channel

Only `sara-vX.Y.Z` stable releases from this public repository are distributed automatically. The official Vercel project uses `sara-stable` as its production branch. `main` changes remain development/preview changes until the release workflow is dispatched. See [automatic updates](AUTO_UPDATE.md). Neither updater nor publisher accesses any private app repository. Existing package name, profile ID and storage calendar names are compatibility identifiers; they are not product display names.
