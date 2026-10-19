# v2.35 — page transitions

Fixed missing recovery after touch cancellation, viewport changes, browser backgrounding and page restoration. Newly displayed neighbor pages are positioned before becoming visible; offscreen pages are hidden after settlement. The horizontal viewport is clipped.

Touch movement is coalesced with requestAnimationFrame; transitions use translate3d and temporary compositor hints. Network refresh starts after the transition settles. Trackpad momentum is limited to one page per gesture. Reduced-motion preference skips animated settlement.

Validation:
- `node --check public/app.js` and `git diff --check` passed.
- `node test/paging.js` passed: cancelled partial swipe, one render for multiple move events, completed swipe, width change, wheel momentum, background recovery and page restoration.
- Browser at 390×844 then 430×932: Calendar → Workstream → Calendar. Workstream aligned at x=0 after resize; returning Calendar left both neighboring pages hidden and Calendar at x=0.
- Screenshot saved outside the repository with isolated demo data.

No real iPhone 120Hz frame-rate measurement was performed. Browser/OS/display refresh rates determine the available frame rate.

Offline data persistence is a proposal only in this version. The current service worker caches the app shell, not calendar API responses. A suitable first step is an account-scoped IndexedDB snapshot (events/tasks/projects/briefings plus last-sync time), shown immediately and refreshed from the server online. Keep offline editing disabled initially; never upload the old snapshot as a replacement for server data. Clear the account snapshot on logout/account changes. Offline writes would need a separate operation queue, stable IDs and revision/conflict handling.
