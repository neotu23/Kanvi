/** Validate the browser-facing Host: Next may construct its internal URL differently. */
export function isLocalRequest(request:Request):boolean {
 try {
  const host=request.headers.get('host');
  if(!host || /[\s/@?#\\]/.test(host)) return false;
  const target=new URL(`http://${host}`);
  if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname)) return false;
  const origin=request.headers.get('origin');
  return (!origin || origin===target.origin) && request.headers.get('sec-fetch-site')!=='cross-site';
 } catch { return false; }
}
