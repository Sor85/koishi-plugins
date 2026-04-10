/**
 * 思考 runtime 单元测试
 * 覆盖自定义标签提取与空内容过滤
 */

import { describe, expect, it } from "vitest";
import { buildStoredThought } from "./think-runtime";

describe("buildStoredThought", () => {
  it("提取 think 标签内容", () => {
    const content = buildStoredThought("前缀<think>abcdefg</think>后缀", "think");

    expect(content).toBe("abcdefg");
  });

  it("支持自定义标签", () => {
    const content = buildStoredThought("<thought>A</thought>中间<thought>B</thought>", "thought");

    expect(content).toBe("A\n\nB");
  });

  it("空白标签内容返回 null", () => {
    const content = buildStoredThought("<think>   </think>", "think");

    expect(content).toBeNull();
  });
});
