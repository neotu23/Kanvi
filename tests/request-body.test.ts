import { expect, it } from 'vitest';
import { readBounded, readJsonRequest } from '../src/features/shared/io';
it('请求包络超限被拒绝，按实际流字节计数', async () => {
  const limit = 2 * 1024 * 1024 * 6 + 8192;
  const request = new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1' }, body: ' '.repeat(limit + 1) });
  await expect(readJsonRequest(request)).rejects.toMatchObject({ code: 'too-large' });
});
it('正文停滞可取消，提前取消的空响应也返回取消错误', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const controller = new AbortController();
  const promise = readBounded(body, 20, controller.signal); controller.abort();
  await expect(promise).rejects.toMatchObject({ code: 'timeout' });
  expect(cancelled).toBe(true);
  await expect(readBounded(null, 20, controller.signal)).rejects.toMatchObject({ code: 'timeout' });
});
it('无效 UTF-8 输入返回可理解的编码错误，不替换为乱码', async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } });
  await expect(readBounded(body, 20, new AbortController().signal)).rejects.toMatchObject({ code: 'encoding' });
});
