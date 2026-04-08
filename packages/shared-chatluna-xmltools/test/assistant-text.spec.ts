/**
 * assistant 文本提取测试
 * 覆盖类型识别与多结构文本展开
 */

import { describe, expect, it } from "vitest";
import {
  extractAssistantText,
  extractTextContent,
  getMessageType,
  isAssistantMessage,
} from "../src/message/assistant-text";

describe("assistant-text", () => {
  it("识别 _getType 返回的 assistant", () => {
    const message = {
      _getType: () => "Assistant",
      content: "hello",
    };

    expect(getMessageType(message)).toBe("assistant");
    expect(isAssistantMessage(message)).toBe(true);
  });

  it("从 children 与 attrs 展开文本", () => {
    const content = [
      {
        children: [{ text: "<actions>" }, { text: '<delete message_id="m1"/>' }],
      },
      { attrs: { text: "</actions>" } },
    ];

    expect(extractTextContent(content)).toBe(
      '<actions><delete message_id="m1"/></actions>',
    );
  });

  it("仅 assistant/ai 返回文本", () => {
    expect(
      extractAssistantText({ role: "assistant", content: "  hi  " }),
    ).toBe("hi");
    expect(extractAssistantText({ type: "ai", text: " hello " })).toBe(
      "hello",
    );
    expect(extractAssistantText({ role: "user", content: "hello" })).toBe("");
  });
});
