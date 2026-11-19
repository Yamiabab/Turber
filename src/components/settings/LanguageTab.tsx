import { Check } from "lucide-react";
import { LANGUAGES, useI18n } from "../../core/i18n";
import { useSettingsStore } from "../../core/store/useSettingsStore";
import { cn } from "../../lib/utils";

export function LanguageTab() {
  const { t, language } = useI18n();
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-muted-foreground text-[12px]">{t("language.title")}</p>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((item) => {
            const active = language === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setLanguage(item.id)}
                className={cn(
                  "border-border flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active ? "bg-secondary text-secondary-foreground" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px]">{item.label}</span>
                  <span className="text-muted-foreground block truncate text-[11px]">{item.desc}</span>
                </span>
                {active ? <Check className="text-turber-success size-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-muted-foreground bg-muted/50 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[11.5px]">
        <Check className="text-turber-success size-3.5" />
        {t("language.description")}
      </div>
    </div>
  );
}
