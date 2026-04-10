/**
 * 自动补全策略单元测试
 * 覆盖默认文本与头像补图的关键分支
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config";
import { applyAutoFillPolicy } from "./policy";
import type { GenerateImageInput, MemeParamsType } from "../types";

const baseConfig: Config = {
  baseUrl: "http://127.0.0.1:2233",
  timeoutMs: 10000,
  emptyTextAutoFillRules: [
    {
      source: "template-default",
      enabled: true,
      weight: 100,
    },
    {
      source: "user-nickname",
      enabled: false,
      weight: 100,
    },
  ],
  autoUseAvatarWhenMinImagesOneAndNoImage: true,
  autoFillOneMissingImageWithAvatar: true,
  autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
  autoUseGroupNicknameWhenNoDefaultText: false,
  enableQuotedImageTrigger: true,
  enableQuotedTextTrigger: false,
  renderMemeListAsImage: false,
  enableDirectAliasWithoutPrefix: true,
  allowMentionPrefixDirectAliasTrigger: false,
  allowLeadingAtBeforeCommand: false,
  enableDeveloperDebugLog: false,
  enableMemeXmlTool: false,
  injectMemeXmlToolAsReplyTool: false,
  enableRandomDedupeWithinHours: false,
  randomDedupeWindowHours: 24,
  enableRandomKeywordNotice: false,
  randomMemeBucketWeightRules: [
    { category: "text-only", enabled: true, weight: 100 },
    { category: "single-image-only", enabled: true, weight: 100 },
    { category: "two-image-only", enabled: true, weight: 100 },
    { category: "image-and-text", enabled: true, weight: 100 },
    { category: "other", enabled: true, weight: 100 },
  ],
  infoFetchConcurrency: 0,
  initLoadRetryTimes: 3,
  disableErrorReplyToPlatform: false,
  excludeTextOnlyMemes: false,
  excludeSingleImageOnlyMemes: false,
  excludeTwoImageOnlyMemes: false,
  excludeImageAndTextMemes: false,
  excludeOtherMemes: false,
  excludedMemeKeys: [],
};

function makeImage(name: string): GenerateImageInput {
  const seed =
    name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 256;
  return {
    data: new Uint8Array([seed, (seed + 1) % 256, (seed + 2) % 256]),
    filename: `${name}.png`,
    mimeType: "image/png",
  };
}

function makeParams(overrides: Partial<MemeParamsType> = {}): MemeParamsType {
  return {
    min_images: 0,
    max_images: 9,
    min_texts: 0,
    max_texts: 9,
    default_texts: ["默认文案"],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyAutoFillPolicy", () => {
  it("无文本时可按模板默认文字补全文案", () => {
    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams(),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 100,
          },
          {
            source: "user-nickname",
            enabled: false,
            weight: 100,
          },
        ],
      },
      senderName: "小明",
    });

    expect(result.texts).toEqual(["默认文案"]);
  });

  it("无文本时可按用户昵称补全文案", () => {
    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams(),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: false,
            weight: 100,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 100,
          },
        ],
      },
      senderName: "小明",
    });

    expect(result.texts).toEqual(["小明"]);
  });

  it("无文本且两个来源都关闭时不补全文案", () => {
    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams(),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: false,
            weight: 100,
          },
          {
            source: "user-nickname",
            enabled: false,
            weight: 100,
          },
        ],
      },
      senderName: "小明",
    });

    expect(result.texts).toEqual([]);
  });

  it("无文本且双开时按权重随机分配来源", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);

    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams(),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 20,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 80,
          },
        ],
      },
      senderName: "小明",
    });

    expect(result.texts).toEqual(["小明"]);
    randomSpy.mockRestore();
  });

  it("命中昵称来源但昵称为空时回退到模板默认文字", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);

    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams(),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 20,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 80,
          },
        ],
      },
      senderName: "",
    });

    expect(result.texts).toEqual(["默认文案"]);
    randomSpy.mockRestore();
  });

  it("模板至少需要两段文字时不使用昵称来源并回退默认文案", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);

    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams({
        min_texts: 2,
        max_texts: 2,
        default_texts: ["第一段", "第二段"],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 20,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 80,
          },
        ],
      },
      senderName: "小明",
    });

    expect(result.texts).toEqual(["第一段", "第二段"]);
    expect(result.selectedTextSource).toBe("template-default");
    randomSpy.mockRestore();
  });

  it("回退来源权重为 0 时不应参与补文案", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);

    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams({
        min_texts: 2,
        max_texts: 2,
        default_texts: ["第一段", "第二段"],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 0,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 100,
          },
        ],
      },
      senderName: "小明",
    });

    expect(result.texts).toEqual([]);
    expect(result.selectedTextSource).toBeUndefined();
    randomSpy.mockRestore();
  });

  it("模板 max_texts=0 时不应自动补任何文本", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams({
        min_texts: 0,
        max_texts: 0,
        default_texts: ["默认文案"],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 100,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 100,
          },
        ],
      },
      senderName: "小明",
    });

    expect(result.texts).toEqual([]);
    randomSpy.mockRestore();
  });

  it("无默认文案且开启群昵称补文案时可使用群昵称", () => {
    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams({
        min_texts: 1,
        max_texts: 1,
        default_texts: [],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 100,
          },
          {
            source: "user-nickname",
            enabled: false,
            weight: 100,
          },
        ],
        autoUseGroupNicknameWhenNoDefaultText: true,
      },
      senderName: "用户昵称",
      groupNicknameText: "群昵称",
    });

    expect(result.texts).toEqual(["群昵称"]);
    expect(result.selectedTextSource).toBe("group-nickname");
  });

  it("无默认文案且群昵称不可用时回退用户昵称来源", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);

    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams({
        min_texts: 1,
        max_texts: 1,
        default_texts: [],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 20,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 80,
          },
        ],
        autoUseGroupNicknameWhenNoDefaultText: true,
      },
      senderName: "用户昵称",
      groupNicknameText: "",
    });

    expect(result.texts).toEqual(["用户昵称"]);
    expect(result.selectedTextSource).toBe("user-nickname");
    randomSpy.mockRestore();
  });

  it("指定 preferredTextSource 时应优先使用指定来源", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);

    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams({
        min_texts: 1,
        max_texts: 1,
        default_texts: ["默认文案"],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 20,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 80,
          },
        ],
      },
      senderName: "用户昵称",
      preferredTextSource: "template-default",
    });

    expect(result.texts).toEqual(["默认文案"]);
    expect(result.selectedTextSource).toBe("template-default");
    randomSpy.mockRestore();
  });

  it("指定 preferredTextSource 命中失败时应回退到可用规则来源", () => {
    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams({
        min_texts: 1,
        max_texts: 1,
        default_texts: ["默认文案"],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 100,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 100,
          },
        ],
      },
      senderName: "",
      preferredTextSource: "user-nickname",
    });

    expect(result.texts).toEqual(["默认文案"]);
    expect(result.selectedTextSource).toBe("template-default");
  });

  it("指定 preferredTextSource 命中失败且规则不可用时可回退群昵称", () => {
    const result = applyAutoFillPolicy({
      texts: [],
      images: [],
      params: makeParams({
        min_texts: 1,
        max_texts: 1,
        default_texts: [],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 100,
          },
          {
            source: "user-nickname",
            enabled: true,
            weight: 100,
          },
        ],
        autoUseGroupNicknameWhenNoDefaultText: true,
      },
      senderName: "",
      groupNicknameText: "群昵称",
      preferredTextSource: "template-default",
    });

    expect(result.texts).toEqual(["群昵称"]);
    expect(result.selectedTextSource).toBe("group-nickname");
  });

  it("用户已提供文本且满足最小数量时不应被群昵称补文案覆盖", () => {
    const result = applyAutoFillPolicy({
      texts: ["123"],
      images: [],
      params: makeParams({
        min_texts: 1,
        max_texts: 1,
        default_texts: [],
      }),
      config: {
        ...baseConfig,
        autoUseGroupNicknameWhenNoDefaultText: true,
      },
      senderName: "用户昵称",
      groupNicknameText: "群昵称",
    });

    expect(result.texts).toEqual(["123"]);
    expect(result.selectedTextSource).toBeUndefined();
  });

  it("用户已提供文本但数量不足时应使用已开启兜底补齐", () => {
    const result = applyAutoFillPolicy({
      texts: ["用户输入"],
      images: [],
      params: makeParams({
        min_texts: 2,
        max_texts: 2,
        default_texts: ["默认1", "默认2"],
      }),
      config: {
        ...baseConfig,
        emptyTextAutoFillRules: [
          {
            source: "template-default",
            enabled: true,
            weight: 100,
          },
          {
            source: "user-nickname",
            enabled: false,
            weight: 100,
          },
        ],
      },
      senderName: "用户昵称",
    });

    expect(result.texts).toEqual(["用户输入", "默认1"]);
    expect(result.selectedTextSource).toBe("template-default");
  });

  it("min_images=1 且 max_images=2 且无图时若存在两个被@头像应优先补两张被@头像", () => {
    const targetAvatar = makeImage("target-avatar");
    const secondaryTargetAvatar = makeImage("secondary-target-avatar");
    const senderAvatar = makeImage("sender-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 1, max_images: 2 }),
      config: {
        ...baseConfig,
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      mentionedAvatarImages: [targetAvatar, secondaryTargetAvatar],
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toBe(targetAvatar);
    expect(result.images[1]).toBe(secondaryTargetAvatar);
  });

  it("min_images=1 且 max_images=3 且无图时若存在三个被@头像应按顺序补满三张", () => {
    const senderAvatar = makeImage("sender-avatar");
    const targetAvatar = makeImage("target-avatar");
    const secondaryTargetAvatar = makeImage("secondary-target-avatar");
    const thirdTargetAvatar = makeImage("third-target-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 1, max_images: 3 }),
      config: {
        ...baseConfig,
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      mentionedAvatarImages: [
        targetAvatar,
        secondaryTargetAvatar,
        thirdTargetAvatar,
      ],
    });

    expect(result.images).toHaveLength(3);
    expect(result.images).toEqual([
      targetAvatar,
      secondaryTargetAvatar,
      thirdTargetAvatar,
    ]);
  });

  it("min_images=1 且 max_images>2 且无图时若存在两个被@头像应优先补两张被@头像", () => {
    const targetAvatar = makeImage("target-avatar");
    const secondaryTargetAvatar = makeImage("secondary-target-avatar");
    const senderAvatar = makeImage("sender-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 1, max_images: 9 }),
      config: {
        ...baseConfig,
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      mentionedAvatarImages: [targetAvatar, secondaryTargetAvatar],
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toBe(targetAvatar);
    expect(result.images[1]).toBe(secondaryTargetAvatar);
  });

  it("min_images=2 且 max_images=3 且无图时若存在三个被@头像应按顺序补满三张", () => {
    const senderAvatar = makeImage("sender-avatar");
    const botAvatar = makeImage("bot-avatar");
    const targetAvatar = makeImage("target-avatar");
    const secondaryTargetAvatar = makeImage("secondary-target-avatar");
    const thirdTargetAvatar = makeImage("third-target-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 2, max_images: 3 }),
      config: {
        ...baseConfig,
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      mentionedAvatarImages: [
        targetAvatar,
        secondaryTargetAvatar,
        thirdTargetAvatar,
      ],
      botAvatarImage: botAvatar,
    });

    expect(result.images).toHaveLength(3);
    expect(result.images).toEqual([
      targetAvatar,
      secondaryTargetAvatar,
      thirdTargetAvatar,
    ]);
  });

  it("min_images=2 且 max_images=2 且无图时若存在三个被@头像仅使用前两张", () => {
    const senderAvatar = makeImage("sender-avatar");
    const botAvatar = makeImage("bot-avatar");
    const targetAvatar = makeImage("target-avatar");
    const secondaryTargetAvatar = makeImage("secondary-target-avatar");
    const thirdTargetAvatar = makeImage("third-target-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 2, max_images: 2 }),
      config: {
        ...baseConfig,
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      mentionedAvatarImages: [
        targetAvatar,
        secondaryTargetAvatar,
        thirdTargetAvatar,
      ],
      botAvatarImage: botAvatar,
    });

    expect(result.images).toHaveLength(2);
    expect(result.images).toEqual([targetAvatar, secondaryTargetAvatar]);
  });

  it("min_images=2 且仅有一个被@头像时仍回退补被@与 bot 头像", () => {
    const targetAvatar = makeImage("target-avatar");
    const botAvatar = makeImage("bot-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 2 }),
      config: {
        ...baseConfig,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      },
      mentionedAvatarImages: [targetAvatar],
      botAvatarImage: botAvatar,
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toBe(targetAvatar);
    expect(result.images[1]).toBe(botAvatar);
  });

  it("min_images=1 且无图且存在被@头像时优先使用被@头像", () => {
    const senderAvatar = makeImage("sender-avatar");
    const targetAvatar = makeImage("target-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 1 }),
      config: {
        ...baseConfig,
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      mentionedAvatarImages: [targetAvatar],
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toBe(targetAvatar);
  });

  it("已有图片且仅差 1 张时可用头像补齐", () => {
    const avatar = makeImage("avatar");
    const first = makeImage("first");
    const second = makeImage("second");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [first, second],
      params: makeParams({ min_images: 3 }),
      config: {
        ...baseConfig,
        autoFillOneMissingImageWithAvatar: true,
      },
      senderAvatarImage: avatar,
    });

    expect(result.images).toHaveLength(3);
    expect(result.images[2]).toBe(avatar);
  });

  it("已有图片但缺口大于 1 时不补头像", () => {
    const avatar = makeImage("avatar");
    const first = makeImage("first");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [first],
      params: makeParams({ min_images: 3 }),
      config: {
        ...baseConfig,
        autoFillOneMissingImageWithAvatar: true,
      },
      senderAvatarImage: avatar,
    });

    expect(result.images).toHaveLength(1);
  });

  it("min_images=2 且无图时若存在两个被@头像优先使用被@1与被@2", () => {
    const senderAvatar = makeImage("sender-avatar");
    const targetAvatar = makeImage("target-avatar");
    const secondaryTargetAvatar = makeImage("secondary-target-avatar");
    const botAvatar = makeImage("bot-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 2 }),
      config: {
        ...baseConfig,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      mentionedAvatarImages: [targetAvatar, secondaryTargetAvatar],
      botAvatarImage: botAvatar,
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toBe(targetAvatar);
    expect(result.images[1]).toBe(secondaryTargetAvatar);
  });

  it("min_images=2 且被@头像与发送者头像相同且存在 bot 时应补发送者与 bot", () => {
    const senderAvatar = makeImage("sender-avatar");
    const targetAvatar: GenerateImageInput = {
      data: new Uint8Array(senderAvatar.data),
      filename: "target-avatar.png",
      mimeType: senderAvatar.mimeType,
    };
    const botAvatar = makeImage("bot-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 2 }),
      config: {
        ...baseConfig,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      mentionedAvatarImages: [targetAvatar],
      botAvatarImage: botAvatar,
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toBe(senderAvatar);
    expect(result.images[1]).toBe(botAvatar);
  });

  it("min_images=2 且无图时可自动补发送者与 bot 头像", () => {
    const senderAvatar = makeImage("sender-avatar");
    const botAvatar = makeImage("bot-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 2 }),
      config: {
        ...baseConfig,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
      botAvatarImage: botAvatar,
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toBe(senderAvatar);
    expect(result.images[1]).toBe(botAvatar);
  });

  it("min_images=2 且无发送者头像时可回退补被@与 bot 头像", () => {
    const targetAvatar = makeImage("target-avatar");
    const botAvatar = makeImage("bot-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 2 }),
      config: {
        ...baseConfig,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      },
      mentionedAvatarImages: [targetAvatar],
      botAvatarImage: botAvatar,
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toBe(targetAvatar);
    expect(result.images[1]).toBe(botAvatar);
  });

  it("min_images=2 且缺少 bot 头像时不自动补图", () => {
    const senderAvatar = makeImage("sender-avatar");

    const result = applyAutoFillPolicy({
      texts: ["a"],
      images: [],
      params: makeParams({ min_images: 2 }),
      config: {
        ...baseConfig,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      },
      senderAvatarImage: senderAvatar,
    });

    expect(result.images).toHaveLength(0);
  });
});
