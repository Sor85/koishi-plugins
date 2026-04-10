/**
 * reply tool 注入单元测试
 * 覆盖开关判定、字段注册、invoke 与 render 行为
 */

import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../config";
import { extractXmlMemeToolCalls } from "../xml-tool-call";
import {
  hasReplyToolsEnabled,
  registerCharacterReplyTools,
} from "./reply-tools";

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    baseUrl: "http://127.0.0.1:2233",
    timeoutMs: 3000,
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
    autoUseAvatarWhenMinImagesOneAndNoImage: false,
    autoFillOneMissingImageWithAvatar: false,
    autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: false,
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
    ...overrides,
  };
}

describe("hasReplyToolsEnabled", () => {
  it("仅在 XML 开关和注入开关同时开启时返回 true", () => {
    expect(
      hasReplyToolsEnabled(
        createConfig({
          enableMemeXmlTool: true,
          injectMemeXmlToolAsReplyTool: true,
        }),
      ),
    ).toBe(true);

    expect(
      hasReplyToolsEnabled(
        createConfig({
          enableMemeXmlTool: true,
          injectMemeXmlToolAsReplyTool: false,
        }),
      ),
    ).toBe(false);

    expect(
      hasReplyToolsEnabled(
        createConfig({
          enableMemeXmlTool: false,
          injectMemeXmlToolAsReplyTool: true,
        }),
      ),
    ).toBe(false);
  });
});

describe("registerCharacterReplyTools", () => {
  it("注册 meme_generate 字段并可正常注销", () => {
    const fields: any[] = [];
    const disposer = vi.fn();
    const registerReplyToolField = vi.fn((field) => {
      fields.push(field);
      return disposer;
    });

    const cleanup = registerCharacterReplyTools({
      ctx: {
        chatluna_character: { registerReplyToolField },
      } as never,
      config: createConfig({
        enableMemeXmlTool: true,
        injectMemeXmlToolAsReplyTool: true,
      }),
      logger: {
        info: vi.fn(),
      } as never,
      executeToolCall: vi.fn(async () => null),
    });

    expect(registerReplyToolField).toHaveBeenCalledTimes(1);
    expect(fields.map((field) => field.name)).toEqual(["meme_generate"]);
    expect(fields[0].isAvailable?.({}, {}, {})).toBe(true);

    cleanup();
    expect(disposer).toHaveBeenCalledTimes(1);
  });

  it("invoke 会归一化参数并调用执行器", async () => {
    const fields: any[] = [];
    const executeToolCall = vi.fn(async () => ({
      memeKey: "qizhu",
      result: "<img src='ok' />",
    }));
    const session = {
      userId: "10000",
      guildId: "20000",
      send: vi.fn(async () => undefined),
    } as any;

    registerCharacterReplyTools({
      ctx: {
        chatluna_character: {
          registerReplyToolField: (field: any) => {
            fields.push(field);
            return vi.fn();
          },
        },
      } as never,
      config: createConfig({
        enableMemeXmlTool: true,
        injectMemeXmlToolAsReplyTool: true,
      }),
      logger: {
        info: vi.fn(),
      } as never,
      executeToolCall,
    });

    const field = fields[0];
    await field.invoke?.(
      {},
      session,
      [
        {
          key: " qizhu ",
          text: "你好|世界|你好",
          image: [" https://a.png ", "", "https://a.png"],
          at: ["@10001", "10002", "10001"],
        },
      ],
      {},
    );

    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall).toHaveBeenCalledWith(session, {
      key: "qizhu",
      texts: ["你好", "世界"],
      imageSources: ["https://a.png"],
      atUserIds: ["10001", "10002"],
    });
    expect(session.send).toHaveBeenCalledWith("<img src='ok' />");
  });

  it("render 输出可被 XML 解析器识别", () => {
    const fields: any[] = [];

    registerCharacterReplyTools({
      ctx: {
        chatluna_character: {
          registerReplyToolField: (field: any) => {
            fields.push(field);
            return vi.fn();
          },
        },
      } as never,
      config: createConfig({
        enableMemeXmlTool: true,
        injectMemeXmlToolAsReplyTool: true,
      }),
      logger: {
        info: vi.fn(),
      } as never,
      executeToolCall: vi.fn(async () => null),
    });

    const field = fields[0];
    const rendered = field.render?.(
      {},
      {},
      [
        {
          key: "qizhu",
          text: ["你好", "世界"],
          image: ["https://a.png", "https://b.png"],
          at: ["@10001", "10002"],
        },
      ],
      {},
    );

    const renderedText = Array.isArray(rendered) ? rendered.join("\n") : "";
    expect(renderedText).toContain('<meme key="qizhu"');

    const parsed = extractXmlMemeToolCalls(renderedText);
    expect(parsed).toEqual([
      {
        key: "qizhu",
        texts: ["你好", "世界"],
        imageSources: ["https://a.png", "https://b.png"],
        atUserIds: ["10001", "10002"],
      },
    ]);
  });

  it("缺少 chatluna_character 时安全跳过", () => {
    expect(() =>
      registerCharacterReplyTools({
        ctx: {} as never,
        config: createConfig({
          enableMemeXmlTool: true,
          injectMemeXmlToolAsReplyTool: true,
        }),
        logger: {
          info: vi.fn(),
        } as never,
        executeToolCall: vi.fn(async () => null),
      }),
    ).not.toThrow();
  });
});
