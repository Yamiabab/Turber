import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { useI18n } from "../../core/i18n";
import { useUserViewSession } from "../../core/store/useUserViewSession";

/**
 * 「AI 用户视角操控」运行状态提示：仅保留紧急停止提示。
 * 授权不再弹窗询问，能否接管完全由控制面板 / 输入框开关决定。
 */
export function UserViewGuard() {
  const { t } = useI18n();
  const stopNotice = useUserViewSession((state) => state.stopNotice);
  const setStopNotice = useUserViewSession((state) => state.setStopNotice);

  useEffect(() => {
    if (!stopNotice) return;
    const timer = window.setTimeout(() => setStopNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [stopNotice, setStopNotice]);

  if (!stopNotice) return null;

  return (
    <div className="pointer-events-none fixed top-3 left-1/2 z-[60] -translate-x-1/2">
      <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] shadow-sm backdrop-blur">
        <ShieldAlert className="size-3.5" />
        <span>{t("userview.stop")}</span>
      </div>
    </div>
  );
}
