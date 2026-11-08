# Generation Service SDK Implementation Plan

Goal: implement the approved docs/superpowers/specs/2026-11-08-generation-service-sdks.md.
User approved implementation, private CNB/lib repositories and release delivery. Keep old ai-kit compatible.

- [x] task-runtime: strict typed errors, task handles, total admission cap, FIFO concurrency, cancellation/deadlines, bounded retry and logs. Tests first: concurrency, queue overflow, backoff capacity, stalled cancellation and close.
- [x] speech-generation: independent provider contract/MiniMax adapter and SpeechService, full and single-consumer streaming lifecycle; test provider cancellation, bytes, stream permits, output-after-failure and no stream retries.
- [x] image-generation: independent image contract/OpenAI-compatible adapter and ImageService; typed format/reference capabilities and validation, fake-provider contracts, safe retry errors.
- [x] Integration: fixed SDK dependencies, app-specific adapters and playback queue remain in business project, service cleanup tied to application close, no SDK source copies.
- [x] Verify each independent SDK npm ci/test/pack, app189 + browser13, standalone installation/example; reviewer checks complete changes.
- [x] Create private CNB/lib repositories, grouped commits and releases with downloaded tarball checksum proof; pin app dependencies to verified release revisions and push feature branch.

Implementation ownership: coordinator owns task-runtime and app integration. Speech and image provider/service implementations can proceed independently against the runtime contract once scaffolded; no cross-editing of repositories. Common runtime has no provider or application knowledge.

Default retry maxAttempts=1; streaming retries forbidden after first delivered output. Abort cannot forcibly kill custom code: logical terminal state may precede resource exit; resource permits remain held until cleanup. Runtime close reports stalled work. No paid model calls or npm registry publication in this run.
