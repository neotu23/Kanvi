import { articleDocument } from '../output/document';

/** 外壳只清除浏览器默认留白；文章排版必须全部来自 bodyHtml。 */
export function themeArticleDocument(bodyHtml: string): string {
  return articleDocument(bodyHtml).replace('</head>', '<style>html,body{margin:0;padding:0}body{display:flow-root}</style></head>');
}
