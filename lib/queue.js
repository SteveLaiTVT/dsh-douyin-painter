export class TaskQueue {
  constructor(limit = 60) {
    this.limit = limit;
    this.items = [];
    this.running = false;
    this.stopped = false;
    this.waiters = [];
  }
  push(work, { priority = false } = {}) {
    if (this.stopped || this.items.length >= this.limit)
      return Promise.reject(Error("queue closed/full"));
    return new Promise((resolve, reject) => {
      this.items[priority ? "unshift" : "push"]({ work, resolve, reject });
      this.drain();
    });
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    while (this.items.length) {
      const t = this.items.shift();
      try {
        t.resolve(await t.work());
      } catch (e) {
        t.reject(e);
      }
    }
    this.running = false;
    this.waiters.splice(0).forEach((r) => r());
  }
  async idle() {
    if (this.running || this.items.length)
      await new Promise((r) => this.waiters.push(r));
  }
  async close() {
    this.stopped = true;
    await this.idle();
  }
}
