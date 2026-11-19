import { useState } from "react";
import { Image, Monitor, Settings2, ShieldAlert, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { useI18n, type MessageKey } from "../../core/i18n";
import { useSettingsStore } from "../../core/store/useSettingsStore";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { ControlAgentSection, ControlAipuSection, ControlDesktopSection, ControlVisionSection } from "./ControlPanelSections";
import { cn } from "../../lib/utils";

interface NavItem {
  value: string;
  labelKey: MessageKey;
  icon: LucideIcon;
}

const SECTIONS: ReadonlyArray<NavItem> = [
  { value: "desktop", labelKey: "control.group.desktop", icon: Monitor },
  { value: "vision", labelKey: "control.group.vision", icon: Image },
  { value: "aipu", labelKey: "control.group.aipu", icon: ShieldAlert },
  { value: "agent", labelKey: "control.group.agent", icon: Settings2 },
];

export function ControlPanelSheet() {
  const { t } = useI18n();
  const open = useSettingsStore((state) => state.controlPanelOpen);
  const setControlPanelOpen = useSettingsStore((state) => state.setControlPanelOpen);
  const [section, setSection] = useState<string>("desktop");

  return (
    <Sheet open={open} onOpenChange={(next) => setControlPanelOpen(next)}>
      <SheetContent
        className="flex w-[620px] max-w-[94vw] flex-col gap-0 p-0 sm:max-w-[620px]"
        side="right"
        showClose={false}
      >
        <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="text-muted-foreground size-4 shrink-0" />
            <SheetTitle className="truncate text-[13.5px] font-semibold">{t("control.title")}</SheetTitle>
          </div>
          <SheetDescription className="sr-only">{t("control.description")}</SheetDescription>
          <Button
            aria-label={t("control.close")}
            className="size-7"
            size="icon"
            variant="ghost"
            onClick={() => setControlPanelOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="border-border flex w-[168px] shrink-0 flex-col gap-1 overflow-y-auto border-r px-2 py-3">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const active = section === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSection(item.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {section === "desktop" ? <ControlDesktopSection /> : null}
            {section === "vision" ? <ControlVisionSection /> : null}
            {section === "aipu" ? <ControlAipuSection /> : null}
            {section === "agent" ? <ControlAgentSection /> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
