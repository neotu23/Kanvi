import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Kanvi · 公众号排版',description:'本地公众号排版与验证'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-CN"><body><header className="site-header"><a href="/" className="brand">Kanvi<span>文有其样</span></a><nav aria-label="工作台导航"><a href="/references">参考风格</a><a href="/">排版样例</a></nav></header>{children}<footer>从喜欢的风格，到属于自己的文字。</footer></body></html>; }
