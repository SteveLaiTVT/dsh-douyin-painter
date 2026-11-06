import { verifyProvenance } from "./provenance.js";
import { mkdir, open, readFile, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { id, hash, sameK, requireThat } from "./util.js";
export class AssetStore {
  constructor(j, { inspect } = {}) {
    this.j = j;
    this.inspect = inspect;
  }
  active(K) {
    return this.j.isAllowed(K) && sameK(this.j.state.rounds[K.round_id]?.K, K);
  }
  async checked(bytes, { K, kind, locked = {}, parents = [] }) {
    requireThat(this.active(K), "asset round unavailable");
    for (const parent of parents) {
      const a = this.j.state.assets[parent];
      requireThat(a && this.active(a.K), "revoked lineage");
    }
    requireThat(
      Buffer.isBuffer(bytes) && bytes.length <= 20 * 1024 * 1024,
      "file too large",
    );
    const inspect = this.inspect || (await import("./media.js")).inspect;
    const info = await inspect(bytes, { kind, ...locked });
    requireThat(info.decoded && info.sha256 === hash(bytes), "file unchecked");
    const assetId = id();
    const dir = join(this.j.root, "artifacts", "original");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, `${assetId}.${info.format}`);
    const f = await open(path, "wx", 0o600);
    try {
      await f.writeFile(bytes);
      await f.sync();
    } finally {
      await f.close();
    }
    const d = await open(dir, "r");
    await d.sync();
    await d.close();
    info.provenance = await verifyProvenance(path);
    requireThat(
      hash(await readFile(path)) === info.sha256,
      "provenance check changed original bytes",
    );
    const asset = {
      id: assetId,
      K: { ...K },
      kind,
      version: 1,
      sha256: info.sha256,
      path,
      parents: [...parents],
      info,
      checked: true,
    };
    requireThat(this.active(K), "asset invalidated during inspection");
    await this.j.commit("asset-checked", [
      { table: "assets", id: assetId, value: asset },
    ]);
    return asset;
  }
  canPublish(assetId) {
    const a = this.j.state.assets[assetId],
      p = this.j.state.approvals[assetId];
    return (
      !!a &&
      this.active(a.K) &&
      a.checked &&
      !!p &&
      p.sha256 === a.sha256 &&
      p.version === a.version &&
      sameK(p.K, a.K) &&
      a.parents.every((parent) => {
        const x = this.j.state.assets[parent];
        return x && this.j.isAllowed(x.K);
      })
    );
  }
  async read(assetId, { public: pub = false, K } = {}) {
    const a = this.j.state.assets[assetId];
    requireThat(a && (!K || sameK(K, a.K)), "unknown asset");
    if (pub) requireThat(this.canPublish(assetId), "asset not public");
    const stat = await lstat(a.path);
    requireThat(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= 20 * 1024 * 1024,
      "invalid file",
    );
    const f = await open(a.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes;
    try {
      bytes = await f.readFile();
    } finally {
      await f.close();
    }
    requireThat(
      hash(bytes) === a.sha256 && a.info.sha256 === a.sha256,
      "changed bytes require reinspection",
    );
    if (pub)
      requireThat(this.canPublish(assetId), "asset revoked while reading");
    return bytes;
  }
  lineage(K) {
    return Object.values(this.j.state.assets)
      .filter((a) => a.K.show_id === K.show_id && a.K.round_id === K.round_id)
      .map((a) => ({
        id: a.id,
        sha256: a.sha256,
        parents: a.parents,
        kind: a.kind,
        K: a.K,
      }));
  }
}
