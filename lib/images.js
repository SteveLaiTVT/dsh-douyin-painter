import { TaskQueue } from "./queue.js";
import {
  hash,
  canonical,
  sameK,
  keyK,
  length,
  now,
  requireThat,
} from "./util.js";
export class Images {
  constructor({
    j,
    rounds,
    assets,
    moderation,
    budget,
    api,
    config,
    clock = now,
  }) {
    Object.assign(this, {
      j,
      rounds,
      assets,
      m: moderation,
      budget,
      api,
      config,
      clock,
    });
    this.queue = new TaskQueue(6);
    this.scheduled = new Set();
    this.inflight = new Map();
    this.closed = false;
    this.onAvailable = () => {};
    this.onStatus = () => {};
  }
  params(phase, frames = 6) {
    return phase === "still"
      ? {
          model: this.config.stillModel,
          output_format: "png",
          size: "1024x1024",
          quality: "medium",
          complexity: "low",
          stream: true,
          partial_images: 2,
          n: 1,
          moderation: "auto",
        }
      : {
          model: this.config.gifModel,
          output_format: "gif",
          frame_count: frames,
          frame_duration_ms: 200,
          size: "auto",
          quality: "medium",
          complexity: "low",
          n: 1,
          moderation: "auto",
        };
  }
  endpoint(phase) {
    if (phase === "still") return "generations";
    return this.config.verifiedPaths?.some(
      (p) =>
        p.verified &&
        p.phase === "gif" &&
        p.model === this.config.gifModel &&
        p.project === this.config.project &&
        p.endpoint === "edits",
    )
      ? "edits"
      : "generations";
  }
  signature(phase, frames = 6) {
    return hash(
      canonical({
        phase,
        project: this.config.project,
        endpoint: this.endpoint(phase),
        params: this.params(phase, frames),
      }),
    );
  }
  preflight(K, phase, frames = 6) {
    requireThat(
      !this.closed &&
        !this.budget.halted &&
        ["still", "gif"].includes(phase) &&
        this.j.isAllowed(K) &&
        sameK(this.rounds.current?.K, K),
      "generation unavailable",
    );
    const rank = this.j.state.rankings[K.round_id];
    requireThat(
      rank?.approved &&
        rank.ranked.length &&
        sameK(rank.K, K) &&
        this.m.isApprovedText(rank.text_id, rank.text_hash),
      "persisted approved winner required",
    );
    const endpoint = this.endpoint(phase),
      signature = this.signature(phase, frames);
    requireThat(
      this.config.verifiedPaths?.some(
        (p) =>
          p.verified &&
          p.phase === phase &&
          p.model === this.params(phase, frames).model &&
          p.project === this.config.project &&
          p.endpoint === endpoint &&
          p.signature === signature,
      ),
      "exact model/project/endpoint/parameters not verified",
    );
    const reference =
      phase === "gif"
        ? Object.values(this.j.state.assets)
            .filter(
              (a) =>
                sameK(a.K, K) &&
                a.kind === "still" &&
                this.assets.canPublish(a.id),
            )
            .at(-1)
        : null;
    if (phase === "gif")
      requireThat(reference, "approved final still required");
    return { rank, endpoint, reference, signature };
  }
  generate(K, phase, { retry = false, operator } = {}) {
    try {
      this.preflight(K, phase);
      requireThat(!retry || operator, "manual retry requires operator");
      const key = `${keyK(K)}/${phase}`;
      requireThat(!this.scheduled.has(key), "generation already queued");
      this.scheduled.add(key);
      return this.queue
        .push(() => this.execute(K, phase, { retry }))
        .finally(() => this.scheduled.delete(key));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  async execute(K, phase, { retry }) {
    let frames = 6;
    const all = Object.values(this.j.state.requests).filter(
      (r) => r.K.round_id === K.round_id && r.phase !== "text",
    );
    const previous = all.filter((r) => r.phase === phase);
    requireThat(retry || previous.length === 0, "explicit retry required");
    requireThat(!retry || !all.some((r) => r.retry), "round retry exhausted");
    let phaseStart = previous[0]?.phase_started ?? this.clock();
    const deadline = phaseStart + 120000;
    let retried = retry;
    while (true) {
      const { rank, endpoint, reference, signature } = this.preflight(
        K,
        phase,
        frames,
      );
      requireThat(this.clock() < deadline, "phase deadline");
      let image;
      if (reference && endpoint === "edits")
        image = await this.assets.read(reference.id, { public: true });
      const params = { ...this.params(phase, frames), prompt: rank.prompt };
      const rule = this.config.costRules?.find(
        (r) =>
          r.verified &&
          r.signature === signature &&
          length(rank.prompt) <= r.max_prompt_chars &&
          (!image || image.length <= r.max_image_bytes),
      );
      requireThat(
        rule &&
          Number.isFinite(rule.upper_bound_usd) &&
          rule.upper_bound_usd > 0 &&
          rule.evidence,
        "no reliable cost upper bound",
      );
      const task = await this.rounds.task(
        phase,
        Object.values(this.j.state.requests).filter(
          (r) => r.K.round_id === K.round_id && r.phase === phase,
        ).length + 1,
      );
      const reservation = await this.budget.reserve({
        K,
        phase,
        attempt: task.attempt,
        task_id: task.task_id,
        model: params.model,
        endpoint,
        params,
        project: this.config.project,
        input_hash: image ? hash(image) : null,
        bound: rule.upper_bound_usd,
        evidence: { verified: true, source: rule.evidence, signature },
        retry: retried,
        phase_started: phaseStart,
      });
      await this.budget.send(reservation.request_id);
      const controller = new AbortController(),
        record = {
          K,
          controller,
          request_id: reservation.request_id,
          deadline,
        };
      this.inflight.set(reservation.request_id, record);
      let completed = false,
        produced = false,
        finalAsset = null;
      const valid = () =>
        !controller.signal.aborted &&
        this.clock() < deadline &&
        this.j.isAllowed(K) &&
        sameK(this.rounds.current?.K, K) &&
        this.rounds.current.tasks[phase]?.task_id === task.task_id;
      const timer = setTimeout(
        () => controller.abort("phase timeout"),
        Math.max(1, deadline - this.clock()),
      );
      this.onStatus({
        K,
        phase,
        started: phaseStart,
        deadline,
        label:
          phase === "gif" && endpoint === "generations"
            ? "同题动图"
            : phase === "gif"
              ? "参考静图动图"
              : "笔刷演绎 · 等待生成",
      });
      try {
        if (phase === "still") {
          let lastIndex = -1;
          for await (const event of this.api.stream(params, {
            signal: controller.signal,
          })) {
            produced = true;
            if (event.usage)
              await this.budget.unknown(
                reservation.request_id,
                "费用待核",
                event.usage,
              );
            if (event.remote_id)
              await this.recordRemote(reservation.request_id, event.remote_id);
            if (!valid()) continue;
            if (event.type === "partial") {
              if (event.index <= lastIndex) continue;
              lastIndex = event.index;
              const a = await this.assets.checked(event.bytes, {
                K,
                kind: "partial",
              });
              if (valid()) this.onAvailable(a);
            } else if (event.type === "completed") {
              finalAsset = await this.assets.checked(event.bytes, {
                K,
                kind: "still",
                locked: { size: params.size },
              });
              completed = true;
            }
          }
        } else {
          const event = await this.api.gif(params, {
            endpoint,
            image,
            signal: controller.signal,
          });
          produced = true;
          if (event.usage)
            await this.budget.unknown(
              reservation.request_id,
              "费用待核",
              event.usage,
            );
          if (event.remote_id)
            await this.recordRemote(reservation.request_id, event.remote_id);
          if (valid()) {
            finalAsset = await this.assets.checked(event.bytes, {
              K,
              kind: "gif",
              parents: endpoint === "edits" ? [reference.id] : [],
              locked: { frame_count: frames, frame_duration_ms: 200 },
            });
            completed = true;
          }
        }
        if (completed && valid() && (await this.rounds.accept(task))) {
          await this.rounds.phase(`${phase}_review`);
          this.onAvailable(finalAsset);
          await this.j.commit("image-stage-result", [
            {
              table: "results",
              id: `image:${K.round_id}:${phase}`,
              value: {
                K,
                status: "awaiting-review",
                asset_id: finalAsset.id,
                request_id: reservation.request_id,
                label:
                  phase === "gif" && endpoint === "generations"
                    ? "同题动图"
                    : null,
              },
            },
          ]);
          return finalAsset;
        }
        await this.budget.unknown(
          reservation.request_id,
          "结果不明/普通迟到不采用",
        );
        return null;
      } catch (e) {
        if (e.code === "moderation_blocked") {
          await this.m.moderationBlocked(reservation.request_id, e, produced);
          return null;
        }
        await this.budget.unknown(
          reservation.request_id,
          e.code === "rate_limit_exceeded" ? "速率限制" : "结果不明/费用待核",
          e.usage,
        );
        await this.j.commit("image-stage-failed", [
          {
            table: "results",
            id: `image:${K.round_id}:${phase}`,
            value: {
              K,
              status: "failed",
              request_id: reservation.request_id,
              kind: e.code || "technical",
            },
          },
        ]);
        const transient = e.code === "rate_limit_exceeded" && e.status === 429;
        const parameter =
          e.code === "invalid_parameter" &&
          ["frame_count", "size"].includes(e.parameter);
        if (
          !retried &&
          (transient || parameter) &&
          this.clock() + 1000 < deadline &&
          this.j.isAllowed(K)
        ) {
          if (parameter) {
            if (phase !== "gif") return null;
            frames = 4;
          }
          retried = true;
          try {
            this.preflight(K, phase, frames);
          } catch {
            return null;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        if (valid()) await this.rounds.phase("closing");
        return null;
      } finally {
        clearTimeout(timer);
        this.inflight.delete(reservation.request_id);
      }
    }
  }
  async recordRemote(request_id, remote_id) {
    await this.j.transact("request-remote-id", (s) => [
      {
        table: "requests",
        id: request_id,
        value: { ...s.requests[request_id], remote_id },
      },
    ]);
  }
  async cancel(K) {
    for (const r of this.inflight.values())
      if (!K || r.K.round_id === K.round_id)
        r.controller.abort("operator cancelled");
  }
  elapsed(K) {
    const r = [...this.inflight.values()].find((r) => sameK(r.K, K));
    if (!r) return null;
    const seconds = Math.floor((this.clock() - (r.deadline - 120000)) / 1000);
    return {
      seconds,
      message:
        seconds >= 90
          ? "可能较慢，仍在生成"
          : seconds >= 45
            ? "仍在生成"
            : "等待生成",
    };
  }
  async close() {
    this.closed = true;
    await this.cancel();
    await this.queue.close();
  }
}
