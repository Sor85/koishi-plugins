/**
 * 随机命令核心逻辑测试
 * 覆盖模板分类、桶权重选择与去重边界
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RandomMemeBucketCategory,
  RandomMemeBucketWeightRule,
} from "../config";
import {
  createShuffledKeys,
  getRandomCandidatesWithDedupe,
  pickRandomBucketByWeight,
  pickRandomItem,
  recordRandomSelection,
  resolveRandomMemeBucket,
} from "./random";
import type { MemeParamsType } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeParams(overrides: Partial<MemeParamsType> = {}): MemeParamsType {
  return {
    min_images: 0,
    max_images: 0,
    min_texts: 0,
    max_texts: 0,
    default_texts: [],
    ...overrides,
  };
}

function makeBucketRules(
  overrides: Partial<RandomMemeBucketWeightRule>[] = [],
): RandomMemeBucketWeightRule[] {
  const baseRules: RandomMemeBucketWeightRule[] = [
    {
      category: "text-only",
      enabled: true,
      weight: 100,
    },
    {
      category: "single-image-only",
      enabled: true,
      weight: 100,
    },
    {
      category: "two-image-only",
      enabled: true,
      weight: 100,
    },
    {
      category: "image-and-text",
      enabled: true,
      weight: 100,
    },
    {
      category: "other",
      enabled: true,
      weight: 100,
    },
  ];

  return baseRules.map((rule, index) => ({
    ...rule,
    ...(overrides[index] ?? {}),
  }));
}

describe("createShuffledKeys", () => {
  it("空输入返回空数组", () => {
    expect(createShuffledKeys([])).toEqual([]);
  });

  it("会过滤空白并按随机种子打乱", () => {
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.5);

    const result = createShuffledKeys([" a ", "", "b", " c "]);

    expect(result).toEqual(["b", "c", "a"]);
    randomSpy.mockRestore();
  });
});

describe("resolveRandomMemeBucket", () => {
  it("可将模板参数映射到五类随机桶", () => {
    expect(
      resolveRandomMemeBucket(
        makeParams({
          min_images: 0,
          max_images: 0,
          min_texts: 1,
          max_texts: 1,
        }),
      ),
    ).toBe("text-only");
    expect(
      resolveRandomMemeBucket(
        makeParams({
          min_images: 1,
          max_images: 1,
          min_texts: 0,
          max_texts: 0,
        }),
      ),
    ).toBe("single-image-only");
    expect(
      resolveRandomMemeBucket(
        makeParams({
          min_images: 2,
          max_images: 2,
          min_texts: 0,
          max_texts: 0,
        }),
      ),
    ).toBe("two-image-only");
    expect(
      resolveRandomMemeBucket(
        makeParams({
          min_images: 1,
          max_images: 1,
          min_texts: 1,
          max_texts: 1,
        }),
      ),
    ).toBe("image-and-text");
  });

  it("复杂图片约束与缺失参数应归入其他桶", () => {
    expect(
      resolveRandomMemeBucket(
        makeParams({
          min_images: 2,
          max_images: 3,
          min_texts: 0,
          max_texts: 0,
        }),
      ),
    ).toBe("other");
    expect(resolveRandomMemeBucket(undefined)).toBe("other");
  });
});

describe("pickRandomBucketByWeight", () => {
  it("会跳过空桶并只从有候选的桶中按权重选择", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0);

    const result = pickRandomBucketByWeight(
      [
        { key: "single", bucketCategory: "single-image-only" as const },
        { key: "other", bucketCategory: "other" as const },
      ],
      makeBucketRules([
        { category: "text-only", weight: 1000 },
        { category: "single-image-only", weight: 10 },
        { category: "two-image-only", weight: 0 },
        { category: "image-and-text", weight: 0 },
        { category: "other", weight: 0 },
      ]),
    );

    expect(result?.bucketCategory).toBe("single-image-only");
    expect(result?.candidates.map((item) => item.key)).toEqual(["single"]);
  });

  it("按桶权重选择，而不是按桶内模板数量选择", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0);

    const result = pickRandomBucketByWeight(
      [
        { key: "text", bucketCategory: "text-only" as const },
        { key: "single-1", bucketCategory: "single-image-only" as const },
        { key: "single-2", bucketCategory: "single-image-only" as const },
      ],
      makeBucketRules([
        { category: "text-only", weight: 100 },
        { category: "single-image-only", weight: 1 },
      ]),
    );

    expect(result?.bucketCategory).toBe("text-only");
    expect(result?.candidates.map((item) => item.key)).toEqual(["text"]);
  });

  it("会忽略禁用或零权重的非空桶", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.2);

    const result = pickRandomBucketByWeight(
      [
        { key: "text", bucketCategory: "text-only" as const },
        { key: "other", bucketCategory: "other" as const },
      ],
      makeBucketRules([
        { category: "text-only", enabled: false, weight: 100 },
        { category: "single-image-only", weight: 0 },
        { category: "two-image-only", weight: 0 },
        { category: "image-and-text", weight: 0 },
        { category: "other", weight: 10 },
      ]),
    );

    expect(result?.bucketCategory).toBe("other");
    expect(result?.candidates.map((item) => item.key)).toEqual(["other"]);
  });

  it("无可参与权重选择的非空桶时返回 undefined", () => {
    const result = pickRandomBucketByWeight(
      [{ key: "text", bucketCategory: "text-only" as const }],
      makeBucketRules([
        { category: "text-only", enabled: false, weight: 0 },
        { category: "single-image-only", enabled: false, weight: 0 },
        { category: "two-image-only", enabled: false, weight: 0 },
        { category: "image-and-text", enabled: false, weight: 0 },
        { category: "other", enabled: false, weight: 0 },
      ]),
    );

    expect(result).toBeUndefined();
  });
});

describe("pickRandomItem", () => {
  it("空数组返回 undefined", () => {
    expect(pickRandomItem([])).toBeUndefined();
  });

  it("按随机索引返回元素", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.49);
    expect(pickRandomItem(["a", "b"])).toBe("a");

    vi.spyOn(Math, "random").mockReturnValueOnce(0.99);
    expect(pickRandomItem(["a", "b"])).toBe("b");
  });
});

describe("getRandomCandidatesWithDedupe", () => {
  it("去重关闭时返回原候选", () => {
    const result = getRandomCandidatesWithDedupe(
      [{ key: "a" }, { key: "b" }],
      new Map<string, number>([["a", 1]]),
      { enabled: false, windowHours: 24, nowMs: 1000 },
    );

    expect(result.candidates.map((item) => item.key)).toEqual(["a", "b"]);
  });

  it("去重开启时过滤窗口内已命中 key", () => {
    const nowMs = 2 * 60 * 60 * 1000;
    const result = getRandomCandidatesWithDedupe(
      [{ key: "a" }, { key: "b" }],
      new Map<string, number>([["a", nowMs - 60 * 60 * 1000]]),
      { enabled: true, windowHours: 24, nowMs },
    );

    expect(result.candidates.map((item) => item.key)).toEqual(["b"]);
  });

  it("去重开启时会清理超窗历史记录", () => {
    const nowMs = 25 * 60 * 60 * 1000;
    const result = getRandomCandidatesWithDedupe(
      [{ key: "a" }],
      new Map<string, number>([["a", 0]]),
      { enabled: true, windowHours: 24, nowMs },
    );

    expect(result.history.has("a")).toBe(false);
    expect(result.candidates.map((item) => item.key)).toEqual(["a"]);
  });

  it("去重后某桶耗尽时可配合桶选择跳过该桶", () => {
    const nowMs = 2 * 60 * 60 * 1000;
    const dedupeResult = getRandomCandidatesWithDedupe(
      [
        {
          key: "single",
          bucketCategory: "single-image-only" as RandomMemeBucketCategory,
        },
        {
          key: "text",
          bucketCategory: "text-only" as RandomMemeBucketCategory,
        },
      ],
      new Map<string, number>([["single", nowMs - 60 * 60 * 1000]]),
      { enabled: true, windowHours: 24, nowMs },
    );

    const pickedBucket = pickRandomBucketByWeight(
      dedupeResult.candidates,
      makeBucketRules([
        { category: "single-image-only", weight: 1000 },
        { category: "text-only", weight: 1 },
      ]),
    );

    expect(pickedBucket?.bucketCategory).toBe("text-only");
    expect(pickedBucket?.candidates.map((item) => item.key)).toEqual(["text"]);
  });
});

describe("recordRandomSelection", () => {
  it("去重开启时记录命中时间", () => {
    const result = recordRandomSelection(new Map(), "a", {
      enabled: true,
      windowHours: 24,
      nowMs: 123,
    });

    expect(result.get("a")).toBe(123);
  });

  it("去重关闭时不新增记录", () => {
    const result = recordRandomSelection(new Map(), "a", {
      enabled: false,
      windowHours: 24,
      nowMs: 123,
    });

    expect(result.has("a")).toBe(false);
  });
});
