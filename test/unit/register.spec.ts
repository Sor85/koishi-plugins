/**
 * 命令注册链路单元测试
 * 覆盖直触发中文别名在“别名必须在前”语义下的触发行为
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("koishi", () => ({
  h: {
    image: vi.fn((buffer: Buffer, mimeType: string) => ({ buffer, mimeType })),
  },
}));

const keyResolverMocks = vi.hoisted(() => ({
  listDirectAliases: vi.fn(async () => ({
    entries: [{ alias: "骑猪", keys: ["qizhu"] }],
    hasInfoFailure: false,
    failedInfoKeys: 0,
    totalKeys: 1,
  })),
}));

vi.mock("../../src/command/key-resolver", () => ({
  createMemeKeyResolver: vi.fn(() => async (key: string) => key),
  listDirectAliases: keyResolverMocks.listDirectAliases,
  shouldRegisterDirectAlias: vi.fn(() => true),
}));

const avatarMocks = vi.hoisted(() => ({
  getSenderAvatarImage: vi.fn(async () => undefined),
  getMentionedTargetAvatarImage: vi.fn(async () => undefined),
  getMentionedSecondaryAvatarImage: vi.fn(async () => undefined),
  getBotAvatarImage: vi.fn(async () => undefined),
  getMentionedTargetDisplayName: vi.fn(async () => undefined),
  getSenderDisplayName: vi.fn(() => undefined),
  resolveAvatarImageByUserId: vi.fn(async () => undefined),
  resolveDisplayNameByUserId: vi.fn(async () => undefined),
}));

vi.mock("../../src/utils/avatar", () => ({
  getSenderAvatarImage: avatarMocks.getSenderAvatarImage,
  getMentionedTargetAvatarImage: avatarMocks.getMentionedTargetAvatarImage,
  getMentionedSecondaryAvatarImage:
    avatarMocks.getMentionedSecondaryAvatarImage,
  getBotAvatarImage: avatarMocks.getBotAvatarImage,
  getMentionedTargetDisplayName: avatarMocks.getMentionedTargetDisplayName,
  getSenderDisplayName: avatarMocks.getSenderDisplayName,
  resolveAvatarImageByUserId: avatarMocks.resolveAvatarImageByUserId,
  resolveDisplayNameByUserId: avatarMocks.resolveDisplayNameByUserId,
}));

const generateMock = vi.fn(async () => ({
  buffer: new Uint8Array([1, 2, 3]).buffer,
  mimeType: "image/png",
}));

const getPreviewMock = vi.fn(async () => ({
  buffer: new Uint8Array([1, 2, 3]).buffer,
  mimeType: "image/png",
}));

const getInfoMock = vi.fn<(key: string) => Promise<any>>(async () => ({
  key: "qizhu",
  params_type: {
    min_images: 0,
    max_images: 0,
    min_texts: 0,
    max_texts: 1,
    default_texts: [],
  },
  keywords: [],
  shortcuts: [],
  tags: [],
  date_created: "2026-01-01T00:00:00",
  date_modified: "2026-01-01T00:00:00",
}));

const getKeysMock = vi.fn<() => Promise<string[]>>(async () => []);

const imageDownloadMocks = vi.hoisted(() => ({
  downloadImage: vi.fn(async () => ({
    data: new Uint8Array([9, 9, 9]),
    filename: "xml-image.png",
    mimeType: "image/png",
  })),
}));

vi.mock("../../src/utils/image", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils/image")>(
    "../../src/utils/image",
  );
  return {
    ...actual,
    downloadImage: imageDownloadMocks.downloadImage,
  };
});

vi.mock("../../src/infra/client", () => ({
  MemeBackendClient: vi.fn().mockImplementation(() => ({
    getKeys: getKeysMock,
    getInfo: getInfoMock,
    getPreview: getPreviewMock,
    generate: generateMock,
  })),
}));

import { registerCommands } from "../../src/command/register";
import type { Config } from "../../src/config";

interface MatchOptions {
  appel?: boolean;
  i18n?: boolean;
  fuzzy?: boolean;
}

type MatchHandler = (session: unknown) => Promise<unknown>;

function createMockContext() {
  const readyHandlers: Array<() => void> = [];
  const disposeHandlers: Array<() => void> = [];
  const runDisposeHandlers = () => {
    disposeHandlers.forEach((handler) => handler());
  };
  const matchHandlers: MatchHandler[] = [];
  const matchDisposers: Array<ReturnType<typeof vi.fn>> = [];
  const middlewareHandlers: Array<(...args: any[]) => Promise<unknown>> = [];
  const matchCalls: Array<{ pattern: string | RegExp; options: MatchOptions }> =
    [];
  const loggerInfo = vi.fn();
  const loggerWarn = vi.fn();
  const rawCollectors: Array<(session: unknown) => Promise<void>> = [];
  const characterLogger = {
    debug: vi.fn(),
  };
  const intervalDisposers: Array<ReturnType<typeof vi.fn>> = [];
  const timeoutDisposers: Array<ReturnType<typeof vi.fn>> = [];

  const ctx: any = {
    command: vi.fn(() => ({
      action: vi.fn(() => ({ action: vi.fn() })),
    })),
    logger: vi.fn(() => ({ info: loggerInfo, warn: loggerWarn })),
    $commander: {
      get: vi.fn(() => undefined),
    },
    chatluna_character: {
      collect: vi.fn((callback: (session: unknown) => Promise<void>) => {
        rawCollectors.push(callback);
      }),
      logger: characterLogger,
    },
    $processor: {
      match: vi.fn(
        (
          pattern: string | RegExp,
          handler: MatchHandler,
          options: MatchOptions,
        ) => {
          matchHandlers.push(handler);
          matchCalls.push({ pattern, options });
          const disposer = vi.fn();
          matchDisposers.push(disposer);
          return disposer;
        },
      ),
    },
    middleware: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
      middlewareHandlers.push(handler);
      return vi.fn();
    }),
    setInterval: vi.fn(() => {
      const disposer = vi.fn();
      intervalDisposers.push(disposer);
      return disposer;
    }),
    setTimeout: vi.fn((handler: () => void) => {
      handler();
      const disposer = vi.fn();
      timeoutDisposers.push(disposer);
      return disposer;
    }),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === "ready") readyHandlers.push(handler);
      if (event === "dispose") disposeHandlers.push(handler);
    }),
  };

  return {
    ctx,
    readyHandlers,
    disposeHandlers,
    runDisposeHandlers,
    matchHandlers,
    matchDisposers,
    middlewareHandlers,
    matchCalls,
    loggerInfo,
    loggerWarn,
    rawCollectors,
    characterLogger,
    timeoutDisposers,
    intervalDisposers,
  };
}

function createBaseConfig(overrides: Partial<Config> = {}): Config {
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
    renderMemeListAsImage: false,
    enableDirectAliasWithoutPrefix: true,
    allowMentionPrefixDirectAliasTrigger: false,
    disallowLeadingAtBeforeCommand: true,
    enableMemeXmlTool: false,
    enableRandomDedupeWithinHours: false,
    randomDedupeWindowHours: 24,
    enableRandomKeywordNotice: false,
    enablePokeTriggerRandom: false,
    pokeTriggerCooldownSeconds: 0,
    enableInfoFetchConcurrencyLimit: false,
    infoFetchConcurrency: 10,
    initLoadRetryTimes: 3,
    disableErrorReplyToPlatform: false,
    excludeTextOnlyMemes: false,
    excludeSingleImageOnlyMemes: false,
    excludeTwoImageOnlyMemes: false,
    excludeImageAndTextMemes: false,
    excludedMemeKeys: [],
    ...overrides,
  };
}

function createSession(content: string, elements: any[] = []) {
  return {
    send: vi.fn(async () => undefined),
    execute: vi.fn(async () => {
      throw new Error("cannot find command meme.preview");
    }),
    stripped: {
      content,
      hasAt: elements.length > 0,
      atSelf: false,
      appel: false,
    },
    elements,
    quote: undefined,
    author: undefined,
    event: { user: {} },
    bot: {
      user: {},
      getLogin: vi.fn(async () => ({ user: {} })),
    },
  };
}

function resetCommonMocks() {
  avatarMocks.getSenderAvatarImage.mockReset();
  avatarMocks.getMentionedTargetAvatarImage.mockReset();
  avatarMocks.getMentionedSecondaryAvatarImage.mockReset();
  avatarMocks.getBotAvatarImage.mockReset();
  avatarMocks.getMentionedTargetDisplayName.mockReset();
  avatarMocks.getSenderDisplayName.mockReset();
  avatarMocks.resolveAvatarImageByUserId.mockReset();
  avatarMocks.resolveDisplayNameByUserId.mockReset();
  avatarMocks.getSenderAvatarImage.mockResolvedValue(undefined);
  avatarMocks.getMentionedTargetAvatarImage.mockResolvedValue(undefined);
  avatarMocks.getMentionedSecondaryAvatarImage.mockResolvedValue(undefined);
  avatarMocks.getBotAvatarImage.mockResolvedValue(undefined);
  avatarMocks.getMentionedTargetDisplayName.mockResolvedValue(undefined);
  avatarMocks.getSenderDisplayName.mockReturnValue(undefined);
  avatarMocks.resolveAvatarImageByUserId.mockResolvedValue(undefined);
  avatarMocks.resolveDisplayNameByUserId.mockResolvedValue(undefined);

  generateMock.mockReset();
  generateMock.mockResolvedValue({
    buffer: new Uint8Array([1, 2, 3]).buffer,
    mimeType: "image/png",
  });

  getPreviewMock.mockReset();
  getPreviewMock.mockResolvedValue({
    buffer: new Uint8Array([1, 2, 3]).buffer,
    mimeType: "image/png",
  });

  getInfoMock.mockReset();
  getInfoMock.mockResolvedValue({
    key: "qizhu",
    params_type: {
      min_images: 0,
      max_images: 0,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
    },
    keywords: [],
    shortcuts: [],
    tags: [],
    date_created: "2026-01-01T00:00:00",
    date_modified: "2026-01-01T00:00:00",
  });

  getKeysMock.mockReset();
  getKeysMock.mockResolvedValue([]);
}

async function flushReadyHandlers(handlers: Array<() => void>) {
  handlers.forEach((handler) => handler());
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function flushAsyncCycles(cycles = 50) {
  for (let i = 0; i < cycles; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  keyResolverMocks.listDirectAliases.mockReset();
  keyResolverMocks.listDirectAliases.mockResolvedValue({
    entries: [{ alias: "骑猪", keys: ["qizhu"] }],
    hasInfoFailure: false,
    failedInfoKeys: 0,
    totalKeys: 1,
  });
  resetCommonMocks();
});

describe("registerCommands", () => {
  it("启用 XML 工具后可用 key 触发生成", async () => {
    const { ctx, readyHandlers, rawCollectors, characterLogger } =
      createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    expect(rawCollectors).toHaveLength(1);
    expect(
      (characterLogger.debug as unknown as Record<string, boolean>)[
        "__chatlunaMemeGeneratorRawInterceptor"
      ],
    ).toBe(true);

    const session = createSession("ignored");
    await rawCollectors[0](session);

    characterLogger.debug(
      '<meme key="qizhu" text="你好|世界" image"https://a.png|https://b.jpg" at="10001|10002"/>',
    );
    characterLogger.debug(
      'model response: <meme key="qizhu" text="你好|世界" image"https://a.png|https://b.jpg" at="10001|10002"/>',
    );
    await flushAsyncCycles();

    expect(generateMock).toHaveBeenCalledWith(
      "qizhu",
      expect.any(Array),
      ["你好", "世界"],
      {},
    );
  });

  it("XML 仅传 key 与 at 时应触发生成", async () => {
    const targetAvatar = {
      data: new Uint8Array([4]),
      filename: "xml-target.png",
      mimeType: "image/png",
    };
    const secondaryTargetAvatar = {
      data: new Uint8Array([5]),
      filename: "xml-target-2.png",
      mimeType: "image/png",
    };

    avatarMocks.resolveAvatarImageByUserId
      .mockResolvedValueOnce(targetAvatar)
      .mockResolvedValueOnce(secondaryTargetAvatar);

    getInfoMock.mockResolvedValue({
      key: "can_can_need",
      params_type: {
        min_images: 2,
        max_images: 2,
        min_texts: 0,
        max_texts: 1,
        default_texts: [],
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    const { ctx, readyHandlers, rawCollectors, characterLogger } =
      createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    const session = createSession("ignored");
    await rawCollectors[0](session);

    characterLogger.debug(
      'model response: <meme key="can_can_need" at="1291774425|1018193431"/>',
    );
    await flushAsyncCycles();

    expect(generateMock).toHaveBeenCalledWith(
      "can_can_need",
      [targetAvatar, secondaryTargetAvatar],
      [],
      {},
    );
  });

  it("XML 单个 at 且模板需两图时应补 bot 头像", async () => {
    const targetAvatar = {
      data: new Uint8Array([6]),
      filename: "xml-target.png",
      mimeType: "image/png",
    };
    const botAvatar = {
      data: new Uint8Array([7]),
      filename: "xml-bot.png",
      mimeType: "image/png",
    };

    avatarMocks.resolveAvatarImageByUserId.mockResolvedValueOnce(targetAvatar);
    avatarMocks.getBotAvatarImage.mockResolvedValueOnce(botAvatar);

    getInfoMock.mockResolvedValue({
      key: "can_can_need",
      params_type: {
        min_images: 2,
        max_images: 2,
        min_texts: 0,
        max_texts: 1,
        default_texts: [],
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    const { ctx, readyHandlers, rawCollectors, characterLogger } =
      createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    const session = createSession("ignored");
    await rawCollectors[0](session);

    characterLogger.debug(
      'model response: <meme key="can_can_need" at="1291774425"/>',
    );
    await flushAsyncCycles();

    expect(generateMock).toHaveBeenCalledWith(
      "can_can_need",
      [targetAvatar, botAvatar],
      [],
      {},
    );
  });

  it("命令映射缺失 meme.preview 时直触发中文别名仍会直接触发 meme 生成", async () => {
    const { ctx, readyHandlers, matchHandlers, matchCalls } =
      createMockContext();

    registerCommands(ctx, createBaseConfig());
    await flushReadyHandlers(readyHandlers);

    expect(matchHandlers).toHaveLength(1);
    expect(matchCalls).toHaveLength(1);
    expect(matchCalls[0].options.fuzzy).toBe(false);

    const session = createSession("骑猪");
    await expect(matchHandlers[0](session)).resolves.toBeTruthy();
    expect(session.execute).not.toHaveBeenCalled();
    expect(generateMock).toHaveBeenCalled();
  });
  it("直触发中文别名生成失败时返回统一错误文案", async () => {
    generateMock.mockRejectedValue(new Error("boom"));
    const { ctx, readyHandlers, matchHandlers } = createMockContext();

    registerCommands(ctx, createBaseConfig());
    await flushReadyHandlers(readyHandlers);

    expect(matchHandlers).toHaveLength(1);

    const session = createSession("骑猪");
    const result = await matchHandlers[0](session);
    expect(String(result)).toContain("后端不可用或超时：boom");
    expect(session.execute).not.toHaveBeenCalled();
  });

  it("开启禁用错误提示后直触发失败时不回复平台并写日志", async () => {
    generateMock.mockRejectedValue(new Error("boom"));
    const { ctx, readyHandlers, matchHandlers, loggerWarn } =
      createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({ disableErrorReplyToPlatform: true }),
    );
    await flushReadyHandlers(readyHandlers);

    const session = createSession("骑猪");
    const result = await matchHandlers[0](session);

    expect(result).toBe("");
    expect(loggerWarn).toHaveBeenCalledWith(
      "meme.generate failed: %s",
      expect.stringContaining("boom"),
    );
    expect(session.execute).not.toHaveBeenCalled();
  });

  it("直触发中文别名在 @ 后携带文本时应保留用户文本", async () => {
    avatarMocks.getMentionedTargetDisplayName.mockResolvedValue("被@群昵称");
    avatarMocks.getSenderDisplayName.mockReturnValue("发送者群昵称");

    getInfoMock.mockResolvedValue({
      key: "qizhu",
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 2,
        default_texts: [],
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    const { ctx, readyHandlers, matchHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
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
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const session = createSession("骑猪 @10002 你好", [
      { type: "at", attrs: { id: "10002", name: "被@群昵称" }, children: [] },
    ]);

    await expect(matchHandlers[0](session)).resolves.toBeTruthy();
    expect(generateMock).toHaveBeenCalledWith("qizhu", [], ["你好"], {});
  });

  it("模板需两图且输入两个@用户时应优先使用两个被@头像", async () => {
    const senderAvatar = {
      data: new Uint8Array([1]),
      filename: "sender.png",
      mimeType: "image/png",
    };
    const targetAvatar = {
      data: new Uint8Array([2]),
      filename: "target.png",
      mimeType: "image/png",
    };
    const secondaryTargetAvatar = {
      data: new Uint8Array([3]),
      filename: "target2.png",
      mimeType: "image/png",
    };

    avatarMocks.getSenderAvatarImage.mockResolvedValue(senderAvatar);
    avatarMocks.getMentionedTargetAvatarImage.mockResolvedValue(targetAvatar);
    avatarMocks.getMentionedSecondaryAvatarImage.mockResolvedValue(
      secondaryTargetAvatar,
    );

    getInfoMock.mockResolvedValue({
      key: "qizhu",
      params_type: {
        min_images: 2,
        max_images: 2,
        min_texts: 0,
        max_texts: 1,
        default_texts: [],
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    const { ctx, readyHandlers, matchHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowMentionPrefixDirectAliasTrigger: true,
        autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const session = createSession("骑猪 @10002 @10003", [
      { type: "at", attrs: { id: "10002" }, children: [] },
      { type: "at", attrs: { id: "10003" }, children: [] },
    ]);

    await expect(matchHandlers[0](session)).resolves.toBeTruthy();
    expect(generateMock).toHaveBeenCalledWith(
      "qizhu",
      [targetAvatar, secondaryTargetAvatar],
      [],
      {},
    );
  });

  it("开启前置@拦截时应拒绝 @用户 meme 前置参数格式", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    registerCommands(
      ctx,
      createBaseConfig({
        disallowLeadingAtBeforeCommand: true,
      }),
    );

    const generateAction = commandActions.get("meme <key:string> [...texts]");
    expect(generateAction).toBeDefined();

    const session = createSession('<at id="10001"/> meme can_can_need', [
      { type: "at", attrs: { id: "10001", name: "user1" }, children: [] },
    ]);

    const result = await generateAction!({ session }, "can_can_need");

    expect(String(result)).toContain("不支持前置@参数");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("关闭前置@拦截时应允许 @用户 meme 前置参数格式", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    registerCommands(
      ctx,
      createBaseConfig({
        disallowLeadingAtBeforeCommand: false,
      }),
    );

    const generateAction = commandActions.get("meme <key:string> [...texts]");
    expect(generateAction).toBeDefined();

    const session = createSession('<at id="10001"/> meme can_can_need', [
      { type: "at", attrs: { id: "10001", name: "user1" }, children: [] },
    ]);

    await generateAction!({ session }, "can_can_need");

    expect(generateMock).toHaveBeenCalled();
  });

  it("默认关闭贴合触发时不应处理骑猪123", async () => {
    const { ctx, readyHandlers, matchHandlers, matchCalls } =
      createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({ allowMentionPrefixDirectAliasTrigger: false }),
    );
    await flushReadyHandlers(readyHandlers);

    expect(matchHandlers).toHaveLength(1);
    expect(matchCalls[0].pattern).toBeInstanceOf(RegExp);
    const pattern = matchCalls[0].pattern as RegExp;
    expect(pattern.test("骑猪123")).toBe(false);
    expect(pattern.test("骑猪 123")).toBe(true);

    const session = createSession("骑猪123");
    const result = await matchHandlers[0](session);
    expect(result).toBe("");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("开启贴合触发后允许骑猪123，并且不注册前置@中间件", async () => {
    const {
      ctx,
      readyHandlers,
      matchHandlers,
      matchCalls,
      middlewareHandlers,
    } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({ allowMentionPrefixDirectAliasTrigger: true }),
    );
    await flushReadyHandlers(readyHandlers);

    expect(middlewareHandlers).toHaveLength(0);
    expect(matchHandlers).toHaveLength(1);
    expect(matchCalls[0].pattern).toBeInstanceOf(RegExp);
    const pattern = matchCalls[0].pattern as RegExp;
    expect(pattern.test("骑猪123")).toBe(true);
    expect(pattern.test("骑猪 @10003 你好")).toBe(true);

    const session = createSession("骑猪123");
    await expect(matchHandlers[0](session)).resolves.toBeTruthy();
    expect(generateMock).toHaveBeenCalledWith("qizhu", [], ["123"], {});
  });

  it("开启贴合触发后允许骑猪@10003你好并正确剔除 @ 提及", async () => {
    const { ctx, readyHandlers, matchHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({ allowMentionPrefixDirectAliasTrigger: true }),
    );
    await flushReadyHandlers(readyHandlers);

    const session = createSession("骑猪@10003你好", [
      { type: "at", attrs: { id: "10003", name: "用户A" }, children: [] },
    ]);

    await expect(matchHandlers[0](session)).resolves.toBeTruthy();
    expect(generateMock).toHaveBeenCalledWith("qizhu", [], ["你好"], {});
  });

  it("开启贴合触发后别名不在开头时不应触发", async () => {
    const { ctx, readyHandlers, matchHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({ allowMentionPrefixDirectAliasTrigger: true }),
    );
    await flushReadyHandlers(readyHandlers);

    const session = createSession("你好骑猪123", [
      { type: "at", attrs: { id: "10002" }, children: [] },
    ]);

    const result = await matchHandlers[0](session);
    expect(result).toBe("");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("别名重叠时应优先命中更长别名", async () => {
    keyResolverMocks.listDirectAliases.mockResolvedValue({
      entries: [
        { alias: "骑猪", keys: ["short"] },
        { alias: "骑猪1", keys: ["long"] },
      ],
      hasInfoFailure: false,
      failedInfoKeys: 0,
      totalKeys: 2,
    });

    const { ctx, readyHandlers, matchHandlers, matchCalls } =
      createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({ allowMentionPrefixDirectAliasTrigger: true }),
    );
    await flushReadyHandlers(readyHandlers);

    expect(matchHandlers).toHaveLength(2);
    expect(matchCalls[0].pattern).toBeInstanceOf(RegExp);
    expect(String(matchCalls[0].pattern)).toContain("骑猪1");

    const session = createSession("骑猪123", [
      { type: "at", attrs: { id: "10002" }, children: [] },
    ]);

    await expect(matchHandlers[0](session)).resolves.toBeTruthy();
    expect(generateMock).toHaveBeenCalledWith("long", [], ["23"], {});
  });

  it("同名别名在启动时打印冲突并在触发时随机命中", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      keyResolverMocks.listDirectAliases.mockResolvedValue({
        entries: [{ alias: "骑猪", keys: ["qizhu", "hug"] }],
        hasInfoFailure: false,
        failedInfoKeys: 0,
        totalKeys: 2,
      });

      const { ctx, readyHandlers, matchHandlers, loggerWarn } =
        createMockContext();

      registerCommands(ctx, createBaseConfig());
      await flushReadyHandlers(readyHandlers);

      expect(loggerWarn).toHaveBeenCalledWith(
        "detected duplicate direct alias: %s -> %s",
        "骑猪",
        "qizhu, hug",
      );

      const session = createSession("骑猪");
      await expect(matchHandlers[0](session)).resolves.toBeTruthy();
      expect(generateMock).toHaveBeenCalledWith("hug", [], [], {});
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("重试后别名被移除时应回收旧 matcher", async () => {
    vi.useFakeTimers();
    keyResolverMocks.listDirectAliases
      .mockResolvedValueOnce({
        entries: [{ alias: "骑猪", keys: ["qizhu"] }],
        hasInfoFailure: true,
        failedInfoKeys: 1,
        totalKeys: 1,
      })
      .mockResolvedValueOnce({
        entries: [],
        hasInfoFailure: false,
        failedInfoKeys: 0,
        totalKeys: 1,
      });

    try {
      const { ctx, readyHandlers, matchHandlers, matchDisposers, loggerInfo } =
        createMockContext();

      registerCommands(ctx, createBaseConfig());
      await flushReadyHandlers(readyHandlers);

      expect(matchHandlers).toHaveLength(1);
      expect(matchDisposers).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(3000);
      await flushAsyncCycles();

      expect(matchDisposers[0]).toHaveBeenCalledTimes(1);
      expect(loggerInfo).toHaveBeenCalledWith(
        "registered direct aliases: %d (new: %d, updated: %d, removed: %d, duplicated aliases: %d, failed info keys: %d/%d)",
        0,
        0,
        0,
        1,
        0,
        0,
        1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("重试后同名别名候选变更时应替换 matcher", async () => {
    vi.useFakeTimers();
    keyResolverMocks.listDirectAliases
      .mockResolvedValueOnce({
        entries: [{ alias: "骑猪", keys: ["qizhu"] }],
        hasInfoFailure: true,
        failedInfoKeys: 1,
        totalKeys: 1,
      })
      .mockResolvedValueOnce({
        entries: [{ alias: "骑猪", keys: ["hug"] }],
        hasInfoFailure: false,
        failedInfoKeys: 0,
        totalKeys: 1,
      });

    try {
      const { ctx, readyHandlers, matchHandlers, matchDisposers, loggerInfo } =
        createMockContext();

      registerCommands(ctx, createBaseConfig());
      await flushReadyHandlers(readyHandlers);

      expect(matchHandlers).toHaveLength(1);
      expect(matchDisposers).toHaveLength(1);

      const firstSession = createSession("骑猪");
      await expect(matchHandlers[0](firstSession)).resolves.toBeTruthy();
      expect(generateMock).toHaveBeenCalledWith("qizhu", [], [], {});

      generateMock.mockClear();

      await vi.advanceTimersByTimeAsync(3000);
      await flushAsyncCycles();

      expect(matchHandlers).toHaveLength(2);
      expect(matchDisposers).toHaveLength(2);
      expect(matchDisposers[0]).toHaveBeenCalledTimes(1);

      const secondSession = createSession("骑猪");
      await expect(matchHandlers[1](secondSession)).resolves.toBeTruthy();
      expect(generateMock).toHaveBeenCalledWith("hug", [], [], {});

      expect(loggerInfo).toHaveBeenCalledWith(
        "registered direct aliases: %d (new: %d, updated: %d, removed: %d, duplicated aliases: %d, failed info keys: %d/%d)",
        1,
        0,
        1,
        0,
        0,
        0,
        1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("插件初始化载入表情失败后重试次数应受配置限制（直连分支）", async () => {
    vi.useFakeTimers();
    keyResolverMocks.listDirectAliases
      .mockResolvedValueOnce({
        entries: [{ alias: "骑猪", keys: ["qizhu"] }],
        hasInfoFailure: true,
        failedInfoKeys: 1,
        totalKeys: 1,
      })
      .mockResolvedValueOnce({
        entries: [{ alias: "骑猪", keys: ["qizhu"] }],
        hasInfoFailure: true,
        failedInfoKeys: 1,
        totalKeys: 1,
      })
      .mockResolvedValueOnce({
        entries: [{ alias: "骑猪", keys: ["qizhu"] }],
        hasInfoFailure: false,
        failedInfoKeys: 0,
        totalKeys: 1,
      });

    try {
      const { ctx, readyHandlers, loggerWarn } = createMockContext();

      registerCommands(ctx, createBaseConfig({ initLoadRetryTimes: 1 }));
      await flushReadyHandlers(readyHandlers);
      expect(keyResolverMocks.listDirectAliases).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      await flushAsyncCycles();

      await vi.advanceTimersByTimeAsync(3000);
      await flushAsyncCycles();

      expect(keyResolverMocks.listDirectAliases).toHaveBeenCalledTimes(2);
      expect(loggerWarn).toHaveBeenCalledWith(
        "direct alias list still incomplete (attempt %d/%d), scheduling retry",
        1,
        1,
      );
      expect(loggerWarn).toHaveBeenCalledWith(
        "direct alias retry stopped after %d attempts",
        1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("插件初始化载入表情失败后重试次数应受配置限制（非直连分支）", async () => {
    vi.useFakeTimers();
    getKeysMock
      .mockRejectedValueOnce(new Error("boom-1"))
      .mockRejectedValueOnce(new Error("boom-2"))
      .mockResolvedValueOnce([]);

    try {
      const { ctx, readyHandlers, loggerWarn } = createMockContext();

      registerCommands(
        ctx,
        createBaseConfig({
          enableDirectAliasWithoutPrefix: false,
          initLoadRetryTimes: 1,
        }),
      );
      await flushReadyHandlers(readyHandlers);
      expect(getKeysMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      await flushAsyncCycles();

      await vi.advanceTimersByTimeAsync(3000);
      await flushAsyncCycles();

      expect(getKeysMock).toHaveBeenCalledTimes(2);
      expect(loggerWarn).toHaveBeenCalledWith(
        "初始化时获取表情列表失败（attempt %d/%d）: %s",
        1,
        1,
        expect.stringContaining("boom-2"),
      );
      expect(loggerWarn).toHaveBeenCalledWith(
        "初始化时获取表情列表重试在 %d 次后停止",
        1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("插件销毁后不应继续调度初始化重试（非直连分支）", async () => {
    vi.useFakeTimers();
    let rejectPendingRetry: ((reason?: unknown) => void) | undefined;
    const pendingRetry = new Promise<never>((_resolve, reject) => {
      rejectPendingRetry = reject;
    });
    getKeysMock
      .mockRejectedValueOnce(new Error("boom-1"))
      .mockImplementationOnce(() => pendingRetry);

    try {
      const { ctx, readyHandlers, runDisposeHandlers } = createMockContext();

      registerCommands(
        ctx,
        createBaseConfig({
          enableDirectAliasWithoutPrefix: false,
          initLoadRetryTimes: 3,
        }),
      );
      await flushReadyHandlers(readyHandlers);
      expect(getKeysMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      await flushAsyncCycles();
      expect(getKeysMock).toHaveBeenCalledTimes(2);

      runDisposeHandlers();
      rejectPendingRetry?.(new Error("late-boom"));
      await flushAsyncCycles();
      await vi.runOnlyPendingTimersAsync();
      await flushAsyncCycles();

      expect(getKeysMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("meme.random 默认关闭去重时可连续命中同一模板", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["same"]);
    getInfoMock.mockResolvedValue({
      key: "same",
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 0,
        default_texts: [],
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomDedupeWithinHours: false,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    await randomAction!({ session: createSession("meme.random") });
    await randomAction!({ session: createSession("meme.random") });

    expect(generateMock).toHaveBeenNthCalledWith(1, "same", [], [], {});
    expect(generateMock).toHaveBeenNthCalledWith(2, "same", [], [], {});
  });

  it("meme.random 开启去重后在耗尽时应重置历史并重新轮回", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["a", "b"]);
    getInfoMock.mockImplementation(async (key: string) => ({
      key,
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 0,
        default_texts: [],
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    }));

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomDedupeWithinHours: true,
        randomDedupeWindowHours: 24,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const first = await randomAction!({
      session: createSession("meme.random"),
    });
    const second = await randomAction!({
      session: createSession("meme.random"),
    });
    const third = await randomAction!({
      session: createSession("meme.random"),
    });

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(third).toBeTruthy();
    expect(generateMock).toHaveBeenNthCalledWith(1, "a", [], [], {});
    expect(generateMock).toHaveBeenNthCalledWith(2, "b", [], [], {});
    expect(generateMock).toHaveBeenNthCalledWith(3, "a", [], [], {});

    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it("meme.random 开启去重时并发请求应串行并先消费不同模板", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["a", "b"]);
    getInfoMock.mockImplementation(async (key: string) => ({
      key,
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 0,
        default_texts: [],
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    }));

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0);

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomDedupeWithinHours: true,
        randomDedupeWindowHours: 24,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const [firstResult, secondResult] = await Promise.all([
      randomAction!({ session: createSession("meme.random") }),
      randomAction!({ session: createSession("meme.random") }),
    ]);

    expect(firstResult).toBeTruthy();
    expect(secondResult).toBeTruthy();
    expect(generateMock).toHaveBeenNthCalledWith(1, "a", [], [], {});
    expect(generateMock).toHaveBeenNthCalledWith(2, "b", [], [], {});
    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it("meme.random 开启去重时单模板耗尽后应立即轮回", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["same"]);
    getInfoMock.mockResolvedValue({
      key: "same",
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 0,
        default_texts: [],
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    let now = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomDedupeWithinHours: true,
        randomDedupeWindowHours: 24,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const first = await randomAction!({
      session: createSession("meme.random"),
    });
    expect(first).toBeTruthy();

    now = 60 * 60 * 1000;
    const second = await randomAction!({
      session: createSession("meme.random"),
    });
    expect(second).toBeTruthy();

    now = 24 * 60 * 60 * 1000;
    const third = await randomAction!({
      session: createSession("meme.random"),
    });
    expect(third).toBeTruthy();

    expect(generateMock).toHaveBeenCalledTimes(3);
    nowSpy.mockRestore();
  });

  it("meme.random 关键词提示关闭时不应额外发送触发提示", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["same"]);
    getInfoMock.mockResolvedValue({
      key: "same",
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 0,
        default_texts: [],
      },
      keywords: ["同义词"],
      shortcuts: [{ key: "看看你的" }],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomKeywordNotice: false,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const session = createSession("meme.random");
    const result = await randomAction!({ session });

    expect(result).toBeTruthy();
    expect(session.send).not.toHaveBeenCalled();
  });

  it("meme.random 开启关键词提示时应与图片同条返回 key 与中文别名", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["same"]);
    getInfoMock.mockResolvedValue({
      key: "can_can_need",
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 3,
        default_texts: [],
      },
      keywords: ["看看你的"],
      shortcuts: [{ key: "看你的" }],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomKeywordNotice: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const session = createSession("meme.random", [
      { type: "at", attrs: { id: "10001", name: "user1" }, children: [] },
      { type: "at", attrs: { id: "10002", name: "user2" }, children: [] },
    ]);
    const result = await randomAction!(
      {
        session,
      },
      "自定义文案",
    );

    expect(typeof result).toBe("string");
    expect(String(result)).toContain("key：same");
    expect(String(result)).toContain("别名：看看你的");
    expect(String(result)).toContain("<img");
    expect(String(result)).not.toContain("meme 关键词：");
    expect(String(result)).not.toContain("触发方式：");
    expect(session.send).not.toHaveBeenCalled();
  });

  it("meme.random 开启关键词提示时无中文别名应显示占位文案", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["same"]);
    getInfoMock.mockResolvedValue({
      key: "same",
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 1,
        default_texts: [],
      },
      keywords: ["a"],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomKeywordNotice: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const session = createSession("meme.random");
    const result = await randomAction!({ session });

    expect(typeof result).toBe("string");
    expect(String(result)).toContain("key：same");
    expect(String(result)).toContain("别名：（无中文别名）");
    expect(String(result)).toContain("<img");
    expect(session.send).not.toHaveBeenCalled();
  });

  it("excludedMemeKeys 应拦截 meme.info/meme.preview/meme 并过滤直连别名", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers, matchHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["qizhu", "other"]);

    registerCommands(
      ctx,
      createBaseConfig({
        excludedMemeKeys: [" qizhu "],
        enableDirectAliasWithoutPrefix: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const infoAction = commandActions.get("meme.info <key:string>");
    const previewAction = commandActions.get("meme.preview <key:string>");
    const generateAction = commandActions.get("meme <key:string> [...texts]");

    expect(infoAction).toBeDefined();
    expect(previewAction).toBeDefined();
    expect(generateAction).toBeDefined();

    await expect(infoAction!({}, "qizhu")).resolves.toContain("该模板已被排除");
    await expect(previewAction!({}, "qizhu")).resolves.toContain(
      "该模板已被排除",
    );

    const generateSession = createSession("meme qizhu");
    await expect(
      generateAction!({ session: generateSession }, "qizhu"),
    ).resolves.toContain("该模板已被排除");

    expect(matchHandlers).toHaveLength(0);
    expect(generateMock).not.toHaveBeenCalled();
    expect(getPreviewMock).not.toHaveBeenCalled();
  });

  it("排除仅需 1 张图片模板时应过滤 meme.list 并拦截 meme.random", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["single_image_only"]);
    getInfoMock.mockResolvedValue({
      key: "single_image_only",
      params_type: {
        min_images: 1,
        max_images: 1,
        min_texts: 0,
        max_texts: 0,
        default_texts: [],
      },
      keywords: ["单图模板"],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    registerCommands(
      ctx,
      createBaseConfig({
        enableDirectAliasWithoutPrefix: false,
        excludeSingleImageOnlyMemes: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const listAction = commandActions.get("meme.list");
    const randomAction = commandActions.get("meme.random [...texts]");

    expect(listAction).toBeDefined();
    expect(randomAction).toBeDefined();

    await expect(
      listAction!({ session: createSession("meme.list") }),
    ).resolves.toContain("当前后端没有可用模板");

    await expect(
      randomAction!({ session: createSession("meme.random") }),
    ).resolves.toContain("当前后端没有可用模板");

    expect(generateMock).not.toHaveBeenCalled();
  });

  it("排除需要 2 张图片模板时应过滤 meme.list 并拦截 meme.random", async () => {
    const commandActions = new Map<
      string,
      (...args: any[]) => Promise<unknown>
    >();
    const { ctx, readyHandlers } = createMockContext();
    ctx.command = vi.fn((name: string) => ({
      action: vi.fn((handler: (...args: any[]) => Promise<unknown>) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    }));

    getKeysMock.mockResolvedValue(["double_image_only"]);
    getInfoMock.mockResolvedValue({
      key: "double_image_only",
      params_type: {
        min_images: 2,
        max_images: 2,
        min_texts: 0,
        max_texts: 0,
        default_texts: [],
      },
      keywords: ["双图模板"],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    });

    registerCommands(
      ctx,
      createBaseConfig({
        enableDirectAliasWithoutPrefix: false,
        excludeTwoImageOnlyMemes: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const listAction = commandActions.get("meme.list");
    const randomAction = commandActions.get("meme.random [...texts]");

    expect(listAction).toBeDefined();
    expect(randomAction).toBeDefined();

    await expect(
      listAction!({ session: createSession("meme.list") }),
    ).resolves.toContain("当前后端没有可用模板");

    await expect(
      randomAction!({ session: createSession("meme.random") }),
    ).resolves.toContain("当前后端没有可用模板");

    expect(generateMock).not.toHaveBeenCalled();
  });
});
