# 弹幕画师 v1 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task. Preserve the frozen spec. Steps use checkboxes for progress.

**Goal:** Implement M1–M7 with AC-addressed offline tests and a reviewable branch/PR; never merge.

**Architecture:** In-process external protocol driver, one event journal writer, serial text/image queues, independent safety and accounting paths. A loopback HTTP/WS publisher separates the private control session from a read-only stage. Review and asset access bind K, version and exact bytes.

**Tech Stack:** Node.js ESM, built-in test runner, ws, omggif, isolated abortable resource-limited Worker decoder; no live API tests.

**Spec:** DESIGN.md v1.3 at 24259b4; DECISIONS.md; RESEARCH §4; CNB #10 and #3–#9.

## Global Constraints

- T1 != T2; [T0,T1), review < D, freeze immutable canonical UTF-8 SHA-256.
- Never publish unreviewed strings/pixels; permanent round-wide safety revocation across generations.
- Control token + exact Host/Origin + CSRF + hash-bound approval; loopback only.
- Unconfigured show_budget_limit_usd prohibits paid calls; atomic reservations include paid text.
- Tests inject all network/model dependencies. Do not inspect, create or use real keys.
- Mac DSH, douyinLive and actual capture are rehearsal requirements, never simulated successes.

## Review Focus

- Delayed callbacks after cancellation/restart must not revive pixels or release unknown cost.
- Same timestamp at T1/D and batch capacity tie must stay deterministic.
- Replaced bytes and same hashes in different rounds must respect approval and lineage.
- Frozen/suspended stage or missing receipt must keep control warning visible.
- Damaged journal or missing revocation/budget records must keep publication/paid calls disabled.

## Task 1: M7 foundation

Files: index.js, cordis.patch.yml, lib/{plugin,bridge,queue,config,journal,auth,budget}.js; tests/AC-{20,45-49,58-64,66}.test.js.
Interfaces: Journal.commit(type,data) -> durable event; Budget.reserve/send/settle; Auth.exchange/authorize; DshBridge.run/followup/close.
- [x] Write/run failing AC tests; implement; run complete suite; commit; attempt push (DNS blocked) M7 skeleton.

## Task 2: M1 ingestion

Files: lib/transport.js; tests/AC-01-03.test.js.
Interfaces: Ingress.submit -> locally stamped event consumed by RoundEngine; transport emits health only, never public strings.
- [x] RED -> implement -> GREEN -> commit; attempt push (DNS blocked).

## Task 3: M2 rounds

Files: lib/rounds.js; tests/AC-04-16.test.js.
Interfaces: RoundEngine.start/receive/stop/review/freeze/task/accept; Journal persists frozen snapshot before ranking.
- [x] RED boundary/capacity/late tests -> implement -> GREEN -> commit; attempt push (DNS blocked).

## Task 4: M3 moderation

Files: lib/moderation.js, lib/assets.js; tests/AC-17-26.test.js.
Interfaces: Moderation.reviewText/approve/moderationBlocked/revoke; AssetStore.checked/read; safety bypasses ordinary queue.
- [x] RED revocation/hash tests -> implement -> GREEN -> commit; attempt push (DNS blocked).

## Task 5: M4 ranking

Files: lib/ranking.js; tests/AC-27-33.test.js.
Interfaces: Ranking.propose/publish/reveal; full candidate scores and same frozen hash persist before winner dispatch.
- [x] RED score/type/time tests -> implement -> GREEN -> commit; attempt push (DNS blocked).

## Task 6: M5 image pipeline

Files: lib/{images,openai,media,decode-worker,decode-core,png,provenance}.js; tests/AC-34-49.test.js.
Interfaces: Images.generate/retry/cancel; OpenAIImages.stream/gif; inspect(bytes, locked config) -> checked full-frame record/contact sheet.
- [x] RED stream/file/budget tests -> implement -> GREEN -> commit; attempt push (DNS blocked).

## Task 7: M6 + M7 integration

Files: lib/{publisher,server,runtime}.js; public/{stage,control}.*; tests/AC-50-65.test.js and browser tests; docs/{AC-STATUS,MAC-REHEARSAL}.md.
Interfaces: Publisher.connect/heartbeat/command/ack; Runtime wires authenticated commands to modules; apply(ctx) owns startup/shutdown.
- [x] RED lease/ack/integration tests -> implement -> GREEN -> commit; attempt push (DNS blocked).
- [x] Fresh whole-branch review, fix material findings with regression tests, full verification.
- [ ] Prepare 66-row PR body; cnb post-pull to main; never merge.

## Environment evidence

Original .git is read-only. Work files stay in this repository; independent metadata is in /tmp/dsh-painter-v1-git/.git, branch feat/v1-impl rooted at design/v1.1-freeze. Every commit; attempt push (DNS blocked) uses explicit --git-dir/--work-tree. The original main and design refs remain untouched. cnb CLI issue fetch attempts fail ConnectionRefused; /tmp/issues/m0–m7.md are cached local excerpts, not a successful online fetch. Remote push/PR will be attempted and failures reported without inventing a URL.

Module commit steps are complete locally. Every planned push was attempted and failed DNS; PR creation remains externally blocked and is not checked complete.
