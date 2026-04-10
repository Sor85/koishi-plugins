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

vi.mock("./key-resolver", () => ({
  createMemeKeyResolver: vi.fn(() => async (key: string) => key),
  listDirectAliases: keyResolverMocks.listDirectAliases,
  shouldRegisterDirectAlias: vi.fn(() => true),
}));

const avatarMocks = vi.hoisted(() => ({
  getSenderAvatarImage: vi.fn(async () => undefined),
  getMentionedAvatarImages: vi.fn(async () => []),
  getMentionedTargetAvatarImage: vi.fn(async () => undefined),
  getMentionedSecondaryAvatarImage: vi.fn(async () => undefined),
  getBotAvatarImage: vi.fn(async () => undefined),
  getMentionedTargetDisplayName: vi.fn(async () => undefined),
  getSenderDisplayName: vi.fn(() => undefined),
  resolveAvatarImageByUserId: vi.fn(async () => undefined),
  resolveDisplayNameByUserId: vi.fn(async () => undefined),
}));

vi.mock("../utils/avatar", () => ({
  getSenderAvatarImage: avatarMocks.getSenderAvatarImage,
  getMentionedAvatarImages: avatarMocks.getMentionedAvatarImages,
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

vi.mock("../utils/image", async () => {
  const actual = await vi.importActual<typeof import("../utils/image")>(
    "../utils/image",
  );
  return {
    ...actual,
    downloadImage: imageDownloadMocks.downloadImage,
  };
});

vi.mock("../infra/client", () => ({
  MemeBackendClient: vi.fn().mockImplementation(() => ({
    getKeys: getKeysMock,
    getInfo: getInfoMock,
    getPreview: getPreviewMock,
    generate: generateMock,
  })),
}));

import { registerCommands } from "./register";
import type { Config } from "../config";

interface MatchOptions {
  appel?: boolean;
  i18n?: boolean;
  fuzzy?: boolean;
}

type MatchHandler = (session: unknown) => Promise<unknown>;
type MiddlewareHandler = (
  session: any,
  next: () => Promise<unknown>,
) => Promise<unknown>;

function createMockCharacterService() {
  const completionMessages: any[] = [];
  const originalPush = completionMessages.push.bind(completionMessages);
  completionMessages.push = vi.fn((...items: any[]) => originalPush(...items));
  const tempStore = {
    completionMessages,
  };
  const getTemp = vi.fn(async () => tempStore);
  const registerReplyToolFieldDisposers: Array<ReturnType<typeof vi.fn>> = [];
  const registerReplyToolFields: any[] = [];

  const registerReplyToolField = vi.fn((field: any) => {
    const disposer = vi.fn();
    registerReplyToolFieldDisposers.push(disposer);
    registerReplyToolFields.push(field);
    return disposer;
  });

  return {
    service: {
      getTemp,
      registerReplyToolField,
    },
    getTemp,
    registerReplyToolField,
    registerReplyToolFieldDisposers,
    registerReplyToolFields,
    tempStore,
    completionMessages,
    originalCompletionMessagesPush: completionMessages.push,
  };
}

function createMockContext(options: { withCharacterService?: boolean } = {}) {
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
  const injectHandlers: Array<(ctx: any) => void> = [];
  const injectDisposers: Array<ReturnType<typeof vi.fn>> = [];
  let characterService =
    options.withCharacterService === false
      ? null
      : createMockCharacterService();

  const ctx: any = {
    command: vi.fn(() => ({
      action: vi.fn(() => ({ action: vi.fn() })),
    })),
    logger: vi.fn(() => ({ info: loggerInfo, warn: loggerWarn })),
    $commander: {
      get: vi.fn(() => undefined),
    },
    chatluna_character: characterService?.service,
    inject: vi.fn((deps: string[], handler: (ctx: any) => void) => {
      injectHandlers.push(handler);
      if (deps.includes("chatluna_character") && ctx.chatluna_character) {
        handler(ctx);
      }
      const disposer = vi.fn();
      injectDisposers.push(disposer);
      return disposer;
    }),
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
      return disposer;
    }),
    setTimeout: vi.fn((handler: () => void) => {
      handler();
      const disposer = vi.fn();
      return disposer;
    }),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === "ready") readyHandlers.push(handler);
      if (event === "dispose") disposeHandlers.push(handler);
    }),
  };

  const setCharacterService = (
    nextCharacterService: ReturnType<typeof createMockCharacterService> | null,
  ) => {
    characterService = nextCharacterService;
    ctx.chatluna_character = nextCharacterService?.service;
  };

  const triggerInjectHandlers = () => {
    injectHandlers.forEach((handler) => handler(ctx));
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
    getTemp: characterService?.getTemp,
    tempStore: characterService?.tempStore,
    completionMessages: characterService?.completionMessages,
    originalCompletionMessagesPush:
      characterService?.originalCompletionMessagesPush,
    registerReplyToolField: characterService?.registerReplyToolField,
    registerReplyToolFieldDisposers:
      characterService?.registerReplyToolFieldDisposers,
    registerReplyToolFields: characterService?.registerReplyToolFields,
    injectHandlers,
    injectDisposers,
    triggerInjectHandlers,
    setCharacterService,
    characterService,
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

function createMiddlewareSession(
  content: string,
  executeResult = "",
  elements: any[] = [],
  strippedOverrides: Partial<{
    hasAt: boolean;
    atSelf: boolean;
    appel: boolean;
    content: string;
  }> = {},
  rawContent?: string,
): any {
  return {
    content: rawContent ?? content,
    stripped: {
      content,
      hasAt: true,
      atSelf: false,
      appel: false,
      ...strippedOverrides,
    },
    elements,
    send: vi.fn(async () => undefined),
    execute: vi.fn(async () => executeResult),
  };
}

function resetCommonMocks() {
  avatarMocks.getSenderAvatarImage.mockReset();
  avatarMocks.getMentionedAvatarImages.mockReset();
  avatarMocks.getMentionedTargetAvatarImage.mockReset();
  avatarMocks.getMentionedSecondaryAvatarImage.mockReset();
  avatarMocks.getBotAvatarImage.mockReset();
  avatarMocks.getMentionedTargetDisplayName.mockReset();
  avatarMocks.getSenderDisplayName.mockReset();
  avatarMocks.resolveAvatarImageByUserId.mockReset();
  avatarMocks.resolveDisplayNameByUserId.mockReset();
  avatarMocks.getSenderAvatarImage.mockResolvedValue(undefined);
  avatarMocks.getMentionedAvatarImages.mockResolvedValue([]);
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
  it("chatluna_character 延迟可用后仍应挂载 XML runtime", async () => {
    const {
      ctx,
      readyHandlers,
      setCharacterService,
      triggerInjectHandlers,
      loggerWarn,
    } = createMockContext({ withCharacterService: false });

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    expect(loggerWarn).not.toHaveBeenCalled();

    const delayedCharacterService = createMockCharacterService();
    setCharacterService(delayedCharacterService);
    triggerInjectHandlers();

    expect(loggerWarn).not.toHaveBeenCalled();
    expect(ctx.chatluna_character.getTemp).not.toBe(
      delayedCharacterService.getTemp,
    );

    const session = createSession("ignored");
    const temp = await ctx.chatluna_character.getTemp(session);

    expect(delayedCharacterService.getTemp).toHaveBeenCalledWith(session);
    expect(temp.completionMessages.push).not.toBe(
      delayedCharacterService.originalCompletionMessagesPush,
    );
  });

  it("chatluna_character 重挂载后应恢复旧 service 并接管新 service", async () => {
    const {
      ctx,
      readyHandlers,
      setCharacterService,
      triggerInjectHandlers,
      characterService,
    } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    const originalCharacterService = characterService!;
    const session = createSession("ignored");
    await ctx.chatluna_character.getTemp(session);

    expect(ctx.chatluna_character.getTemp).not.toBe(
      originalCharacterService.getTemp,
    );
    expect(originalCharacterService.completionMessages.push).not.toBe(
      originalCharacterService.originalCompletionMessagesPush,
    );

    const replacementCharacterService = createMockCharacterService();
    setCharacterService(replacementCharacterService);
    triggerInjectHandlers();

    expect(originalCharacterService.service.getTemp).toBe(
      originalCharacterService.getTemp,
    );
    expect(originalCharacterService.completionMessages.push).toBe(
      originalCharacterService.originalCompletionMessagesPush,
    );
    expect(ctx.chatluna_character.getTemp).not.toBe(
      replacementCharacterService.getTemp,
    );

    await ctx.chatluna_character.getTemp(session);
    replacementCharacterService.completionMessages.push({
      role: "assistant",
      content: '<meme key="qizhu" text="你好"/>',
    });
    await flushAsyncCycles();

    expect(generateMock).toHaveBeenCalledWith("qizhu", [], ["你好"], {});

    generateMock.mockClear();
    originalCharacterService.completionMessages.push({
      role: "assistant",
      content: '<meme key="qizhu" text="旧链路"/>',
    });
    await flushAsyncCycles();

    expect(generateMock).not.toHaveBeenCalled();
  });

  it("启用 XML 工具后可用 key 触发生成", async () => {
    const { ctx, readyHandlers, completionMessages } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    const session = createSession("ignored");
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "assistant",
      content:
        '<meme key="qizhu" text="你好|世界" image"https://a.png|https://b.jpg" at="10001|10002"/>',
    });
    await flushAsyncCycles();

    expect(generateMock).toHaveBeenCalledWith(
      "qizhu",
      expect.any(Array),
      ["你好", "世界"],
      {},
    );
  });

  it("启用 XML 工具后可记录发送成功日志", async () => {
    const { ctx, readyHandlers, completionMessages, loggerInfo } =
      createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    const session = createSession("ignored") as any;
    session.userId = "1291774425";
    session.guildId = "987654321";
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "assistant",
      content:
        '<meme key="qizhu" text="你好|世界" image"https://a.png|https://b.jpg" at="10001|10002"/>',
    });
    await flushAsyncCycles();

    expect(session.send).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith(
      "meme=%s, user=%s, guild=%s",
      "qizhu",
      "1291774425",
      "987654321",
    );
  });

  it("启用 XML 工具后应兼容数组型 assistant 内容", async () => {
    const { ctx, readyHandlers, completionMessages } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    const session = createSession("ignored");
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "assistant",
      content: [
        { text: "先说点别的：" },
        {
          content:
            '<meme key="qizhu" text="你好|世界" image"https://a.png|https://b.jpg" at="10001|10002"/>',
        },
      ],
    });
    await flushAsyncCycles();

    expect(generateMock).toHaveBeenCalledWith(
      "qizhu",
      expect.any(Array),
      ["你好", "世界"],
      {},
    );
  });

  it("普通 assistant 文本不应触发 XML 生成", async () => {
    const { ctx, readyHandlers, completionMessages } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    const session = createSession("ignored");
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "assistant",
      content: "这是一段普通回复，没有任何 XML 指令。",
    });
    await flushAsyncCycles();

    expect(generateMock).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalled();
    expect(completionMessages).toHaveLength(1);
  });

  it("非 assistant 消息不应触发 XML 生成", async () => {
    const { ctx, readyHandlers, completionMessages } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    const session = createSession("ignored");
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "user",
      content: '<meme key="qizhu" text="你好"/>',
    });
    await flushAsyncCycles();

    expect(generateMock).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalled();
    expect(completionMessages).toHaveLength(1);
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

    const { ctx, readyHandlers, completionMessages } = createMockContext();

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
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "assistant",
      content: '<meme key="can_can_need" at="1291774425|1018193431"/>',
    });
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

    const { ctx, readyHandlers, completionMessages } = createMockContext();

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
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "assistant",
      content: '<meme key="can_can_need" at="1291774425"/>',
    });
    await flushAsyncCycles();

    expect(generateMock).toHaveBeenCalledWith(
      "can_can_need",
      [targetAvatar, botAvatar],
      [],
      {},
    );
  });


  it("开启 reply tool 注入且能力可用时应关闭 XML 动作执行", async () => {
    const {
      ctx,
      readyHandlers,
      completionMessages,
      registerReplyToolField,
      registerReplyToolFields,
    } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        injectMemeXmlToolAsReplyTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    expect(registerReplyToolField).toHaveBeenCalledTimes(1);
    expect(registerReplyToolFields?.map((field) => field.name)).toEqual([
      "meme_generate",
    ]);

    const session = createSession("ignored");
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "assistant",
      content: '<meme key="qizhu" text="reply-tool-mode"/>',
    });
    await flushAsyncCycles();

    expect(generateMock).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalled();
  });

  it("开启 reply tool 注入但能力不可用时应回退 XML 动作执行", async () => {
    const { ctx, readyHandlers, completionMessages, loggerWarn } =
      createMockContext();
    delete ctx.chatluna_character.registerReplyToolField;

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        injectMemeXmlToolAsReplyTool: true,
        enableDirectAliasWithoutPrefix: false,
        enableDeveloperDebugLog: true,
      }),
    );

    await flushReadyHandlers(readyHandlers);

    const session = createSession("ignored");
    await ctx.chatluna_character.getTemp(session);

    completionMessages.push({
      role: "assistant",
      content: '<meme key="qizhu" text="fallback-xml"/>',
    });
    await flushAsyncCycles();

    expect(generateMock).toHaveBeenCalled();
    expect(session.send).toHaveBeenCalledTimes(1);
    expect(loggerWarn).toHaveBeenCalledWith(
      "chatluna_character.registerReplyToolField 不可用，回退为 XML 动作执行模式",
    );
  });

  it("开启 reply tool 注入后 dispose 应注销 reply tool 字段", async () => {
    const {
      ctx,
      readyHandlers,
      runDisposeHandlers,
      registerReplyToolFieldDisposers,
    } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        enableMemeXmlTool: true,
        injectMemeXmlToolAsReplyTool: true,
        enableDirectAliasWithoutPrefix: false,
      }),
    );

    await flushReadyHandlers(readyHandlers);
    expect(registerReplyToolFieldDisposers).toHaveLength(1);

    runDisposeHandlers();

    expect(registerReplyToolFieldDisposers?.[0]).toHaveBeenCalledTimes(1);
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

  it("模板需 1-2 图且输入两个@用户时应优先使用两个被@头像", async () => {
    const senderAvatar = {
      data: new Uint8Array([11]),
      filename: "sender-1-2.png",
      mimeType: "image/png",
    };
    const targetAvatar = {
      data: new Uint8Array([12]),
      filename: "target-1-2.png",
      mimeType: "image/png",
    };
    const secondaryTargetAvatar = {
      data: new Uint8Array([13]),
      filename: "target-1-2-secondary.png",
      mimeType: "image/png",
    };

    avatarMocks.getSenderAvatarImage.mockResolvedValue(senderAvatar);
    avatarMocks.getMentionedAvatarImages.mockResolvedValue([
      targetAvatar,
      secondaryTargetAvatar,
    ]);

    getInfoMock.mockResolvedValue({
      key: "qizhu",
      params_type: {
        min_images: 1,
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
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
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

  it("模板需 1-多图且输入两个@用户时应优先使用两个被@头像", async () => {
    const senderAvatar = {
      data: new Uint8Array([21]),
      filename: "sender-1-n.png",
      mimeType: "image/png",
    };
    const targetAvatar = {
      data: new Uint8Array([22]),
      filename: "target-1-n.png",
      mimeType: "image/png",
    };
    const secondaryTargetAvatar = {
      data: new Uint8Array([23]),
      filename: "target-1-n-secondary.png",
      mimeType: "image/png",
    };

    avatarMocks.getSenderAvatarImage.mockResolvedValue(senderAvatar);
    avatarMocks.getMentionedAvatarImages.mockResolvedValue([
      targetAvatar,
      secondaryTargetAvatar,
    ]);

    getInfoMock.mockResolvedValue({
      key: "qizhu",
      params_type: {
        min_images: 1,
        max_images: 9,
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
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
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

  it("模板需 1-3 图且输入三个@用户时应按顺序使用三个被@头像", async () => {
    const senderAvatar = {
      data: new Uint8Array([31]),
      filename: "sender-1-3.png",
      mimeType: "image/png",
    };
    const targetAvatar = {
      data: new Uint8Array([32]),
      filename: "target-1-3.png",
      mimeType: "image/png",
    };
    const secondaryTargetAvatar = {
      data: new Uint8Array([33]),
      filename: "target-1-3-secondary.png",
      mimeType: "image/png",
    };
    const thirdTargetAvatar = {
      data: new Uint8Array([34]),
      filename: "target-1-3-third.png",
      mimeType: "image/png",
    };

    avatarMocks.getSenderAvatarImage.mockResolvedValue(senderAvatar);
    avatarMocks.getMentionedAvatarImages.mockResolvedValue([
      targetAvatar,
      secondaryTargetAvatar,
      thirdTargetAvatar,
    ]);

    getInfoMock.mockResolvedValue({
      key: "qizhu",
      params_type: {
        min_images: 1,
        max_images: 3,
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
        autoUseAvatarWhenMinImagesOneAndNoImage: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const session = createSession("骑猪 @10002 @10003 @10004", [
      { type: "at", attrs: { id: "10002" }, children: [] },
      { type: "at", attrs: { id: "10003" }, children: [] },
      { type: "at", attrs: { id: "10004" }, children: [] },
    ]);

    await expect(matchHandlers[0](session)).resolves.toBeTruthy();
    expect(generateMock).toHaveBeenCalledWith(
      "qizhu",
      [targetAvatar, secondaryTargetAvatar, thirdTargetAvatar],
      [],
      {},
    );
  });

  it("关闭前置@允许时 @bot meme 应放行给下游", async () => {
    const { ctx, middlewareHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowLeadingAtBeforeCommand: false,
      }),
    );

    expect(middlewareHandlers).toHaveLength(1);
    const middleware = middlewareHandlers[0] as MiddlewareHandler;
    const session = createMiddlewareSession(
      '<at id="10000"/> meme can_can_need',
      '<img src="ok"/>',
      [],
      { atSelf: true },
    );
    const next = vi.fn(async () => "next-ok");

    await middleware(session, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(session.execute).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalled();
  });

  it("开启前置@允许时中间件应改写并执行指令", async () => {
    const { ctx, middlewareHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowLeadingAtBeforeCommand: true,
      }),
    );

    expect(middlewareHandlers).toHaveLength(1);
    const middleware = middlewareHandlers[0] as MiddlewareHandler;
    const session = createMiddlewareSession(
      '<at id="10001"/> meme can_can_need',
      '<img src="ok"/>',
    );
    const next = vi.fn(async () => undefined);

    await middleware(session, next);

    expect(next).not.toHaveBeenCalled();
    expect(session.execute).toHaveBeenCalledWith("meme can_can_need");
    expect(session.send).toHaveBeenCalledWith('<img src="ok"/>');
  });

  it("开启前置@允许时仅有前置@也应改写为 meme + @参数", async () => {
    const { ctx, middlewareHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowLeadingAtBeforeCommand: true,
      }),
    );

    expect(middlewareHandlers).toHaveLength(1);
    const middleware = middlewareHandlers[0] as MiddlewareHandler;
    const session = createMiddlewareSession('<at id="10001"/> meme', "ok");
    const next = vi.fn(async () => undefined);

    await middleware(session, next);

    expect(next).not.toHaveBeenCalled();
    expect(session.execute).toHaveBeenCalledWith("meme");
    expect(session.send).toHaveBeenCalledWith("ok");
  });

  it("开启前置@允许时应兼容 elements 兜底解析", async () => {
    const { ctx, middlewareHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowLeadingAtBeforeCommand: true,
      }),
    );

    expect(middlewareHandlers).toHaveLength(1);
    const middleware = middlewareHandlers[0] as MiddlewareHandler;
    const session = createMiddlewareSession("meme can_can_need", "ok", [
      { type: "at", attrs: { id: "10001" } },
      { type: "text", attrs: { content: " meme can_can_need" } },
    ]);
    const next = vi.fn(async () => undefined);

    await middleware(session, next);

    expect(next).not.toHaveBeenCalled();
    expect(session.execute).toHaveBeenCalledWith("meme can_can_need");
    expect(session.send).toHaveBeenCalledWith("ok");
  });

  it("关闭前置@允许时 stripped 无前置@但 content 有前置@仍应放行", async () => {
    const { ctx, middlewareHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowLeadingAtBeforeCommand: false,
      }),
    );

    expect(middlewareHandlers).toHaveLength(1);
    const middleware = middlewareHandlers[0] as MiddlewareHandler;
    const session = createMiddlewareSession(
      "meme can_can_need",
      "",
      [],
      { atSelf: false },
      '<at id="10001"/> meme can_can_need',
    );
    const next = vi.fn(async () => "next-ok");

    await middleware(session, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(session.execute).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalled();
  });

  it("开启前置@允许时 @bot 非meme消息应放行给下游", async () => {
    const { ctx, middlewareHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowLeadingAtBeforeCommand: true,
      }),
    );

    expect(middlewareHandlers).toHaveLength(1);
    const middleware = middlewareHandlers[0] as MiddlewareHandler;
    const session = createMiddlewareSession('<at id="10000"/> 你好', "", [], {
      atSelf: true,
    });
    const next = vi.fn(async () => "next-ok");

    await middleware(session, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(session.execute).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalled();
  });

  it("关闭前置@允许时 @bot 别名直触发应被禁用且不吞消息", async () => {
    const { ctx, readyHandlers, matchHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowLeadingAtBeforeCommand: false,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    expect(matchHandlers).toHaveLength(1);
    const session = createSession("骑猪", [
      { type: "at", attrs: { id: "10000", name: "bot" }, children: [] },
    ]);
    session.stripped.atSelf = true;

    const result = await matchHandlers[0](session);

    expect(result).toBeUndefined();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("开启前置@允许时 @bot 别名直触发应允许", async () => {
    const { ctx, readyHandlers, matchHandlers } = createMockContext();

    registerCommands(
      ctx,
      createBaseConfig({
        allowLeadingAtBeforeCommand: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    expect(matchHandlers).toHaveLength(1);
    const session = createSession("骑猪", [
      { type: "at", attrs: { id: "10000", name: "bot" }, children: [] },
    ]);
    session.stripped.atSelf = true;

    await expect(matchHandlers[0](session)).resolves.toBeTruthy();
    expect(generateMock).toHaveBeenCalledWith("qizhu", [], [], {});
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

    expect(middlewareHandlers).toHaveLength(1);
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
    expect(result).toBeUndefined();
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

  it("meme.random 在戳一戳会话中可用操作者头像补单图模板", async () => {
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

    const actorAvatar = {
      data: new Uint8Array([7, 8, 9]),
      filename: "poke-actor-avatar.png",
      mimeType: "image/png",
    };

    avatarMocks.resolveAvatarImageByUserId.mockResolvedValueOnce(actorAvatar);

    getKeysMock.mockResolvedValue(["single"]);
    getInfoMock.mockResolvedValue({
      key: "single",
      params_type: {
        min_images: 1,
        max_images: 1,
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

    registerCommands(ctx, createBaseConfig());
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const session = createSession("meme.random") as any;
    session.userId = "123456789";
    session.onebot = {
      post_type: "notice",
      notice_type: "notify",
      sub_type: "poke",
      target_id: "99999",
      self_id: "99999",
      operator_id: "123456789",
      group_id: "20001",
      sender: { card: "操作者群昵称" },
    };

    await randomAction!({ session });

    expect(avatarMocks.resolveAvatarImageByUserId).toHaveBeenCalled();
    expect(generateMock).toHaveBeenCalledWith("single", [actorAvatar], [], {});
  });

  it("meme.random 在戳一戳会话中昵称解析失败时应回退群昵称而非 QQ 号", async () => {
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

    avatarMocks.resolveDisplayNameByUserId.mockResolvedValueOnce("123456789");

    getKeysMock.mockResolvedValue(["textOnly"]);
    getInfoMock.mockResolvedValue({
      key: "textOnly",
      params_type: {
        min_images: 0,
        max_images: 0,
        min_texts: 1,
        max_texts: 1,
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
        autoUseGroupNicknameWhenNoDefaultText: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const session = createSession("meme.random") as any;
    session.userId = "123456789";
    session.onebot = {
      post_type: "notice",
      notice_type: "notify",
      sub_type: "poke",
      target_id: "99999",
      self_id: "99999",
      operator_id: "123456789",
      group_id: "20001",
      sender: { card: "操作者群昵称" },
    };

    await randomAction!({ session });

    expect(generateMock).toHaveBeenCalledWith(
      "textOnly",
      [],
      ["操作者群昵称"],
      {},
    );
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

  function createRandomMemeInfo(
    key: string,
    params: {
      min_images: number;
      max_images: number;
      min_texts: number;
      max_texts: number;
      default_texts?: string[];
    },
  ) {
    return {
      key,
      params_type: {
        default_texts: [],
        ...params,
      },
      keywords: [],
      shortcuts: [],
      tags: [],
      date_created: "2026-01-01T00:00:00",
      date_modified: "2026-01-01T00:00:00",
    };
  }

  it("meme.random 会按桶权重优先命中高权重类别", async () => {
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

    getKeysMock.mockResolvedValue(["text-high", "other-low"]);
    getInfoMock.mockImplementation(async (key: string) => {
      if (key === "text-high") {
        return createRandomMemeInfo(key, {
          min_images: 0,
          max_images: 0,
          min_texts: 0,
          max_texts: 1,
          default_texts: [],
        });
      }
      return createRandomMemeInfo(key, {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 0,
      });
    });

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    registerCommands(
      ctx,
      createBaseConfig({
        randomMemeBucketWeightRules: [
          { category: "text-only", enabled: true, weight: 100 },
          { category: "single-image-only", enabled: true, weight: 0 },
          { category: "two-image-only", enabled: true, weight: 0 },
          { category: "image-and-text", enabled: true, weight: 0 },
          { category: "other", enabled: true, weight: 1 },
        ],
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const result = await randomAction!({
      session: createSession("meme.random"),
    });

    expect(result).toBeTruthy();
    expect(generateMock).toHaveBeenCalledWith("text-high", [], [], {});
    expect(generateMock).not.toHaveBeenCalledWith(
      "other-low",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    randomSpy.mockRestore();
  });

  it("meme.random 开启去重时桶耗尽后应直接切换到仍有候选的其他桶", async () => {
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

    getKeysMock.mockResolvedValue(["text-only", "other-only"]);
    getInfoMock.mockImplementation(async (key: string) => {
      if (key === "text-only") {
        return createRandomMemeInfo(key, {
          min_images: 0,
          max_images: 0,
          min_texts: 0,
          max_texts: 1,
          default_texts: [],
        });
      }
      return createRandomMemeInfo(key, {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 0,
      });
    });

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomDedupeWithinHours: true,
        randomDedupeWindowHours: 24,
        randomMemeBucketWeightRules: [
          { category: "text-only", enabled: true, weight: 100 },
          { category: "single-image-only", enabled: true, weight: 0 },
          { category: "two-image-only", enabled: true, weight: 0 },
          { category: "image-and-text", enabled: true, weight: 0 },
          { category: "other", enabled: true, weight: 1 },
        ],
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

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(generateMock).toHaveBeenNthCalledWith(1, "text-only", [], [], {});
    expect(generateMock).toHaveBeenNthCalledWith(2, "other-only", [], [], {});

    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it("meme.random 开启去重时只有所有桶耗尽才会重置历史", async () => {
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

    getKeysMock.mockResolvedValue(["text-only", "other-only"]);
    getInfoMock.mockImplementation(async (key: string) => {
      if (key === "text-only") {
        return createRandomMemeInfo(key, {
          min_images: 0,
          max_images: 0,
          min_texts: 0,
          max_texts: 1,
          default_texts: [],
        });
      }
      return createRandomMemeInfo(key, {
        min_images: 0,
        max_images: 0,
        min_texts: 0,
        max_texts: 0,
      });
    });

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);

    registerCommands(
      ctx,
      createBaseConfig({
        enableRandomDedupeWithinHours: true,
        randomDedupeWindowHours: 24,
        randomMemeBucketWeightRules: [
          { category: "text-only", enabled: true, weight: 100 },
          { category: "single-image-only", enabled: true, weight: 0 },
          { category: "two-image-only", enabled: true, weight: 0 },
          { category: "image-and-text", enabled: true, weight: 0 },
          { category: "other", enabled: true, weight: 1 },
        ],
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    await randomAction!({ session: createSession("meme.random") });
    await randomAction!({ session: createSession("meme.random") });
    await randomAction!({ session: createSession("meme.random") });

    expect(generateMock).toHaveBeenNthCalledWith(1, "text-only", [], [], {});
    expect(generateMock).toHaveBeenNthCalledWith(2, "other-only", [], [], {});
    expect(generateMock).toHaveBeenNthCalledWith(3, "text-only", [], [], {});

    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it("meme.random 命中模板生成失败时应跳过当前模板并继续尝试下一个候选", async () => {
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

    getKeysMock.mockResolvedValue(["first", "second"]);
    getInfoMock.mockImplementation(async (key: string) =>
      createRandomMemeInfo(key, {
        min_images: 0,
        max_images: 0,
        min_texts: 1,
        max_texts: 1,
        default_texts: [],
      }),
    );

    generateMock
      .mockRejectedValueOnce(new Error("文本“1231231231...”过长"))
      .mockResolvedValueOnce({
        buffer: new Uint8Array([4, 5, 6]).buffer,
        mimeType: "image/png",
      });

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    registerCommands(ctx, createBaseConfig());
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");
    expect(randomAction).toBeDefined();

    const result = await randomAction!(
      { session: createSession("meme.random") },
      "1231231231...",
    );

    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(generateMock).toHaveBeenNthCalledWith(
      1,
      "first",
      [],
      ["1231231231..."],
      {},
    );
    expect(generateMock).toHaveBeenNthCalledWith(
      2,
      "second",
      [],
      ["1231231231..."],
      {},
    );
    expect(result).toBeTruthy();
    expect(typeof result).not.toBe("string");
    expect(String(result)).not.toContain("random key: first");

    randomSpy.mockRestore();
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

  it("meme.list 在单图模板类别排除下应过滤大小写不同的模板 key", async () => {
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

    getKeysMock.mockResolvedValue(["what_I_want_to_do", "safe_text"]);
    getInfoMock.mockImplementation(async (key: string) => {
      if (key === "what_I_want_to_do") {
        return {
          key,
          params_type: {
            min_images: 1,
            max_images: 1,
            min_texts: 0,
            max_texts: 0,
            default_texts: [],
          },
          keywords: ["大写单图模板"],
          shortcuts: [],
          tags: [],
          date_created: "2026-01-01T00:00:00",
          date_modified: "2026-01-01T00:00:00",
        };
      }
      if (key === "safe_text") {
        return {
          key,
          params_type: {
            min_images: 0,
            max_images: 0,
            min_texts: 1,
            max_texts: 1,
            default_texts: [],
          },
          keywords: ["保留文本模板"],
          shortcuts: [],
          tags: [],
          date_created: "2026-01-01T00:00:00",
          date_modified: "2026-01-01T00:00:00",
        };
      }
      throw new Error(`unexpected key: ${key}`);
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

    expect(listAction).toBeDefined();

    const result = await listAction!({ session: createSession("meme.list") });

    expect(result).toContain("保留文本模板");
    expect(result).not.toContain("大写单图模板");
    expect(result).not.toContain("what_I_want_to_do");
  });

  it("排除其他模板时应过滤 meme.list 并拦截显式访问", async () => {
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

    getKeysMock.mockResolvedValue(["other"]);
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

    registerCommands(
      ctx,
      createBaseConfig({
        enableDirectAliasWithoutPrefix: false,
        excludeOtherMemes: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const listAction = commandActions.get("meme.list");
    const infoAction = commandActions.get("meme.info <key:string>");
    const previewAction = commandActions.get("meme.preview <key:string>");
    const generateAction = commandActions.get("meme <key:string> [...texts]");

    expect(listAction).toBeDefined();
    expect(infoAction).toBeDefined();
    expect(previewAction).toBeDefined();
    expect(generateAction).toBeDefined();

    await expect(
      listAction!({ session: createSession("meme.list") }),
    ).resolves.toContain("当前后端没有可用模板");
    await expect(infoAction!({}, "other")).resolves.toContain("该模板已被排除");
    await expect(previewAction!({}, "other")).resolves.toContain(
      "该模板已被排除",
    );
    await expect(
      generateAction!({ session: createSession("meme other") }, "other"),
    ).resolves.toContain("该模板已被排除");

    expect(generateMock).not.toHaveBeenCalled();
    expect(getPreviewMock).not.toHaveBeenCalled();
  });

  it("排除其他模板时 meme.random 不应选中未命中既有分类的模板", async () => {
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

    getKeysMock.mockResolvedValue(["single_image_only", "other", "text_only"]);
    getInfoMock.mockImplementation(async (key: string) => {
      if (key === "single_image_only") {
        return {
          key,
          params_type: {
            min_images: 1,
            max_images: 1,
            min_texts: 0,
            max_texts: 0,
            default_texts: [],
          },
          keywords: [],
          shortcuts: [],
          tags: [],
          date_created: "2026-01-01T00:00:00",
          date_modified: "2026-01-01T00:00:00",
        };
      }
      if (key === "text_only") {
        return {
          key,
          params_type: {
            min_images: 0,
            max_images: 0,
            min_texts: 1,
            max_texts: 1,
            default_texts: [],
          },
          keywords: [],
          shortcuts: [],
          tags: [],
          date_created: "2026-01-01T00:00:00",
          date_modified: "2026-01-01T00:00:00",
        };
      }

      return {
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
      };
    });

    registerCommands(
      ctx,
      createBaseConfig({
        enableDirectAliasWithoutPrefix: false,
        excludeSingleImageOnlyMemes: true,
        excludeOtherMemes: true,
      }),
    );
    await flushReadyHandlers(readyHandlers);

    const randomAction = commandActions.get("meme.random [...texts]");

    expect(randomAction).toBeDefined();

    await randomAction!({ session: createSession("meme.random") }, "你好");

    expect(generateMock).toHaveBeenCalledWith("text_only", [], ["你好"], {});
  });
});
