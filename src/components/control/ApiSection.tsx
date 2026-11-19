import { CheckIcon, Lock, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "../../core/i18n";
import { useSettingsStore, type ApiDraft } from "../../core/store/useSettingsStore";
import { cn } from "../../lib/utils";

const EMPTY_DRAFT: ApiDraft = { name: "", baseUrl: "", model: "", apiKey: "" };

function isValidBaseUrl(value: string): boolean {
  return /^https?:\/\/\S+/i.test(value.trim());
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11.5px] font-medium">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-[10.5px] leading-relaxed">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "border-border bg-background h-8 w-full rounded-md border px-2 text-[12px] outline-none placeholder:text-muted-foreground/60";

/** API 创建：创建 / 编辑 / 切换 / 删除对话使用的模型接口。 */
export function ControlApiSection() {
  const { t } = useI18n();
  const apis = useSettingsStore((state) => state.apis);
  const activeApiId = useSettingsStore((state) => state.activeApiId);
  const createApi = useSettingsStore((state) => state.createApi);
  const updateApi = useSettingsStore((state) => state.updateApi);
  const removeApi = useSettingsStore((state) => state.removeApi);
  const selectApi = useSettingsStore((state) => state.selectApi);

  const [draft, setDraft] = useState<ApiDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ApiDraft>(EMPTY_DRAFT);

  const submit = () => {
    if (!draft.baseUrl.trim() || !draft.model.trim()) {
      setError(t("api.error.required"));
      return;
    }
    if (!isValidBaseUrl(draft.baseUrl)) {
      setError(t("api.error.invalidUrl"));
      return;
    }
    createApi(draft);
    setDraft(EMPTY_DRAFT);
    setError(null);
  };

  const startEdit = (id: string) => {
    const entry = apis.find((item) => item.id === id);
    if (!entry) return;
    setEditingId(id);
    setEditDraft({
      name: entry.name,
      baseUrl: entry.baseUrl,
      model: entry.model,
      apiKey: entry.apiKey,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (!editDraft.baseUrl.trim() || !editDraft.model.trim()) {
      setError(t("api.error.required"));
      return;
    }
    if (!isValidBaseUrl(editDraft.baseUrl)) {
      setError(t("api.error.invalidUrl"));
      return;
    }
    updateApi(editingId, editDraft);
    setEditingId(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="border-border space-y-1 border-b pb-3">
        <h3 className="text-[13px] font-semibold">{t("api.group")}</h3>
        <p className="text-muted-foreground text-[11.5px]">{t("api.group.desc")}</p>
      </div>

      <div className="space-y-1.5">
        {apis.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">{t("api.empty")}</p>
        ) : null}
        {apis.map((entry) => {
          const active = entry.id === activeApiId;
          const editing = entry.id === editingId;
          return (
            <div
              key={entry.id}
              className={cn(
                "border-border rounded-md border px-2.5 py-2",
                active ? "border-primary/60 bg-primary/5" : "bg-background",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium">{entry.name}</span>
                    {active ? (
                      <span className="bg-primary/15 text-primary inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px]">
                        <CheckIcon className="size-2.5" />
                        {t("api.active")}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground truncate font-mono text-[10.5px]">
                    {entry.model} · {entry.baseUrl || "—"}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1 truncate font-mono text-[10.5px]">
                    {entry.apiKey ? null : <Lock className="size-2.5 shrink-0" />}
                    {entry.apiKey ? `••••${entry.apiKey.slice(-4)}` : t("api.field.apiKeyPlaceholder")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {active ? null : (
                    <button
                      type="button"
                      onClick={() => selectApi(entry.id)}
                      className="border-border hover:bg-muted inline-flex h-6 items-center rounded-md border px-1.5 text-[11px]"
                    >
                      {t("api.use")}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={t("api.action.edit")}
                    onClick={() => startEdit(entry.id)}
                    className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center"
                  >
                    <PencilIcon className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("common.delete")}
                    onClick={() => {
                      removeApi(entry.id);
                      if (editingId === entry.id) setEditingId(null);
                    }}
                    className="text-muted-foreground hover:text-destructive inline-flex size-6 items-center justify-center"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              </div>

              {editing ? (
                <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                  <Field label={t("api.field.baseUrl")}>
                    <input
                      className={inputClass}
                      value={editDraft.baseUrl}
                      placeholder={t("api.field.baseUrlPlaceholder")}
                      onChange={(event) => setEditDraft({ ...editDraft, baseUrl: event.target.value })}
                    />
                  </Field>
                  <Field label={t("api.field.model")}>
                    <input
                      className={inputClass}
                      value={editDraft.model}
                      placeholder={t("api.field.modelPlaceholder")}
                      onChange={(event) => setEditDraft({ ...editDraft, model: event.target.value })}
                    />
                  </Field>
                  <Field label={t("api.field.apiKey")}>
                    <input
                      className={inputClass}
                      value={editDraft.apiKey}
                      placeholder={t("api.field.apiKeyPlaceholder")}
                      spellCheck={false}
                      onChange={(event) => setEditDraft({ ...editDraft, apiKey: event.target.value })}
                    />
                  </Field>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="bg-primary text-primary-foreground inline-flex h-7 items-center rounded-md px-2.5 text-[11.5px]"
                    >
                      {t("api.action.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="border-border hover:bg-muted inline-flex h-7 items-center rounded-md border px-2.5 text-[11.5px]"
                    >
                      {t("api.action.cancel")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-border space-y-2 rounded-lg border border-dashed px-3 py-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-[12.5px] font-medium">
            <PlusIcon className="size-3.5" />
            {t("api.create.title")}
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">{t("api.create.desc")}</p>
        </div>
        <Field label={t("api.field.name")}>
          <input
            className={inputClass}
            value={draft.name}
            placeholder={t("api.field.namePlaceholder")}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
        <Field label={t("api.field.baseUrl")}>
          <input
            className={inputClass}
            value={draft.baseUrl}
            placeholder={t("api.field.baseUrlPlaceholder")}
            spellCheck={false}
            onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
          />
        </Field>
        <Field label={t("api.field.model")}>
          <input
            className={inputClass}
            value={draft.model}
            placeholder={t("api.field.modelPlaceholder")}
            spellCheck={false}
            onChange={(event) => setDraft({ ...draft, model: event.target.value })}
          />
        </Field>
        <Field label={t("api.field.apiKey")}>
          <input
            className={inputClass}
            value={draft.apiKey}
            placeholder={t("api.field.apiKeyPlaceholder")}
            spellCheck={false}
            onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
          />
        </Field>
        {error ? (
          <p className="text-destructive text-[11px]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-muted-foreground text-[10.5px]">{t("api.hint")}</span>
          <button
            type="button"
            onClick={submit}
            className="bg-primary text-primary-foreground inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11.5px]"
          >
            <PlusIcon className="size-3" />
            {t("api.action.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
