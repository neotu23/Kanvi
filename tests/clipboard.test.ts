import { expect,it } from 'vitest';
import { buildClipboardPayload } from '../src/features/output/clipboard';
it('复制载荷保留最终样式，不复制 HTML 代码文本或重新渲染',()=>{
 const artifact={bodyHtml:'<p style="color:#333">周末</p>',plainText:'周末',htmlHash:'bound-to-this-output'};
 expect(buildClipboardPayload(artifact)).toEqual({html:'<p style="color:#333">周末</p>',text:'周末'});
});
