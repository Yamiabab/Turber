import { useI18n } from "../../core/i18n";
import { useThemeStore } from "../../core/store/useThemeStore";

const STACK = ["Tauri 2", "React 19", "TypeScript", "Tailwind v4", "assistant-ui", "Zustand", "CodeMirror 6"];

export function AboutTab() {
  const { t } = useI18n();

  const customThemes = useThemeStore((state) => state.customThemes);

  const facts = [
    { label: t("about.fact.components"), value: t("about.value.official") },
    { label: t("about.fact.presets"), value: String(2 + customThemes.length) },
    { label: t("about.fact.vars"), value: "24" },
  ];

  return (
    <div className="space-y-5">
      <div className="border-border bg-muted/40 rounded-lg border px-3 py-3">
        <p className="text-foreground text-[13px] font-medium">Turber 0.1.0</p>
        <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">{t("about.description")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {facts.map((item) => (
          <div key={item.label} className="border-border bg-muted/30 rounded-lg border px-2.5 py-3 text-center">
            <p className="text-foreground text-[19px] font-semibold tabular-nums">{item.value}</p>
            <p className="text-muted-foreground mt-1 text-[11px] leading-tight">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-muted-foreground text-[12px]">{t("about.stack")}</p>
        <div className="flex flex-wrap gap-1.5">
          {STACK.map((item) => (
            <span
              key={item}
              className="border-border bg-muted/40 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
