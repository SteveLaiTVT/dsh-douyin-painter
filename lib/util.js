import { createHash, randomUUID } from "node:crypto";
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const canonical = (value) =>
  JSON.stringify(value === undefined ? null : sort(value));
function sort(x) {
  if (Array.isArray(x)) return x.map(sort);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, sort(x[k])]),
    );
  if (typeof x === "number" && !Number.isFinite(x))
    throw Error("non-finite number");
  return x;
}
export const sameK = (a, b) =>
  !!a &&
  !!b &&
  a.show_id === b.show_id &&
  a.round_id === b.round_id &&
  a.generation === b.generation;
export const keyK = (K) => `${K.show_id}/${K.round_id}/${K.generation}`;
export const id = () => randomUUID();
export const length = (s) =>
  [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(s)].length;
export const now = () => performance.now();
export function requireThat(condition, message = "invalid state") {
  if (!condition) throw Error(message);
}
