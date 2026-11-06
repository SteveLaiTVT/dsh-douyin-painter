import omggif from "omggif";
import { encodePNG } from "../lib/png.js";

// Offline demo artwork; deliberately contains the word MOCK in the actual pixels.
function drawing(size, frame = 0) {
  const rgba = Buffer.alloc(size * size * 4);
  // Simple geometric moon, stars and a floating cat; this is never a model output.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, k = (y * size + x) * 4;
    let c = [22 + Math.floor(18 * v), 37 + Math.floor(20 * v), 68 + Math.floor(30 * v)];
    if ((u - .69) ** 2 + (v - .29) ** 2 < .028) c = [255, 224, 143];
    if ((u - .42) ** 2 / .024 + (v - .62 - frame * .003) ** 2 / .032 < 1) c = [233, 171, 128];
    if ((u - .42) ** 2 + (v - .43 - frame * .003) ** 2 < .017) c = [245, 194, 152];
    if (v > .23 && v < .37 && ((u > .29 && u < .36 && u < .29 + (v - .23) / 2) || (u > .48 && u < .55 && u > .55 - (v - .23) / 2))) c = [245, 194, 152];
    if (((u - .37) ** 2 + (v - .43 - frame * .003) ** 2 < .00012) || ((u - .47) ** 2 + (v - .43 - frame * .003) ** 2 < .00012)) c = [31, 43, 54];
    if ((x * 53 + y * 17) % (Math.floor(size / 8) * 101) === 0 && v < .75) c = [252, 237, 196];
    if (v > .84 && v < .98) c = [255, 222, 140];
    rgba.set([...c, 255], k);
  }
  // A readable, fixed 5×7 MOCK stamp, independent of system fonts.
  const letters = [
    ["10001","11011","10101","10101","10001","10001","10001"],
    ["01110","10001","10001","10001","10001","10001","01110"],
    ["01111","10000","10000","10000","10000","10000","01111"],
    ["10001","10010","10100","11000","10100","10010","10001"],
  ];
  const unit = Math.max(1, Math.floor(size / 80)), left = Math.floor((size - 23 * unit) / 2), top = Math.floor(.865 * size);
  letters.forEach((rows, i) => rows.forEach((row, y) => [...row].forEach((bit, x) => {
    if (bit !== "1") return;
    for (let dy = 0; dy < unit; dy++) for (let dx = 0; dx < unit; dx++)
      rgba.set([23, 35, 54, 255], ((top + y * unit + dy) * size + left + (i * 6 + x) * unit + dx) * 4);
  })));
  return rgba;
}

export class MockImages {
  async *stream(_params, { signal } = {}) {
    signal?.throwIfAborted();
    yield { type: "completed", bytes: encodePNG(1024, 1024, drawing(1024)) };
  }
  async gif(params, { signal } = {}) {
    const size = 256, bytes = Buffer.alloc(2 * 1024 * 1024);
    const palette = [0x182a4b, 0xffdf91, 0xe9ab80, 0xf5c298, 0x1f2b36, 0xfcedc4, 0x283962, 0x000000];
    const writer = new omggif.GifWriter(bytes, size, size, { palette, loop: 0 });
    for (let frame = 0; frame < params.frame_count; frame++) {
      signal?.throwIfAborted();
      const rgba = drawing(size, frame < 3 ? frame : 5 - frame), indexed = new Uint8Array(size * size);
      for (let i = 0; i < indexed.length; i++) {
        const r = rgba[i * 4], g = rgba[i * 4 + 1];
        indexed[i] = r > 250 ? (g > 230 ? 5 : 1) : r > 240 ? 3 : r > 200 ? 2 : r < 33 ? 0 : 6;
      }
      writer.addFrame(0, 0, size, size, indexed, { delay: params.frame_duration_ms / 10, disposal: 1 });
    }
    return { bytes: bytes.subarray(0, writer.end()) };
  }
}
