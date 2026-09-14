export function articleDocument(bodyHtml:string):string {
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Kanvi 排版样例</title></head><body>'+bodyHtml+'</body></html>';
}
