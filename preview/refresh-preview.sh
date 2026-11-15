#!/usr/bin/env bash
# 一条命令刷新模型预览：跑脚本构建 → 导出 GLB → 生成可旋转的单文件 HTML → 截图。
#
#   refresh-preview.sh <模型脚本.py> [输出目录]
#
# 输出的 cad-preview.html 是自包含的（three.js 与几何都内联），双击即可打开旋转。
set -uo pipefail

SCRIPT=${1:-}
if [ -z "$SCRIPT" ]; then
  echo "用法: refresh-preview.sh <模型脚本.py> [输出目录]" >&2
  exit 2
fi
OUT=${2:-"$PWD/cad-preview"}
PLUGIN="$(cd "$(dirname "$0")" && pwd)"
export PATH="$HOME/.local/bin:$PATH"

BUILD=$(cad run "$SCRIPT" 2>&1)
echo "$BUILD"
ID=$(printf '%s\n' "$BUILD" | sed -n 's/^  id: //p' | head -1)
if [ -z "$ID" ]; then
  echo "没从构建输出里拿到文档 id，停止" >&2
  exit 1
fi
SIZE=$(printf '%s\n' "$BUILD" | sed -n 's/.*bounds \(.*\) mm.*/\1/p' | head -1)
NAME=$(basename "$SCRIPT" .py)

mkdir -p "$OUT"
cad model export "$ID" "$OUT/$NAME.glb" || exit 1
python "$PLUGIN/make-preview.py" \
  --glb "$OUT/$NAME.glb" \
  --out-dir "$OUT" \
  --name "$NAME" \
  --size "${SIZE} mm" \
  --shot "$OUT/preview-shot.png" || exit 1

echo
echo "预览页：$OUT/cad-preview.html"
echo "截图：  $OUT/preview-shot.png"
