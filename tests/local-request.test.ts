import {expect,it} from 'vitest';
import {isLocalRequest} from '../src/features/validation/local-request';
it('Next 内部 URL 与浏览器地址不同，仍允许相同 Host 的本机请求',()=>{
 expect(isLocalRequest(new Request('http://localhost:3210/api/preview',{headers:{host:'127.0.0.1:3210',origin:'http://127.0.0.1:3210','sec-fetch-site':'same-origin'}}))).toBe(true);
});
it('拒绝跨站、非本机 Host、端口不同和无效来源',()=>{
 const cases: Record<string,string>[] = [{host:'evil.example',origin:'http://evil.example'},{host:'127.0.0.1:3210',origin:'http://evil.example'},{host:'127.0.0.1:3210',origin:'http://127.0.0.1:3211'},{host:'localhost:3210',origin:'null'},{host:'localhost:3210','sec-fetch-site':'cross-site'}];
 for (const headers of cases) expect(isLocalRequest(new Request('http://localhost:3210/api/preview',{headers}))).toBe(false);
});
