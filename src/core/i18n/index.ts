import { useCallback } from "react";
import { useSettingsStore } from "../store/useSettingsStore";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  MESSAGES,
  type Language,
  type MessageKey,
  type TranslateVars,
} from "./messages";

export { DEFAULT_LANGUAGE, LANGUAGES, MESSAGES };
export type { Language, MessageKey, TranslateVars };

export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

function format(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  let text = template;
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`{${key}}`).join(String(value));
  }
  return text;
}

/** 非组件环境（事件回调、store 外部逻辑）使用的翻译函数。 */
export function translate(language: Language, key: MessageKey, vars?: TranslateVars): string {
  const table = MESSAGES[language] ?? MESSAGES[DEFAULT_LANGUAGE];
  return format(table[key] ?? MESSAGES[DEFAULT_LANGUAGE][key] ?? key, vars);
}

export function useLanguage(): Language {
  return useSettingsStore((state) => state.language ?? DEFAULT_LANGUAGE);
}

/** 组件内使用：返回 t 与当前语言，语言变化会自动重渲染。 */
export function useI18n(): { t: Translate; language: Language } {
  const language = useLanguage();
  const t = useCallback<Translate>((key, vars) => translate(language, key, vars), [language]);
  return { t, language };
}
