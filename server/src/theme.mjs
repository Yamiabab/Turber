/**
 * Turber · 共享 Material UI 基础样式（原生 Material 规范：Roboto、elevation、outlined 输入框）
 * 圆角统一 1px（shape.borderRadius = 1）。
 */

export const BASE_CSS = `
  :root {
    color-scheme: light;
    --radius: 1px;
    --md-font: "Roboto", "Noto Sans SC", "PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif;
    --md-mono: "Roboto Mono", "Cascadia Code", Consolas, "Courier New", monospace;

    --md-primary: #1976d2;
    --md-primary-dark: #1565c0;
    --md-on-primary: #ffffff;
    --md-primary-soft: rgba(25, 118, 210, 0.08);
    --md-primary-soft-2: rgba(25, 118, 210, 0.12);

    --md-error: #d32f2f;
    --md-error-soft: rgba(211, 47, 47, 0.08);
    --md-success: #2e7d32;
    --md-success-soft: rgba(46, 125, 50, 0.08);
    --md-warning: #ed6c02;

    --md-bg: #f5f5f5;
    --md-paper: #ffffff;
    --md-text: rgba(0, 0, 0, 0.87);
    --md-text-2: rgba(0, 0, 0, 0.6);
    --md-text-3: rgba(0, 0, 0, 0.38);
    --md-divider: rgba(0, 0, 0, 0.12);
    --md-hover: rgba(0, 0, 0, 0.04);
    --md-input-border: rgba(0, 0, 0, 0.23);

    --md-e1: 0 2px 1px -1px rgba(0, 0, 0, 0.2), 0 1px 1px 0 rgba(0, 0, 0, 0.14), 0 1px 3px 0 rgba(0, 0, 0, 0.12);
    --md-e2: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12);
    --md-e3: 0 3px 3px -2px rgba(0, 0, 0, 0.2), 0 3px 4px 0 rgba(0, 0, 0, 0.14), 0 1px 8px 0 rgba(0, 0, 0, 0.12);
    --md-e4: 0 2px 4px -1px rgba(0, 0, 0, 0.2), 0 4px 5px 0 rgba(0, 0, 0, 0.14), 0 1px 10px 0 rgba(0, 0, 0, 0.12);
    --md-e6: 0 3px 5px -1px rgba(0, 0, 0, 0.2), 0 6px 10px 0 rgba(0, 0, 0, 0.14), 0 1px 18px 0 rgba(0, 0, 0, 0.12);
    --md-e8: 0 5px 5px -3px rgba(0, 0, 0, 0.2), 0 8px 10px 1px rgba(0, 0, 0, 0.14), 0 3px 14px 2px rgba(0, 0, 0, 0.12);
    --md-e24: 0 11px 15px -7px rgba(0, 0, 0, 0.2), 0 24px 38px 3px rgba(0, 0, 0, 0.14), 0 9px 46px 8px rgba(0, 0, 0, 0.12);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --md-primary: #90caf9;
      --md-primary-dark: #42a5f5;
      --md-on-primary: rgba(0, 0, 0, 0.87);
      --md-primary-soft: rgba(144, 202, 249, 0.12);
      --md-primary-soft-2: rgba(144, 202, 249, 0.18);
      --md-bg: #121212;
      --md-paper: #1e1e1e;
      --md-text: rgba(255, 255, 255, 0.87);
      --md-text-2: rgba(255, 255, 255, 0.6);
      --md-text-3: rgba(255, 255, 255, 0.38);
      --md-divider: rgba(255, 255, 255, 0.12);
      --md-hover: rgba(255, 255, 255, 0.06);
      --md-input-border: rgba(255, 255, 255, 0.23);
      --md-error: #f48fb1;
      --md-success: #81c784;
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: var(--md-bg);
    color: var(--md-text);
    font-family: var(--md-font);
    font-size: 14px;
    line-height: 1.43;
    letter-spacing: 0.01071em;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  button, input { font-family: inherit; }
  [hidden] { display: none !important; }

  /* ---------- Typography ---------- */
  .t-h4 { font-size: 34px; line-height: 1.235; font-weight: 400; letter-spacing: 0.00735em; margin: 0; }
  .t-h5 { font-size: 24px; line-height: 1.334; font-weight: 400; letter-spacing: 0; margin: 0; }
  .t-h6 { font-size: 20px; line-height: 1.6; font-weight: 500; letter-spacing: 0.0075em; margin: 0; }
  .t-sub1 { font-size: 16px; line-height: 1.75; font-weight: 400; letter-spacing: 0.00938em; margin: 0; }
  .t-sub2 { font-size: 14px; line-height: 1.57; font-weight: 500; letter-spacing: 0.00714em; margin: 0; }
  .t-body2 { font-size: 14px; line-height: 1.43; letter-spacing: 0.01071em; margin: 0; }
  .t-cap { font-size: 12px; line-height: 1.66; letter-spacing: 0.03333em; margin: 0; color: var(--md-text-2); }
  .t-overline { font-size: 12px; line-height: 2.6; font-weight: 500; letter-spacing: 0.08333em; text-transform: uppercase; margin: 0; color: var(--md-text-2); }
  .mono { font-family: var(--md-mono); }

  /* ---------- Paper ---------- */
  .paper { background: var(--md-paper); border-radius: var(--radius); box-shadow: var(--md-e1); }
  .paper--e2 { box-shadow: var(--md-e2); }
  .paper--e3 { box-shadow: var(--md-e3); }
  .paper--e4 { box-shadow: var(--md-e4); }
  .paper--e8 { box-shadow: var(--md-e8); }
  .paper--outlined { box-shadow: none; border: 1px solid var(--md-divider); }
  .divider { height: 0; border: 0; border-top: 1px solid var(--md-divider); margin: 0; }

  /* ---------- AppBar ---------- */
  .appbar {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 64px;
    padding: 0 24px;
    background: var(--md-primary);
    color: var(--md-on-primary);
    box-shadow: var(--md-e4);
    position: sticky;
    top: 0;
    z-index: 1100;
  }
  .appbar__brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .appbar__mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius);
    background: var(--md-on-primary);
    color: var(--md-primary);
    font-size: 18px;
    font-weight: 700;
  }
  .appbar__title { font-size: 20px; font-weight: 500; letter-spacing: 0.0075em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .appbar__spacer { flex: 1; }
  .appbar__right { display: flex; align-items: center; gap: 12px; }
  .appbar__user { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; }
  .appbar__avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.24);
    color: var(--md-on-primary);
    font-size: 15px;
    font-weight: 500;
    text-transform: uppercase;
  }
  .appbar .btn--text { color: inherit; }
  .appbar .btn--text:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }

  /* ---------- Drawer ---------- */
  .drawer {
    width: 240px;
    flex: none;
    padding: 8px 0;
    background: var(--md-paper);
    border-right: 1px solid var(--md-divider);
  }
  .drawer__label { padding: 16px 16px 8px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--md-text);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.00714em;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .nav-item:hover { background: var(--md-hover); }
  .nav-item.is-active { background: var(--md-primary-soft); color: var(--md-primary); font-weight: 600; }
  .nav-item__icon { width: 18px; height: 18px; flex: none; opacity: 0.72; }

  /* ---------- Buttons ---------- */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36.5px;
    padding: 6px 16px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--md-text);
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02857em;
    line-height: 1.75;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  }
  .btn:focus-visible { outline: 2px solid var(--md-primary); outline-offset: 2px; }
  .btn:disabled { cursor: default; color: var(--md-text-3); }
  .btn--contained { background: var(--md-primary); color: var(--md-on-primary); box-shadow: var(--md-e1); }
  .btn--contained:hover:not(:disabled) { background: var(--md-primary-dark); box-shadow: var(--md-e2); }
  .btn--contained:disabled { background: var(--md-divider); color: var(--md-text-3); box-shadow: none; }
  .btn--outlined { border-color: var(--md-primary); color: var(--md-primary); }
  .btn--outlined:hover:not(:disabled) { background: var(--md-primary-soft); border-color: var(--md-primary-dark); }
  .btn--outlined:disabled { border-color: var(--md-divider); color: var(--md-text-3); }
  .btn--text { color: var(--md-primary); padding: 6px 8px; }
  .btn--text:hover:not(:disabled) { background: var(--md-primary-soft); }
  .btn--text.btn--danger { color: var(--md-error); }
  .btn--text.btn--danger:hover:not(:disabled) { background: var(--md-error-soft); }
  .btn--sm { min-height: 30.5px; padding: 4px 10px; font-size: 13px; }
  .btn--block { width: 100%; }

  /* ---------- TextField (outlined) ---------- */
  .field { position: relative; display: block; margin-bottom: 16px; }
  .field input {
    width: 100%;
    height: 56px;
    padding: 18px 14px 6px;
    border: 1px solid var(--md-input-border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--md-text);
    font-size: 16px;
    line-height: 1.5;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .field > span {
    position: absolute;
    left: 10px;
    top: 0;
    transform: translateY(-50%);
    padding: 0 4px;
    background: var(--md-paper);
    color: var(--md-text-2);
    font-size: 12px;
    line-height: 1.4;
    letter-spacing: 0.00938em;
    pointer-events: none;
    transition: color 0.15s ease;
  }
  .field input::placeholder { color: transparent; }
  .field input:hover { border-color: var(--md-text); }
  .field input:focus { border-color: var(--md-primary); border-width: 2px; padding: 17px 13px 5px; }
  .field input:focus ~ span { color: var(--md-primary); }

  /* ---------- Table ---------- */
  .tbl { width: 100%; border-collapse: collapse; font-size: 14px; letter-spacing: 0.01071em; }
  .tbl th {
    height: 56px;
    padding: 6px 16px;
    text-align: left;
    font-size: 14px;
    font-weight: 500;
    color: var(--md-text);
    border-bottom: 1px solid var(--md-divider);
    white-space: nowrap;
  }
  .tbl td { height: 52px; padding: 6px 16px; border-bottom: 1px solid var(--md-divider); color: var(--md-text); }
  .tbl tbody tr:last-child td { border-bottom: 0; }
  .tbl tbody tr:hover { background: var(--md-hover); }
  .tbl .ta-r { text-align: right; }
  .tbl .ta-c { text-align: center; }
  .tbl__empty td { text-align: center; color: var(--md-text-2); padding: 32px 16px; }
  .tbl-wrap { overflow-x: auto; }

  /* ---------- Chip ---------- */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border-radius: var(--radius);
    border: 1px solid var(--md-divider);
    background: transparent;
    color: var(--md-text-2);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02857em;
    white-space: nowrap;
  }
  .chip--ok { border-color: rgba(46, 125, 50, 0.4); background: var(--md-success-soft); color: var(--md-success); }
  .chip--off { border-color: rgba(211, 47, 47, 0.35); background: var(--md-error-soft); color: var(--md-error); }
  .chip--neutral { border-color: var(--md-divider); background: var(--md-hover); color: var(--md-text-2); }

  /* ---------- Alert ---------- */
  .alert {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    border-radius: var(--radius);
    background: var(--md-primary-soft);
    color: var(--md-text);
    font-size: 14px;
    line-height: 1.5;
    letter-spacing: 0.01071em;
  }
  .alert__icon { flex: none; width: 20px; height: 20px; color: var(--md-primary); }
  .alert--success { background: var(--md-success-soft); }
  .alert--success .alert__icon { color: var(--md-success); }
  .alert--error { background: var(--md-error-soft); }
  .alert--error .alert__icon { color: var(--md-error); }

  /* ---------- Snackbar ---------- */
  .snackbar {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%) translateY(12px);
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 0 16px;
    border-radius: var(--radius);
    background: #323232;
    color: #ffffff;
    box-shadow: var(--md-e6);
    font-size: 14px;
    letter-spacing: 0.01071em;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
    max-width: 84vw;
    z-index: 1400;
  }
  .snackbar[data-show="1"] { opacity: 1; transform: translateX(-50%) translateY(0); }
  .snackbar[data-kind="error"] { background: var(--md-error); color: #ffffff; }

  /* ---------- 表单辅助 ---------- */
  .form-hint { margin: 8px 0 0; font-size: 12px; line-height: 1.66; letter-spacing: 0.03333em; color: var(--md-text-2); }
  .form-hint[data-kind="error"] { color: var(--md-error); }
  .form-hint[data-kind="success"] { color: var(--md-success); }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
`;
