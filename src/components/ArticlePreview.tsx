import { articleDocument } from '../features/output/document';
export function ArticlePreview({html}:{html:string}) {
 return <iframe className="article-frame" title="文章手机预览" sandbox="" srcDoc={articleDocument(html)} />;
}
