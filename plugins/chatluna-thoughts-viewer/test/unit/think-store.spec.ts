/**
 * 思考存储单元测试
 * 覆盖群组缓存 key 与当前/上次思考滚动行为
 */

import { describe, expect, it } from "vitest";
import {
  buildThoughtStoreKey,
  createThinkStore,
} from "../../src/store/think-store";

describe("buildThoughtStoreKey", () => {
  it("按平台+群组生成 key", () => {
    const key = buildThoughtStoreKey({
      platform: "onebot",
      guildId: "10001",
    });

    expect(key).toBe("onebot:10001");
  });

  it("同群不同用户生成同一个 key", () => {
    const key1 = buildThoughtStoreKey({
      platform: "onebot",
      guildId: "10001",
    });
    const key2 = buildThoughtStoreKey({
      platform: "onebot",
      guildId: "10001",
    });

    expect(key1).toBe("onebot:10001");
    expect(key2).toBe("onebot:10001");
    expect(key1).toBe(key2);
  });

  it("私聊缺失 guildId 时使用 private", () => {
    const key = buildThoughtStoreKey({
      platform: "onebot",
      guildId: undefined,
    });

    expect(key).toBe("onebot:private");
  });

  it("缺失 platform 时返回 null", () => {
    expect(
      buildThoughtStoreKey({
        platform: "",
        guildId: "10001",
      }),
    ).toBeNull();
  });
});

describe("createThinkStore", () => {
  it("首次写入只保存 current", () => {
    const store = createThinkStore();
    store.update("group", "A");

    expect(store.getCurrent("group")).toBe("A");
    expect(store.getPrevious("group")).toBeUndefined();
  });

  it("第二次写入会把旧 current 推到 previous", () => {
    const store = createThinkStore();
    store.update("group", "A");
    store.update("group", "B");

    expect(store.getCurrent("group")).toBe("B");
    expect(store.getPrevious("group")).toBe("A");
  });

  it("第三次写入会继续滚动 previous，仅保留最近两条", () => {
    const store = createThinkStore();
    store.update("group", "A");
    store.update("group", "B");
    store.update("group", "C");

    expect(store.getCurrent("group")).toBe("C");
    expect(store.getPrevious("group")).toBe("B");
    expect(store.size()).toBe(1);
  });
});
