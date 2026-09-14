import { lookup } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { MAX_REFERENCE_BYTES, ReferenceError } from './contracts';

interface Address { address: string; family: number }
interface RemoteResponse { status: number; headers: IncomingHttpHeaders; body: Readable }
export interface FetchDependencies {
  resolve: (hostname: string) => Promise<Address[]>;
  request: (url: URL, address: Address, signal: AbortSignal) => Promise<RemoteResponse>;
}
const excluded = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) excluded.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) excluded.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !excluded.check(address, 'ipv4');
  // Conservatively accept native global unicast only; reject mapped/tunnel/special ranges.
  return family === 6 && globalV6.check(address, 'ipv6') && !excluded.check(address, 'ipv6');
}
export function validateReferenceUrl(value: string): URL {
  try {
    if (value.length > 8192) throw new Error();
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com' || url.username || url.password || (url.port && url.port !== '443')) throw new Error();
    url.hash = '';
    return url;
  } catch { throw new ReferenceError('invalid-url', '仅支持 HTTPS 的 mp.weixin.qq.com 文章链接，不接受账号密码或其他端口。'); }
}

export const requestPinned: FetchDependencies['request'] = (url, address, signal) => new Promise((resolve, reject) => {
  const options: RequestOptions & { autoSelectFamily: boolean } = {
    method: 'GET', signal, agent: false, autoSelectFamily: false, family: address.family,
    servername: 'mp.weixin.qq.com',
    // The TLS hostname remains unchanged; the only network address is the vetted result.
    lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    headers: { Accept: 'text/html', 'Accept-Encoding': 'gzip, deflate, br', 'User-Agent': 'Kanvi/0.1 (local reference importer)' },
  };
  const req = httpsRequest(url, options, res => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }));
  req.on('error', reject);
  req.end();
});
const defaults: FetchDependencies = { resolve: hostname => lookup(hostname, { all: true, order: 'verbatim' }), request: requestPinned };

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
async function readHtml(response: RemoteResponse, signal: AbortSignal): Promise<string> {
  const type = response.headers['content-type'] ?? '';
  if (!/^text\/html(?:\s*;|\s*$)/i.test(type)) throw new ReferenceError('not-html', '来源未返回 HTML 文章。');
  const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(type)?.[1];
  if (charset && !/^utf-?8$/i.test(charset)) throw new ReferenceError('encoding', '目前仅支持 UTF-8 HTML，请转换后导入。');
  const encoding = response.headers['content-encoding']?.trim().toLowerCase();
  const decoder = !encoding || encoding === 'identity' ? new Transform({ transform(chunk, _enc, cb) { cb(null, chunk); } })
    : encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
  if (!decoder) throw new ReferenceError('encoding', '来源使用不支持的内容编码。');
  let size = 0; let wireSize = 0;
  const chunks: Buffer[] = [];
  const wireLimit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    wireSize += chunk.length;
    callback(wireSize > MAX_REFERENCE_BYTES ? new ReferenceError('too-large', '参考响应大小超过 2 MiB。', 413) : null, chunk);
  } });
  const sink = new Writable({ write(chunk: Buffer, _encoding, callback) {
    size += chunk.length;
    if (size > MAX_REFERENCE_BYTES) { callback(new ReferenceError('too-large', '参考 HTML 解压后大小超过 2 MiB。', 413)); return; }
    chunks.push(chunk); callback();
  } });
  await pipeline(response.body, wireLimit, decoder, sink, { signal });
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new ReferenceError('encoding', '来源不是有效 UTF-8 文档。'); }
}

export async function fetchReference(value: string, dependencies = defaults, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<{ html: string; sourceUrl: string }> {
  let url = validateReferenceUrl(value);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  try {
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted();
      const addresses = await abortable(dependencies.resolve(url.hostname), signal);
      if (!addresses.length || addresses.some(a => isIP(a.address) !== a.family || !isPublicAddress(a.address))) throw new ReferenceError('unsafe-address', '来源解析到了非公网地址，已停止读取。');
      const response = await abortable(dependencies.request(url, addresses[0], signal), signal);
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirects >= 3) throw new ReferenceError('redirect-limit', '来源跳转超过 3 次，已停止读取。');
          const location = response.headers.location;
          if (!location) throw new ReferenceError('invalid-redirect', '来源跳转缺少目标地址。');
          try { url = validateReferenceUrl(new URL(location, url).href); }
          catch { throw new ReferenceError('invalid-url', '来源跳转到不允许的地址，已停止读取。'); }
          continue;
        }
        if (response.status !== 200) throw new ReferenceError('http-error', `来源返回 HTTP ${response.status}，未保存为文章。`);
        return { html: await readHtml(response, signal), sourceUrl: url.href };
      } finally { response.body.destroy(); }
    }
  } catch (error) {
    if (options.signal?.aborted) throw new ReferenceError('cancelled', '读取已取消。', 408);
    if (timeout.aborted) throw new ReferenceError('timeout', '读取超过时间限制，请稍后重试或导入保存的 HTML。', 408);
    if (error instanceof ReferenceError) throw error;
    throw new ReferenceError('network-error', '网络读取或解压失败，请稍后重试或导入保存的 HTML。', 502);
  }
}
