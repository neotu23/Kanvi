export const MAX_REFERENCE_BYTES = 2 * 1024 * 1024;

export class ReferenceError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}
export interface StyleEvidence {
  id: string;
  parentId: string | null;
  tag: string;
  text: string;
  declarations: Array<{ property: string; value: string; origin: 'inline' | 'stylesheet'; selector?: string }>;
}
export interface Diagnostic { code: string; message: string }
export interface ReferenceSnapshot {
  version: 1;
  id: string;
  sourceUrl: string | null;
  fetchedAt: string;
  contentHash: string;
  title: string;
  sourceHtml: string;
  articleHtml: string;
  styleEvidence: StyleEvidence[];
  diagnostics: Diagnostic[];
}
// Raw HTML is deliberately absent from every browser-facing response.
export type ReferenceSummary = Pick<ReferenceSnapshot, 'id' | 'sourceUrl' | 'fetchedAt' | 'contentHash' | 'title' | 'diagnostics'>;
export function referenceSummary(snapshot: ReferenceSnapshot): ReferenceSummary {
  const { id, sourceUrl, fetchedAt, contentHash, title, diagnostics } = snapshot;
  return { id, sourceUrl, fetchedAt, contentHash, title, diagnostics };
}
