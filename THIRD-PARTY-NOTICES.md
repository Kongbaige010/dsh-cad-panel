# 第三方声明（Third-Party Notices）

本仓库是**第三方项目，与 DeepSeek、Thompson Labs 均无隶属关系**，非任何一方的官方产物。

本项目自身代码以 MIT 许可发布（见 `LICENSE`）。它对下列第三方作品存在依赖、引用或
修改，依各自许可在此保留版权声明与许可文本。

---

## 1. text-to-cad / cad-server

- **用途**：本项目为 text-to-cad 的 CAD 引擎编写适配补丁（`patch-current-route.py`、
  `patch-embed-instrument.py`、`repatch-engine-csp.sh`）。这些脚本在**使用者本机**对已安装
  的引擎文件做幂等改写；本仓库**不包含**该引擎的源码副本。
- **版本**：`cad-server` 0.11.9
- **来源**：<https://github.com/earthtojake/text-to-cad>
- **许可**：MIT

```
MIT License

Copyright (c) 2026 Thompson Labs LLC

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
```

---

## 2. DeepSeekRuntime（DSH）

- **用途**：本项目是一个 DSH 客户端插件，调用其公开的 Cordis 插件接口（槽位注册、
  右侧栏 dock 服务等）。**本仓库不包含 DSH 的任何源码或二进制。**
- **许可**：其 `@deepseek-ai/*` 包声明为 MIT（本机实测 195 个包中 194 个 MIT，
  1 个 `node-addon-landlock-run` 为 BSD-3-Clause，属沙箱依赖）。

```
MIT License

Copyright (c) 2026 DeepSeek

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
```

---

## 3. three.js

- **用途**：`preview/vendor-classic/` 内联了 three.js r147 的三个构建产物
  （`three.min.js`、`GLTFLoader.js`、`OrbitControls.js`），用于生成可离线旋转的
  单文件模型预览页。原文件头部的许可声明未被移除。
- **版本**：r147
- **来源**：<https://github.com/mrdoob/three.js>
- **许可**：MIT

```
MIT License

Copyright © 2010-2022 Three.js Authors

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
```

---

## 商标说明

"DeepSeek"、"DeepSeekRuntime"、"DSH"、"text-to-cad"、"three.js" 等名称与标识归各自
权利人所有。本项目仅以**描述性方式**说明兼容性与依赖关系，不表示任何形式的官方认可、
赞助或隶属。包名与文档中不使用"官方""official"等表述。

## 免责

本项目按"现状"提供，不附带任何担保。它对**特定版本**的引擎做文件级补丁，
上游升级后可能失效；使用前请核对 README 中标注的适用版本。
