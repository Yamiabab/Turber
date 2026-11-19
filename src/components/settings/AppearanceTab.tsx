import { RotateCcw } from "lucide-react";
import { useI18n, type MessageKey } from "../../core/i18n";
import { BUILTIN_THEMES, type ThemePreset } from "../../core/theme/themes";
import { useThemeStore } from "../../core/store/useThemeStore";
import { useSettingsStore } from "../../core/store/useSettingsStore";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

function SliderRow({
  label,
  max,
  min,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        className="accent-primary h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border"
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function AppearanceTab() {
  const { t } = useI18n();
  const appearance = useSettingsStore((state) => state.appearance);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const resetAppearance = useSettingsStore((state) => state.resetAppearance);
  const customThemes = useThemeStore((state) => state.customThemes);

  const themes: ThemePreset[] = [...BUILTIN_THEMES, ...customThemes];

  const labelOf = (theme: ThemePreset): { name: string; desc: string } => {
    if (theme.custom) return { name: theme.name, desc: theme.desc };
    const nameKey = `theme.${theme.id}.name` as MessageKey;
    const descKey = `theme.${theme.id}.desc` as MessageKey;
    return { name: t(nameKey), desc: t(descKey) };
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-muted-foreground text-[12px]">{t("appearance.presets")}</p>
        <div className="grid grid-cols-2 gap-2">
          {themes.map((theme) => {
            const active = appearance.theme === theme.id;
            const { name, desc } = labelOf(theme);
            return (
              <Button
                key={theme.id}
                className={cn("h-auto justify-start gap-2 py-2", active && "ring-primary/60 ring-1")}
                variant={active ? "secondary" : "outline"}
                onClick={() => setAppearance({ theme: theme.id })}
              >
                <span className="size-8 shrink-0 rounded-[6px]" style={{ background: theme.swatch }} />
                <span className="min-w-0 text-left">
                  <span className="flex items-center gap-1 text-[12.5px]">
                    <span className="truncate">{name}</span>
                    {theme.custom && (
                      <span className="border-border text-muted-foreground shrink-0 rounded-full border px-1 text-[9.5px] leading-4">
                        {t("appearance.customTag")}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground block truncate text-[11px]">{desc}</span>
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <SliderRow
        label={t("appearance.radius")}
        max={26}
        min={4}
        step={1}
        value={appearance.radius}
        onChange={(value) => setAppearance({ radius: Math.round(value) })}
      />
      <SliderRow
        label={t("appearance.fontSize")}
        max={18}
        min={12}
        step={1}
        value={appearance.fontSize}
        onChange={(value) => setAppearance({ fontSize: Math.round(value) })}
      />
      <SliderRow
        format={(value) => `${Math.round(value * 100)}%`}
        label={t("appearance.opacity")}
        max={1}
        min={0.4}
        step={0.02}
        value={appearance.opacity}
        onChange={(value) => setAppearance({ opacity: Number(value.toFixed(2)) })}
      />
      <SliderRow
        format={(value) => `${Math.round(value)}px`}
        label={t("appearance.blur")}
        max={40}
        min={0}
        step={1}
        value={appearance.blur}
        onChange={(value) => setAppearance({ blur: Math.round(value) })}
      />

      <Button className="h-7 px-2.5 text-[12px]" size="sm" variant="outline" onClick={resetAppearance}>
        <RotateCcw className="size-3" />
        {t("appearance.reset")}
      </Button>
    </div>
  );
}
