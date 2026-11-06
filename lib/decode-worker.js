import { parentPort, workerData } from "node:worker_threads";
import { decode } from "./decode-core.js";
try {
  parentPort.postMessage({
    ok: true,
    info: decode(
      Buffer.from(workerData.bytes),
      workerData.locked,
      workerData.limits,
    ),
  });
} catch (e) {
  parentPort.postMessage({ ok: false, error: e.message });
}
