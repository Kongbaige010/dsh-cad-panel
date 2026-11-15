"""给引擎加一个 GET /dsh/current：告诉 DSH 的 CAD 面板「该显示哪个模型」。

为什么需要：面板是个 iframe，只能读取允许它来源的响应；DSH 界面的来源是
dsh-app://app（不透明来源），所以答案必须带 access-control-allow-origin: *。
只返回一个文档 id（不含模型数据），取 state/documents 下最新的一条 ——
也就是使用者刚建出来的那个。
"""

import io
import os
import sys

PATCH = os.path.expanduser(
    r"~/.local/state/cad/releases/0.11.9/Lib/site-packages/cad_server/viewer/http_app.py"
)

DISPATCH_OLD = '''        if pathname == "/api" or pathname.startswith("/api/"):'''
DISPATCH_NEW = '''        if pathname == "/dsh/current":
            if method != "GET":
                return ApiError.method(method, pathname, ("GET",)).send(response)
            self._dsh_current(response)
            return
        if pathname == "/api" or pathname.startswith("/api/"):'''

MARKER = "    def _dispatch(self, request, response) -> None:"

METHOD = '''    def _dsh_current(self, response) -> None:
        """``GET /dsh/current``: the document DSH's CAD panel should show.

        The panel is an iframe, so it can only read what allows its origin -- and DSH's
        UI runs on the opaque dsh-app://app, hence the wildcard. It names a document id
        and nothing of the model: the newest entry under the state's ``documents`` is
        what the person just built.
        """
        newest = None
        newest_mtime = -1.0
        try:
            from pathlib import Path

            from cad.engine.places import state_dir

            for entry in (Path(state_dir()) / "documents").iterdir():
                try:
                    mtime = entry.stat().st_mtime
                except OSError:
                    continue
                if mtime > newest_mtime:
                    newest, newest_mtime = entry.name, mtime
        except Exception:  # noqa: BLE001 - a missing state directory is an empty panel, not an error
            newest = None
        response.also = (*response.also, ("access-control-allow-origin", "*"))
        response.send_json(200, {"id": newest, "url": "/" + newest if newest else "/"})

'''


def main():
    src = io.open(PATCH, encoding="utf-8").read()
    if "_dsh_current" in src:
        print("已打过该补丁，跳过")
        return 0
    if src.count(DISPATCH_OLD) != 1 or src.count(MARKER) != 1:
        print("锚点不唯一，中止")
        return 1
    src = src.replace(DISPATCH_OLD, DISPATCH_NEW, 1)
    src = src.replace(MARKER, METHOD + MARKER, 1)
    io.open(PATCH, "w", encoding="utf-8", newline="").write(src)
    print("已加入 /dsh/current 路由")
    return 0


if __name__ == "__main__":
    sys.exit(main())
