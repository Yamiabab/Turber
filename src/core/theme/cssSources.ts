const rawModules = import.meta.glob("../../styles/**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type CssSource = {
  /** Stable identifier, e.g. `styles/themes/aurora.css`. */
  key: string;
  /** File name only, used in the compact file switcher. */
  label: string;
  /** Folder the file lives in, used for grouping in the switcher. */
  group: string;
  /** Original content shipped with the build. */
  css: string;
};

const toProjectPath = (path: string): string => {
  const marker = "/src/";
  const index = path.lastIndexOf(marker);
  if (index >= 0) return path.slice(index + marker.length);
  return path.replace(/^\.\.?\//, "");
};

export const CSS_SOURCES: CssSource[] = Object.entries(rawModules)
  .map(([path, css]) => {
    const key = toProjectPath(path);
    const segments = key.split("/");
    return {
      key,
      label: segments[segments.length - 1] ?? key,
      group: segments.slice(0, -1).join("/") || "src",
      css,
    };
  })
  .sort((a, b) => a.key.localeCompare(b.key));

export const CSS_SOURCE_MAP: Record<string, string> = Object.fromEntries(
  CSS_SOURCES.map((item) => [item.key, item.css]),
);
