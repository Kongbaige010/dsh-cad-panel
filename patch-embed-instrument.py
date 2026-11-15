"""给 text-to-cad 的 index.html 注入"嵌入自诊断"脚本。

为什么要注入：viewer 本来是给独立标签页用的。嵌进 DSH 面板（界面跑在 dsh-app://app
自定义协议上）时，浏览器可能拒绝存储访问，而页面一读 sessionStorage 就抛异常 ——
结果就是一片空白，没有任何线索。这里做两件事：
  1. 存储兜底：sessionStorage/localStorage 不可用时换成内存实现；
  2. 差错可见：任何异常都在页面底部画红条，并 postMessage 给父窗口，截图即可看到原因。

注意：脚本内容里**不能出现反斜杠转义**（换行用 String.fromCharCode(10)），
否则经 heredoc 传输时会被吃掉，生成的文件语法损坏。
"""

import io
import os
import sys

PATCH = os.path.expanduser(
    r"~/.local/state/cad/releases/0.11.9/Lib/site-packages/cad_server/viewer/http_app.py"
)

OLD_SERVE = '''        index_html = os.path.join(self.dist_dir, "index.html")
        if not self._serve_file(response, index_html, content_type_for_static_asset(index_html)):
            response.send_plain(404, "Not found")'''

NEW_SERVE = '''        index_html = os.path.join(self.dist_dir, "index.html")
        if self._serve_instrumented(response, index_html):
            return
        if not self._serve_file(response, index_html, content_type_for_static_asset(index_html)):
            response.send_plain(404, "Not found")'''

MARKER = "    # --- dispatch ---------------------------------------------------------"

METHOD = '''    def _serve_instrumented(self, response, index_html) -> bool:
        """Serve index.html with the embed shim injected (DSH panel iframe).

        Why: the viewer is a normal top-level page. Embedded in DSH -- whose UI runs
        on the custom scheme dsh-app://app -- the browser may refuse storage access,
        and a page that throws while reading sessionStorage shows nothing at all:
        a blank panel with no clue. The shim gives storage an in-memory fallback and
        paints any error into the page itself, so a screenshot carries the reason.

        Returns False when there is no client built, leaving the caller's 404.
        """
        try:
            with open(index_html, "r", encoding="utf-8") as handle:
                html = handle.read()
        except OSError:
            return False
        if "dsh-embed-shim" in html:
            body = html
        else:
            snippet = (
                '<script id="dsh-embed-shim">(function(){'
                'var mem={};'
                'function shim(){return{getItem:function(k){return k in mem?mem[k]:null;},'
                'setItem:function(k,v){mem[k]=String(v);},removeItem:function(k){delete mem[k];},'
                'clear:function(){mem={};},key:function(i){return Object.keys(mem)[i]||null;},'
                'get length(){return Object.keys(mem).length;}};}'
                'try{window.sessionStorage.getItem("t");}catch(e){'
                'try{Object.defineProperty(window,"sessionStorage",{value:shim(),configurable:true});}catch(e2){}}'
                'try{window.localStorage.getItem("t");}catch(e){'
                'try{Object.defineProperty(window,"localStorage",{value:shim(),configurable:true});}catch(e2){}}'
                'var seen=[];'
                'function paint(kind,text){'
                'try{seen.push(kind+": "+text);'
                'var box=document.getElementById("dsh-embed-errors");'
                'if(!box){box=document.createElement("div");box.id="dsh-embed-errors";'
                'box.style.cssText="position:fixed;left:0;right:0;bottom:0;max-height:45%;overflow:auto;'
                'z-index:2147483647;background:#7f1d1d;color:#fff;font:12px/1.5 monospace;'
                'padding:8px 10px;white-space:pre-wrap";document.documentElement.appendChild(box);}'
                'box.textContent=seen.join(String.fromCharCode(10)+String.fromCharCode(10));}catch(ignore){}'
                'try{parent.postMessage({source:"cad-viewer",kind:kind,text:text},"*");}catch(ignore){}'
                '}'
                'window.addEventListener("error",function(e){'
                'paint("error",(e.message||"")+" @ "+(e.filename||"")+":"+(e.lineno||0));});'
                'window.addEventListener("unhandledrejection",function(e){'
                'var r=e.reason;paint("rejection",(r&&(r.stack||r.message))||String(r));});'
                'setTimeout(function(){'
                'var root=document.getElementById("root");'
                'if(!root||root.children.length===0){'
                'paint("stalled","8s later #root is still empty");}'
                '},8000);'
                '})();</script>'
            )
            if "<head>" in html:
                body = html.replace("<head>", "<head>" + snippet, 1)
            else:
                body = snippet + html
        response.send_bytes(
            200,
            body.encode("utf-8"),
            "text/html; charset=utf-8",
            [("cache-control", "no-store")],
        )
        return True

'''


def main():
    src = io.open(PATCH, encoding="utf-8").read()
    if "_serve_instrumented" in src:
        print("已注入过，无需重复")
        return 0
    for name, old in (("_serve_dist 调用点", OLD_SERVE), ("dispatch 锚点", MARKER)):
        if src.count(old) != 1:
            print("锚点 %s 命中 %d 次，中止" % (name, src.count(old)))
            return 1
    src = src.replace(OLD_SERVE, NEW_SERVE, 1)
    src = src.replace(MARKER, METHOD + MARKER, 1)
    io.open(PATCH, "w", encoding="utf-8", newline="").write(src)
    print("注入补丁已写入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
