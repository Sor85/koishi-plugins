/**
 * 详情渲染器
 * 渲染好感度详情卡片图片
 */

import type { Context } from "koishi";
import type { LogFn } from "../types";
import { renderHtml } from "./base";
import { COMMON_STYLE } from "./styles";

export interface InspectData {
  userId: string;
  nickname: string;
  platform: string;
  relation: string;
  compositeAffinity: number;
  longTermAffinity: number;
  shortTermAffinity: number;
  coefficient: number;
  streak: number;
  chatCount: number;
  lastInteraction: string;
  avatarUrl?: string;
  impression?: string;
}

const INSPECT_STYLE = `
    ${COMMON_STYLE}
    .card-inspect {
      background: #ffffff;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    }
    .header-inspect {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid #f3f4f6;
    }
    .avatar-lg {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid #e5e7eb;
    }
    .avatar-placeholder-lg {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      font-weight: 600;
      font-size: 32px;
    }
    .nickname-lg {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-item {
      background: #f9fafb;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      transition: all 0.2s;
    }
    .stat-value-lg {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      font-feature-settings: "tnum";
      line-height: 1.2;
    }
    .stat-value-lg.primary {
      color: #ec4899;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-top: 1px solid #f3f4f6;
      font-size: 14px;
    }
    .detail-label {
      color: #6b7280;
    }
    .detail-val {
      font-weight: 600;
      color: #374151;
    }
    .impression-section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #f3f4f6;
    }
    .impression-title {
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 10px;
    }
    .impression-content {
      font-size: 14px;
      color: #374151;
      line-height: 1.6;
      background: #f9fafb;
      border-radius: 8px;
      padding: 12px;
    }
`;

function buildInspectHtml(data: InspectData): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>${INSPECT_STYLE}</style>
</head>
<body>
  <div class="container" style="width: 480px; padding: 40px;" id="inspect-root">
    <div class="card-inspect">
      <div class="header-inspect">
        ${
          data.avatarUrl
            ? `<img class="avatar-lg" src="${data.avatarUrl}" onerror="this.style.display='none'" />`
            : `<div class="avatar-placeholder-lg">${data.nickname.charAt(0)}</div>`
        }
        <div class="user-info">
          <div class="nickname-lg">${data.nickname}</div>
          <div class="sub-text" style="font-size: 14px;">${data.platform ? `${data.platform}/` : ""}${data.userId}</div>
          ${data.relation && data.relation !== "——" ? `<span class="badge" style="margin-top: 8px; display: inline-block;">${data.relation}</span>` : ""}
        </div>
      </div>
      
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value-lg primary">${data.compositeAffinity}</div>
          <div class="stat-label">好感度</div>
        </div>
        <div class="stat-item">
          <div class="stat-value-lg">${data.chatCount}</div>
          <div class="stat-label">互动次数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value-lg" style="font-size: 20px; color: #4b5563;">${data.longTermAffinity}</div>
          <div class="stat-label">长期好感度</div>
        </div>
        <div class="stat-item">
          <div class="stat-value-lg" style="font-size: 20px; color: #4b5563;">${data.shortTermAffinity}</div>
          <div class="stat-label">短期好感度</div>
        </div>
      </div>

      <div class="detail-list">
        <div class="detail-row">
          <span class="detail-label">好感度系数</span>
          <span class="detail-val">${data.coefficient.toFixed(2)}（连续 ${data.streak} 天）</span>
        </div>
        <div class="detail-row" style="border-bottom: 1px solid #f3f4f6;">
          <span class="detail-label">最后互动</span>
          <span class="detail-val">${data.lastInteraction || "——"}</span>
        </div>
      </div>
      ${
        data.impression
          ? `
      <div class="impression-section">
        <div class="impression-title">印象</div>
        <div class="impression-content">${data.impression}</div>
      </div>`
          : ""
      }
    </div>
  </div>
</body>
</html>`;
}

export function createInspectRenderer(ctx: Context, log?: LogFn) {
  return async function renderInspect(
    data: InspectData,
  ): Promise<Buffer | null> {
    const html = buildInspectHtml(data);
    return renderHtml(
      ctx,
      html,
      {
        width: 480,
        height: 600,
        selector: "#inspect-root",
      },
      log,
    );
  };
}

export type InspectRenderer = ReturnType<typeof createInspectRenderer>;
