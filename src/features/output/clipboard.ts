import type { OutputArtifact } from './contracts';
export function buildClipboardPayload(artifact:OutputArtifact) {
 return {html:artifact.bodyHtml,text:artifact.plainText};
}
/**
 * “复制全文”走纯文本剪贴板，写入的是与“下载 HTML”完全一致的整份 HTML 源码（含文档外壳），
 * 不是供公众号编辑器解析的富文本片段。
 */
export async function writeHtmlSource(clipboard:{writeText(text:string):Promise<void>},documentHtml:string):Promise<void> {
 if(!documentHtml.trim()) throw new Error('当前没有可复制的正文。');
 await clipboard.writeText(documentHtml);
}
