import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const optional = project => project.required === false;
export function upstreamLock(root = process.cwd()) {
 return JSON.parse(readFileSync(resolve(root, 'docs/upstream-lock.json'), 'utf8'));
}
/** vendor/<project-id> 路径；未安装时给出 setup 指引。主题链路按需调用。 */
export function upstreamRepo(root = process.cwd(), id) {
 const project = upstreamLock(root).projects.find(item => item.id === id);
 if (!project) throw new Error(`上游记录缺少 ${id}`);
 const cwd = resolve(root, 'vendor', project.id);
 if (!existsSync(cwd)) throw new Error(`${id} 尚未安装，请先运行 npm run setup:checker`);
 return cwd;
}
/** 必需项目缺失即抛错；标记 required:false 的项目缺失时跳过，不影响现有检测链路。 */
export function checkUpstream(root = process.cwd()) {
 const lock = upstreamLock(root);
 for (const project of lock.projects) {
  const cwd = resolve(root, 'vendor', project.id);
  if (!existsSync(cwd)) {
   if (optional(project)) continue;
   throw new Error(`${project.id} 未安装，请先运行 npm run setup:checker`);
  }
  const run = args => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 }).trim();
  if (run(['rev-parse', 'HEAD']) !== project.commit) throw new Error(`${project.id} 版本与锁定记录不一致`);
  if (run(['diff', 'HEAD', '--name-only'])) throw new Error(`${project.id} 源码有未记录修改`);
  const unmanaged = run(['ls-files', '--others', '--exclude-standard']).split('\n').filter(file => file && !(project.id === 'wechat-spec' && file === 'cli/package-lock.json'));
  if (unmanaged.length) throw new Error(`${project.id} 存在未记录文件：${unmanaged.join(', ')}`);
 }
 if (!readFileSync(resolve(root, 'docs/locks/wechat-cli.package-lock.json')).equals(readFileSync(resolve(root, 'vendor/wechat-spec/cli/package-lock.json')))) throw new Error('检查器依赖锁文件不一致');
 return lock.projects.find(p => p.id === 'wechat-spec').commit;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 try { console.log('上游版本检查通过：' + checkUpstream()); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
