import { useState } from "react";
import { X } from "lucide-react";
import { useI18n, type MessageKey } from "../../core/i18n";
import { useSettingsStore } from "../../core/store/useSettingsStore";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { AboutTab } from "./AboutTab";
import { AppearanceTab } from "./AppearanceTab";
import { CssEditorTab } from "./CssEditorTab";
import { LanguageTab } from "./LanguageTab";

const TABS = [
  { value: "language", labelKey: "settings.tab.language" },
  { value: "appearance", labelKey: "settings.tab.appearance" },
  { value: "css", labelKey: "settings.tab.css" },
  { value: "about", labelKey: "settings.tab.about" },
] as const satisfies ReadonlyArray<{ value: string; labelKey: MessageKey }>;

export function SettingsPanel() {
  const { t } = useI18n();
  const open = useSettingsStore((state) => state.settingsOpen);
  const setSettingsOpen = useSettingsStore((state) => state.setSettingsOpen);
  const [tab, setTab] = useState<string>("language");

  return (
    <Sheet open={open} onOpenChange={(next) => setSettingsOpen(next)}>
      <SheetContent
        className="flex w-[560px] max-w-[92vw] flex-col gap-0 p-0 sm:max-w-[560px]"
        side="right"
        showClose={false}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <SheetTitle className="text-[13.5px] font-semibold">{t("settings.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("settings.description")}</SheetDescription>
          <Button
            aria-label={t("settings.close")}
            className="size-7"
            size="icon"
            variant="ghost"
            onClick={() => setSettingsOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
          {TABS.map((item) => (
            <Button
              key={item.value}
              className="h-7 px-2.5 text-[12px]"
              size="sm"
              variant={tab === item.value ? "secondary" : "ghost"}
              onClick={() => setTab(item.value)}
            >
              {t(item.labelKey)}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {tab === "language" ? <LanguageTab /> : null}
          {tab === "appearance" ? <AppearanceTab /> : null}
          {tab === "css" ? <CssEditorTab /> : null}
          {tab === "about" ? <AboutTab /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
