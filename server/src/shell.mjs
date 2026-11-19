/**
 * 页面外壳：只提供挂载点，所有界面由原生 Material UI 组件渲染（见 ui/app.jsx）。
 */

export function renderShell({ page, title }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta name="color-scheme" content="light dark" />
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg" />
<link rel="stylesheet" href="/assets/app.css" />
</head>
<body>
<div id="root"></div>
<script>window.__TURBER_PAGE__ = "${page}";</script>
<script defer src="/assets/app.js"></script>
</body>
</html>`;
}
