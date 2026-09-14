import type { OutputArtifact } from './contracts';
export function buildClipboardPayload(artifact:OutputArtifact) {
 return {html:artifact.bodyHtml,text:artifact.plainText};
}
