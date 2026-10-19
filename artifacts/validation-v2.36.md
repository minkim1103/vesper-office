# v2.36 — self-hosted fonts

- Bundled all 98 WOFF2 subsets referenced by Pretendard Variable 1.3.9 and Source Serif 4 (Google Fonts v15, variable weight 400–600), with both upstream SIL OFL licenses and a source/size manifest.
- Removed Google Fonts/jsDelivr stylesheet links and preconnects. Font CSS and binary assets now come from `/fonts/v1/`.
- Retained the font stack and system-font priority. No system/proprietary font redistribution.
- Service worker caches requested WOFF2 subsets first and preserves this cache across app-shell upgrades. The versioned font paths have immutable, one-year HTTP cache headers. No full-font preload.

Validation: `test/fonts.js` passed for every binary signature/size, stylesheet references, licenses and cache reuse with the simulated network offline. Service-worker syntax check and diff whitespace check passed. Browser showed local stylesheet links, existing typography and no console warnings/errors in the isolated demo. Computed title font remained Source Serif 4. Mobile screenshot saved outside the repository.

No measured before/after loading-time benchmark. Initial download depends on device font selection and displayed characters. Cached subsets can be reused offline; uncached glyph subsets require a first download. Calendar data persistence is unchanged.
