import { createHash, randomBytes } from 'node:crypto';
import { inputRequired, inputResponse, type CallToolResult, type InputRequiredResult, type ServerContext } from '@modelcontextprotocol/server';
import { text } from './http.js';
import type { JsonSchema, ToolDef } from './types.js';

export const TOKEN_TTL_MS = 5 * 60_000;
export const TOKEN_QUIET_MS = 10_000;

export const CONFIRM_TOKEN_SCHEMA: JsonSchema = {
  type: 'string',
  description: '确认码。客户端不支持弹窗确认时，第一次调用只返回操作预览和确认码；把预览告诉用户并得到同意后，用相同参数带上确认码再调一次。支持弹窗确认的客户端不需要这个参数',
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 给用户看的操作预览：工具、首句说明、逐个参数；product 带上中文产品名 */
export function preview(tool: ToolDef, args: Record<string, unknown>): string {
  const lines = [`${tool.title}（${tool.name}）`, tool.description.split(/[。；]/)[0]];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    lines.push(`- ${k}：${render(tool, k, v)}`);
  }
  return lines.join('\n');
}

function render(tool: ToolDef, key: string, v: unknown): string {
  if (key === 'product') {
    // 产品中文名就在 product 参数的描述里："产品：dynamic-monthly=动态住宅流量（期限），…"
    const desc = tool.inputSchema.properties.product?.description ?? '';
    const m = desc.match(new RegExp(`${escapeRegExp(String(v))}=([^，,]+)`));
    return m ? `${String(v)}（${m[1]}）` : String(v);
  }
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon((v as Record<string, unknown>)[k])]))
  : v;
const fingerprint = (tool: string, args: Record<string, unknown>): string =>
  createHash('sha256').update(tool + JSON.stringify(canon(args))).digest('hex');

/**
 * 客户端不支持弹窗确认时用的一次性确认码：绑定工具与参数，过期或参数变了都作废。
 * 发出后有静默期，用于限制紧接预览的自动重试；服务不能仅凭等待时间判断用户是否同意。
 * 提前使用不消费确认码，只顺延生效时间；助手仍须等待用户明确同意，不能等待到期后自动执行。
 */
export class ConfirmTokens {
  private pending = new Map<string, { fp: string; expires: number; notBefore: number }>();
  constructor(private now: () => number = Date.now, private quietMs: number = TOKEN_QUIET_MS) {}

  issue(tool: string, args: Record<string, unknown>): string {
    const t = this.now();
    for (const [k, p] of this.pending) if (p.expires < t) this.pending.delete(k); // 过期的顺手清掉，长会话里不会越积越多
    const token = randomBytes(4).toString('hex');
    this.pending.set(token, { fp: fingerprint(tool, args), expires: t + TOKEN_TTL_MS, notBefore: t + this.quietMs });
    return token;
  }

  consume(token: string, tool: string, args: Record<string, unknown>): 'ok' | 'unknown' | 'expired' | 'mismatch' | 'too_soon' {
    const p = this.pending.get(token);
    if (!p) return 'unknown';
    const t = this.now();
    if (p.expires < t) {
      this.pending.delete(token);
      return 'expired';
    }
    if (p.fp !== fingerprint(tool, args)) {
      this.pending.delete(token);
      return 'mismatch';
    }
    if (t < p.notBefore) {
      p.notBefore = t + this.quietMs;
      return 'too_soon';
    }
    this.pending.delete(token);
    return 'ok';
  }
}

export interface ConfirmDeps {
  supportsElicitation: (ctx: ServerContext) => boolean;
  exec: (args: Record<string, unknown>) => Promise<CallToolResult>;
  tokens: ConfirmTokens;
}

/**
 * 写操作先确认再执行。客户端支持弹窗（elicitation）就弹给用户点；没拿到同意或不支持就退到确认码：
 * 只回预览和确认码，模型转述给用户后带码重调。
 */
export function withConfirm(tool: ToolDef, deps: ConfirmDeps) {
  return async (input: Record<string, unknown>, ctx: ServerContext): Promise<CallToolResult | InputRequiredResult> => {
    const { confirm_token, ...args } = input;

    if (typeof confirm_token === 'string' && confirm_token) {
      const state = deps.tokens.consume(confirm_token, tool.name, args);
      if (state === 'mismatch') return text('确认码对应的参数与本次不同，已作废。请不带确认码重新调用，重新向用户确认。', true);
      if (state === 'too_soon') {
        return text('确认码还不能用：这次调用仍在静默期内。时间限制不代表用户已经同意；必须把预览转述给用户并等待明确回复，服务无法仅凭时间验证用户授权。现在停下来等待回复；不要立刻重试，每提前试一次生效时间都会顺延。每一次操作都要单独确认，之前确认过同样的操作也不例外。', true);
      }
      if (state !== 'ok') return text('确认码无效或已过期。请不带确认码重新调用，重新向用户确认。', true);
      return deps.exec(args);
    }

    let note = '';
    if (deps.supportsElicitation(ctx)) {
      const answer = inputResponse(ctx.mcpReq.inputResponses, 'confirm');
      if (answer.kind === 'missing') {
        return inputRequired({
          inputRequests: {
            confirm: inputRequired.elicit({
              message: `${preview(tool, args)}\n\n确认执行以上操作？`,
              requestedSchema: {
                type: 'object',
                properties: { confirm: { type: 'boolean', title: '确认执行', description: '勾选表示同意执行上述操作' } },
                required: ['confirm'],
              },
            }),
          },
        });
      }
      if (answer.kind === 'elicit' && answer.action === 'accept' && answer.content?.confirm === true) return deps.exec(args);
      // 有的客户端声明能弹窗却不显示就直接回 decline，把它当拒绝会让写操作在这类客户端永远做不成；
      // 弹窗没拿到同意就一律退到确认码，让用户在对话里确认
      note = '弹窗没有得到确认（可能客户端没显示弹窗，也可能用户拒绝了）。';
    }

    const token = deps.tokens.issue(tool.name, args);
    return text(
      `${note}待确认，尚未执行。\n${preview(tool, args)}\n\n请把以上内容原样告诉用户；用户明确同意后，用相同参数加 confirm_token=${token} 再调用一次（5 分钟内有效，只能用一次；必须等待用户明确同意，时间限制不代表授权）。用户不同意就不要再调。每一次操作都要单独确认，之前确认过同样的操作也不例外。`,
      false,
    );
  };
}
