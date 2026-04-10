/**
 * 头像工具单元测试
 * 覆盖 @用户头像提取与下载行为
 */

import { describe, expect, it, vi } from "vitest";

const imageMocks = vi.hoisted(() => ({
  downloadImage: vi.fn(async () => ({
    data: new Uint8Array([1, 2, 3]),
    filename: "mentioned-avatar.png",
    mimeType: "image/png",
  })),
}));

vi.mock("./image", () => ({
  downloadImage: imageMocks.downloadImage,
}));

import {
  getMentionedAvatarImages,
  getMentionedSecondaryAvatarImage,
  getMentionedTargetAvatarImage,
  getMentionedTargetDisplayName,
  getSenderDisplayName,
} from "./avatar";

function createCtx() {
  return {
    logger: vi.fn(() => ({
      warn: vi.fn(),
    })),
  } as any;
}

describe("getMentionedAvatarImages", () => {
  it("存在三个被@用户时按顺序返回三个头像", async () => {
    imageMocks.downloadImage.mockReset();
    imageMocks.downloadImage
      .mockResolvedValueOnce({
        data: new Uint8Array([1]),
        filename: "mentioned-1.png",
        mimeType: "image/png",
      })
      .mockResolvedValueOnce({
        data: new Uint8Array([2]),
        filename: "mentioned-2.png",
        mimeType: "image/png",
      })
      .mockResolvedValueOnce({
        data: new Uint8Array([3]),
        filename: "mentioned-3.png",
        mimeType: "image/png",
      });

    const getGuildMember = vi.fn(async (_guildId: string, userId: string) => ({
      avatar: `https://cdn.example.com/${userId}.png`,
    }));

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        { type: "at", attrs: { id: "10002" }, children: [] },
        { type: "at", attrs: { id: "10003" }, children: [] },
        { type: "at", attrs: { id: "10004" }, children: [] },
      ],
      bot: {
        getGuildMember,
        getUser: vi.fn(),
      },
    } as any;

    const result = await getMentionedAvatarImages(createCtx(), session, 3000);

    expect(getGuildMember).toHaveBeenNthCalledWith(1, "20001", "10002");
    expect(getGuildMember).toHaveBeenNthCalledWith(2, "20001", "10003");
    expect(getGuildMember).toHaveBeenNthCalledWith(3, "20001", "10004");
    expect(result).toHaveLength(3);
    expect(result.map((item) => item.filename)).toEqual([
      "mentioned-1.png",
      "mentioned-2.png",
      "mentioned-3.png",
    ]);
  });

  it("会跳过自身提及、特殊提及与重复提及", async () => {
    imageMocks.downloadImage.mockReset();
    imageMocks.downloadImage
      .mockResolvedValueOnce({
        data: new Uint8Array([4]),
        filename: "mentioned-a.png",
        mimeType: "image/png",
      })
      .mockResolvedValueOnce({
        data: new Uint8Array([5]),
        filename: "mentioned-b.png",
        mimeType: "image/png",
      });

    const getGuildMember = vi.fn(async (_guildId: string, userId: string) => ({
      avatar: `https://cdn.example.com/${userId}.png`,
    }));

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        { type: "at", attrs: { id: "all" }, children: [] },
        { type: "at", attrs: { id: "10001" }, children: [] },
        { type: "at", attrs: { id: "10002" }, children: [] },
        { type: "at", attrs: { id: "10002" }, children: [] },
        { type: "at", attrs: { id: "here" }, children: [] },
        { type: "at", attrs: { id: "10003" }, children: [] },
      ],
      bot: {
        getGuildMember,
        getUser: vi.fn(),
      },
    } as any;

    const result = await getMentionedAvatarImages(createCtx(), session, 3000);

    expect(getGuildMember).toHaveBeenNthCalledWith(1, "20001", "10002");
    expect(getGuildMember).toHaveBeenNthCalledWith(2, "20001", "10003");
    expect(result.map((item) => item.filename)).toEqual([
      "mentioned-a.png",
      "mentioned-b.png",
    ]);
  });

  it("中间某个被@用户头像解析失败时会跳过并继续后续用户", async () => {
    imageMocks.downloadImage.mockReset();
    imageMocks.downloadImage
      .mockResolvedValueOnce({
        data: new Uint8Array([6]),
        filename: "mentioned-ok-1.png",
        mimeType: "image/png",
      })
      .mockResolvedValueOnce({
        data: new Uint8Array([7]),
        filename: "mentioned-ok-3.png",
        mimeType: "image/png",
      });

    const getGuildMember = vi.fn(async (_guildId: string, userId: string) => {
      if (userId === "10003") {
        throw new Error("member failed");
      }
      return {
        avatar: `https://cdn.example.com/${userId}.png`,
      };
    });
    const getUser = vi
      .fn()
      .mockRejectedValueOnce(new Error("user failed"))
      .mockRejectedValueOnce(new Error("user failed again"));

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        { type: "at", attrs: { id: "10002" }, children: [] },
        { type: "at", attrs: { id: "10003" }, children: [] },
        { type: "at", attrs: { id: "10004" }, children: [] },
      ],
      bot: {
        getGuildMember,
        getUser,
      },
    } as any;

    const result = await getMentionedAvatarImages(createCtx(), session, 3000);

    expect(result.map((item) => item.filename)).toEqual([
      "mentioned-ok-1.png",
      "mentioned-ok-3.png",
    ]);
  });
});

describe("getMentionedTargetAvatarImage", () => {
  it("提取第一个非自身 @用户 并使用成员头像下载", async () => {
    imageMocks.downloadImage.mockReset();
    imageMocks.downloadImage.mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      filename: "mentioned-avatar.png",
      mimeType: "image/png",
    });

    const getGuildMember = vi.fn(async () => ({
      avatar: "https://cdn.example.com/member.png",
    }));
    const getUser = vi.fn();

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        { type: "at", attrs: { id: "10001" }, children: [] },
        { type: "at", attrs: { id: "10002" }, children: [] },
      ],
      bot: {
        getGuildMember,
        getUser,
      },
    } as any;

    const result = await getMentionedTargetAvatarImage(
      createCtx(),
      session,
      3000,
    );

    expect(getGuildMember).toHaveBeenCalledWith("20001", "10002");
    expect(getUser).not.toHaveBeenCalled();
    expect(imageMocks.downloadImage).toHaveBeenCalledWith(
      expect.anything(),
      "https://cdn.example.com/member.png",
      3000,
      "mentioned-avatar",
    );
    expect(result).toBeTruthy();
  });

  it("无 @用户 时返回 undefined", async () => {
    imageMocks.downloadImage.mockReset();

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [{ type: "text", attrs: { content: "hello" }, children: [] }],
      bot: {
        getGuildMember: vi.fn(),
        getUser: vi.fn(),
      },
    } as any;

    const result = await getMentionedTargetAvatarImage(
      createCtx(),
      session,
      3000,
    );

    expect(result).toBeUndefined();
    expect(imageMocks.downloadImage).not.toHaveBeenCalled();
  });

  it("群成员头像不存在时回退 getUser(guild) 与 getUser", async () => {
    imageMocks.downloadImage.mockReset();
    imageMocks.downloadImage.mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      filename: "mentioned-avatar.png",
      mimeType: "image/png",
    });

    const getGuildMember = vi.fn(async () => ({
      avatar: undefined,
      user: {},
    }));
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({ avatar: undefined })
      .mockResolvedValueOnce({ avatar: "https://cdn.example.com/user.png" });

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [{ type: "at", attrs: { id: "10002" }, children: [] }],
      bot: {
        getGuildMember,
        getUser,
      },
    } as any;

    const result = await getMentionedTargetAvatarImage(
      createCtx(),
      session,
      3000,
    );

    expect(getGuildMember).toHaveBeenCalledWith("20001", "10002");
    expect(getUser).toHaveBeenNthCalledWith(1, "10002", "20001");
    expect(getUser).toHaveBeenNthCalledWith(2, "10002");
    expect(imageMocks.downloadImage).toHaveBeenCalledWith(
      expect.anything(),
      "https://cdn.example.com/user.png",
      3000,
      "mentioned-avatar",
    );
    expect(result).toBeTruthy();
  });

  it("getGuildMember 抛错时继续回退 getUser", async () => {
    imageMocks.downloadImage.mockReset();
    imageMocks.downloadImage.mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      filename: "mentioned-avatar.png",
      mimeType: "image/png",
    });

    const getGuildMember = vi.fn(async () => {
      throw new Error("member failed");
    });
    const getUser = vi.fn().mockResolvedValueOnce({
      avatar: "https://cdn.example.com/user-guild.png",
    });

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [{ type: "at", attrs: { id: "10002" }, children: [] }],
      bot: {
        getGuildMember,
        getUser,
      },
    } as any;

    const result = await getMentionedTargetAvatarImage(
      createCtx(),
      session,
      3000,
    );

    expect(getGuildMember).toHaveBeenCalledWith("20001", "10002");
    expect(getUser).toHaveBeenCalledWith("10002", "20001");
    expect(result).toBeTruthy();
  });

  it("可从 attrs.userId 与 attrs.qq 提取被@用户", async () => {
    imageMocks.downloadImage.mockReset();
    imageMocks.downloadImage.mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      filename: "mentioned-avatar.png",
      mimeType: "image/png",
    });

    const getGuildMember = vi.fn(async () => ({
      avatar: "https://cdn.example.com/user-id.png",
    }));
    const getUser = vi.fn(async () => ({ avatar: undefined }));

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        {
          type: "text",
          attrs: {},
          children: [{ type: "at", attrs: { userId: "10002" }, children: [] }],
        },
        { type: "at", attrs: { qq: "10003" }, children: [] },
      ],
      bot: {
        getGuildMember,
        getUser,
      },
    } as any;

    const result = await getMentionedTargetAvatarImage(
      createCtx(),
      session,
      3000,
    );

    expect(getGuildMember).toHaveBeenCalledWith("20001", "10002");
    expect(result).toBeTruthy();
  });

  it("@all 或 @here 不应触发头像补全", async () => {
    imageMocks.downloadImage.mockReset();

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        { type: "at", attrs: { id: "all" }, children: [] },
        { type: "at", attrs: { id: "here" }, children: [] },
      ],
      bot: {
        getGuildMember: vi.fn(),
        getUser: vi.fn(),
      },
    } as any;

    const result = await getMentionedTargetAvatarImage(
      createCtx(),
      session,
      3000,
    );

    expect(result).toBeUndefined();
    expect(imageMocks.downloadImage).not.toHaveBeenCalled();
  });
});

describe("getMentionedSecondaryAvatarImage", () => {
  it("存在两个被@用户时返回第二个用户头像", async () => {
    imageMocks.downloadImage.mockReset();
    imageMocks.downloadImage.mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      filename: "mentioned-secondary-avatar.png",
      mimeType: "image/png",
    });

    const getGuildMember = vi.fn(async (_guildId: string, userId: string) => {
      if (userId === "10003") {
        return { avatar: "https://cdn.example.com/user2.png" };
      }
      return { avatar: "https://cdn.example.com/user1.png" };
    });

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        { type: "at", attrs: { id: "10002" }, children: [] },
        { type: "at", attrs: { id: "10003" }, children: [] },
      ],
      bot: {
        getGuildMember,
        getUser: vi.fn(),
      },
    } as any;

    const result = await getMentionedSecondaryAvatarImage(
      createCtx(),
      session,
      3000,
    );

    expect(getGuildMember).toHaveBeenCalledWith("20001", "10003");
    expect(imageMocks.downloadImage).toHaveBeenCalledWith(
      expect.anything(),
      "https://cdn.example.com/user2.png",
      3000,
      "mentioned-secondary-avatar",
    );
    expect(result).toBeTruthy();
  });

  it("仅有一个被@用户时返回 undefined", async () => {
    imageMocks.downloadImage.mockReset();

    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [{ type: "at", attrs: { id: "10002" }, children: [] }],
      bot: {
        getGuildMember: vi.fn(),
        getUser: vi.fn(),
      },
    } as any;

    const result = await getMentionedSecondaryAvatarImage(
      createCtx(),
      session,
      3000,
    );

    expect(result).toBeUndefined();
    expect(imageMocks.downloadImage).not.toHaveBeenCalled();
  });
});

describe("getSenderDisplayName", () => {
  it("发送者昵称会清洗控制字符并截断长度", () => {
    const session = {
      author: {
        nick: `${"b".repeat(90)}\n\u0000`,
      },
      event: { user: {} },
      username: "",
    } as any;

    const result = getSenderDisplayName(session);

    expect(result).toBe("b".repeat(64));
  });
});

describe("getMentionedTargetDisplayName", () => {
  it("优先使用 at.name 作为被@昵称", async () => {
    const getGuildMember = vi.fn();
    const getUser = vi.fn();
    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        { type: "at", attrs: { id: "10002", name: "被@群昵称" }, children: [] },
      ],
      bot: {
        getGuildMember,
        getUser,
      },
    } as any;

    const result = await getMentionedTargetDisplayName(session);

    expect(result).toBe("被@群昵称");
    expect(getGuildMember).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("at.name 超长或含控制字符时会清洗并截断", async () => {
    const getGuildMember = vi.fn();
    const getUser = vi.fn();
    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [
        {
          type: "at",
          attrs: {
            id: "10002",
            name: `${"a".repeat(80)}\n\u0000`,
          },
          children: [],
        },
      ],
      bot: {
        getGuildMember,
        getUser,
      },
    } as any;

    const result = await getMentionedTargetDisplayName(session);

    expect(result).toBe("a".repeat(64));
    expect(getGuildMember).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("at.name 缺失时回退群成员 nick/name 与 user 昵称字段", async () => {
    const getGuildMember = vi.fn(async () => ({
      nick: "成员群昵称",
      name: "成员名",
      user: { nick: "用户昵称", name: "用户名" },
    }));
    const getUser = vi.fn();
    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [{ type: "at", attrs: { id: "10002" }, children: [] }],
      bot: {
        getGuildMember,
        getUser,
      },
    } as any;

    const result = await getMentionedTargetDisplayName(session);

    expect(result).toBe("成员群昵称");
    expect(getGuildMember).toHaveBeenCalledWith("20001", "10002");
  });

  it("无被@时返回 undefined", async () => {
    const session = {
      userId: "10001",
      guildId: "20001",
      elements: [{ type: "text", attrs: { content: "hello" }, children: [] }],
      bot: {
        getGuildMember: vi.fn(),
        getUser: vi.fn(),
      },
    } as any;

    const result = await getMentionedTargetDisplayName(session);

    expect(result).toBeUndefined();
  });
});
