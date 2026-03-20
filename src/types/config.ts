/**
 * 配置相关类型定义
 * 包含插件配置及各子模块配置类型
 */

export interface ShortTermConfig {
  promoteThreshold: number;
  demoteThreshold: number;
  longTermPromoteStep: number;
  longTermDemoteStep: number;
  longTermStep?: number;
  resetBiasRange?: number;
}

export interface ActionWindowConfig {
  windowHours: number;
  increaseBonus: number;
  decreaseBonus: number;
  bonusChatThreshold: number;
  maxEntries: number;
}

export interface CoefficientConfig {
  base: number;
  maxDrop: number;
  maxBoost: number;
  decayPerDay: number;
  boostPerDay: number;
}

export interface AffinityDynamicsConfig {
  shortTerm?: Partial<ShortTermConfig>;
  actionWindow?: Partial<ActionWindowConfig>;
  coefficient?: Partial<CoefficientConfig>;
}

export interface RelationshipLevel {
  min: number;
  max: number;
  relation: string;
  note?: string;
}

export interface ManualRelationship {
  userId: string;
  relation: string;
  note?: string;
}

export interface VariableSettings {
  affinityVariableName: string;
  relationshipLevelVariableName: string;
  blacklistListVariableName: string;
}

export interface XmlToolSettings {
  enableAffinityXmlToolCall: boolean;
  enableBlacklistXmlToolCall: boolean;
  enableRelationshipXmlToolCall: boolean;
  enableUserAliasXmlToolCall: boolean;
  characterPromptTemplate: string;
}

export interface Config {
  scopeId: string;
  botSelfIds: string[];
  affinityEnabled: boolean;
  affinityDisplayRange: number;
  initialAffinity: number;
  affinityDynamics?: AffinityDynamicsConfig;
  blacklistLogInterception: boolean;
  shortTermBlacklistPenalty: number;
  unblockPermanentInitialAffinity: number;
  rankDefaultLimit: number;
  rankRenderAsImage: boolean;
  blacklistDefaultLimit: number;
  inspectRenderAsImage: boolean;
  inspectShowImpression: boolean;
  debugLogging: boolean;
  blacklistRenderAsImage: boolean;
  shortTermBlacklistRenderAsImage: boolean;
  relationships: ManualRelationship[];
  relationshipAffinityLevels: RelationshipLevel[];
  variableSettings: VariableSettings;
  xmlToolSettings: XmlToolSettings;
}
