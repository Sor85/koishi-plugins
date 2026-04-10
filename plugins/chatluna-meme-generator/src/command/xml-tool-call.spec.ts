/**
 * XML 工具调用单元测试
 * 仅覆盖 key/text/image/at 固定协议
 */

import { describe, expect, it } from "vitest";
import { extractXmlMemeToolCalls } from "./xml-tool-call";

describe("extractXmlMemeToolCalls", () => {
  it("解析固定协议的 key/text/image/at", () => {
    const content =
      '<meme key="qizhu" text="你好|世界" image"https://a.png|https://b.jpg" at="10001|10002"/>';
    const result = extractXmlMemeToolCalls(content);
    expect(result).toEqual([
      {
        key: "qizhu",
        texts: ["你好", "世界"],
        imageSources: ["https://a.png", "https://b.jpg"],
        atUserIds: ["10001", "10002"],
      },
    ]);
  });

  it("解析 image= 形式并保留兼容", () => {
    const content =
      '<meme key="qizhu" text="冲鸭" image="https://a.png" at="@10001"/>';
    const result = extractXmlMemeToolCalls(content);
    expect(result).toEqual([
      {
        key: "qizhu",
        texts: ["冲鸭"],
        imageSources: ["https://a.png"],
        atUserIds: ["10001"],
      },
    ]);
  });

  it("缺少 key 时忽略", () => {
    const content = '<meme text="abc" image"https://a.png" at="10001"/>';
    const result = extractXmlMemeToolCalls(content);
    expect(result).toEqual([]);
  });

  it("出现 alias/texts 等不支持参数时忽略", () => {
    const content = '<meme key="qizhu" alias="骑猪" texts="a|b"/>';
    const result = extractXmlMemeToolCalls(content);
    expect(result).toEqual([]);
  });

  it("普通文本包裹 XML 标签时仍可解析", () => {
    const content =
      '先回复一句话。\n<meme key="qizhu" text="你好|世界" image="https://a.png" at="10001"/>\n结束。';
    const result = extractXmlMemeToolCalls(content);
    expect(result).toEqual([
      {
        key: "qizhu",
        texts: ["你好", "世界"],
        imageSources: ["https://a.png"],
        atUserIds: ["10001"],
      },
    ]);
  });

  it("换行包裹 XML 标签时仍可解析", () => {
    const content =
      '这是 assistant 的最终回复\n\n<meme key="qizhu" text="冲鸭" at="@10001"/>\n';
    const result = extractXmlMemeToolCalls(content);
    expect(result).toEqual([
      {
        key: "qizhu",
        texts: ["冲鸭"],
        imageSources: [],
        atUserIds: ["10001"],
      },
    ]);
  });
});
