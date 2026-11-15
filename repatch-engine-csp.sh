#!/usr/bin/env bash
# 让 text-to-cad 的 viewer 能被 DSH 的界面以 iframe 嵌入。
#
# 为什么需要改引擎：viewer 是给"独立标签页"设计的，嵌入时有**三道锁**，缺一不可：
#   ① http_app.py  PAGE_HEADERS 的 CSP `frame-ancestors 'self'` → 只允许自己嵌入
#      （且 DSH 界面跑在自定义协议 dsh-app://app 上，写死端口的白名单也不匹配）
#   ② engine_app.py  _navigation() 只认 sec-fetch-dest == 'document'
#      → iframe 里是 'iframe'，首个页面请求直接被 403
#   ③ engine_app.py  _session_cookie() 是 SameSite=Strict
#      → 跨站 iframe 不发 Cookie，页面里的 /assets/*.js 全部 403 → 白板
#
# 何时需要重跑：`cad update` / 重装引擎之后（release 目录被换掉，改动丢失 → 面板变空白）。
# 跑完要重启引擎进程才生效：结束占用 3245 的进程，下次建模/看图会自动起新的。
set -u

STATE="${HOME}/.local/state/cad/releases"
found=0

for rel in "$STATE"/*; do
  APP="$rel/Lib/site-packages/cad_server/viewer/engine_app.py"
  HTTP="$rel/Lib/site-packages/cad_server/viewer/http_app.py"
  [ -f "$APP" ] && [ -f "$HTTP" ] || continue
  found=1
  echo "== $rel"

  python - "$APP" "$HTTP" <<'PY'
import io, os, shutil, sys

app_path, http_path = sys.argv[1], sys.argv[2]

# (说明, 文件, 原始串, 目标串)
PATCHES = [
    ("① CSP 允许任意祖先（DSH 用 dsh-app://app 自定义协议）", http_path,
     'PAGE_HEADERS = (("content-security-policy", "frame-ancestors \'self\'"),)',
     'PAGE_HEADERS = (("content-security-policy", "frame-ancestors *"),)'),
    # 早期版本可能写过端口白名单，一并纠正
    ("① CSP 端口白名单 → 通配", http_path,
     'PAGE_HEADERS = (("content-security-policy", "frame-ancestors \'self\' http://127.0.0.1:* http://localhost:*"),)',
     'PAGE_HEADERS = (("content-security-policy", "frame-ancestors *"),)'),
    ("① CSP 写死端口 → 通配", http_path,
     'PAGE_HEADERS = (("content-security-policy", "frame-ancestors \'self\' http://127.0.0.1:51890 http://localhost:51890"),)',
     'PAGE_HEADERS = (("content-security-policy", "frame-ancestors *"),)'),
    ("② iframe 的页面加载也算导航", app_path,
     "    return (request.header('sec-fetch-dest') == 'document' or 'text/html' in request.header('accept')) \\",
     "    return (request.header('sec-fetch-dest') in ('document', 'iframe', 'frame') or 'text/html' in request.header('accept')) \\"),
    ("③ 会话 Cookie 可在跨站 iframe 中发送", app_path,
     "f'Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=Strict')",
     "f'Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=None; Secure; Partitioned')"),
    # ④ 真正解决问题的一层：DSH 界面跑在 dsh-app://app 自定义协议上，
    #    浏览器既不发 SameSite Cookie，Sec-Fetch-Site 也是 cross-site，
    #    于是页面里的 /assets/*.js 与 /api/* 全被 403。这里记住"最近一次凭证通过"，
    #    窗口期内同机请求直接放行——不依赖 Cookie，也不需要反向代理。
    ("④ 记录最近授权时刻（模块级状态）", app_path,
     "def _navigation(request):",
     '''# 本机嵌入放行：DSH 界面跑在自定义协议（dsh-app://app）上，浏览器把它当跨站，
# 既不会送 SameSite 会话 Cookie，Sec-Fetch-Site 也会是 cross-site，
# 于是页面里的 /assets/*.js 与 /api/* 全被 403 → 白板。
# 既然引擎只监听 127.0.0.1 且 Host 已校验，这里记住"最近一次凭证通过"的时刻，
# 窗口期内同机请求直接放行：不留 Cookie、不需要反向代理、没有额外常驻进程。
AUTHORIZED_SECONDS = 12 * 3600
_AUTHORIZED = {"at": 0.0}


def _recently_authorized():
    return (time.time() - _AUTHORIZED["at"]) < AUTHORIZED_SECONDS


def _authorize_now():
    _AUTHORIZED["at"] = time.time()


def _navigation(request):'''),
    ("④ 凭证通过时记录时刻", app_path,
     """        session = saved if saved and standing(self.token, 'session', saved) == 'ok' else ''
        if 'ok' not in offered and not session:
            return self._refused(request, response, 'expired' in offered)""",
     """        session = saved if saved and standing(self.token, 'session', saved) == 'ok' else ''
        sticky = _recently_authorized()
        if 'ok' in offered:
            _authorize_now()  # 本次带了正确凭证：之后的同机请求进入放行窗口
            sticky = True
        if 'ok' not in offered and not session and not sticky:
            return self._refused(request, response, 'expired' in offered)"""),
    ("④ 放行窗口内豁免跨站来源校验", app_path,
     "        if 'ok' not in offered and request.header('sec-fetch-site') not in ('', 'same-origin', 'none'):",
     "        if 'ok' not in offered and not sticky and request.header('sec-fetch-site') not in ('', 'same-origin', 'none'):"),
]

texts = {}
for _, path, _, _ in PATCHES:
    texts[path] = io.open(path, encoding='utf-8').read()

for label, path, old, new in PATCHES:
    cur = texts[path]
    if new in cur:
        print(f"  {label}: 已就绪")
        continue
    if cur.count(old) != 1:
        print(f"  {label}: 跳过（锚点命中 {cur.count(old)} 次，版本可能变了）")
        continue
    bak = path + ".bak-before-dsh-embed"
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
    texts[path] = cur.replace(old, new)
    print(f"  {label}: 已打补丁")

for path, text in texts.items():
    cur = io.open(path, encoding='utf-8').read()
    if cur != text:
        io.open(path, 'w', encoding='utf-8', newline='').write(text)
PY
done

if [ "$found" = "0" ]; then
  echo "没找到引擎 release：$STATE/*/Lib/site-packages/cad_server/viewer/"
  exit 1
fi

# 另两道补丁（各自幂等，重复跑无副作用）：
#   ⑤ 往 index.html 注入嵌入自诊断脚本（存储兜底 + 出错画红条）
#   ⑥ 加 GET /dsh/current，让面板能跟随最新模型（带 CORS）
HERE="$(cd "$(dirname "$0")" && pwd)"
for patcher in "$HERE/patch-embed-instrument.py" "$HERE/patch-current-route.py"; do
  if [ -f "$patcher" ]; then
    echo "== 运行 $(basename "$patcher")"
    python "$patcher" || echo "   （跳过：锚点不匹配，版本可能变了）"
  fi
done

echo
echo "提醒：改完要重启引擎才生效。做法："
echo "  netstat -ano | grep LISTENING | grep ':3245'     # 看 PID"
echo "  taskkill //PID <PID> //F                         # 结束它"
echo "  然后随便跑一次 cad run 会自动起新引擎"
exit 0
