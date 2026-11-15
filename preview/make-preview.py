"""把一份 GLB 生成一个可离线、可鼠标旋转的 HTML 预览页（单文件，双击即可打开）。

为什么用「经典脚本」而不是 ES 模块：浏览器在 ``file://`` 下按 CORS 规则拒绝加载 ES
模块（实测：换成 http 才渲染）。经典脚本没有这个限制，所以把 three.js 整体内联，
页面就变成一个真正可以拷走、双击就转的独立文件。

为什么几何内联：换机器只带走这一个 HTML，不用再管 GLB 路径。

用法：
  python make-preview.py --glb 路径 --out-dir 目录 [--name 模型名] [--size "90 × 70 × 48 mm"] [--shot png]
"""

import argparse
import base64
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, "vendor-classic")
LIBS = ("three.min.js", "GLTFLoader.js", "OrbitControls.js")

HTML = """<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__NAME__ · 模型预览</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #eef1f5;
               font: 13px/1.6 ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif; }
  canvas { display: block; }
  #hud { position: fixed; top: 12px; left: 14px; z-index: 2; color: #1f2937;
         background: rgba(255,255,255,.86); padding: 6px 10px; border-radius: 8px;
         box-shadow: 0 2px 10px rgba(15,23,42,.10); }
  #hud b { font-weight: 600; }
  #hint { position: fixed; bottom: 12px; left: 14px; z-index: 2; color: #64748b; }
  #fail { position: fixed; inset: 0; display: none; place-items: center; z-index: 3;
          color: #7f1d1d; background: #fff; font-size: 14px; padding: 24px; text-align: center; }
</style>
</head>
<body>
<div id="hud"><b>__NAME__</b> · __SIZE__</div>
<div id="hint">左键旋转 · 滚轮缩放 · 右键平移</div>
<div id="fail"></div>
<script id="glb" type="text/plain">__GLB__</script>
<script>__THREE__</script>
<script>__LOADER__</script>
<script>__CONTROLS__</script>
<script>
(function () {
  "use strict";

  function fail(message) {
    var box = document.getElementById("fail");
    box.style.display = "grid";
    box.textContent = "预览加载失败：" + message;
  }

  try {
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef1f5);

    var camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100000);
    /* GLB 走 glTF 惯例：Y 轴朝上（导出时已从 CAD 的 Z-up 转过来），用默认 up */

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d97a5, 0.78));
    var key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(1, -1.4, 2);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-1.2, 1, 0.8);
    scene.add(fill);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    function frameObject(object) {
      var box = new THREE.Box3().setFromObject(object);
      var size = box.getSize(new THREE.Vector3());
      var center = box.getCenter(new THREE.Vector3());
      var span = Math.max(size.x, size.y, size.z) || 1;
      var distance = (span / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.55;
      camera.position.set(
        center.x + distance * 0.92,
        center.y + distance * 0.86,
        center.z + distance * 1.05
      );
      camera.near = distance / 500;
      camera.far = distance * 50;
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();

      var gridSize = Math.pow(10, Math.ceil(Math.log10(span * 3)));
      var grid = new THREE.GridHelper(gridSize, 20, 0xc2c9d4, 0xd8dee7);
      grid.position.set(center.x, box.min.y - span * 0.02, center.z);
      scene.add(grid);
    }

    var raw = document.getElementById("glb").textContent.replace(/\\s+/g, "");
    var binary = atob(raw);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    new THREE.GLTFLoader().parse(bytes.buffer, "", function (gltf) {
      var model = gltf.scene;
      model.traverse(function (node) {
        if (node.isMesh) {
          node.material = new THREE.MeshStandardMaterial({
            color: 0x93a9c0, metalness: 0.18, roughness: 0.68
          });
        }
      });
      scene.add(model);
      frameObject(model);
      window.__previewReady = true;
    }, function (error) {
      fail(String((error && error.message) || error));
    });

    window.addEventListener("resize", function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    renderer.setAnimationLoop(function () {
      controls.update();
      renderer.render(scene, camera);
    });
  } catch (error) {
    fail(String((error && error.message) || error));
  }
})();
</script>
</body>
</html>
"""


def read_lib(name: str) -> str:
    path = os.path.join(VENDOR, name)
    if not os.path.isfile(path):
        raise SystemExit(f"缺少 {path}（先用 curl 下载 three 经典脚本版）")
    # 内联进 <script> 时把结束标签断开，避免提前闭合
    return open(path, encoding="utf-8").read().replace("</script>", "<\\/script>")


def build(glb: str, out_dir: str, name: str, size: str, shot: str | None) -> int:
    if not os.path.isfile(glb):
        print(f"没有这个 GLB：{glb}")
        return 1
    os.makedirs(out_dir, exist_ok=True)

    payload = base64.b64encode(open(glb, "rb").read()).decode("ascii")
    html = HTML
    for token, lib in zip(("__THREE__", "__LOADER__", "__CONTROLS__"), LIBS):
        html = html.replace(token, read_lib(lib))
    html = html.replace("__NAME__", name).replace("__SIZE__", size).replace("__GLB__", payload)

    target = os.path.join(out_dir, "cad-preview.html")
    with open(target, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(html)
    print(f"已生成 {target}（{len(html):,} 字符，单文件、双击可开）")

    if shot:
        return screenshot(target, shot)
    return 0


def screenshot(page: str, out_png: str) -> int:
    """用 Edge 无头截一张图，确认页面真的画出了东西（file:// 直开，和双击一致）。"""
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    ]
    browser = next((path for path in candidates if os.path.isfile(path)), None)
    if browser is None:
        print("找不到 Edge/Chrome，跳过截图校验")
        return 0
    os.makedirs(os.path.dirname(os.path.abspath(out_png)) or ".", exist_ok=True)
    command = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--hide-scrollbars",
        "--window-size=1200,800",
        "--virtual-time-budget=8000",
        f"--screenshot={out_png}",
        "file:///" + os.path.abspath(page).replace("\\", "/"),
    ]
    done = subprocess.run(command, capture_output=True, text=True, timeout=180)
    if os.path.isfile(out_png):
        print(f"已截图 {out_png}（{os.path.getsize(out_png)} 字节）")
        return 0
    print("截图失败：", (done.stderr or done.stdout or "")[:400])
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="把 GLB 变成可离线旋转的单文件 HTML")
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--name", default="model")
    parser.add_argument("--size", default="")
    parser.add_argument("--shot", default=None, help="同时用无头浏览器截图到该路径")
    args = parser.parse_args()
    return build(os.path.abspath(args.glb), os.path.abspath(args.out_dir), args.name, args.size, args.shot)


if __name__ == "__main__":
    sys.exit(main())
