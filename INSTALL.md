# 安装 dsh-cad-panel

本页只讲安装。功能说明见 [README.md](README.md)，实现细节见 [docs/DETAIL.md](docs/DETAIL.md)。

## 前置条件

| 项 | 要求 | 怎么确认 |
|---|---|---|
| DSH 桌面端 | 能正常启动并打开会话 | 打开本机 Web GUI 即可 |
| text-to-cad | `cad` 命令可用 | `cad --version` |
| CAD 引擎 | 监听 `127.0.0.1:3245` | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3245/` |
| Node.js | 仅自检脚本需要 | `node -v` |

`curl` 返回 `403` 也算正常——那说明引擎活着，只是当前请求没带凭据。

## 第一步：取代码

```bash
git clone https://github.com/Kongbaige010/dsh-cad-panel.git ~/.dsh/local-plugins/dsh-cad-panel
```

放到 `~/.dsh/local-plugins/` 下只是为了与其它本地插件同处一地，放别处也能用。

## 第二步：给引擎打补丁

```bash
bash ~/.dsh/local-plugins/dsh-cad-panel/repatch-engine-csp.sh
```

脚本是**幂等**的，重复执行不会叠加。它做六件事：放行 `frame-ancestors`、把 iframe 请求当导航、
调整 cookie、给授权加记忆、新增 `GET /dsh/current`、注入 embed shim。
改动前的文件备份在同目录的 `*.bak-before-dsh-*`。

> 打了补丁之后，**任何** `cad update` 都会把它们覆盖掉，重跑本步即可。

## 第三步：在 DSH 里登记为本地 bundle

在 DSH 的插件/扩展入口里把这个目录添加为本地 bundle。若你的版本支持 profile 依赖，也可以直接写进
profile 的 `package.json`：

```json
{ "dependencies": { "dsh-cad-panel": "link:C:/Users/<you>/.dsh/local-plugins/dsh-cad-panel" } }
```

登记完成后**重载页面**（`Ctrl+Shift+R`）。宿主半边可热加载，但客户端胶囊要页面重载才出现。

## 验收

按顺序确认三件事，任何一条不过就先别看功能：

1. 输入框左侧出现 `CAD` 胶囊。
2. 点它，右侧栏打开一个只读的 `CAD` dock 标签，里面是当前模型。
3. 跑一次 `cad run` 重建，面板**自己**刷新一次（不是你要手动点）。

自检脚本可以替你核对插件的注册行为：

```bash
cd ~/.dsh/local-plugins/dsh-cad-panel && node verify-client.js
```

期望最后一行是 `RESULT: ALL CHECKS PASSED`。

## 回滚

1. 从 DSH 里移除该 bundle 并重载页面。
2. 如需还原引擎：把 `*.bak-before-dsh-*` 覆盖回原文件，或直接 `cad update` 覆盖。
3. 引擎侧补丁是唯一动过外部文件的部分，插件本体只读取引擎，不改它。

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 点了胶囊但面板空白 | 引擎没起或端口不是 3245 | 起引擎；端口不同就改 `lib/client.js` 的 `ENGINE_URL` |
| 面板里显示 403 | 引擎已重启，授权记忆丢了 | 重启 DSH 让宿主重新预热 token，或等宿主下一次续期 |
| 右侧栏反复自动弹开 | 装了旧版（用 `opened` 触发） | 升级到当前版本：只认 `built` |
| 胶囊根本不出现 | 客户端模块 id 与包名不一致 | 确认 `lib/client.js` 的 `load({ id })` 等于 `package.json` 的 `name` |
