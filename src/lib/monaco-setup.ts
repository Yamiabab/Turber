import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import cssWorker from "monaco-editor/language/css/css.worker.js?worker";
import htmlWorker from "monaco-editor/language/html/html.worker.js?worker";
import jsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";
import { loader } from "@monaco-editor/react";

type MonacoWorkerEnvironment = {
  getWorker: (workerId: string, label: string) => Worker;
};

(self as unknown as { MonacoEnvironment: MonacoWorkerEnvironment }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "json") return new jsonWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

monaco.editor.defineTheme("turber-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#151515",
    "editorGutter.background": "#151515",
    "editor.lineHighlightBackground": "#1c1c1c",
    "editorLineNumber.foreground": "#4a4a4a",
    "editorLineNumber.activeForeground": "#a3a3a3",
    "editorIndentGuide.background1": "#1f1f1f",
  },
});

monaco.editor.defineTheme("turber-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#ffffff",
    "editorGutter.background": "#ffffff",
    "editor.lineHighlightBackground": "#f5f5f5",
    "editorLineNumber.foreground": "#b3b3b3",
    "editorLineNumber.activeForeground": "#404040",
  },
});

export { monaco };
