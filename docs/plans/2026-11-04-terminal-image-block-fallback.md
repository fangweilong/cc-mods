# terminal-image 字符块降级渲染实施计划

- 日期：2026-11-04
- 状态：任务 0–7 已完成并通过插件测试与校验；任务 8 真实终端验收待用户执行（2026-11-04）。
- 目标：在没有 Kitty/Graphics 协议的终端（Windows Terminal、VS Code 集成终端、Apple Terminal、tmux 等）用宿主 `<Raster>` 元素以「半块字符 + 真彩色」显示 PNG，替代当前的「直接不渲染」。

## 1. 背景与结论

现状：`hooks/detect.ts` 对 Windows Terminal 等终端返回 `unsupported`，渲染 hook 直接跳过；宿主 `<Image>` 只支持 Kitty/Ghostty 与 iTerm2 3.5+，没有 SIXEL 通道，所以插件无法照搬 omp 的 SIXEL 方案（插件无法主动向终端写 DCS 序列，也无法让宿主按图形行高排版）。

可行通道：宿主在 terminal 面提供了 `<Raster>`（`RasterProps`，`index.d.ts:9948`）：

- 固定 `columns × rows` 单元格，每格一个宽度 1 的 BMP 字符 + 前景色 + 背景色；
- `cells` 是 `columns * rows` 个小端 u32 三元组 `[codePoint, 0x00RRGGBB, 0x00RRGGBB]` 的标准 base64；
- 宿主一次最多绘制 1024 个不同色对，其余映射到最近色；
- 仅 terminal 面存在（`$.ui.resolve(e)` 的 terminal 元素表）。

因此方案是：**自己解码 PNG，降采样成 `columns × rows*2` 的像素网格，每格用 `▀`（U+2580）上半块，前景=上像素、背景=下像素，打包成 Raster 的 `cells`**。这是纯文本渲染，不依赖任何图形协议，Windows Terminal 一定能出图。

## 2. 行为与配置

新增 `image.blocks`：

| 键 | 值域 | 默认 | 含义 |
| --- | --- | --- | --- |
| `blocks` | `auto` / `on` / `off` | `auto` | `auto` 仅在探测结果为 `unsupported` 时用字符块；`on` 任何终端都强制字符块（用于验证/对比）；`off` 保持现有行为 |

与既有配置的优先级：

1. `enabled=false` 或 `mode=off` → 什么都不画。
2. `CC_TERMINAL_IMAGE=off` → 什么都不画（含字符块）。
3. `CC_TERMINAL_IMAGE=on/force` → 按 `supported` 处理，只走宿主 `<Image>`。
4. `blocks=on` → 字符块，覆盖 `supported` 的 `Image` 选择。
5. `blocks=off` → 只走 `<Image>`（现状）。
6. `auto`：`unsupported` → 字符块；`supported` → `<Image>`；`unknown` → `<Image>` 交给宿主（不回退，避免把 iTerm2、tmux 透传等能出图的终端降级）。

`unknown` 保持交给宿主是刻意选择：现有探测把 iTerm2、tmux 内层 Kitty 等归为 `unknown`，改成字符块会直接降质。需要时用户可用 `blocks=on` 强制。

新增排查命令输出：`/terminal-image` 增加 `blocks=<off|auto|on>` 与最近一次字符块结果（`decoded` / `rejected:<reason>`）。

## 3. 渲染规格

### 3.1 尺寸与采样

- 复用 `fitLayout` / `layoutPictures` 得到每张图的 `columns × rows`（单元格，含多图并排）。
- 像素网格固定为 `columns × (rows * 2)`：一个字符格放上下两个像素。
- 缩小时按区域做 box 平均（含分数边界）；放大时取最近像素。
- 单元格宽高比沿用 `CELL_ASPECT = 2`，因此网格的宽高比与图片一致，不会拉伸。

### 3.2 颜色

- PNG 的 alpha 先与背景色合成；全透明像素保留为背景色（Raster 不支持真正的透明格，v1 不做 `0x01000000` 透传）。
- 背景色来源：`COLORFGBG` 最后一个字段（ANSI 0–15 → xterm RGB），缺失时按黑底 `#000000`。不新增配置项。
- 每格：`codePoint = 0x2580`，`fg = 上像素 RGB`，`bg = 下像素 RGB`。
- 颜色不预先量化，交给宿主的 1024 色对映射；若实测存在明显色带，再单独加调色板量化（不在 v1）。

### 3.3 打包与上限

- 生成 `Uint8Array(columns * rows * 12)`，按小端写入三个 u32，再 `toBase64()` 得到 `cells`。
- `columns ≤ 512`、`rows ≤ 256`（配置上限 255，天然满足）。
- 解码与采样都设硬上限：解码后 RGBA ≤ 64 MiB、像素数 ≤ 16,777,216；超限直接放弃该图，不渲染、不抛错。

### 3.4 缓存

- 只缓存最终 `cells`（约 `columns*rows*12` 字节），不缓存 RGBA。
- key：
  - 文件图片：`realPath + mtimeMs + size`；
  - 内联图片：base64 字符串本身；
  - 再拼 `columns × rows × 背景色`。
- LRU 32 项。命中直接复用，避免每次重绘都 inflate/采样。
- 文件图片继续复用现有 `fileCache`；`fileCache` 清空时同步清空块缓存。

## 4. PNG 解码器规格

插件运行环境「no DOM, no Node」，没有 `zlib`、也没有声明 `DecompressionStream`，因此必须自带纯 TS 解码：

`hooks/inflate.ts`

- zlib 包装（跳过 2 字节头，不校验 adler32）+ DEFLATE：
  - stored / fixed Huffman / dynamic Huffman；
  - 回引复制、边界检查；
  - 输出超过调用方给的上限立即失败。
- 只实现 PNG IDAT 需要的能力，不做压缩端。

`hooks/png-decode.ts`

- 逐块解析：`IHDR`、`PLTE`、`tRNS`、`IDAT`（可多块拼接）、`IEND`；忽略未知辅助块，不校验 CRC。
- 支持：
  - 颜色类型 0（灰度）、2（RGB）、3（索引）、4（灰度+alpha）、6（RGBA）；
  - 位深 1/2/4/8/16（1/2/4 仅索引与灰度；16 位取高字节降到 8 位）；
  - `tRNS`：索引透明表、灰度/RGB 透明键。
- 不支持并明确拒绝：Adam7 隔行（`interlace=1`）、非法块顺序、尺寸/输出超限、坏 Huffman 数据。
- 输出 `{ width, height, rgba: Uint8Array }`。
- 失败只影响该张图片：渲染 hook 捕获后按「不渲染」处理，不影响消息其他内容。

## 5. 改动清单

| 文件 | 改动 |
| --- | --- |
| `terminal-image/hooks/inflate.ts` | 新增：zlib/DEFLATE 解压 |
| `terminal-image/hooks/png-decode.ts` | 新增：PNG → RGBA |
| `terminal-image/hooks/blocks.ts` | 新增：采样、合成、打包 `cells`、LRU 缓存 |
| `terminal-image/hooks/config.ts` | 新增 `blocks` 字段与归一化 |
| `terminal-image/hooks/detect.ts` | 新增 `resolveRenderKind(support, config)`（`image`/`raster`/`none`）与背景色解析 |
| `terminal-image/hooks/register.tsx` | `withPictures` 按渲染种类选择 `<Image>` 或 `<Raster>`；三个来源的提前返回改为按种类判断；清缓存 |
| `terminal-image/tests/*` | 解码、采样打包、策略、渲染树测试 |
| `cc-mods-config/hooks/register.ts` | `image.blocks` 默认值、归一化、配置面板 Select、clone |
| `terminal-image/README.md` | 能力表、配置表、限制、验证步骤 |
| `readme.md` | Mod 说明与配置段落同步 |
| `TODO.md` | 移除/更新与「不支持终端不占位」相关的待办 |

不改动：消息文本、`[Image #N]` 占位、工具结果、`ImageSource` 读取逻辑、非 terminal 面。

## 6. 任务拆分

### 任务 0：基线

- [ ] 运行 `claude plugin validate terminal-image` 与 `claude plugin test terminal-image`，记录当前结果（含已知跨平台失败，不混入本次改动）。
- [ ] 确认工作区与 `git status` 干净度，保留与本功能无关的改动。

### 任务 1：inflate

- [ ] 写 `hooks/inflate.ts`（stored/fixed/dynamic、回引、输出上限）。
- [ ] 测试：用 Python `zlib` 预生成的三类压缩流 fixture（base64 常量）验证解压结果；坏数据、超限、截断各一条。

### 任务 2：PNG 解码

- [ ] 写 `hooks/png-decode.ts`。
- [ ] 生成 fixture：1×1 RGBA、3×2 RGB、索引色 + tRNS、16 位灰度、隔行（应拒绝）、损坏 IDAT（应拒绝）、超限尺寸（应拒绝）；期望 RGBA 用本地工具预计算后写入测试常量。
- [ ] 测试：尺寸/像素逐字节断言，拒绝原因断言。

### 任务 3：字符块渲染

- [ ] 写 `hooks/blocks.ts`：box 采样、alpha 合成、`▀` 打包、LRU。
- [ ] 测试：
  - 2×2 像素 → 1×1 格，确认上/下像素与 fg/bg 对应；
  - 缩小取均值、放大取最近；
  - `cells` 小端布局逐字节断言；
  - 同一输入第二次调用命中缓存（不重复解码）。

### 任务 4：策略与配置

- [ ] `config.ts` 增加 `blocks`；非法值回退 `auto`。
- [ ] `detect.ts` 增加渲染种类解析与 `COLORFGBG` 背景色。
- [ ] 测试：`off/auto/on` × `supported/unknown/unsupported` 六种组合，以及 `CC_TERMINAL_IMAGE` 覆盖优先级。

### 任务 5：渲染接入

- [ ] `withPictures` 支持 Raster：每图一个 `<Raster key=... columns rows cells>`，多图仍按行 Box 并排。
- [ ] 用户消息、助手 Markdown、ToolUse、ToolGroup 四个渲染点统一走种类判断。
- [ ] 解码失败、`Raster` 在运行时缺失（旧宿主）时静默回退到不渲染。
- [ ] 测试：
  - `WT_SESSION` + `blocks=auto` → 出现 `Raster`，无 `Image`；
  - VS Code 同理；
  - `TERM_PROGRAM=WezTerm` → 仍出现 `Image`；
  - `blocks=off` → 不出现 `Raster`；
  - 坏 PNG → 不出现 `Raster` 且不影响下层渲染。

### 任务 6：配置面板

- [ ] `cc-mods-config` 增加 `image.blocks` 默认值、归一化、clone。
- [ ] terminal-image 页签新增 Select：自动 / 总是 / 关闭（中英双语，沿用现有内联文案风格）。
- [ ] 测试：归一化与保存后热重载。

### 任务 7：文档

- [ ] `terminal-image/README.md`：新增降级表、`blocks` 配置、PNG 解码支持矩阵（含隔行不支持）、性能与缓存说明。
- [ ] 根 `readme.md`：terminal-image 段落与目录说明同步。
- [ ] `TODO.md`：清理与本次能力冲突的条目。

### 任务 8：真实终端验收（用户执行）

- [ ] Windows Terminal：粘贴图片、Markdown 本地 PNG、`Read` 工具图片各一次，确认可见、比例正确、滚动无残影。
- [ ] VS Code 集成终端：同上。
- [ ] Kitty / WezTerm：确认仍走 `<Image>`，无回归。
- [ ] tmux（内层 Kitty）：确认 `unknown` 策略下仍走宿主，不被降级；`blocks=on` 时可切到字符块。
- [ ] 连续重绘/滚动 100 行，确认无重复解码导致的卡顿。

## 7. 验收标准

1. Windows Terminal、VS Code 集成终端在 `blocks=auto` 下能看见三类来源的 PNG。
2. Kitty/Ghostty/WezTerm 行为与现在完全一致，仍用 `<Image>`。
3. 解码失败或 PNG 不受支持时，消息与工具行其余内容正常，不出现空白占位、报错或打断渲染。
4. 同一张图在重绘时命中缓存：第二次渲染不重复 inflate。
5. `claude plugin validate`、`claude plugin test` 通过；新增测试覆盖解压、解码、打包、策略、渲染树。
6. 配置面板切换 `blocks` 保存后立即生效，无需重启会话。

## 8. 风险与不做的事

- **宿主 `<Raster>` 是 early access**：类型随版本重写。实现时做运行时存在性检查，缺失则退回现状；验收以当前 2.1.318 为准。
- **纯 JS inflate 的性能**：2 MiB 压缩图首次解码可能数百毫秒，但 hook 预算 10s 且在 hooks worker 中执行；靠缓存避免重复。若实测明显卡顿，再考虑把解码提前到 `prompt.submit` / 文件读取时预热。
- **画质**：48×16 单元格 = 48×32 像素网格，细节有限的图片（截图、图表）可读，照片会明显失真；提高 `maxColumns/maxRows` 可改善，不新增专用配置。
- **隔行 PNG 不支持**：实际截图/工具图片极少；不实现 Adam7。
- **颜色**：不做调色板量化与真彩检测，256 色终端由宿主映射到最近色；极端情况下色带明显，可后续单独优化。
- **不做**：SIXEL、iTerm2 手写序列、JPEG/GIF/WebP/SVG、网络图片、`<Raster>` 动态 `blit` 动画。

## 9. 实施记录（2026-11-04）

- inflate 为自写纯 TS（DEFLATE stored / fixed / dynamic），未引入第三方依赖。
- `CC_TERMINAL_IMAGE=off` 同时关闭字符块；`blocks=off` 在不支持终端保持“不渲染”，不插入空白 `<Image>`。
- 字符块只使用内联 base64；超过 2 MiB 的文件源没有字节，直接跳过。
- 宿主没有 `Raster`（旧版本）时静默保持原渲染。
- 字符块缓存键为“内容哈希/文件路径+mtime+大小 + 列×行 + 背景色”，LRU 32；配置重载和会话启动清空。
- 验证：`claude plugin validate` 通过；`claude plugin test terminal-image` 46 通过；`claude plugin test cc-mods-config` 83 通过；另外用 Pillow 生成的 64×64 自适应滤波 PNG 与解码结果 SHA-256 一致。
- 未做真实 Windows Terminal / VS Code 终端目视验收。