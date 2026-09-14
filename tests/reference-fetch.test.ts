import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { fetchReference, isPublicAddress, validateReferenceUrl, type FetchDependencies } from '../src/features/references/fetch-reference';

const url = 'https://mp.weixin.qq.com/s/example';
const response = (text = '<div id="js_content">原文</div>') => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Readable.from([Buffer.from(text)]) });
function dependencies(overrides: Partial<FetchDependencies> = {}): FetchDependencies {
  return { resolve: async () => [{ address: '1.2.3.4', family: 4 }], request: async () => response(), ...overrides };
}
it.each(['http://mp.weixin.qq.com/s/x', 'https://mp.weixin.qq.com.evil.test/x', 'https://u:p@mp.weixin.qq.com/x', 'https://mp.weixin.qq.com:444/x', 'https://127.0.0.1/x', 'file:///etc/hosts'])('拒绝非法来源 %s', value => {
  expect(() => validateReferenceUrl(value)).toThrow();
});
it.each(['127.0.0.1', '10.0.0.2', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::'])('排除非公网地址 %s', ip => expect(isPublicAddress(ip)).toBe(false));
it('固定经校验的 DNS 地址，任意私网解析使整次读取失败', async () => {
  let called = false;
  const d = dependencies({ request: async (_url, address) => { called = true; expect(address).toEqual({ address: '1.2.3.4', family: 4 }); return response(); } });
  expect((await fetchReference(url, d)).html).toContain('原文');
  expect(called).toBe(true);
  await expect(fetchReference(url, dependencies({ resolve: async () => [{ address: '127.0.0.1', family: 4 }], request: async () => { throw Error('不应发出请求'); } }))).rejects.toMatchObject({ code: 'unsafe-address' });
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
});
it('逐次校验跳转来源并限制跳转次数', async () => {
  await expect(fetchReference(url, dependencies({ request: async () => ({ status: 302, headers: { location: 'https://evil.test' }, body: Readable.from([]) }) }))).rejects.toMatchObject({ code: 'invalid-url' });
  let requests = 0;
  await expect(fetchReference(url, dependencies({ request: async () => { requests++; return { status: 302, headers: { location: '/s/again' }, body: Readable.from([]) }; } }))).rejects.toMatchObject({ code: 'redirect-limit' });
  expect(requests).toBe(4);
});
it('实际解压 gzip，按解压后字节限制大小而不相信 Content-Length', async () => {
  const compressed = gzipSync(Buffer.from('<div>文字</div>'));
  const d = dependencies({ request: async () => ({ status: 200, headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, body: Readable.from([compressed]) }) });
  expect((await fetchReference(url, d)).html).toBe('<div>文字</div>');
  d.request = async () => ({ status: 200, headers: { 'content-type': 'text/html', 'content-encoding': 'gzip', 'content-length': '1' }, body: Readable.from([gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1, 'x'))]) });
  await expect(fetchReference(url, d)).rejects.toMatchObject({ code: 'too-large' });
});
it('拒绝非 HTML、HTTP 失败及不支持的编码', async () => {
  for (const r of [
    { ...response(), status: 403 },
    { ...response(), headers: { 'content-type': 'application/json' } },
    { ...response(), headers: { 'content-type': 'text/html', 'content-encoding': 'unknown' } },
  ]) await expect(fetchReference(url, dependencies({ request: async () => r }))).rejects.toThrow();
});
it('整次超时覆盖 DNS 和响应流，取消请求可及时退出', async () => {
  await expect(fetchReference(url, dependencies({ resolve: () => new Promise(() => {}) }), { timeoutMs: 15 })).rejects.toMatchObject({ code: 'timeout' });
  const body = new Readable({ read() {} });
  await expect(fetchReference(url, dependencies({ request: async () => ({ ...response(), body }) }), { timeoutMs: 15 })).rejects.toMatchObject({ code: 'timeout' });
  expect(body.destroyed).toBe(true);
  const controller = new AbortController(); controller.abort();
  await expect(fetchReference(url, dependencies(), { signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
});
