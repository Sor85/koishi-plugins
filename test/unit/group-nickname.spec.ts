/**
 * 群昵称补文案执行链路测试
 * 覆盖被@昵称优先、发送者昵称回退与用户文本优先
 */

import { describe, expect, it, vi } from "vitest";

const backendMocks = vi.hoisted(() => ({
  generate: vi.fn(),
  getInfo: vi.fn(),
}));

const displayNameMocks = vi.hoisted(() => ({
  getMentionedTargetDisplayName: vi.fn(),
  getSenderDisplayName: vi.fn(),
}));

vi.mock("koishi", () => ({
  h: {
    image: vi.fn((buffer: Buffer, mimeType: string) => ({ buffer, mimeType })),
  },
}));

vi.mock("../../src/command/key-resolver", () => ({
  createMemeKeyResolver: vi.fn(() => async (key: string) => key),
  listDirectAliases: vi.fn(async () => ({
    entries: [],
    hasInfoFailure: false,
    failedInfoKeys: 0,
    totalKeys: 0,
  })),
  shouldRegisterDirectAlias: vi.fn(() => true),
}));

vi.mock("../../src/infra/client", () => ({
  MemeBackendClient: vi.fn().mockImplementation(() => ({
    getKeys: vi.fn(async () => []),
    getInfo: backendMocks.getInfo,
    getPreview: vi.fn(),
    generate: backendMocks.generate,
  })),
}));

vi.mock("../../src/command/parse", () => ({
  parseCommandInput: vi.fn(
    async (_ctx: unknown, _session: unknown, texts: string[]) => ({
      texts: texts.map((text) => text.trim()).filter(Boolean),
      images: [],
    }),
  ),
}));

const avatarMocks = vi.hoisted(() => ({
  getSenderAvatarImage: vi.fn(async () => undefined),
  getMentionedTargetAvatarImage: vi.fn(async () => undefined),
  getMentionedSecondaryAvatarImage: vi.fn(async () => undefined),
  getBotAvatarImage: vi.fn(async () => undefined),
}));

vi.mock("../../src/utils/avatar", () => ({
  getSenderAvatarImage: avatarMocks.getSenderAvatarImage,
  getMentionedTargetAvatarImage: avatarMocks.getMentionedTargetAvatarImage,
  getMentionedSecondaryAvatarImage:
    avatarMocks.getMentionedSecondaryAvatarImage,
  getBotAvatarImage: avatarMocks.getBotAvatarImage,
  getMentionedTargetDisplayName: displayNameMocks.getMentionedTargetDisplayName,
  getSenderDisplayName: displayNameMocks.getSenderDisplayName,
}));

import type { Config } from "../../src/config";
import { registerCommands } from "../../src/command/register";

type CommandAction = (...args: any[]) => Promise<unknown>;

function createMockContext() {
  const commandActions = new Map<string, CommandAction>();

  const ctx: any = {
    command: vi.fn((name: string) => ({
      action: vi.fn((handler: CommandAction) => {
        commandActions.set(name, handler);
        return { action: vi.fn() };
      }),
    })),
    logger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
    $commander: {
      get: vi.fn(() => undefined),
    },
    $processor: {
      match: vi.fn(() => vi.fn()),
    },
    middleware: vi.fn(),
    on: vi.fn(),
  };

  return { ctx, commandActions };
}

function createBaseConfig(): Config {
  return {
    baseUrl: "http://127.0.0.1:2233",
    timeoutMs: 3000,
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
    autoUseAvatarWhenMinImagesOneAndNoImage: false,
    autoFillOneMissingImageWithAvatar: false,
    autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: false,
    autoUseGroupNicknameWhenNoDefaultText: true,
    enableQuotedImageTrigger: true,
    enableQuotedTextTrigger: false,
    renderMemeListAsImage: false,
    enableDirectAliasWithoutPrefix: false,
    allowMentionPrefixDirectAliasTrigger: false,
    allowLeadingAtBeforeCommand: false,
    enableDeveloperDebugLog: false,
    enableMemeXmlTool: false,
    enableRandomDedupeWithinHours: false,
    randomDedupeWindowHours: 24,
    enableRandomKeywordNotice: false,
    infoFetchConcurrency: 0,
    initLoadRetryTimes: 3,
    disableErrorReplyToPlatform: false,
    excludeTextOnlyMemes: false,
    excludeSingleImageOnlyMemes: false,
    excludeTwoImageOnlyMemes: false,
    excludeImageAndTextMemes: false,
    excludedMemeKeys: [],
  };
}

function createSession() {
  return {
    elements: [],
    quote: undefined,
    author: undefined,
    event: { user: {} },
    bot: {
      user: {},
      getLogin: vi.fn(async () => ({ user: {} })),
    },
  } as any;
}

function resetAvatarMocks() {
  avatarMocks.getSenderAvatarImage.mockReset();
  avatarMocks.getMentionedTargetAvatarImage.mockReset();
  avatarMocks.getMentionedSecondaryAvatarImage.mockReset();
  avatarMocks.getBotAvatarImage.mockReset();
  avatarMocks.getSenderAvatarImage.mockResolvedValue(undefined);
  avatarMocks.getMentionedTargetAvatarImage.mockResolvedValue(undefined);
  avatarMocks.getMentionedSecondaryAvatarImage.mockResolvedValue(undefined);
  avatarMocks.getBotAvatarImage.mockResolvedValue(undefined);
}

describe("group nickname auto fill", () => {
  it("用户未提供文本且存在 @ 用户时优先使用被@群昵称", async () => {
    backendMocks.generate.mockReset();
    backendMocks.getInfo.mockReset();
    displayNameMocks.getMentionedTargetDisplayName.mockReset();
    displayNameMocks.getSenderDisplayName.mockReset();
    resetAvatarMocks();

    backendMocks.getInfo.mockResolvedValue({
      key: "yi",
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
    backendMocks.generate.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    });
    displayNameMocks.getMentionedTargetDisplayName.mockResolvedValue(
      "被@群昵称",
    );
    displayNameMocks.getSenderDisplayName.mockReturnValue("发送者群昵称");

    const { ctx, commandActions } = createMockContext();
    registerCommands(ctx, createBaseConfig());

    const memeAction = commandActions.get("meme <key:string> [...texts]");
    expect(memeAction).toBeDefined();

    const result = await memeAction!({ session: createSession() }, "yi");

    expect(result).toBeTruthy();
    expect(displayNameMocks.getMentionedTargetDisplayName).toHaveBeenCalled();
    expect(displayNameMocks.getSenderDisplayName).toHaveBeenCalled();
    expect(backendMocks.generate).toHaveBeenCalledWith(
      "yi",
      [],
      ["被@群昵称"],
      {},
    );
  });

  it("用户未提供文本且无 @ 用户时回退使用发送者群昵称", async () => {
    backendMocks.generate.mockReset();
    backendMocks.getInfo.mockReset();
    displayNameMocks.getMentionedTargetDisplayName.mockReset();
    displayNameMocks.getSenderDisplayName.mockReset();
    resetAvatarMocks();

    backendMocks.getInfo.mockResolvedValue({
      key: "yi",
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
    backendMocks.generate.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    });
    displayNameMocks.getMentionedTargetDisplayName.mockResolvedValue(undefined);
    displayNameMocks.getSenderDisplayName.mockReturnValue("发送者群昵称");

    const { ctx, commandActions } = createMockContext();
    registerCommands(ctx, createBaseConfig());

    const memeAction = commandActions.get("meme <key:string> [...texts]");
    expect(memeAction).toBeDefined();

    const result = await memeAction!({ session: createSession() }, "yi");

    expect(result).toBeTruthy();
    expect(displayNameMocks.getMentionedTargetDisplayName).toHaveBeenCalled();
    expect(displayNameMocks.getSenderDisplayName).toHaveBeenCalled();
    expect(backendMocks.generate).toHaveBeenCalledWith(
      "yi",
      [],
      ["发送者群昵称"],
      {},
    );
  });

  it("用户已提供文本时应保持用户文本", async () => {
    backendMocks.generate.mockReset();
    backendMocks.getInfo.mockReset();
    displayNameMocks.getMentionedTargetDisplayName.mockReset();
    displayNameMocks.getSenderDisplayName.mockReset();
    resetAvatarMocks();

    backendMocks.getInfo.mockResolvedValue({
      key: "yi",
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
    backendMocks.generate.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    });
    displayNameMocks.getMentionedTargetDisplayName.mockResolvedValue(
      "被@群昵称",
    );
    displayNameMocks.getSenderDisplayName.mockReturnValue("发送者群昵称");

    const { ctx, commandActions } = createMockContext();
    registerCommands(ctx, createBaseConfig());

    const memeAction = commandActions.get("meme <key:string> [...texts]");
    expect(memeAction).toBeDefined();

    const result = await memeAction!({ session: createSession() }, "yi", "123");

    expect(result).toBeTruthy();
    expect(backendMocks.generate).toHaveBeenCalledWith("yi", [], ["123"], {});
  });
});
