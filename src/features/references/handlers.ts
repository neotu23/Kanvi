import { isLocalRequest } from '../validation/local-request';
import { errorResponse, json, readJsonRequest } from '../shared/io';
import { ReferenceError, referenceSummary } from './contracts';
import { extractArticle } from './extract-article';
import { fetchReference } from './fetch-reference';
import { ReferenceRepository } from './repository';

const forbidden = () => json({ error: '仅接受本机页面的请求。', code: 'forbidden' }, 403);
export function createReferenceHandlers(repository: ReferenceRepository, fetcher: typeof fetchReference = fetchReference) {
  let importing = false;
  return {
    async POST(request: Request) {
      if (!isLocalRequest(request)) return forbidden();
      if (importing) return json({ error: '正在导入参考，请稍后重试。', code: 'busy' }, 409);
      importing = true;
      try {
        const data = await readJsonRequest(request);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ReferenceError('invalid-input', '请提供文章链接或 HTML 文件。', 400);
        const value = data as Record<string, unknown>;
        if (Object.keys(value).length !== 1 || !('url' in value || 'html' in value)) throw new ReferenceError('invalid-input', '每次只能提供文章链接或 HTML 文件其中一种来源。', 400);
        let html: string; let sourceUrl: string | null = null;
        if ('url' in value) {
          if (typeof value.url !== 'string' || !value.url.trim()) throw new ReferenceError('invalid-input', '文章链接不能为空。', 400);
          ({ html, sourceUrl } = await fetcher(value.url, undefined, { signal: request.signal }));
        } else {
          if (typeof value.html !== 'string' || !value.html.trim()) throw new ReferenceError('invalid-input', 'HTML 文件不能为空。', 400);
          html = value.html;
        }
        const result = await repository.save(extractArticle(html, sourceUrl));
        return json({ reference: referenceSummary(result.snapshot), duplicate: !result.created }, result.created ? 201 : 200);
      } catch (error) { return errorResponse(error); }
      finally { importing = false; }
    },
    async GET(request: Request) {
      if (!isLocalRequest(request)) return forbidden();
      try { return json(await repository.list(new URL(request.url).searchParams.get('after') ?? undefined)); }
      catch (error) { return errorResponse(error); }
    },
    async detail(request: Request, id: string) {
      if (!isLocalRequest(request)) return forbidden();
      try {
        const snapshot = await repository.get(id);
        return json({ reference: { ...referenceSummary(snapshot), styleEvidence: snapshot.styleEvidence } });
      } catch (error) { return errorResponse(error); }
    },
  };
}
export const referenceRepository = new ReferenceRepository();
export const referenceHandlers = createReferenceHandlers(referenceRepository);
