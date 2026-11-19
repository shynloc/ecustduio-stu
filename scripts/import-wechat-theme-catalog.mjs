// Build-time import of the MIT-licensed ACKS Markdown catalog. No network at runtime.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { execFileSync } from "node:child_process";
import { createCanvas, loadImage } from "@napi-rs/canvas";
const source = resolve(process.argv[2] || ".artifacts/mdeditor-upstream");
const read = (name) => readFileSync(join(source, "src", name), "utf8");
const context = createContext({});
for (const name of ["theme-core.js", "theme-revision.js"])
  runInContext(read(name), context, { timeout: 5000 });
const signatures = JSON.parse(read("theme-signatures.json"));
for (const signature of Object.values(signatures))
  if (signature.type === "svg")
    signature.svg = read("theme-signatures/" + signature.file);
const catalog = read("theme-catalog.js")
  .replace(
    "const profiles = []; // MILESTONE_PROFILES",
    "const profiles = " + read("milestone-profiles.json") + ";",
  )
  .replace(
    "const signatures = {}; // THEME_SIGNATURES",
    "const signatures = " + JSON.stringify(signatures) + ";",
  );
runInContext(catalog, context, { timeout: 5000 });
const { THEMES, THEME_META, RECIPES } = context.MD;
if (Object.keys(THEMES).length !== 43 || Object.keys(RECIPES).length !== 9)
  throw new Error("Upstream catalog changed; review before importing.");
const output = "public/wechat-themes",
  vendor = "vendor/acks-markdown";
mkdirSync(output, { recursive: true });
mkdirSync(vendor, { recursive: true });
copyFileSync(join(source, "LICENSE"), join(vendor, "LICENSE"));
copyFileSync(join(source, "LICENSE"), join(output, "LICENSE.txt"));
const cssFiles = [
  "article.css",
  "theme-revision.css",
  "milestone-base.css",
  "milestone-generated.css",
  "theme-catalog.css",
];
for (const name of [
  ...cssFiles,
  "theme-core.js",
  "theme-revision.js",
  "theme-catalog.js",
  "theme-render.js",
  "milestone-profiles.json",
  "theme-signatures.json",
])
  copyFileSync(join(source, "src", name), join(vendor, name));
const definitions = {},
  summaries = [],
  pngs = {};
for (const [key, t] of Object.entries(THEMES)) {
  const id = key.startsWith("milestone-") ? key : "acks-" + key;
  const signature = signatures[t.signature];
  const bytesIn =
    signature.type === "svg"
      ? Buffer.from(
          signature.svg
            .replaceAll("#111111", t.heading)
            .replaceAll("#777777", t.accent)
            .replaceAll("#aaaaaa", t.accent2 || t.accent)
            .replaceAll("#eeeeee", t.markBg),
        )
      : readFileSync(
          join(source, "src/theme-assets", signature.asset + ".png"),
        );
  // Raster assets retain the vector artwork when WeChat strips SVG elements.
  const img = await loadImage(bytesIn);
  const canvas = createCanvas(630, 210),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, 630, 210);
  const scale = Math.min(630 / img.width, 210 / img.height),
    w = img.width * scale,
    h = img.height * scale;
  ctx.drawImage(img, (630 - w) / 2, (210 - h) / 2, w, h);
  const bytes = canvas.toBuffer("image/png");
  pngs[id] = bytes.toString("base64");
  writeFileSync(join(output, id + ".png"), bytes);
  definitions[id] = { ...t, upstreamId: key };
  summaries.push({
    id,
    name: t.name,
    ...THEME_META[key],
    bg: t.bg,
    text: t.text,
    heading: t.heading,
    accent: t.accent,
    bodySize: t.bodySize,
    lineHeight: t.lineHeight,
    paraIndent: t.paraIndent,
  });
}
const header =
  "// Generated from ACKS Markdown Editor (MIT). See vendor/acks-markdown/LICENSE.\n";
writeFileSync(
  "server/wechat-theme-data.ts",
  header +
    "export const themeDefinitions: Record<string,any> = " +
    JSON.stringify(definitions, null, 2) +
    ";\nexport const themeCss = " +
    JSON.stringify(cssFiles.map(read).join("\n")) +
    ";\nexport const themeSignaturePng: Record<string,string> = " +
    JSON.stringify(pngs) +
    ";\n",
);
writeFileSync(
  "shared/wechat-theme-catalog.ts",
  header +
    "export const upstreamWechatThemeIds = " +
    JSON.stringify(
      summaries.map((x) => x.id),
      null,
      2,
    ) +
    " as const;\nexport const upstreamWechatCatalog = " +
    JSON.stringify(summaries, null, 2) +
    ";\nexport const wechatRecipes = " +
    JSON.stringify(RECIPES, null, 2) +
    " as const;\nexport const wechatRecipeIds = " +
    JSON.stringify(Object.keys(RECIPES)) +
    " as const;\n",
);
const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
writeFileSync(
  join(vendor, "README.md"),
  `# ACKS Markdown themes\n\nSource: https://github.com/shynloc/ACKS-Markdown-Editor\nReference: https://mdeditor.acks.com.cn/\nCommit: ${commit}\nLicense: MIT (see LICENSE).\n\n43 complete catalog entries and 9 recipes are imported. Original CSS and theme definitions are retained here for audit. Generated server styles are in server/wechat-theme-data.ts, public raster signatures in public/wechat-themes. The server inlines CSS, resolves custom properties, and flattens vertical layouts for WeChat. It never fetches resources while rendering.\n\nRebuild with node scripts/import-wechat-theme-catalog.mjs /path/to/upstream-checkout after reviewing upstream changes.\n`,
);
console.log(
  JSON.stringify({
    themes: summaries.length,
    recipes: Object.keys(RECIPES).length,
    commit,
  }),
);
