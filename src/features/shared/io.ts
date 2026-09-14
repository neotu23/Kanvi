import { ReferenceError } from '../references/contracts';

/** Cap actual bytes; cancellation also covers a stalled body after response headers. */
export async function readBounded(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw new ReferenceError('timeout', '请求已取消或超过时间限制。', 408);
  if (!body) return '';
  const reader = body.getReader();
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => { reject(new ReferenceError('timeout', '请求已取消或超过时间限制。', 408)); void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), cancelled]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new ReferenceError('too-large', '请求或响应大小超过允许范围。', 413);
      chunks.push(value);
    }
    if (signal.aborted) throw new ReferenceError('timeout', '请求已取消或超过时间限制。', 408);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { throw new ReferenceError('encoding', '请求或响应不是有效 UTF-8 文档。', 400); }
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function readJsonRequest(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type') ?? '')) throw new ReferenceError('content-type', '请使用 JSON 请求。', 415);
  // JSON may encode each source byte as six ASCII characters (e.g. \u003c).
  // The decoded HTML remains independently capped at 2 MiB by extractArticle.
  const text = await readBounded(request.body, 2 * 1024 * 1024 * 6 + 8192, AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]));
  try { return JSON.parse(text); }
  catch { throw new ReferenceError('invalid-json', '请求 JSON 格式不正确。', 400); }
}
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function errorResponse(error: unknown): Response {
  if (error instanceof ReferenceError) return json({ error: error.message, code: error.code }, error.status);
  return json({ error: '本地处理失败，请检查文件和配置后重试。', code: 'internal' }, 500);
}
