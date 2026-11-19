import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FC } from "react";

import { cn } from "../../../lib/utils";
import { useI18n } from "../../../core/i18n";
import { Button } from "../../ui/button";

export type ModelSelectorModel = {
  id: string;
  name: string;
  description?: string;
};

type ModelSelectorProps = {
  models: readonly ModelSelectorModel[];
  defaultValue?: string | undefined;
  value?: string | undefined;
  onValueChange?: ((id: string) => void) | undefined;
  placeholder?: string | undefined;
  variant?: "ghost" | "outline" | "default" | undefined;
  size?: "sm" | "default" | "icon" | undefined;
  className?: string | undefined;
  align?: "start" | "end" | undefined;
};

/**
 * Drop-in equivalent of the reference `ModelSelector` trigger + content pair:
 * a ghost button showing the active model that opens a searchable list.
 */
export const ModelSelector: FC<ModelSelectorProps> = ({
  models,
  defaultValue,
  value,
  onValueChange,
  placeholder,
  variant = "ghost",
  size = "sm",
  className,
  align = "start",
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState<string | undefined>(
    defaultValue ?? models[0]?.id,
  );
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value === undefined) return;
    setInternal(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedId = value ?? internal;
  const selected = models.find((model) => model.id === selectedId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return models;
    return models.filter(
      (model) =>
        model.name.toLowerCase().includes(needle) ||
        model.id.toLowerCase().includes(needle),
    );
  }, [models, query]);

  const select = (id: string) => {
    setInternal(id);
    onValueChange?.(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "aui-model-selector-trigger text-muted-foreground hover:text-foreground max-w-40 gap-1.5 px-2 font-normal",
          className,
        )}
      >
        <span className="truncate">{selected?.name ?? placeholder ?? t("chat.model.select")}</span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-60" />
      </Button>

      {open && (
        <div
          data-slot="aui_model-selector-content"
          role="listbox"
          className={cn(
            "bg-popover text-popover-foreground animate-in fade-in zoom-in-95 absolute bottom-full z-50 mb-1 w-60 overflow-hidden rounded-lg border shadow-lg duration-100",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <div className="relative border-b p-1.5">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute start-4 top-1/2 size-3.5 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("chat.model.search")}
              className="h-7 w-full rounded-md bg-transparent ps-7 pe-2 text-xs outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                {t("chat.model.empty")}
              </p>
            )}
            {filtered.map((model) => {
              const active = model.id === selectedId;
              return (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => select(model.id)}
                  className={cn(
                    "hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    active && "bg-accent/60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {model.name}
                    </span>
                    {model.description && (
                      <span className="text-muted-foreground block truncate text-[11px]">
                        {model.description}
                      </span>
                    )}
                  </span>
                  {active && <CheckIcon className="mt-0.5 size-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
