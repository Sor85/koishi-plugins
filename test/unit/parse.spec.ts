/**
 * 输入解析单元测试
 * 校验文本清理与引用消息触发行为
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCommandInput } from "../../src/command/parse";
import { downloadImage, extractImageSources } from "../../src/utils/image";

vi.mock("../../src/utils/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/image")>();
  return {
    ...actual,
    downloadImage: vi.fn(async (_ctx, _src, _timeoutMs, filenamePrefix) => ({
      data: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      filename: `${filenamePrefix}.png`,
    })),
  };
});

function createConfig(overrides: Record<string, unknown> = {}) {
  return {
    timeoutMs: 3000,
    enableQuotedImageTrigger: true,
    enableQuotedTextTrigger: false,
    ...overrides,
  };
}

describe("extractImageSources", () => {
  it("提取消息中的 img src", () => {
    const elements = [
      { type: "text", attrs: { content: "hello" }, children: [] },
      { type: "img", attrs: { src: "https://a.com/1.png" }, children: [] },
      { type: "img", attrs: { src: "https://a.com/2.jpg" }, children: [] },
    ] as never[];

    const result = extractImageSources(elements);
    expect(result).toEqual(["https://a.com/1.png", "https://a.com/2.jpg"]);
  });

  it("忽略无 src 的 img 与非 img 元素", () => {
    const elements = [
      { type: "img", attrs: {}, children: [] },
      { type: "at", attrs: { id: "1" }, children: [] },
      { type: "text", attrs: { content: "x" }, children: [] },
    ] as never[];

    const result = extractImageSources(elements);
    expect(result).toEqual([]);
  });
});

describe("parseCommandInput", () => {
  beforeEach(() => {
    vi.mocked(downloadImage).mockClear();
  });

  it("开启引用图片触发时应包含引用消息图片", async () => {
    const result = await parseCommandInput(
      {} as never,
      {
        elements: [
          { type: "img", attrs: { src: "https://a.com/current.png" } },
        ],
        quote: {
          elements: [
            { type: "img", attrs: { src: "https://a.com/quoted.png" } },
          ],
        },
      } as never,
      [],
      createConfig({ enableQuotedImageTrigger: true }) as never,
    );

    expect(vi.mocked(downloadImage)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(downloadImage).mock.calls[0][1]).toBe(
      "https://a.com/current.png",
    );
    expect(vi.mocked(downloadImage).mock.calls[1][1]).toBe(
      "https://a.com/quoted.png",
    );
    expect(result.images).toHaveLength(2);
  });

  it("关闭引用图片触发时应忽略引用消息图片", async () => {
    const result = await parseCommandInput(
      {} as never,
      {
        elements: [
          { type: "img", attrs: { src: "https://a.com/current.png" } },
        ],
        quote: {
          elements: [
            { type: "img", attrs: { src: "https://a.com/quoted.png" } },
          ],
        },
      } as never,
      [],
      createConfig({ enableQuotedImageTrigger: false }) as never,
    );

    expect(vi.mocked(downloadImage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadImage).mock.calls[0][1]).toBe(
      "https://a.com/current.png",
    );
    expect(result.images).toHaveLength(1);
  });

  it("开启引用文字触发且无文本参数时应回填引用文字", async () => {
    const result = await parseCommandInput(
      {} as never,
      {
        elements: [],
        quote: {
          elements: [
            { type: "text", attrs: { content: "  引用文案  " } },
            { type: "text", attrs: { content: "" } },
          ],
        },
      } as never,
      [],
      createConfig({ enableQuotedTextTrigger: true }) as never,
    );

    expect(result.texts).toEqual(["引用文案"]);
  });

  it("开启引用文字触发但有文本参数时应保持用户输入", async () => {
    const result = await parseCommandInput(
      {} as never,
      {
        elements: [],
        quote: {
          elements: [{ type: "text", attrs: { content: "引用文案" } }],
        },
      } as never,
      ["  用户输入  "],
      createConfig({ enableQuotedTextTrigger: true }) as never,
    );

    expect(result.texts).toEqual(["用户输入"]);
  });

  it("关闭引用文字触发时应忽略引用文字", async () => {
    const result = await parseCommandInput(
      {} as never,
      {
        elements: [],
        quote: {
          elements: [{ type: "text", attrs: { content: "引用文案" } }],
        },
      } as never,
      [],
      createConfig({ enableQuotedTextTrigger: false }) as never,
    );

    expect(result.texts).toEqual([]);
  });
});
