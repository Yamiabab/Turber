import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Download, FileCode, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { CSS_SOURCES, CSS_SOURCE_MAP } from "../../core/theme/cssSources";
import {
  BUILTIN_THEME_CSS_KEYS,
  DEFAULT_THEME_ID,
  THEME_CSS_DIR,
  isLockedTheme,
  themeCssKey,
  themeCssTemplate,
  type ThemeMode,
} from "../../core/theme/themes";
import {
  applyCssOverrides,
  downloadCssText,
  loadCssOverrides,
  persistCssOverrides,
  type CssOverrideMap,
} from "../../core/theme/cssOverrides";
import { useI18n, type MessageKey, type TranslateVars } from "../../core/i18n";
import { useSettingsStore } from "../../core/store/useSettingsStore";
import { isLightThemeResolved, useThemeStore } from "../../core/store/useThemeStore";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

const MonacoEditor = lazy(async () => {
  await import("../../lib/monaco-setup");
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 12,
  lineHeight: 18,
  tabSize: 2,
  wordWrap: "on" as const,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  renderLineHighlight: "line" as const,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
  padding: { top: 8, bottom: 12 },
};

interface StatusMessage {
  key: MessageKey;
  vars?: TranslateVars;
}

interface EditorFile {
  key: string;
  label: string;
  /** 自建主题 id，内置与主页面文件为空 */
  customId?: string;
  locked?: boolean;
}

/** 主页面 CSS：globals / tokens 等，与主题预设 CSS 分开 */
const PAGE_FILES: EditorFile[] = CSS_SOURCES.filter((item) => !item.key.startsWith(`${THEME_CSS_DIR}/`)).map(
  (item) => ({ key: item.key, label: item.label }),
);

/** 内置主题预设 CSS（深色 / 浅色），锁定不可删除 */
const BUILTIN_THEME_FILES: EditorFile[] = CSS_SOURCES.filter((item) => BUILTIN_THEME_CSS_KEYS.includes(item.key)).map(
  (item) => ({ key: item.key, label: item.label, locked: true }),
);

/** 覆盖表口径：内置源文件按原文比对，自建主题 CSS 无内置原文，只要有内容就写入。 */
function buildOverrides(source: Record<string, string>): CssOverrideMap {
  const map: CssOverrideMap = {};
  for (const [key, css] of Object.entries(source)) {
    const base = CSS_SOURCE_MAP[key];
    if (base === undefined) {
      if (css.trim().length > 0) map[key] = css;
      continue;
    }
    if (css !== base) map[key] = css;
  }
  return map;
}

export function CssEditorTab() {
  const { t } = useI18n();
  const theme = useSettingsStore((state) => state.appearance.theme);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const customThemes = useThemeStore((state) => state.customThemes);
  const addTheme = useThemeStore((state) => state.addTheme);
  const removeTheme = useThemeStore((state) => state.removeTheme);

  const [overrides, setOverrides] = useState<CssOverrideMap>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [activeKey, setActiveKey] = useState<string>(BUILTIN_THEME_FILES[0]?.key ?? PAGE_FILES[0]?.key ?? "");
  const [status, setStatus] = useState<StatusMessage>({ key: "css.status.loaded" });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<ThemeMode>("dark");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadCssOverrides().then((map) => {
      if (!alive) return;
      setOverrides(map);
      const nextBase: Record<string, string> = {};
      const nextDraft: Record<string, string> = {};
      for (const file of [...BUILTIN_THEME_FILES, ...PAGE_FILES]) {
        const original = CSS_SOURCE_MAP[file.key] ?? "";
        nextBase[file.key] = original;
        nextDraft[file.key] = map[file.key] ?? original;
      }
      setBaseline(nextBase);
      setDrafts(nextDraft);
      const count = Object.keys(map).length;
      setStatus(count > 0 ? { key: "css.status.loadedOverrides", vars: { count } } : { key: "css.status.loaded" });
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 自建主题出现 / 消失时，补齐或清理编辑草稿 */
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of customThemes) {
        const key = themeCssKey(item.id);
        if (!(key in next)) {
          next[key] = overrides[key] ?? themeCssTemplate(item.id, item.mode);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setBaseline((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of customThemes) {
        const key = themeCssKey(item.id);
        if (!(key in next)) {
          next[key] = overrides[key] ?? themeCssTemplate(item.id, item.mode);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [customThemes, overrides]);

  const themeFiles = useMemo<EditorFile[]>(
    () => [
      ...BUILTIN_THEME_FILES,
      ...customThemes.map((item) => ({
        key: themeCssKey(item.id),
        label: `${item.id}.css`,
        customId: item.id,
      })),
    ],
    [customThemes],
  );

  const allFiles = useMemo(() => [...themeFiles, ...PAGE_FILES], [themeFiles]);

  const dirtyKeys = useMemo(
    () => Object.keys(drafts).filter((key) => drafts[key] !== (baseline[key] ?? CSS_SOURCE_MAP[key] ?? "")),
    [drafts, baseline],
  );

  const activeFile = allFiles.find((item) => item.key === activeKey);
  const activeDraft = drafts[activeKey] ?? CSS_SOURCE_MAP[activeKey] ?? "";
  const activeDirty = drafts[activeKey] !== (baseline[activeKey] ?? CSS_SOURCE_MAP[activeKey] ?? "");

  const handleApply = () => {
    const map = buildOverrides(drafts);
    applyCssOverrides(map);
    setOverrides(map);
    const count = Object.keys(map).length;
    setStatus(count > 0 ? { key: "css.status.applied", vars: { count } } : { key: "css.status.appliedNone" });
  };

  const handleSave = async () => {
    const map = buildOverrides(drafts);
    const ok = await persistCssOverrides(map);
    if (ok) {
      applyCssOverrides(map);
      setOverrides(map);
      setBaseline((prev) => ({ ...prev, ...drafts }));
      const count = Object.keys(map).length;
      setStatus(count > 0 ? { key: "css.status.saved", vars: { count } } : { key: "css.status.cleared" });
    } else {
      setStatus({ key: "css.status.writeFailed" });
    }
  };

  const handleResetFile = () => {
    if (!activeKey) return;
    const next = baseline[activeKey] ?? CSS_SOURCE_MAP[activeKey] ?? "";
    setDrafts((prev) => ({ ...prev, [activeKey]: next }));
    setStatus({ key: "css.status.reverted", vars: { key: activeKey } });
  };

  const handleResetAll = async () => {
    const reset: Record<string, string> = {};
    for (const [key, css] of Object.entries(CSS_SOURCE_MAP)) reset[key] = css;
    for (const item of customThemes) {
      const key = themeCssKey(item.id);
      reset[key] = themeCssTemplate(item.id, item.mode);
    }
    setDrafts(reset);
    setBaseline(reset);
    const map = buildOverrides(reset);
    await persistCssOverrides(map);
    applyCssOverrides(map);
    setOverrides(map);
    setStatus({ key: "css.status.clearedAll" });
  };

  const handleExport = () => {
    const map = buildOverrides(drafts);
    const merged = Object.entries(map)
      .map(([key, css]) => `/* ${key} */\n${css}`)
      .join("\n\n");
    downloadCssText(merged, "turber-theme.css");
    setStatus({ key: "css.status.exported", vars: { count: Object.keys(map).length } });
  };

  const handleCreateTheme = async () => {
    const name = newName.trim();
    if (!name) return;
    const preset = addTheme(name, newMode);
    const key = themeCssKey(preset.id);
    const css = themeCssTemplate(preset.id, preset.mode);
    const nextDrafts = { ...drafts, [key]: css };
    const nextBase = { ...baseline, [key]: css };
    setDrafts(nextDrafts);
    setBaseline(nextBase);
    setActiveKey(key);
    setCreating(false);
    setNewName("");
    const map = buildOverrides(nextDrafts);
    const ok = await persistCssOverrides(map);
    if (ok) {
      applyCssOverrides(map);
      setOverrides(map);
    }
    setStatus({
      key: ok ? "css.status.themeCreated" : "css.status.writeFailed",
      vars: ok ? { name: preset.name, key } : undefined,
    });
  };

  const handleDeleteTheme = async (id: string, name: string) => {
    if (isLockedTheme(id)) {
      setStatus({ key: "css.status.locked" });
      return;
    }
    const key = themeCssKey(id);
    removeTheme(id);
    if (theme === id) setAppearance({ theme: DEFAULT_THEME_ID });
    const nextDrafts = { ...drafts };
    delete nextDrafts[key];
    const nextBase = { ...baseline };
    delete nextBase[key];
    setDrafts(nextDrafts);
    setBaseline(nextBase);
    setPendingDeleteId(null);
    if (activeKey === key) setActiveKey(BUILTIN_THEME_FILES[0]?.key ?? "");
    const map = buildOverrides(nextDrafts);
    const ok = await persistCssOverrides(map);
    if (ok) {
      applyCssOverrides(map);
      setOverrides(map);
    }
    setStatus({ key: ok ? "css.status.themeDeleted" : "css.status.writeFailed", vars: ok ? { name } : undefined });
  };

  const renderRow = (file: EditorFile) => {
    const isActive = file.key === activeKey;
    const isDirty = drafts[file.key] !== (baseline[file.key] ?? CSS_SOURCE_MAP[file.key] ?? "");
    const isSaved = file.key in overrides;
    const pending = file.customId !== undefined && pendingDeleteId === file.customId;
    return (
      <div
        key={file.key}
        className={cn(
          "group flex items-center rounded transition-colors",
          isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        )}
      >
        <button
          type="button"
          onClick={() => setActiveKey(file.key)}
          title={file.key}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-[11.5px]"
        >
          <FileCode className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{file.label}</span>
          {isDirty && <span className="bg-primary ml-auto size-1.5 shrink-0 rounded-full" />}
          {!isDirty && isSaved && <span className="bg-turber-success ml-auto size-1.5 shrink-0 rounded-full" />}
        </button>
        {file.locked && <Lock className="mr-1.5 size-3 shrink-0 opacity-40" />}
        {!file.locked && file.customId === undefined && null}
        {!file.locked && file.customId !== undefined && (
          pending ? (
            <span className="flex shrink-0 items-center gap-1 pr-1.5">
              <button
                type="button"
                className="text-turber-danger text-[10.5px] hover:underline"
                onClick={() => void handleDeleteTheme(file.customId as string, file.label.replace(/\.css$/, ""))}
              >
                {t("css.deleteConfirm")}
              </button>
              <button
                type="button"
                className="text-[10.5px] hover:underline"
                onClick={() => setPendingDeleteId(null)}
              >
                {t("css.cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              title={t("css.deleteTheme")}
              className="text-muted-foreground hover:text-turber-danger mr-1.5 shrink-0"
              onClick={() => setPendingDeleteId(file.customId as string)}
            >
              <Trash2 className="size-3" />
            </button>
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[12px] leading-relaxed">{t("css.intro")}</p>
        <span className="border-border bg-muted/60 text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[10.5px]">
          {dirtyKeys.length > 0 ? t("css.modifiedCount", { count: dirtyKeys.length }) : t("css.noChanges")}
        </span>
      </div>

      <div className="flex h-[420px] gap-2">
        <div className="border-border w-[196px] shrink-0 overflow-y-auto rounded-md border p-1">
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-muted-foreground text-[10.5px] tracking-wide">{t("css.group.themes")}</span>
            <button
              type="button"
              title={t("css.newTheme")}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setCreating((value) => !value)}
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          {creating && (
            <div className="border-border bg-muted/40 mb-1 space-y-1.5 rounded border p-1.5">
              <input
                autoFocus
                className="border-border bg-background text-foreground h-6 w-full rounded border px-1.5 text-[11.5px] outline-none"
                placeholder={t("css.themeName")}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreateTheme();
                  if (event.key === "Escape") setCreating(false);
                }}
              />
              <div className="flex items-center gap-1">
                {(["dark", "light"] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      "flex-1 rounded border px-1 py-0.5 text-[10.5px]",
                      newMode === mode ? "border-primary text-foreground" : "border-border text-muted-foreground",
                    )}
                    onClick={() => setNewMode(mode)}
                  >
                    {t(mode === "dark" ? "css.mode.dark" : "css.mode.light")}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Button className="h-6 flex-1 px-1.5 text-[11px]" size="sm" onClick={() => void handleCreateTheme()}>
                  {t("css.create")}
                </Button>
                <Button
                  className="h-6 px-1.5 text-[11px]"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                >
                  {t("css.cancel")}
                </Button>
              </div>
            </div>
          )}

          {themeFiles.map(renderRow)}

          <div className="border-border/70 mt-1 border-t px-1.5 py-1">
            <span className="text-muted-foreground text-[10.5px] tracking-wide">{t("css.group.page")}</span>
          </div>
          {PAGE_FILES.map(renderRow)}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate font-mono">{activeFile ? activeFile.key : t("css.group.page")}</span>
            <span className="shrink-0">
              {activeDirty ? t("css.dirty") : activeKey in overrides ? t("css.overridden") : t("css.original")}
            </span>
          </div>

          <div className="border-border min-h-0 flex-1 overflow-hidden rounded-md border">
            <Suspense
              fallback={
                <div className="text-muted-foreground flex h-full items-center justify-center text-[12px]">
                  {t("css.loadingEditor")}
                </div>
              }
            >
              <MonacoEditor
                height="100%"
                path={activeKey}
                language="css"
                theme={isLightThemeResolved(theme) ? "light" : "vs-dark"}
                value={activeDraft}
                options={EDITOR_OPTIONS}
                onChange={(value) => {
                  if (!activeKey) return;
                  setDrafts((prev) => ({ ...prev, [activeKey]: value ?? "" }));
                }}
              />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-7 px-2.5 text-[12px]" size="sm" onClick={handleApply}>
          <FileCode className="size-3.5" />
          {t("css.apply")}
        </Button>
        <Button className="h-7 px-2.5 text-[12px]" size="sm" variant="secondary" onClick={() => void handleSave()}>
          <Save className="size-3.5" />
          {t("css.save")}
        </Button>
        <Button className="h-7 px-2.5 text-[12px]" size="sm" variant="outline" onClick={handleResetFile}>
          <RotateCcw className="size-3.5" />
          {t("css.resetFile")}
        </Button>
        <Button className="h-7 px-2.5 text-[12px]" size="sm" variant="outline" onClick={() => void handleResetAll()}>
          <Trash2 className="size-3.5" />
          {t("css.resetAll")}
        </Button>
        <Button className="h-7 px-2.5 text-[12px]" size="sm" variant="ghost" onClick={handleExport}>
          <Download className="size-3.5" />
          {t("css.export")}
        </Button>
      </div>

      <div className="text-muted-foreground bg-muted/50 border-border space-y-1 rounded-md border px-3 py-2 text-[11.5px] leading-relaxed">
        <div>
          {t(status.key, status.vars)}　·　{t("css.footer")} --turber-bg、--turber-surface、--turber-border、--turber-fg、--turber-accent、--turber-radius、--turber-blur、--turber-font
        </div>
        <div className="opacity-80">{t("css.themeHint")}</div>
      </div>
    </div>
  );
}
