import { Readable } from "node:stream";

// Exercise the production HTTP handler without binding a socket (sandbox EPERM).
export async function request(server, path, { body, headers = {}, method = body === undefined ? "GET" : "POST" } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.url = path; req.method = method;
  req.headers = { host: "127.0.0.1:7321", ...(method === "POST" ? { origin: "http://127.0.0.1:7321", "content-type": "application/json" } : {}), ...headers };
  const result = { status: 200, headers: {}, bytes: Buffer.alloc(0) };
  const res = {
    headersSent: false,
    setHeader(k, v) { result.headers[k.toLowerCase()] = v; },
    writeHead(status, values = {}) { result.status = status; this.headersSent = true; for (const [k, v] of Object.entries(values)) this.setHeader(k, v); },
    end(bytes = "") { result.bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes); this.headersSent = true; },
  };
  await server.handle(req, res);
  return { ...result, text: result.bytes.toString(), json: () => JSON.parse(result.bytes.toString()) };
}
