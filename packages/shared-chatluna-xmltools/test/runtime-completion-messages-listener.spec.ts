/**
 * completionMessages 监听测试
 * 覆盖 assistant 分发、去重与恢复行为
 */

import { describe, expect, it, vi } from "vitest";
import { subscribeAssistantResponses } from "../src/runtime/completion-messages-listener";

describe("subscribeAssistantResponses", () => {
  it("assistant 消息触发 onResponse", () => {
    const messages: unknown[] = [];
    const seen: Array<{ response: string; session: unknown }> = [];

    const unsubscribe = subscribeAssistantResponses(messages, {
      symbolNamespace: "unit-test",
      getSession: () => ({ id: "s1" }),
      onResponse: ({ response, session }) => {
        seen.push({ response, session });
      },
    });

    messages.push({ role: "assistant", content: "  hello  " });
    messages.push({ role: "user", content: "ignored" });

    expect(seen).toEqual([{ response: "hello", session: { id: "s1" } }]);

    unsubscribe();
  });

  it("同一消息对象只触发一次并在最后恢复 push", () => {
    const messages: unknown[] = [];
    const originalPush = messages.push;
    const onResponse = vi.fn();

    const unsubscribeA = subscribeAssistantResponses(messages, {
      symbolNamespace: "unit-test-restore",
      onResponse,
    });
    const unsubscribeB = subscribeAssistantResponses(messages, {
      symbolNamespace: "unit-test-restore",
      onResponse,
    });

    const message = { role: "assistant", content: "x" };
    messages.push(message);
    messages.push(message);
    expect(onResponse).toHaveBeenCalledTimes(2);

    unsubscribeA();
    expect(messages.push).not.toBe(originalPush);
    unsubscribeB();
    expect(messages.push).toBe(originalPush);
  });

  it("同一消息对象内容变化后会再次触发", () => {
    const messages: unknown[] = [];
    const seen: string[] = [];

    const unsubscribe = subscribeAssistantResponses(messages, {
      symbolNamespace: "unit-test-update",
      onResponse: ({ response }) => {
        seen.push(response);
      },
    });

    const message = { role: "assistant", content: "first" };
    messages.push(message);
    message.content = "second";
    messages.push(message);

    expect(seen).toEqual(["first", "second"]);

    unsubscribe();
  });
});
