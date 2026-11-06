# Execution ledger — docs/implementation-plan.md

- Baseline: frozen design files only, clean worktree, no executable tests.
- Authorization: design already frozen by user; no new design/permission gate. Work in requested repository, no new worktree.
- OpenAI credential skill overridden by explicit user prohibition: no credential search, provisioning or live calls.
- Pre-flight: journal keys K/phase/attempt used by rounds, moderation, ranking, images and publisher; one shared budget ledger covers text and images; no interface conflict.
- Task 1 in progress. Original Git metadata is read-only; independent writable metadata initialized from exact frozen branch. CLI online issue reads blocked; cached excerpts read for all modules.

- Resume 2026-11-06: frozen v1.3 commit 24259b4, 66 AC. Writable metadata advanced to exact frozen commit before scaffold; original refs untouched.
- CNB CLI get-issue #3–#10 retried: ConnectionRefused. Comments #10/#9/#5 will be retried separately; cached excerpts are only fallback evidence.
- Normal Tencent registry installation attempted: EAI_AGAIN DNS. Use available verified package tarball/cache; retain full-frame decoding requirements.
- Ruling: continue in the requested checkout with existing /tmp Git metadata; read-only .git prevents ordinary branch creation. No additional worktree or redesign.
- Task 1 foundation complete: Journal single writer, fsync/atomic indexes, running/clean witness and barriers; money ledger; local auth; owned DSH bridge. RED→GREEN: 10/10 tests (`npm test`). AC-66 covers intent write/fsync, revoked event/index and close fsync failure followed by crash/restart and later clean exit.
- Ruling: Node default test subprocess isolation fails in this sandbox; same tests execute using `--test-isolation=none` (10 pass). Test execution is real, process decoder/browser capability will be reported separately.
- Official cookbook/ACP read via web; current exact official master SHA cannot be established from stale GitHub history. Host SHA and actual loading remain AC-62 Mac prerequisites. No credential inspection or live paid calls.
- Push scaffold failed: DNS for cnb.cool. Each module push will still be attempted; bundle and PR body retained for delivery if networking remains blocked.
- Task 2 M1 complete: exclusive ingress modes; local monotonic stamp/sequence; source-scoped dedup; bounded raw buffer and reconnect. RED→GREEN: 12/12 (`npm test`). Actual douyinLive packet/identity compatibility remains Mac rehearsal. Push retried below.
- Task 3 M2 complete: controlled T1/D equality, draining, 60/30 capacity, batch ordering, immutable canonical frozen snapshot, task generation/attempt and phase adoption gates. RED→GREEN: 19/19 (`npm test`). Runtime will own actual timers and model/review orchestration; all deadlines use these same clocks.
- Task 4 M3 complete: private pending text; checked hash-bound independent approvals; nickname fallback; immutable whole-round output revocation via persisted request mapping, lineage access gates. RED→GREEN: 22/22 (`npm test`). Human GIF UI and full media decoder attach in M5/M6.
- Task 5 M4 complete: full-candidate strict integer validation; fixed weight recomputation/ties; raw+weighted/version audit; exact approved reason/prompt hash; shared 10s deadline; 3/3/6 reveal projection and immutable post-reveal winner. RED→GREEN: 31/31 (`npm test`).
- Task 6 M5 complete: exact Images SSE fields, verified static/GIF paths, one serial image queue, budget reservations before send, unknown costs retained, still-before-GIF and distinct approvals, complete PNG/GIF bytes and LZW validation, actual frame composition/contact sheet. RED→GREEN: 37/37 (`npm test`), including real independent decode Workers.
- Ruling: child process spawning is denied (spawnSync EPERM); independent resource-limited Worker is the implemented decoder isolation. Heap 96MiB + young 16MiB + stack 4MiB, bounded native buffers and 5s termination protect the host event loop. Mac concurrent-load behavior remains rehearsal.
- Task 7 M6/M7 integration implemented: isolated stage/control pages, exact receipt protocol and local watchdog; HTTP/WS loopback service; manual/model text orchestration, image and invoice controls, DSH lifecycle, no automatic restart replay. RED→GREEN: 45/45 (`npm test`); syntax and package import: 41 modules (`npm run check`).
- Added regressions for lost journal + surviving budget, clean restart without automatic playback/payment, and actual DSH maxTokens/no-tools setup; each observed RED then GREEN.
- Actual HTTP/WS loopback test attempted: listen EPERM on 127.0.0.1. Handler behavior tests pass, live transport does NOT count as verified. Browser dependencies/binaries are unavailable; dedicated browser test retained for explicit execution/reporting.
- Whole branch review requested under executing-plans/requesting-code-review; review is read-only. Frozen v1.3 remains authority. No credentials read, created or used; API dependencies in tests are injected mocks.
