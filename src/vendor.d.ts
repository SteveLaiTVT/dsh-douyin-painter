// Optional Harness peer: loaded dynamically only when running inside the host.
declare module '@deepseek-ai/dsh-llm' {
  export function createUserMessage(input: Record<string, unknown>): { id: string; [key: string]: unknown };
}

declare module '*moon-body.js';
