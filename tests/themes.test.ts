import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {listThemes,loadTheme,themesRoot,type ThemePackage} from '../src/features/themes/library';
import {removeTheme} from '../src/features/themes/remove';
import {parseLint,parseValidate,pythonVersion,runLintTheme,runValidateArticle} from '../src/features/themes/python';

const SEED_COMMIT='9accaf5039f29aade5d8ca315739b42845b11225';
function fixture():string {
 const root=mkdtempSync(join(tmpdir(),'kanvi-themes-'));
 cpSync(join(themesRoot(),'moss-zen'),join(root,'moss-zen'),{recursive:true});
 return root;
}
function editTheme(root:string,id:string,mutate:(theme:Record<string,unknown>)=>void):void {
 const path=join(root,id,'theme.json');
 const theme=JSON.parse(readFileSync(path,'utf8')) as Record<string,unknown>;
 mutate(theme);writeFileSync(path,JSON.stringify(theme));
}
const upstreamOf=(pkg:ThemePackage)=>{if(!('upstream' in pkg.source))throw new Error('缺少上游记录');return pkg.source.upstream!;};

it('种子主题库可读取，来源记录绑定固定提交',async()=>{
 const entries=await listThemes(themesRoot());
 expect(entries.map(e=>e.id).sort()).toEqual(['cinnabar-catalog','graphite-editorial','mist-masthead','moss-zen','paper-journal','step-workshop']);
 expect(entries.every(e=>e.ok)).toBe(true);
 const pkg=await loadTheme('moss-zen',themesRoot());
 expect(pkg.origin).toBe('seed');
 expect(upstreamOf(pkg).commit).toBe(SEED_COMMIT);
 expect(pkg.theme.tokens.layout.max_width).toBe('677px');
 expect(pkg.theme.slots).toContain('media_ph');
 expect(pkg.hasNote).toBe(true);
});
it('目录名与 theme.json 的 id 不一致时拒绝读取',async()=>{
 const root=fixture(),target=join(root,'renamed-theme');
 cpSync(join(root,'moss-zen'),target,{recursive:true});rmSync(join(root,'moss-zen'),{recursive:true});
 await expect(loadTheme('renamed-theme',root)).rejects.toThrow(/目录名/);
});
it('theme.json 额外字段、必选槽缺失与非法颜色都会被拒绝',async()=>{
 const root=fixture();
 editTheme(root,'moss-zen',theme=>{(theme as Record<string,unknown>).extra=1;});
 await expect(loadTheme('moss-zen',root)).rejects.toThrow(/无效/);
 editTheme(root,'moss-zen',theme=>{delete (theme as Record<string,unknown>).extra;});
 editTheme(root,'moss-zen',theme=>{const slots=theme.slots as string[];theme.slots=slots.filter(slot=>slot!=='media_ph').concat('root');});
 await expect(loadTheme('moss-zen',root)).rejects.toThrow(/必选槽 media_ph/);
 editTheme(root,'moss-zen',theme=>{const tokens=theme.tokens as {color:Record<string,string>};tokens.color.brand='red';});
 await expect(loadTheme('moss-zen',root)).rejects.toThrow(/十六进制/);
});
it('缺少 THEME.md 或 preview.html 时拒绝读取',async()=>{
 const root=fixture();
 unlinkSync(join(root,'moss-zen','THEME.md'));
 await expect(loadTheme('moss-zen',root)).rejects.toThrow(/THEME\.md/);
 cpSync(join(themesRoot(),'moss-zen','THEME.md'),join(root,'moss-zen','THEME.md'));
 unlinkSync(join(root,'moss-zen','preview.html'));
 await expect(loadTheme('moss-zen',root)).rejects.toThrow(/preview\.html/);
});
it('来源记录损坏时拒绝读取',async()=>{
 const root=fixture();
 writeFileSync(join(root,'moss-zen','SOURCE.json'),JSON.stringify({version:1,origin:'seed'}));
 await expect(loadTheme('moss-zen',root)).rejects.toThrow(/无效|时间/);
});
it('没有来源记录的主题按本地主题读取',async()=>{
 const root=fixture();
 unlinkSync(join(root,'moss-zen','SOURCE.json'));
 const pkg=await loadTheme('moss-zen',root);
 expect(pkg.origin).toBe('local');
});
it('删除主题需要二次确认，删除后不再出现在列表里',async()=>{
 const root=fixture();
 await expect(removeTheme('moss-zen','moss-zen-typo',root)).rejects.toThrow(/二次确认/);
 const removed=await removeTheme('moss-zen','moss-zen',root);
 expect(removed.origin).toBe('seed');
 expect(await listThemes(root)).toEqual([]);
 await expect(removeTheme('moss-zen','moss-zen',root)).rejects.toThrow(/没有找到/);
});
it('拒绝删除路径穿越与非目录目标',async()=>{
 const root=fixture();
 await expect(removeTheme('../secret' as string,'../secret',root)).rejects.toThrow(/id 无效/);
 const outside=mkdtempSync(join(tmpdir(),'kanvi-outside-'));
 symlinkSync(outside,join(root,'linked-theme'));
 await expect(removeTheme('linked-theme','linked-theme',root)).rejects.toThrow(/不是可删除/);
 mkdirSync(join(root,'empty-theme'));
 await expect(removeTheme('empty-theme','empty-theme',root)).resolves.toMatchObject({id:'empty-theme'});
});
it('lint 与正文校验的输出解析与退出码一致',()=>{
 expect(parseLint('── /themes/x ──\n  OK\n\n汇总: ERROR×0  WARN×0')).toMatchObject({ok:true,errorCount:0,warnCount:0});
 const lint=parseLint('  ERROR  缺少 hero\n  WARN   四周虚线框\n\n汇总: ERROR×1  WARN×1');
 expect(lint).toMatchObject({ok:false,errorCount:1,warnCount:1});
 expect(lint?.errors[0]).toContain('缺少 hero');
 expect(parseLint('找不到路径: /tmp/x')).toBeNull();
 expect(parseValidate('公众号正文校验: a.html\n  span[leaf] ×4\n\n通过')).toMatchObject({ok:true,errorCount:0,warnCount:0});
 const invalid=parseValidate('ERROR ×1\n  - <div> 会被改写，请用 <section>\n\n无 ERROR');
 expect(invalid).toMatchObject({ok:false,errorCount:1});
 expect(invalid?.errors[0]).toContain('<div>');
 expect(parseValidate('无法启动')).toBeNull();
});
it('真实 lint 脚本对种子主题通过，对不存在的主题失败且不算通过',async()=>{
 if(!await pythonVersion()) return;
 const seed=await runLintTheme(join(themesRoot(),'moss-zen'));
 expect(seed.error).toBeUndefined();
 expect(seed).toMatchObject({ok:true,errorCount:0,warnCount:0});
 const missing=await runLintTheme(join(themesRoot(),'no-such-theme'));
 expect(missing.ok).toBe(false);
 expect(missing.error).toBeTruthy();
});
it('真实正文校验脚本能通过合法片段并拦下 div',async()=>{
 if(!await pythonVersion()) return;
 const root=mkdtempSync(join(tmpdir(),'kanvi-article-'));
 const clean=join(root,'clean.html'),bad=join(root,'bad.html');
 writeFileSync(clean,'<section style="max-width:677px;margin:0 auto;padding:20px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.9;"><span leaf="">雨停了，沿着河边走一会儿。</span></p></section>');
 writeFileSync(bad,'<div style="max-width:677px;margin:0 auto;"><p style="font-size:16px;"><span leaf="">雨停了。</span></p></div>');
 const pass=await runValidateArticle(clean);
 expect(pass).toMatchObject({ok:true,errorCount:0,warnCount:0});
 const fail=await runValidateArticle(bad);
 expect(fail.ok).toBe(false);
 expect(fail.issues.some(issue=>issue.level==='ERROR'&&issue.message.includes('div'))).toBe(true);
});
