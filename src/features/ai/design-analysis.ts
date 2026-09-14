import { createHash, randomUUID } from 'node:crypto';
import type { ReferenceSnapshot } from '../references/contracts';
import { completeJson, aiConfig, type AiOptions } from './client';
import { ANALYSIS_PROMPT_VERSION, validateAnalysis, type DesignAnalysis } from './schema';

export interface AnalysisRecord {
  version: 1; id: string; referenceId: string; referenceHash: string; inputHash: string;
  createdAt: string; model: string; promptVersion: string; status: 'draft'; design: DesignAnalysis;
}
export function analysisInput(snapshot: ReferenceSnapshot) {
  return { evidence: snapshot.styleEvidence, diagnostics: snapshot.diagnostics };
}
export async function analyzeDesign(snapshot: ReferenceSnapshot, options: AiOptions = {}): Promise<AnalysisRecord> {
  const input = JSON.stringify(analysisInput(snapshot));
  const config = options.config ?? aiConfig();
  const result = await completeJson(input, { ...options, config });
  return {
    version: 1, id: randomUUID(), referenceId: snapshot.id, referenceHash: snapshot.contentHash,
    inputHash: createHash('sha256').update(input).digest('hex'), createdAt: new Date().toISOString(), model: config.model,
    promptVersion: ANALYSIS_PROMPT_VERSION, status: 'draft', design: validateAnalysis(result, snapshot.styleEvidence),
  };
}
