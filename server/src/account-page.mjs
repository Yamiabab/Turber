import { renderShell } from "./shell.mjs";

export function renderAccountPage() {
  return renderShell({ page: "account", title: "账户 · Turber" });
}
