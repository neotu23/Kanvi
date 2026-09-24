# 第三方来源与许可

Kanvi 直接使用 Juice 内联自定义 HTML/CSS。WeMD 仅作为处理策略调研来源，本阶段未复制其代码。微信检查器从锁定的源码副本运行；本项目自有入口负责进程清理与响应校验，不改动上游引擎。

## Juice 12.1.3

来源：https://github.com/Automattic/juice

# MIT License

Copyright (c) 2021 Automattic

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## 微信文章结构检查器

来源：https://github.com/wechatjs/verify-article-structure-spec

MIT License

Copyright (c) 2026 Tencent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## WeMD（调研来源）

来源：https://github.com/tenngoxars/WeMD

MIT License

Copyright (c) 2025 WeMD Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


其他 npm 依赖的许可证随各软件包分发；准确版本见 package-lock.json 和 docs/locks/wechat-cli.package-lock.json。

## Markdown 与属性区解析（第四阶段）

- mdast-util-from-markdown 2.0.3：MIT，https://github.com/syntax-tree/mdast-util-from-markdown
- mdast-util-gfm 3.1.0：MIT，https://github.com/syntax-tree/mdast-util-gfm
- micromark-extension-gfm 3.0.0：MIT，https://github.com/micromark/micromark-extension-gfm
- mdast-util-frontmatter 2.0.1：MIT，https://github.com/syntax-tree/mdast-util-frontmatter
- micromark-extension-frontmatter 2.0.0：MIT，https://github.com/micromark/micromark-extension-frontmatter
- yaml 2.9.1：ISC，https://github.com/eemeli/yaml

以上依赖经 npm 安装，许可证原文随包分发；精确传递依赖及完整性记录见 package-lock.json。Kanvi 使用 AST 并校验允许的结构，不直接信任或执行 Markdown 中的 HTML。
