import test from "node:test";
import assert from "node:assert/strict";
const m = await import("../lib/provenance.js").catch(() => ({}));
test("AC-57: actual verifier report records signature issues and signer separately from trust or SynthID claims", async () => {
  assert.equal(typeof m.verifyProvenance, "function");
  const report = {
    active_manifest: "urn:test",
    manifests: {
      "urn:test": {
        claim_generator: "fixture",
        signature_info: { issuer: "Fixture Issuer" },
      },
    },
    validation_status: null,
  };
  const valid = await m.verifyProvenance("/private/fixture.png", {
    run: async () => ({ stdout: JSON.stringify(report) }),
  });
  assert.equal(valid.validation, "tool-reported-valid");
  assert.equal(valid.issuer, "Fixture Issuer");
  assert.equal(valid.trust, "not-established");
  assert.equal(valid.synthid, "not-verifiable-locally");
  const invalid = await m.verifyProvenance("/private/fixture.png", {
    run: async () => ({
      stdout: JSON.stringify({
        ...report,
        validation_status: [{ code: "assertion.dataHash.mismatch" }],
      }),
    }),
  });
  assert.equal(invalid.validation, "reported-issues");
  const missing = await m.verifyProvenance("/private/fixture.png", {
    run: async () => {
      const e = Error("absent");
      e.code = "ENOENT";
      throw e;
    },
  });
  assert.equal(missing.validation, "unavailable");
  assert.equal(missing.issuer, null);
});
