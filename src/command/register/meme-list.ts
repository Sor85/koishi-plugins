/**
 * meme.list 构建与渲染
 * 负责模板信息拉取、分类分段与文本/图片输出
 */

import { h, type Context } from "koishi";
import type { Config } from "../../config";
import { MemeBackendClient } from "../../infra/client";
import type { MemeInfoResponse } from "../../types";
import { normalizeMemeKey } from "./exclusion";
import {
  type ContextWithOptionalServices,
  MEME_LIST_CATEGORY_LABEL,
  MEME_LIST_CATEGORY_ORDER,
  type MemeListCategory,
  type MemeListEntry,
  type MemeListInfoResult,
  type MemeListSection,
} from "./types";

function resolveMemeListCategory(
  params: MemeInfoResponse["params_type"] | undefined,
): MemeListCategory {
  if (!params) return "unknown";

  const needImage = params.max_images > 0;
  const needText = params.max_texts > 0;

  if (!needImage && !needText) return "no-args";
  if (!needImage && needText) return "text-only";
  if (needImage && !needText) return "image-only";
  return "image-and-text";
}

function shouldExcludeByMemeCategory(
  category: MemeListCategory,
  params: MemeInfoResponse["params_type"] | undefined,
  config: Config,
): boolean {
  if (category === "text-only") return config.excludeTextOnlyMemes;
  if (category === "image-only") {
    if (!params) return config.excludeOtherMemes;
    const minImages = params.min_images;
    const maxImages = params.max_images;
    if (maxImages <= 1) return config.excludeSingleImageOnlyMemes;
    if (minImages >= 2) return config.excludeTwoImageOnlyMemes;
    return config.excludeOtherMemes;
  }
  if (category === "image-and-text") return config.excludeImageAndTextMemes;
  return config.excludeOtherMemes;
}

function isParamsTypeExcludedByConfig(
  params: MemeInfoResponse["params_type"] | undefined,
  config: Config,
): boolean {
  return shouldExcludeByMemeCategory(
    resolveMemeListCategory(params),
    params,
    config,
  );
}

export async function buildCategoryExcludedMemeKeySet(
  client: MemeBackendClient,
  keys: string[],
  config: Config,
): Promise<Set<string>> {
  if (keys.length === 0) return new Set<string>();
  if (
    !config.excludeTextOnlyMemes &&
    !config.excludeSingleImageOnlyMemes &&
    !config.excludeTwoImageOnlyMemes &&
    !config.excludeImageAndTextMemes &&
    !config.excludeOtherMemes
  ) {
    return new Set<string>();
  }

  const infoResults = await fetchMemeListInfos(client, keys, config);
  return new Set(
    infoResults
      .filter(
        (result) =>
          result.info &&
          isParamsTypeExcludedByConfig(result.info.params_type, config),
      )
      .map((result) => normalizeMemeKey(result.key)),
  );
}

function pickChineseAlias(info: MemeInfoResponse): string {
  const aliases = [
    ...info.keywords,
    ...info.shortcuts.flatMap((shortcut) =>
      shortcut.humanized ? [shortcut.humanized, shortcut.key] : [shortcut.key],
    ),
  ]
    .map((alias) => alias.trim())
    .filter(Boolean);

  const chineseAlias = aliases.find((alias) => /[^\x00-\x7F]/.test(alias));
  if (chineseAlias) return chineseAlias;
  return info.key;
}

function resolveMemeListInfoConcurrency(
  config: Config,
  keyCount: number,
): number {
  if (keyCount <= 0) return 0;
  const normalized = Number.isFinite(config.infoFetchConcurrency)
    ? Math.floor(config.infoFetchConcurrency)
    : 0;

  if (normalized <= 0) return keyCount;
  return Math.min(keyCount, Math.max(1, normalized));
}

export async function fetchMemeListInfos(
  client: MemeBackendClient,
  keys: string[],
  config: Config,
): Promise<MemeListInfoResult[]> {
  const results: MemeListInfoResult[] = new Array(keys.length);
  const workerCount = resolveMemeListInfoConcurrency(config, keys.length);
  let nextIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= keys.length) break;

      const key = keys[index];
      try {
        const info = await client.getInfo(key);
        results[index] = { key, info };
      } catch {
        results[index] = { key };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

export function buildMemeListEntries(
  infoResults: MemeListInfoResult[],
): MemeListEntry[] {
  return infoResults.map((result) => {
    if (!result.info) {
      return {
        alias: result.key,
        category: "unknown",
      };
    }

    return {
      alias: pickChineseAlias(result.info),
      category: resolveMemeListCategory(result.info.params_type),
    };
  });
}

export function buildMemeListSections(
  entries: MemeListEntry[],
): MemeListSection[] {
  const sections: MemeListSection[] = [];

  for (const category of MEME_LIST_CATEGORY_ORDER) {
    const aliases = Array.from(
      new Set(
        entries
          .filter((entry) => entry.category === category)
          .map((entry) => entry.alias.trim())
          .filter(Boolean)
          .sort((left, right) =>
            left.localeCompare(right, "zh-Hans-CN", {
              sensitivity: "base",
            }),
          ),
      ),
    );

    if (aliases.length === 0) continue;

    sections.push({
      title: MEME_LIST_CATEGORY_LABEL[category],
      aliases,
    });
  }

  return sections;
}

export function formatMemeListLines(sections: MemeListSection[]): string[] {
  const lines: string[] = [];

  for (const section of sections) {
    lines.push(section.title);
    lines.push(section.aliases.join(" "));
    lines.push("");
  }

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function toBase64(data: unknown): string | undefined {
  if (Buffer.isBuffer(data)) return data.toString("base64");
  if (data instanceof Uint8Array) return Buffer.from(data).toString("base64");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("base64");
  return undefined;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stringifyImageSegment(
  image: ReturnType<typeof h.image>,
): string {
  const normalize = (h as { normalize?: (value: unknown) => unknown[] })
    .normalize;
  if (typeof normalize === "function") {
    const normalized = normalize(image)
      .map((value) => String(value))
      .join("");
    if (normalized.trim()) return normalized;
  }

  const text = String(image);
  if (text && text !== "[object Object]") return text;

  const imageLike = image as unknown as {
    attrs?: { src?: unknown; url?: unknown };
    mimeType?: unknown;
    buffer?: unknown;
  };

  const source = imageLike.attrs?.src ?? imageLike.attrs?.url;
  if (typeof source === "string" && source.trim()) {
    return `<img src="${source.trim()}"/>`;
  }

  const base64 = toBase64(imageLike.buffer);
  if (!base64) return "<img/>";

  const mimeType =
    typeof imageLike.mimeType === "string" && imageLike.mimeType.trim()
      ? imageLike.mimeType.trim()
      : "image/png";

  return `<img src="data:${mimeType};base64,${base64}"/>`;
}

export async function buildListMessage(
  ctx: ContextWithOptionalServices,
  sections: MemeListSection[],
  lines: string[],
  renderAsImage: boolean,
  _platform: string | undefined,
  logger: ReturnType<Context["logger"]>,
): Promise<string> {
  const content = lines.join("\n");
  if (!renderAsImage || !ctx.puppeteer) return content;

  const width = 2400;
  const titleFontSize = 22;
  const aliasFontSize = 16;
  const paddingX = 72;
  const paddingY = 72;

  try {
    const sectionContent = sections
      .map((section) => {
        const aliasCells = section.aliases
          .map((alias) => `<div class="alias-cell">${escapeXml(alias)}</div>`)
          .join("");
        return `<section class="section"><div class="section-title">${escapeXml(section.title)}</div><div class="alias-grid">${aliasCells}</div></section>`;
      })
      .join("");

    const fallbackContent = lines
      .map((line) => `<div class="line">${escapeXml(line)}</div>`)
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"/><style>body{margin:0;padding:0;background:#f5f7fb;}#list{width:${width}px;padding:${paddingY}px ${paddingX}px;box-sizing:border-box;color:#0f172a;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Noto Emoji","Segoe UI Symbol","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Arial Unicode MS",sans-serif;font-variant-emoji:emoji;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;}.section{margin:0 0 22px 0;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;background:#ffffff;}.section-title{padding:12px 16px;background:#e2e8f0;border-bottom:1px solid #cbd5e1;font-size:${titleFontSize}px;line-height:1.4;font-weight:700;}.alias-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));}.alias-cell{padding:10px 12px;font-size:${aliasFontSize}px;line-height:1.5;border-right:1px solid #dbe3ee;border-bottom:1px solid #dbe3ee;word-break:break-word;overflow-wrap:anywhere;background:#ffffff;}.alias-cell:nth-child(2n){background:#f8fafc;}.line{font-size:${aliasFontSize}px;line-height:1.6;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;}.alias-cell img.emoji,.line img.emoji{width:1.15em;height:1.15em;vertical-align:-0.2em;margin:0 0.02em;}</style></head><body><div id="list">${sections.length > 0 ? sectionContent : fallbackContent}</div></body></html>`;

    const renderedSegment = await ctx.puppeteer.render(
      html,
      async (page, next) => {
        await page.evaluate(async () => {
          const loadTwemoji = async (): Promise<boolean> => {
            const twemojiApi = (window as unknown as { twemoji?: unknown })
              .twemoji;
            if (twemojiApi) return true;

            const scriptUrls = [
              "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/twemoji.min.js",
              "https://unpkg.com/twemoji@14.0.2/dist/twemoji.min.js",
            ];

            const loadScript = async (url: string): Promise<boolean> => {
              return await new Promise<boolean>((resolve) => {
                const script = document.createElement("script");
                script.src = url;
                script.async = true;
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
              });
            };

            for (const url of scriptUrls) {
              const loaded = await loadScript(url);
              if (loaded) return true;
            }

            return false;
          };

          if (typeof document !== "undefined" && document.fonts?.ready) {
            await document.fonts.ready;
          }

          const loaded = await loadTwemoji();
          if (!loaded) return;

          const listNode = document.querySelector("#list");
          const twemojiApi = (
            window as unknown as {
              twemoji?: {
                parse: (
                  node: Element,
                  options?: {
                    base?: string;
                    folder?: string;
                    ext?: string;
                    className?: string;
                  },
                ) => void;
              };
            }
          ).twemoji;
          if (!listNode || !twemojiApi) return;

          twemojiApi.parse(listNode, {
            base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
            folder: "svg",
            ext: ".svg",
            className: "emoji",
          });

          const emojiImages = Array.from(
            document.querySelectorAll<HTMLImageElement>("#list img.emoji"),
          );
          if (emojiImages.length === 0) return;

          await Promise.race([
            Promise.all(
              emojiImages.map(
                (image) =>
                  new Promise<void>((resolve) => {
                    if (image.complete) {
                      resolve();
                      return;
                    }
                    image.addEventListener("load", () => resolve(), {
                      once: true,
                    });
                    image.addEventListener("error", () => resolve(), {
                      once: true,
                    });
                  }),
              ),
            ),
            new Promise<void>((resolve) => setTimeout(resolve, 2500)),
          ]);
        });

        const handle = await page.$("#list");
        return next(handle);
      },
    );

    return renderedSegment || content;
  } catch (error) {
    logger.warn(
      "meme.list image render failed, fallback to text: %s",
      String(error),
    );
    return content;
  }
}
