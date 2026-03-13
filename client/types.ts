/**
 * 前端类型定义
 * 包含配置接口和组件 Props 类型
 */

export interface BlacklistEntry {
  userId: string;
  nickname: string;
  blockedAt: string;
  note: string;
  platform: string;
}

export interface TemporaryBlacklistEntry {
  userId: string;
  nickname: string;
  blockedAt: string;
  expiresAt: string;
  durationHours: string;
  penalty: string;
  note: string;
  platform: string;
}

export interface VariableSettings {
  affinityVariableName?: string;
  relationshipLevelVariableName?: string;
  blacklistListVariableName?: string;
}

export interface XmlToolSettings {
  enableAffinityXmlToolCall?: boolean;
  enableBlacklistXmlToolCall?: boolean;
  enableRelationshipXmlToolCall?: boolean;
  enableUserAliasXmlToolCall?: boolean;
  characterPromptTemplate?: string;
}

export interface FrontendConfigSubset {
  scopeId?: string;
  affinityInitSelfIds?: string[];
  affinityEnabled?: boolean;
  affinityDisplayRange?: number;
  rankRenderAsImage?: boolean;
  rankDefaultLimit?: number;

  blacklistLogInterception?: boolean;
  unblockPermanentInitialAffinity?: number;
  blacklistDefaultLimit?: number;
  blacklistRenderAsImage?: boolean;
  shortTermBlacklistRenderAsImage?: boolean;

  inspectRenderAsImage?: boolean;
  inspectShowImpression?: boolean;
  debugLogging?: boolean;

  variableSettings?: VariableSettings;
  xmlToolSettings?: XmlToolSettings;

  affinityVariableName?: string;
  relationshipLevelVariableName?: string;
  blacklistListVariableName?: string;
}
