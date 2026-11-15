# 实现细节

给要改代码或排查问题的人看。安装见 [INSTALL.md](../INSTALL.md)。

## 两半结构

插件分宿主半边与客户端半边，各管一段，互不阻塞：

```
lib/index.js    宿主：启动时与每 5 分钟用持久 token 给引擎"开门"，全程 try/catch
lib/client.js   客户端：胶囊按钮、右侧栏 dock tab、构建监听、错误如实显示
```

宿主半边**绝不能抛异常**——插件抛错会中断 DSH 启动。所以每个槽位注册与每个定时器都各自包在
`try/catch` 里，定时器 `unref()`，进程不会被它吊住。

## 右侧栏是 dock，不是一个槽位

```
注册 tab 类型  ctx.sidebarRightTabs.register({ id, kind, multiple, title(), guide: [...] })
渲染内容      ctx.slots.register({ name: "sidebar.right.pane.tab",       key: <id|kind> }, C)
渲染标题      ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: <id|kind> }, C)
打开          ctx.sidebarRight.commandTarget(el) → openTabFromTarget(kind, target)
关闭          ctx.sidebarRight.closeIn(sessionId, tabId)
读快照        ctx.sidebarRight.openTabs.getSnapshot()
```

服务可能未注入，一律用 `ctx.inject([...], scope => ...)` 取，**不要裸访问** `ctx.sidebarRight`。

## 自动打开只认一个信号：built

| 字段 | 何时变 | 能当触发源吗 |
|---|---|---|
| `built` | 真正重建模型时 | ✅ 唯一可信 |
| `opened` | 每次打开文档 | ❌ 会自激：面板开 → 时间戳变 → 再开 → … |
| `preview` | 每次生成预览 | ❌ 同上 |
| 目录 mtime | 任何读写 | ❌ 同上 |

另外两条纪律：面板已开时不再 open（否则抢焦点）；**不在页面加载时自动开**——要的是"执行 CAD
任务时自动开"，不是"一进页面就开"。

## 引擎侧补丁（`repatch-engine-csp.sh`，幂等）

| # | 位置 | 作用 |
|---|---|---|
| ① | `http_app.py` CSP `frame-ancestors` ×3 | 允许被 DSH 内嵌 |
| ② | `engine_app.py` `_navigation()` 接受 `document/iframe/frame` | iframe 请求视为导航 |
| ③ | `engine_app.py` cookie `SameSite=None; Secure; Partitioned` | 跨站带得上凭据 |
| ④ | `engine_app.py` sticky authorization（12h，5 分钟续） | 免反复要 token |
| ⑤ | `http_app.py` 新增 `GET /dsh/current` | 面板探测当前文档，返回 `id`/`url`/`built` |
| ⑥ | `http_app.py` 注入 `dsh-embed-shim` | storage 兜底 + 错误浮层 |

`cad update` 覆盖 `http_app.py` / `engine_app.py` 后补丁全丢，重跑脚本即可。
安全边界没有放宽：引擎仍只听 `127.0.0.1`，有 Host 白名单，未带凭据的请求照样 403。

## 预览管线

```
cad run 脚本  →  取文档 id 与 bounds  →  cad model export（GLB）
              →  make-preview.py（GLB + three.js → 单文件 HTML）
              →  无头 Edge 截图 PNG
```

一键入口：`bash preview/refresh-preview.sh <模型脚本.py> <输出目录>`。

## 对比图与圈注

`preview/make-diff-sheet.py` 把改动前后两张图并排，并按正交投影把改动位置画成红圈：

```bash
python preview/make-diff-sheet.py --before a.png --after b.png --out diff.png \
  --half-h <settledCamera.orthographicHalfHeight> \
  --cam-pos x,y,z --cam-target x,y,z --cam-up x,y,z \
  --hole 20,20,8 --hole -20,20,8
```

两个前提不满足就别比：两张图必须来自**完全相同**的相机（核对 `orthographicHalfHeight` 逐位相等），
且投影时**在缩放后的坐标系里直接投影**（再乘一次缩放比会把圈甩到左上角）。

## 为什么用经典脚本内联 three.js

`file://` 下浏览器拒绝加载 ES 模块（CORS），用 `type="module"` 的页面双击只会白屏。改成经典脚本把
three 与几何全部内联，单文件离线可用。另外 GLB 是 glTF 惯例的 **Y 轴朝上**，不是 CAD 的 Z 轴朝上，
相机用默认 `up`，`GridHelper` 也默认躺在 XZ 平面。

## 客户端模块 id 必须等于包名

`window.__ModuleLoader__.load({ id })` 的 `id` 必须与 `package.json` 的 `name` 完全一致。宿主是按包名
去模块表里取模块的，`id` 多一个后缀就**取不到、不报错、不渲染**，表现为"装了但界面上什么都没有"。
