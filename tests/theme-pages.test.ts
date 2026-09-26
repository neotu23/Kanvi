import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { expect, it } from 'vitest';
import Page from '../src/app/page';
import Layout from '../src/app/layout';
import { ThemeStudio } from '../src/components/ThemeStudio';
import { ThemeSettings } from '../src/components/ThemeSettings';
import { ThemeHistory } from '../src/components/ThemeHistory';

it('首页只保留主题与正文入口，管理功能各自有独立页面', async () => {
 const home=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
 expect(home).toContain('生成正文'); expect(home).toContain('主题库');
 for (const text of ['主题工厂','待确认草案','备份与恢复','本地数据路径','渲染历史','python3','DeepSeek']) expect(home).not.toContain(text);
 const studio=renderToStaticMarkup(createElement(ThemeStudio));
 expect(studio).toContain('新建模板'); expect(studio).toContain('设计提示词'); expect(studio).toContain('完整文章预览');
 const settings=renderToStaticMarkup(createElement(ThemeSettings));
 expect(settings).toContain('备份与恢复'); expect(settings).toContain('本地数据路径');
 expect(renderToStaticMarkup(createElement(ThemeHistory))).toContain('已保存文章');
});
it('主导航只保留四个工作入口，旧工具从设置访问', () => {
 const $=load(renderToStaticMarkup(createElement(Layout,{children:'正文'})));
 expect($('nav a').map((_,n)=>$(n).attr('href')).get()).toEqual(['/','/studio','/history','/settings']);
 const settings=load(renderToStaticMarkup(createElement(ThemeSettings)));
 expect(settings('.legacy-links a').map((_,n)=>settings(n).attr('href')).get()).toEqual(['/demo','/references','/templates','/generate']);
});
