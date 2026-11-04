/**
 * 从 Markdown 中提取本地图片路径。
 *
 * 只处理本地文件；网络地址和数据 URI 交给终端自身或上层渲染，
 * 避免渲染 hook 里发起网络请求。
 */
const IMAGE_PATTERN =
  /!\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu

/** 返回 Markdown 中出现的本地图片路径，去重并保持出现顺序。 */
export function extractMarkdownImagePaths(markdown: string): string[] {
  const paths: string[] = []

  for (const match of markdown.matchAll(IMAGE_PATTERN)) {
    const target = (match[1] ?? match[2] ?? '').trim()
    if (!target || !isLocalImageTarget(target)) continue

    const path = localPathFromTarget(target)
    if (path && !paths.includes(path)) paths.push(path)
  }

  return paths
}

/** 是否是 Mod 可以读取的本地路径；`file:` 和 Windows 盘符视为本地。 */
export function isLocalImageTarget(target: string): boolean {
  if (/^[A-Za-z]:[\\/]/u.test(target)) return true
  if (/^file:/iu.test(target)) return true
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target)) return false
  if (target.startsWith('//')) return false
  return true
}

/** 把 `file://` 地址转回文件系统路径；普通路径原样返回。 */
export function localPathFromTarget(target: string): string {
  if (!/^file:/iu.test(target)) return target

  const raw = target.replace(/^file:\/\//iu, '')
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // 保留原样，交给文件系统判断。
  }

  // file:///C:/x.png -> C:/x.png；file:///home/a.png -> /home/a.png
  return /^\/[A-Za-z]:[\\/]/u.test(decoded) ? decoded.slice(1) : decoded
}
