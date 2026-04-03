/**
 * 插件配置类型
 * 定义工具、XML 与变量配置结构
 */

export type OneBotProtocol = "napcat" | "llbot";

export interface NativeToolItemConfig {
  enabled: boolean;
  toolName: string;
  description: string;
}

export interface NativeToolsConfig {
  enableNapCatProtocol: boolean;
  enableLlbotProtocol: boolean;
  poke: NativeToolItemConfig;
  setSelfProfile: NativeToolItemConfig;
  setGroupCard: NativeToolItemConfig;
  setGroupBan: NativeToolItemConfig;
  setMsgEmoji: NativeToolItemConfig;
  deleteMessage: NativeToolItemConfig;
}

export interface XmlToolsConfig {
  injectXmlToolAsReplyTool: boolean;
  enablePokeXmlTool: boolean;
  enableEmojiXmlTool: boolean;
  enableDeleteXmlTool: boolean;
  enableBanXmlTool: boolean;
  referencePrompt: string;
}

export type MemberInfoItem =
  | "userId"
  | "nickname"
  | "role"
  | "level"
  | "title"
  | "gender"
  | "age"
  | "area"
  | "joinTime"
  | "lastSentTime";

export interface UserInfoConfig {
  variableName: string;
  items: MemberInfoItem[];
}

export interface BotInfoConfig {
  variableName: string;
  items: MemberInfoItem[];
}

export type GroupInfoItem =
  | "groupName"
  | "groupId"
  | "memberCount"
  | "createTime"
  | "ownerList"
  | "adminList";

export interface GroupInfoConfig {
  variableName: string;
  items: GroupInfoItem[];
}

export interface GroupShutListConfig {
  variableName: string;
}

export interface RandomConfig {
  variableName: string;
  min: number;
  max: number;
}

export interface VariablesConfig {
  userInfo: UserInfoConfig;
  botInfo: BotInfoConfig;
  groupInfo: GroupInfoConfig;
  groupShutList: GroupShutListConfig;
  random: RandomConfig;
}

export interface Config
  extends NativeToolsConfig, XmlToolsConfig, VariablesConfig {
  debugLogging: boolean;
}

export interface LogFn {
  (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    meta?: unknown,
  ): void;
}

export interface MemberInfo {
  userId?: string;
  user_id?: string;
  id?: string;
  qq?: string;
  uid?: string;
  role?: string;
  roleName?: string;
  permission?: string;
  identity?: string;
  roles?: string[];
  card?: string;
  remark?: string;
  displayName?: string;
  nick?: string;
  nickname?: string;
  name?: string;
  level?: string | number;
  levelName?: string;
  level_name?: string;
  level_info?: {
    current_level?: string | number;
    level?: string | number;
  };
  title?: string;
  specialTitle?: string;
  special_title?: string;
  sex?: string | number;
  gender?: string | number;
  age?: string | number;
  area?: string;
  region?: string;
  location?: string;
  join_time?: string | number;
  joined_at?: string | number;
  joinTime?: string | number;
  joinedAt?: string | number;
  joinTimestamp?: string | number;
  last_sent_time?: string | number;
  lastSentTime?: string | number;
  lastSpeakTimestamp?: string | number;
  user?: {
    nickname?: string;
    name?: string;
  };
}
