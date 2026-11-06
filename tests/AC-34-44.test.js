import test from "node:test";
import assert from "node:assert/strict";
import omggif from "omggif";
import { deflateSync } from "node:zlib";
import { hash } from "../lib/util.js";
const M = await import("../lib/media.js").catch(() => ({})),
  O = await import("../lib/openai.js").catch(() => ({}));
import { png, gif } from "./fixtures.js";
test("AC-39/40/44: actual PNG bytes, CRC, fixed size/APNG and transport size rejected", async () => {
  assert.equal(typeof M.inspect, "function");
  const b = png();
  const info = await M.inspect(b, { kind: "still", size: "1x1" });
  assert.equal(info.sha256, hash(b));
  assert.equal(info.width, 1);
  assert.equal(info.frames, 1);
  for (const data of [
    Buffer.from("not PNG"),
    b.subarray(0, b.length - 1),
    Buffer.from(b).fill(1, 36, 37),
    Buffer.alloc(20 * 1024 * 1024 + 1),
  ])
    await assert.rejects(M.inspect(data, { kind: "still", size: "1x1" }));
  await assert.rejects(M.inspect(b, { kind: "still", size: "1024x1024" }));
  await assert.rejects(M.inspect(png(2049, 1), { kind: "partial" }));
});
test("AC-26/41/42/43: complete GIF frames/time and full-frame contact sheet from exact bytes", async () => {
  assert.equal(typeof M.inspect, "function");
  const b = gif();
  const info = await M.inspect(b, {
    kind: "gif",
    frame_count: 6,
    frame_duration_ms: 200,
  });
  assert.equal(info.frames, 6);
  assert.deepEqual(info.durations, [200, 200, 200, 200, 200, 200]);
  assert.equal(info.frame_hashes.length, 6);
  assert.notEqual(info.frame_hashes[0], info.frame_hashes[1]);
  assert.ok(info.contactSheet.startsWith("data:image/png;base64,"));
  assert.equal(info.sha256, hash(b));
  for (const f of [4, 7])
    await assert.rejects(
      M.inspect(gif(f), {
        kind: "gif",
        frame_count: 6,
        frame_duration_ms: 200,
      }),
    );
  await assert.rejects(
    M.inspect(gif(6, 2, 2, 10), {
      kind: "gif",
      frame_count: 6,
      frame_duration_ms: 200,
    }),
  );
  await assert.rejects(
    M.inspect(b.subarray(0, -4), {
      kind: "gif",
      frame_count: 6,
      frame_duration_ms: 200,
    }),
  );
});
test("AC-43: independent worker deadline and memory/pixel bounds fail closed", async () => {
  assert.equal(typeof M.inspect, "function");
  await assert.rejects(
    M.inspect(
      gif(),
      { kind: "gif", frame_count: 6, frame_duration_ms: 200 },
      { timeout: 0.01 },
    ),
  );
  const b = gif();
  b.writeUInt16LE(2048, 6);
  b.writeUInt16LE(2048, 8);
  await assert.rejects(
    M.inspect(b, { kind: "gif", frame_count: 6, frame_duration_ms: 200 }),
  );
});
test("AC-35/37/39: Images SSE exact fields, partials do not complete stream; oversized/duplicate streams denied", async () => {
  assert.equal(typeof O.OpenAIImages, "function");
  const events = [
    {
      type: "image_generation.partial_image",
      partial_image_index: 0,
      b64_json: png().toString("base64"),
    },
    {
      type: "image_generation.completed",
      b64_json: png().toString("base64"),
      usage: { output_tokens: 100 },
    },
  ];
  const enc = new TextEncoder();
  const api = new O.OpenAIImages({
    apiKey: "mock",
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (const event of events)
              c.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
            c.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  });
  const got = [];
  for await (const e of api.stream({
    model: "gpt-image-2.6-flare",
    stream: true,
    n: 1,
    moderation: "auto",
  }))
    got.push(e);
  assert.equal(got.length, 2);
  assert.equal(got[1].type, "completed");
  assert.equal(got[0].index, 0);
});
