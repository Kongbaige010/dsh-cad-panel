# dsh-cad-panel

> **第三方插件，非 DSH 官方产物。** 与 DeepSeek、Thompson Labs 均无隶属关系。

把 [text-to-cad](https://github.com/earthtojake/text-to-cad) 的实时三维视图接进
DSH 的右侧栏，并提供离线可旋转的模型预览页。

## 能力

| 能力 | 说明 |
|---|---|
| **右侧栏 dock 面板** | 点输入框左侧的 `CAD` 胶囊，在右侧栏打开实时视图；再点一次收起 |
| **构建自动展开** | 模型真正重建时自动打开面板（不打扰的触发，见下） |
| **会话内看图** | 配合 `preview/` 的一键脚本，把最新渲染图贴进对话 |
| **离线可旋转页** | 生成单文件 `cad-preview.html`，双击即开，three.js 与几何全部内联 |
| **前后对比图** | 同机位渲染两张图并圈出改动位置，用来核对"到底改了什么" |

## 安装

```bash
git clone <this repo> ~/.dsh/local-plugins/dsh-cad-panel
```

然后在 DSH 中把该目录作为本地 bundle 加入 profile（或按你的 DSH 版本的插件安装方式）。
重载页面后，输入框左侧应出现 `CAD` 胶囊。

## 前置条件

1. 本机已安装 text-to-cad，`cad` 命令可用，引擎监听 `127.0.0.1:3245`。
2. 运行一次引擎补丁脚本（幂等，可重复执行）：

```bash
bash ~/.dsh/local-plugins/dsh-cad-panel/repatch-engine-csp.sh
```

> **适用版本：`cad-server` 0.11.9。** 补丁是文件级改写，`cad update` 升级后可能失效，
> 届时重新运行上面的脚本；若上游改动过大导致脚本报错，请提 issue 而不是静默跳过。

## 为什么自动展开只用 `built` 一个信号

引擎每次文档被打开时都会改写 `opened` / `preview` 字段与目录时间戳，**用它们触发会形成
自激循环**（面板一开 → 时间戳变 → 再开 → …），表现为右侧栏疯狂弹开。
只有 `built` 字段在真正重建时才变化，所以它才是唯一可信的触发源。

## 目录

```
lib/client.js              客户端：胶囊按钮、dock tab、构建监听
lib/index.js               宿主：token 预热（全程 try/catch，绝不阻断 DSH 启动）
preview/make-preview.py    GLB + three.js → 单文件 HTML
preview/refresh-preview.sh 一键：构建 → 导出 → 生成 → 截图
preview/make-diff-sheet.py 同机位前后对比 + 投影圈注
preview/vendor-classic/    three.js r147（内联用）
patch-current-route.py     给引擎加 GET /dsh/current
patch-embed-instrument.py  注入 embed shim
repatch-engine-csp.sh      上述补丁的总入口
```

## 许可

MIT。依赖与内联组件的版权声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
