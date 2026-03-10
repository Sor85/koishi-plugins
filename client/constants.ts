/**
 * 前端常量定义
 * 包含导航、工具、变量的配置映射
 */

export interface NavSection {
  title: string;
  key: string;
}

export interface ToolItem {
  name: string;
  enableKey: string;
  enabled: boolean;
}

export interface VariableItem {
  name: string;
  key: string;
  enabled: boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  { title: "好感度设置", key: "affinity" },
  { title: "黑名单设置", key: "blacklist" },
  { title: "关系设置", key: "relationship" },
  { title: "变量设置", key: "variables" },
  { title: "XML 工具设置", key: "xmlTools" },
  { title: "其他设置", key: "otherSettings" },
];

export const TITLE_TO_KEY: Record<string, string> = {
  好感度设置: "affinity",
  黑名单设置: "blacklist",
  关系设置: "relationship",
  变量设置: "variables",
  "XML 工具设置": "xmlTools",
  其他设置: "otherSettings",
};

export const KEY_TO_TITLE: Record<string, string> = {
  affinity: "好感度设置",
  blacklist: "黑名单设置",
  relationship: "关系设置",
  variables: "变量设置",
  xmlTools: "XML 工具设置",
  otherSettings: "其他设置",
};

export const VARIABLE_CONFIG: Record<
  string,
  { section: string; searchKey: string | string[] }
> = {
  affinity: { section: "变量设置", searchKey: "affinityVariableName" },
  relationshipLevel: {
    section: "变量设置",
    searchKey: "relationshipLevelVariableName",
  },
  blacklistList: {
    section: "变量设置",
    searchKey: "blacklistListVariableName",
  },
  userAlias: {
    section: "变量设置",
    searchKey: "userAliasVariableName",
  },
};

export const PLUGIN_NAME = "koishi-plugin-chatluna-affinity";
