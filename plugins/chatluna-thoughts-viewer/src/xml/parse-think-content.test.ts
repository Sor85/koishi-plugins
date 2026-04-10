/**
 * XML 标签解析单元测试
 * 覆盖自定义标签与边界输入
 */

import { describe, expect, it } from "vitest";
import { parseTagContent } from "./parse-think-content";

describe("parseTagContent", () => {
  it("提取单个标签内容", () => {
    const input = "你好<think>我在思考</think>再见";
    const result = parseTagContent(input, "think");

    expect(result).toEqual({
      thoughts: ["我在思考"],
    });
  });

  it("无目标标签时返回空数组", () => {
    const input = "纯文本无标签";
    const result = parseTagContent(input, "think");

    expect(result).toEqual({
      thoughts: [],
    });
  });

  it("支持多个同名标签", () => {
    const input = "<think>第一段</think>中间<think>第二段</think>";
    const result = parseTagContent(input, "think");

    expect(result).toEqual({
      thoughts: ["第一段", "第二段"],
    });
  });

  it("支持多行标签内容", () => {
    const input = "你好\n<think>\n第一行\n第二行\n</think>\n再见";
    const result = parseTagContent(input, "think");

    expect(result).toEqual({
      thoughts: ["\n第一行\n第二行\n"],
    });
  });

  it("支持带属性标签", () => {
    const input = '<think type="reasoning">推理过程</think>结果';
    const result = parseTagContent(input, "think");

    expect(result).toEqual({
      thoughts: ["推理过程"],
    });
  });

  it("支持自定义标签", () => {
    const input = "<thought>自定义内容</thought>";
    const result = parseTagContent(input, "thought");

    expect(result).toEqual({
      thoughts: ["自定义内容"],
    });
  });

  it("空标签名时返回空数组", () => {
    const input = "<think>内容</think>";
    const result = parseTagContent(input, "");

    expect(result).toEqual({
      thoughts: [],
    });
  });
});
