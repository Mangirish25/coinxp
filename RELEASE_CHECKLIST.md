# Release checklist

This checklist is intentionally not signed. Part 10 is incomplete.

Completed Part 10 slices:

- [x] Badge, level-up, streak, mission, challenge, purchase, and day recap notices carry presentation payloads without financial data
- [x] Atomic per-notice celebration claims prevent simultaneous devices from starting the same sequence; expired claims can be recovered
- [x] Muted notices and disabled celebrations remain visible in a static progress recap instead of being discarded
- [x] Celebration dialogs focus Skip when it becomes available, lock background scrolling, and return focus to the trigger on close
- [x] MOT-003 frame-time sampling is gated to visible animated visuals, recent interaction and a visible tab; low quality suppresses flame ambient extras
- [x] STR-012 adds a status-driven year heatmap and Monday–Sunday strip with text labels, activity counts, keyboard navigation, and reduced-motion handling
- [x] STR-012 calendar tooltips include the server-calculated streak length for each settled day and open on focus or tap
- [x] QA-002/004 Storybook Motion Lab includes flame, medallion and streak calendar controls, with the Accessibility addon enabled
- [x] Badge gallery search/category/earned filters and keyboard controls for showcase ordering
- [x] Rare and higher badge medallions add restrained hover tilt; detail cards flip between artwork and tier data with reduced-motion support
- [x] Account deletion grace boundary and cross-table erasure are covered by integration tests

- [x] Production same-origin cookie/header/origin baseline groundwork
- [x] Readiness endpoint checks database and migrations
- [x] In-memory server and client unit/component suites pass
- [x] Streaming owner-scoped account export and rate limit
- [x] Account deletion, 30-day grace, restore, hard-erasure integration check
- [x] Password change invalidates existing sessions with a per-user token version
- [x] SEC-002 authorization sweep enumerates mounted routers and rejects unauthenticated access across all 65 private route/method cases
- [ ] Full celebration payload contract, instant path, cross-device exactly-once behavior
- [ ] XP chips, level-up choreography, complete badge rarity reveal and streak heatmap
- [ ] UI state coverage for offline/partial failure at all screen sizes
- [ ] Storybook Motion Lab and visual regression baselines
- [ ] Playwright end-to-end flows and multi-browser smoke tests
- [ ] axe, contrast matrix, screen-reader and flash-rate review
- [ ] Lighthouse, frame-time, memory leak and final bundle-budget gates
- [ ] Nightly encrypted off-host backup, retention, restore check, and rehearsed recovery
- [ ] CI supply-chain/secret/container scans and pinned base image digest
- [ ] Deployment on the chosen host, migration rehearsal, monitoring and disclosure contact
- [ ] Manual screen-reader pass and owner sign-off
