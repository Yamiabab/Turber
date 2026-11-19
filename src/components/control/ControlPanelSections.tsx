import { Lock, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n, type MessageKey } from "../../core/i18n";
import { restartEmergencyWatch } from "../../core/ai/userViewController";
import { useAipuStore, type AipuTargetKind } from "../../core/store/useAipuStore";
import { canUseUserView, useControlStore, type MousePermission } from "../../core/store/useControlStore";
import { cn } from "../../lib/utils";
import { ControlApiSection } from "./ApiSection";

const HOTKEY_OPTIONS: ReadonlyArray<{ value: string; label: MessageKey }> = [
  { value: "double:alt", label: "control.hotkey.double.alt" },
  { value: "double:ctrl", label: "control.hotkey.double.ctrl" },
  { value: "double:shift", label: "control.hotkey.double.shift" },
  { value: "combo:ctrl+shift+q", label: "control.hotkey.combo" },
];

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-transparent bg-primary" : "border-border bg-muted",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-4 rounded-full shadow-sm transition-transform",
          checked ? "bg-primary-foreground" : "bg-background",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

function SectionHeader({ labelKey, descKey }: { labelKey: MessageKey; descKey: MessageKey }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1 border-b border-border pb-3">
      <h3 className="text-[13px] font-semibold">{t(labelKey)}</h3>
      <p className="text-muted-foreground text-[11.5px]">{t(descKey)}</p>
    </div>
  );
}

function SettingRow({
  label,
  desc,
  hint,
  disabled,
  children,
}: {
  label: string;
  desc: string;
  hint?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[12.5px] font-medium", disabled && "text-muted-foreground")}>{label}</span>
        </div>
        <p className="text-muted-foreground text-[11.5px] leading-relaxed">{desc}</p>
        {hint ? (
          <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
            {disabled ? <Lock className="size-3 shrink-0" /> : null}
            {hint}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border/60">{children}</div>;
}

/** AI Agent 桌面 */
export function ControlDesktopSection() {
  const { t } = useI18n();
  const { aipu, amo, mouse, captureDesktop, userView, setAipu, setAmo, setMouse, setUserView } = useControlStore();
  const emergencyHotkey = useAipuStore((state) => state.emergencyHotkey);
  const setEmergencyHotkey = useAipuStore((state) => state.setEmergencyHotkey);

  const mouseLocked = !aipu || !amo;
  const userViewLocked = !canUseUserView({ aipu, amo, mouse, captureDesktop, userView });
  /** 鼠标权限的锁定原因：AIPU 总开关优先于 AMO */
  const mouseHint = !aipu ? t("control.aipu.master") : !amo ? t("control.amo.dep") : undefined;
  /** 用户视角操作的锁定原因，按 AIPU → AMO → 截取桌面 → 鼠标权限 逐级提示 */
  const userViewHint = !aipu
    ? t("control.aipu.master")
    : !amo
      ? t("control.amo.dep")
      : !captureDesktop
        ? t("control.userview.dep.capture")
        : t("control.mouse.dep");

  const mouseOptions: Array<{ value: MousePermission; label: MessageKey }> = [
    { value: "none", label: "control.mouse.none" },
    { value: "system", label: "control.mouse.system" },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader labelKey="control.group.desktop" descKey="control.group.desktop.desc" />
      <Rows>
        <SettingRow label={t("control.aipu.label")} desc={t("control.aipu.desc")} hint={t("control.aipu.hint")}>
          <Toggle checked={aipu} label={t("control.aipu.label")} onChange={setAipu} />
        </SettingRow>

        <SettingRow
          label={t("control.amo.label")}
          desc={t("control.amo.desc")}
          hint={aipu ? undefined : t("control.aipu.master")}
          disabled={!aipu}
        >
          <Toggle checked={amo} disabled={!aipu} label={t("control.amo.label")} onChange={setAmo} />
        </SettingRow>

        <SettingRow
          label={t("control.mouse.label")}
          desc={t("control.mouse.desc")}
          hint={mouseHint}
          disabled={mouseLocked}
        >
          <select
            aria-label={t("control.mouse.label")}
            disabled={mouseLocked}
            value={mouse}
            onChange={(event) => setMouse(event.target.value as MousePermission)}
            className={cn(
              "border-border bg-background h-7 rounded-md border px-2 text-[12px] outline-none",
              mouseLocked ? "cursor-not-allowed opacity-40" : "cursor-pointer",
            )}
          >
            {mouseOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.label)}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          label={t("control.userview.label")}
          desc={t("control.userview.desc")}
          hint={userViewLocked ? userViewHint : undefined}
          disabled={userViewLocked}
        >
          <Toggle
            checked={userView}
            disabled={userViewLocked}
            label={t("control.userview.label")}
            onChange={setUserView}
          />
        </SettingRow>

        <SettingRow label={t("control.hotkey.label")} desc={t("control.hotkey.desc")}>
          <select
            aria-label={t("control.hotkey.label")}
            value={emergencyHotkey}
            onChange={(event) => {
              setEmergencyHotkey(event.target.value);
              void restartEmergencyWatch();
            }}
            className="border-border bg-background h-7 cursor-pointer rounded-md border px-2 text-[12px] outline-none"
          >
            {HOTKEY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.label)}
              </option>
            ))}
          </select>
        </SettingRow>
      </Rows>
    </div>
  );
}

/** AI 图像识别 */
export function ControlVisionSection() {
  const { t } = useI18n();
  const aipu = useControlStore((state) => state.aipu);
  const captureDesktop = useControlStore((state) => state.captureDesktop);
  const setCaptureDesktop = useControlStore((state) => state.setCaptureDesktop);

  return (
    <div className="space-y-4">
      <SectionHeader labelKey="control.group.vision" descKey="control.group.vision.desc" />
      <Rows>
        <SettingRow
          label={t("control.capture.label")}
          desc={t("control.capture.desc")}
          hint={aipu ? undefined : t("control.aipu.master")}
          disabled={!aipu}
        >
          <Toggle
            checked={captureDesktop}
            disabled={!aipu}
            label={t("control.capture.label")}
            onChange={setCaptureDesktop}
          />
        </SettingRow>
      </Rows>
    </div>
  );
}

/** AI Agent 设置：模型接口（API 填写处）*/
export function ControlAgentSection() {
  return (
    <div className="space-y-4">
      <SectionHeader labelKey="control.group.agent" descKey="control.group.agent.desc" />
      <ControlApiSection />
    </div>
  );
}

/** AIPU 黑名单管控：网站 / 应用 */
export function ControlAipuSection() {
  const { t } = useI18n();
  const targets = useAipuStore((state) => state.targets);
  const addTarget = useAipuStore((state) => state.addTarget);
  const removeTarget = useAipuStore((state) => state.removeTarget);
  const [site, setSite] = useState("");
  const [app, setApp] = useState("");

  const renderGroup = (
    kind: AipuTargetKind,
    value: string,
    setValue: (next: string) => void,
    placeholderKey: MessageKey,
    labelKey: MessageKey,
    descKey: MessageKey,
  ) => {
    const items = targets.filter((item) => item.kind === kind);
    const submit = () => {
      if (value.trim().length === 0) return;
      addTarget(kind, value);
      setValue("");
    };
    return (
      <div className="space-y-2 py-3">
        <div className="space-y-1">
          <div className="text-[12.5px] font-medium">{t(labelKey)}</div>
          <p className="text-muted-foreground text-[11.5px] leading-relaxed">{t(descKey)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            aria-label={t(labelKey)}
            className="border-border bg-background h-7 min-w-0 flex-1 rounded-md border px-2 text-[12px] outline-none"
            placeholder={t(placeholderKey)}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <button
            type="button"
            onClick={submit}
            className="border-border hover:bg-muted inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[12px]"
          >
            <Plus className="size-3.5" />
            {t("control.aipu.add")}
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">{t("control.aipu.empty")}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.id}
                className="border-border flex items-center justify-between gap-2 rounded-md border px-2 py-1"
              >
                <span className="truncate text-[12px]">{item.value}</span>
                <button
                  type="button"
                  aria-label={t("control.aipu.remove")}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => removeTarget(item.id)}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionHeader labelKey="control.group.aipu" descKey="control.group.aipu.desc" />
      <div className="divide-y divide-border/60">
        {renderGroup(
          "site",
          site,
          setSite,
          "control.aipu.placeholder.site",
          "control.aipu.site.label",
          "control.aipu.site.desc",
        )}
        {renderGroup(
          "app",
          app,
          setApp,
          "control.aipu.placeholder.app",
          "control.aipu.app.label",
          "control.aipu.app.desc",
        )}
      </div>
      <div className="border-border text-muted-foreground space-y-1 rounded-lg border border-dashed px-3 py-2 text-[11px]">
        <p>{t("control.aipu.self")}</p>
        <p className="font-mono break-all">{t("control.aipu.deny")}</p>
      </div>
    </div>
  );
}
