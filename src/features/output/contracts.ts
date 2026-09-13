export interface OutputArtifact { bodyHtml: string; plainText: string; htmlHash: string }
export type InlineResult = { ok: true; html: string } | { ok: false; error: string };
export type Inliner = (html: string, css: string) => InlineResult;
