import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
// Read-only c2patool invocation; no signing, file rewriting, download/export or fabricated trust.
export async function verifyProvenance(path, { run = execute } = {}) {
  const base = {
    tool: "c2patool",
    c2pa_detected: null,
    validation: "unavailable",
    issuer: null,
    claim: null,
    trust: "not-established",
    synthid: "not-verifiable-locally",
  };
  try {
    const { stdout } = await run("c2patool", [path], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
    });
    const report = JSON.parse(stdout),
      active = report.active_manifest,
      manifest = report.manifests?.[active];
    if (!manifest)
      return {
        ...base,
        c2pa_detected: false,
        validation: "no-readable-manifest",
      };
    const statuses = report.validation_status;
    return {
      ...base,
      c2pa_detected: true,
      validation:
        statuses == null || (Array.isArray(statuses) && statuses.length === 0)
          ? "tool-reported-valid"
          : "reported-issues",
      issuer: manifest.signature_info?.issuer ?? null,
      claim: {
        label: active,
        claim_generator: manifest.claim_generator ?? null,
      },
      validation_status: statuses ?? [],
    };
  } catch (e) {
    return {
      ...base,
      reason: [
        "ENOENT",
        "EPERM",
        "ETIMEDOUT",
        "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
      ].includes(e.code)
        ? e.code
        : "verifier-failed",
    };
  }
}
