import { renderShell } from "./shell.mjs";

export function renderLoginPage() {
  return renderShell({ page: "login", title: "登录 · Turber" });
}
