/**
 * 指令输入解析
 * 统一提取文本参数、图片元素与引用消息输入
 */

import type { Context, Session } from "koishi";
import type { Config } from "../config";
import type { GenerateImageInput } from "../types";
import { downloadImage, extractImageSources } from "../utils/image";

interface ElementLike {
  type?: string;
  attrs?: {
    content?: unknown;
  };
}

export interface ParsedInput {
  texts: string[];
  images: GenerateImageInput[];
}

function extractQuotedTexts(elements: readonly ElementLike[] = []): string[] {
  return elements
    .filter((element) => element.type === "text")
    .map((element) => {
      const content = element.attrs?.content;
      return typeof content === "string" ? content.trim() : "";
    })
    .filter(Boolean);
}

export async function parseCommandInput(
  ctx: Context,
  session: Session,
  rawTexts: string[],
  config: Config,
): Promise<ParsedInput> {
  const textsFromArgs = rawTexts.map((text) => text.trim()).filter(Boolean);
  const quotedElements = (session.quote?.elements || []) as ElementLike[];
  const quotedTexts =
    config.enableQuotedTextTrigger && textsFromArgs.length === 0
      ? extractQuotedTexts(quotedElements)
      : [];
  const texts = textsFromArgs.length > 0 ? textsFromArgs : quotedTexts;

  const currentImages = extractImageSources(session.elements);
  const quotedImages = config.enableQuotedImageTrigger
    ? extractImageSources(session.quote?.elements || [])
    : [];
  const imageSources = [...currentImages, ...quotedImages];

  const images: GenerateImageInput[] = [];

  for (let index = 0; index < imageSources.length; index += 1) {
    const src = imageSources[index];
    const image = await downloadImage(
      ctx,
      src,
      config.timeoutMs,
      `input-${index + 1}`,
    );
    images.push(image);
  }

  return { texts, images };
}
