import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Kanvi · 公众号排版',description:'本地公众号排版与验证'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-CN"><body><header className="site-header"><a href="/" className="brand">Kanvi<span>文有其样</span></a><span className="header-note">本地排版工作台</span></header>{children}<footer>从喜欢的风格，到属于自己的文字。</footer></body></html>; }
