# Bundled webfonts

`v1/` contains the upstream WOFF2 files used by Vesper, their Unicode subset styles, original SIL OFL licenses, and a source/size manifest.

- Pretendard Variable 1.3.9: 92 upstream dynamic subsets.
- Source Serif 4 (Google Fonts v15): 6 upstream subsets, variable weight 400–600 and optical size 8–60.

Font files are unmodified. System font fallbacks stay installed on the device; proprietary system fonts are not redistributed.

Only subsets needed by displayed characters are requested. Font responses are cached first by the service worker and have long-lived HTTP cache headers. There is no all-font preload. Previously fetched subsets can be reused without a network connection; never-viewed glyph subsets still need their first download. Browsers may evict cached files.

Paths under v1 are immutable. Publish changed font bytes/styles under a new directory/cache version rather than overwriting v1 assets.
