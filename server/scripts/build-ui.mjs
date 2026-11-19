import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["ui/app.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  outdir: "public",
  entryNames: "app",
  assetNames: "[name]-[hash]",
  loader: { ".woff": "file", ".woff2": "file", ".ttf": "file", ".eot": "file" },
  logLevel: "info",
});
