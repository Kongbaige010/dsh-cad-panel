"""把改动前后两张同机位渲染拼成一张对比图，并把改动位置圈出来。

为什么要这么做：构建日志只说"体积少了多少"，看不出改在哪。把改动位置按相机参数
投影到像素坐标，就能在图上直接标注——这才是"渲染告诉我改了什么"。

同机位的前提：两张图必须用**完全相同**的相机渲染，否则对比无意义。判定方法是核对
两张 snapshot 报告里的 `settledCamera.orthographicHalfHeight` 是否逐位相等。

用法：
  python make-diff-sheet.py --before a.png --after b.png --out diff.png \
      --half-h 30.97595763819767 \
      --cam-pos 114.4183884947508,-114.4183884947508,100.27628336660142 \
      --cam-target 2.351038614908855,-2.351038614908855,10.622403462727865 \
      --hole 20,20,8 --hole -20,20,8 --hole 20,-20,8 --hole -20,-20,8 \
      --title-before "改动前" --title-after "改动后"

相机四个参数取自 `cad_snapshot` 返回的 `settledCamera`；不传则跳过投影、只做并排拼接。
"""

import argparse
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# 这些选项的取值可能是负数（如 -0.348,… 或 -20,20,8），argparse 会把开头的负号
# 误当成选项前缀。下面先做一次 argv 规整，把它们合并成 --flag=value 形式。
NUMERIC_FLAGS = ("--hole", "--cam-pos", "--cam-target", "--cam-up")


def normalize_argv(argv):
    merged = []
    index = 0
    while index < len(argv):
        token = argv[index]
        if token in NUMERIC_FLAGS and index + 1 < len(argv):
            following = argv[index + 1]
            if re.match(r"^-\d", following):
                merged.append(f"{token}={following}")
                index += 2
                continue
        merged.append(token)
        index += 1
    return merged


def parse_triplet(text):
    parts = [float(item) for item in text.replace(" ", "").split(",")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError(f"需要三个数（x,y,z），收到：{text}")
    return np.array(parts, dtype=float)


def load_font(size):
    """优先中文字体，Windows / macOS / Linux 依次尝试，取不到就用内置位图字体。"""
    candidates = (
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "C:/Windows/Fonts/arial.ttf",
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


class Camera:
    """正交相机：世界坐标 → 像素坐标。"""

    def __init__(self, position, target, up, half_height):
        self.position = np.asarray(position, dtype=float)
        forward = np.asarray(target, dtype=float) - self.position
        forward /= np.linalg.norm(forward)
        right = np.cross(forward, np.asarray(up, dtype=float))
        right /= np.linalg.norm(right)
        self.forward = forward
        self.right = right
        self.up = np.cross(right, forward)
        self.half_height = float(half_height)

    def project(self, point, width, height):
        delta = np.asarray(point, dtype=float) - self.position
        x_cam = float(np.dot(delta, self.right))
        y_cam = float(np.dot(delta, self.up))
        px = width / 2.0 + x_cam * height / (2.0 * self.half_height)
        py = height / 2.0 - y_cam * height / (2.0 * self.half_height)
        return px, py


def main() -> int:
    parser = argparse.ArgumentParser(description="同机位前后对比图 + 改动位置圈注")
    parser.add_argument("--before", required=True, help="改动前渲染图")
    parser.add_argument("--after", required=True, help="改动后渲染图")
    parser.add_argument("--out", required=True, help="输出的对比图")
    parser.add_argument("--panel-width", type=int, default=1200, help="单幅宽度（像素）")
    parser.add_argument("--title-before", default="改动前", help="左图标题")
    parser.add_argument("--title-after", default="改动后", help="右图标题")
    parser.add_argument("--note", default="", help="底部结论条文字；留空则不画")
    parser.add_argument("--cam-pos", type=parse_triplet, help="相机位置，逗号分隔三元组")
    parser.add_argument("--cam-target", type=parse_triplet, help="相机目标点")
    parser.add_argument("--cam-up", type=parse_triplet, help="相机 up 向量")
    parser.add_argument("--half-h", type=float, help="正交半高（settledCamera.orthographicHalfHeight）")
    parser.add_argument("--hole", action="append", default=[], type=parse_triplet,
                        help="要圈出的点，可重复：--hole x,y,z")
    args = parser.parse_args(normalize_argv(sys.argv[1:]))

    try:
        before = Image.open(args.before).convert("RGB")
        after = Image.open(args.after).convert("RGB")
    except OSError as error:
        print(f"读图失败：{error}", file=sys.stderr)
        return 1

    panel_w = args.panel_width
    scale = panel_w / before.width
    panel_h = int(before.height * scale)
    before = before.resize((panel_w, panel_h), Image.LANCZOS)
    after = after.resize((panel_w, panel_h), Image.LANCZOS)

    header = 78
    gutter = 18
    footer = 46 if args.note else 0
    canvas = Image.new("RGB", (panel_w * 2 + gutter, panel_h + header + footer), "white")
    canvas.paste(before, (0, header))
    canvas.paste(after, (panel_w + gutter, header))
    draw = ImageDraw.Draw(canvas)

    title_font = load_font(30)
    body_font = load_font(22)
    draw.text((24, 18), args.title_before, font=title_font, fill="#111827")
    draw.text((panel_w + gutter + 24, 18), args.title_after, font=title_font, fill="#111827")

    missing = [name for name, value in (("--cam-pos", args.cam_pos), ("--cam-target", args.cam_target),
                                        ("--cam-up", args.cam_up), ("--half-h", args.half_h)) if value is None]
    if args.hole and missing:
        print(f"提示：未提供 {'、'.join(missing)}，跳过圈注（仍会输出并排对比图）")
    elif args.hole:
        camera = Camera(args.cam_pos, args.cam_target, args.cam_up, args.half_h)
        # 注意：缩放后直接在 panel 坐标系里投影，不能再乘 scale（乘两次会把圈甩到左上角）
        for offset_x in (0, panel_w + gutter):
            for point in args.hole:
                px, py = camera.project(point, panel_w, panel_h)
                px += offset_x
                py += header
                radius = 34
                draw.ellipse([px - radius, py - radius, px + radius, py + radius],
                             outline="#dc2626", width=4)

    draw.line([(panel_w + gutter // 2, 0), (panel_w + gutter // 2, canvas.height)], fill="#e5e7eb", width=2)

    if args.note:
        draw.rectangle([0, canvas.height - footer, canvas.width, canvas.height], fill="#f3f4f6")
        draw.text((24, canvas.height - footer + 8), args.note, font=body_font, fill="#374151")

    canvas.save(args.out)
    print(f"已生成 {args.out}（{canvas.width}×{canvas.height}）")
    if args.hole and not missing:
        for point in args.hole:
            px, py = camera.project(point, panel_w, panel_h)
            print(f"  圈注点 {tuple(float(v) for v in point)} → 面板像素 ({px:.0f}, {py:.0f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
