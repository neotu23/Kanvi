import { isLocalRequest } from '../validation/local-request';
import { ReferenceError } from '../references/contracts';
import { referenceRepository } from '../references/handlers';
import { ReferenceRepository } from '../references/repository';
import { errorResponse, json, readJsonRequest } from '../shared/io';
import { AnalysisRepository } from './repository';
import { analyzeDesign } from './design-analysis';
import { aiConfigurationStatus } from './client';

export function createAnalysisHandlers(references: ReferenceRepository, analyses: AnalysisRepository, analyze = analyzeDesign) {
  let running = false;
  return {
    async POST(request: Request, id: string) {
      if (!isLocalRequest(request)) return json({ error: '仅接受本机页面的请求。', code: 'forbidden' }, 403);
      if (running) return json({ error: '正在分析，请等待当前请求完成。', code: 'busy' }, 409);
      running = true;
      try {
        const body = await readJsonRequest(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new ReferenceError('invalid-input', '分析仅使用已保存参考，不接受额外指令。', 400);
        const snapshot = await references.get(id);
        const analysis = await analyze(snapshot, { signal: request.signal });
        await analyses.save(analysis);
        return json({ analysis }, 201);
      } catch (error) { return errorResponse(error); }
      finally { running = false; }
    },
    async GET(request: Request, id: string) {
      if (!isLocalRequest(request)) return json({ error: '仅接受本机页面的请求。', code: 'forbidden' }, 403);
      try {
        const snapshot = await references.get(id);
        return json({ ...await analyses.list(snapshot, new URL(request.url).searchParams.get('after') ?? undefined), ai: await aiConfigurationStatus() });
      } catch (error) { return errorResponse(error); }
    },
  };
}
export const analysisHandlers = createAnalysisHandlers(referenceRepository, new AnalysisRepository());
