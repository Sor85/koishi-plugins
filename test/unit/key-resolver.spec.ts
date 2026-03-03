/**
 * 模板别名解析单元测试
 * 覆盖中文关键词与快捷短语到 key 的映射行为
 */

import { describe, expect, it, vi } from "vitest";
import {
  createMemeKeyResolver,
  listDirectAliases,
  shouldRegisterDirectAlias,
} from "../../src/command/key-resolver";
import type { MemeInfoResponse } from "../../src/types";

function createInfoResponse(
  key: string,
  keywords: string[] = [],
  humanized?: string,
): MemeInfoResponse {
  return {
    key,
    params_type: {
      min_images: 0,
      max_images: 4,
      min_texts: 0,
      max_texts: 4,
      default_texts: [],
    },
    keywords,
    shortcuts: [
      {
        key,
        humanized,
      },
    ],
    tags: [],
    date_created: "2026-01-01T00:00:00",
    date_modified: "2026-01-01T00:00:00",
  };
}

describe("shouldRegisterDirectAlias", () => {
  it("仅允许无空白的非纯英文数字别名", () => {
    expect(shouldRegisterDirectAlias("骑猪")).toBe(true);
    expect(shouldRegisterDirectAlias("5000兆")).toBe(true);
    expect(shouldRegisterDirectAlias("滚")).toBe(true);
    expect(shouldRegisterDirectAlias("揍")).toBe(true);
    expect(shouldRegisterDirectAlias("qizhu")).toBe(false);
    expect(shouldRegisterDirectAlias("google image")).toBe(false);
    expect(shouldRegisterDirectAlias("   ")).toBe(false);
  });
});

describe("listDirectAliases", () => {
  it("仅返回可安全直触发的中文别名并去重", async () => {
    const result = await listDirectAliases({
      getKeys: async () => ["qizhu", "google"],
      getInfo: async (key: string) => {
        if (key === "qizhu") {
          return createInfoResponse("qizhu", ["骑猪", "google", "骑猪"]);
        }
        return createInfoResponse("google", ["google", "google image"]);
      },
    });

    expect(result.entries).toEqual([{ alias: "骑猪", keys: ["qizhu"] }]);
    expect(result.hasInfoFailure).toBe(false);
    expect(result.failedInfoKeys).toBe(0);
    expect(result.totalKeys).toBe(2);
  });

  it("部分 getInfo 失败时返回失败统计", async () => {
    const result = await listDirectAliases({
      getKeys: async () => ["qizhu", "google"],
      getInfo: async (key: string) => {
        if (key === "qizhu") {
          return createInfoResponse("qizhu", ["骑猪"]);
        }
        throw new Error("temporary");
      },
    });

    expect(result.entries).toEqual([{ alias: "骑猪", keys: ["qizhu"] }]);
    expect(result.hasInfoFailure).toBe(true);
    expect(result.failedInfoKeys).toBe(1);
    expect(result.totalKeys).toBe(2);
  });

  it("设置 infoFetchConcurrency 后应按配置限制并发数", async () => {
    const running = new Set<string>();
    let maxRunning = 0;

    const result = await listDirectAliases(
      {
        getKeys: async () => ["k1", "k2", "k3", "k4", "k5"],
        getInfo: async (key: string) => {
          running.add(key);
          maxRunning = Math.max(maxRunning, running.size);
          await Promise.resolve();
          await Promise.resolve();
          running.delete(key);
          return createInfoResponse(key, ["骑猪"]);
        },
      },
      {
        infoFetchConcurrency: 2,
      },
    );

    expect(result.entries).toEqual([
      { alias: "骑猪", keys: ["k1", "k2", "k3", "k4", "k5"] },
    ]);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });
});

describe("createMemeKeyResolver", () => {
  it("中文关键词可解析到真实 key", async () => {
    const resolver = createMemeKeyResolver({
      getKeys: async () => ["qizhu"],
      getInfo: async () => createInfoResponse("qizhu", ["骑猪"]),
    });

    await expect(resolver("骑猪")).resolves.toBe("qizhu");
  });

  it("humanized 快捷短语可解析到真实 key", async () => {
    const resolver = createMemeKeyResolver({
      getKeys: async () => ["qizhu"],
      getInfo: async () => createInfoResponse("qizhu", [], "骑猪"),
    });

    await expect(resolver("骑猪")).resolves.toBe("qizhu");
  });

  it("同名别名冲突时按随机结果命中候选 key", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      const resolver = createMemeKeyResolver({
        getKeys: async () => ["qizhu", "hug"],
        getInfo: async (key: string) =>
          key === "qizhu"
            ? createInfoResponse("qizhu", ["骑猪"])
            : createInfoResponse("hug", ["骑猪"]),
      });

      await expect(resolver("骑猪")).resolves.toBe("qizhu");
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("同名直触发别名列表应返回多个候选 key", async () => {
    const result = await listDirectAliases({
      getKeys: async () => ["qizhu", "hug"],
      getInfo: async (key: string) =>
        key === "qizhu"
          ? createInfoResponse("qizhu", ["骑猪"])
          : createInfoResponse("hug", ["骑猪"]),
    });

    expect(result.entries).toEqual([{ alias: "骑猪", keys: ["hug", "qizhu"] }]);
  });

  it("未知别名保持原输入", async () => {
    const resolver = createMemeKeyResolver({
      getKeys: async () => ["qizhu"],
      getInfo: async () => createInfoResponse("qizhu", ["骑猪"]),
    });

    await expect(resolver("不存在别名")).resolves.toBe("不存在别名");
  });

  it("直接输入 key 时按原 key 返回", async () => {
    const resolver = createMemeKeyResolver({
      getKeys: async () => ["qizhu"],
      getInfo: async () => createInfoResponse("qizhu", ["骑猪"]),
    });

    await expect(resolver("qizhu")).resolves.toBe("qizhu");
  });

  it("别名匹配忽略前后空白与大小写", async () => {
    const resolver = createMemeKeyResolver({
      getKeys: async () => ["QIZHU"],
      getInfo: async () => createInfoResponse("QIZHU", ["骑猪"]),
    });

    await expect(resolver("  qizhu  ")).resolves.toBe("QIZHU");
  });

  it("getKeys 首次失败后可在后续请求恢复", async () => {
    const getKeys = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue(["qizhu"]);
    const getInfo = vi.fn(async () => createInfoResponse("qizhu", ["骑猪"]));
    const resolver = createMemeKeyResolver({ getKeys, getInfo });

    await expect(resolver("骑猪")).rejects.toThrow("timeout");
    await expect(resolver("骑猪")).resolves.toBe("qizhu");
  });

  it("getInfo 部分失败时当前请求可回退并在后续请求恢复别名", async () => {
    const getKeys = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValue(["qizhu"]);
    const getInfo = vi
      .fn<(key: string) => Promise<MemeInfoResponse>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(createInfoResponse("qizhu", ["骑猪"]));
    const resolver = createMemeKeyResolver({ getKeys, getInfo });

    await expect(resolver("骑猪")).resolves.toBe("骑猪");
    await expect(resolver("骑猪")).resolves.toBe("qizhu");
  });

  it("解析器设置 infoFetchConcurrency 后应按配置限制并发数", async () => {
    const running = new Set<string>();
    let maxRunning = 0;

    const resolver = createMemeKeyResolver(
      {
        getKeys: async () => ["k1", "k2", "k3", "k4", "k5"],
        getInfo: async (key: string) => {
          running.add(key);
          maxRunning = Math.max(maxRunning, running.size);
          await Promise.resolve();
          await Promise.resolve();
          running.delete(key);
          return createInfoResponse(key, ["别名"]);
        },
      },
      {
        infoFetchConcurrency: 2,
      },
    );

    await expect(resolver("别名")).resolves.toBeDefined();
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it("infoFetchConcurrency=0 时不限制并发", async () => {
    const running = new Set<string>();
    let maxRunning = 0;

    const resolver = createMemeKeyResolver(
      {
        getKeys: async () => ["k1", "k2", "k3", "k4"],
        getInfo: async (key: string) => {
          running.add(key);
          maxRunning = Math.max(maxRunning, running.size);
          await Promise.resolve();
          await Promise.resolve();
          running.delete(key);
          return createInfoResponse(key, ["别名"]);
        },
      },
      {
        infoFetchConcurrency: 0,
      },
    );

    await expect(resolver("别名")).resolves.toBeDefined();
    expect(maxRunning).toBe(4);
  });
});
