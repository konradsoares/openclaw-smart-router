import { dispatch } from './dispatch.mjs';
import { parseTelegram, sendTelegram } from './telegram.mjs';
import { classify } from './dispatch-policy.mjs';

export const DEFAULTS = { mode: 'route', telegramMode: 'off', telegramPrefix: '!route', localAgent: 'pair', cloudAgent: 'main', localMaxChars: 800, maxPromptChars: 1500, dispatcherTimeoutSeconds: 45, allowedTelegramIds: [], deliveryMethod: 'cli' };

export function createHandler(api, cfg, deps = { dispatch, sendTelegram }) {
  const inFlight = new Set();
  return async (event, ctx) => {
    if (cfg.telegramMode !== 'prefix') return;
    const msg = parseTelegram(event, ctx, cfg);
    if (!msg) return;
    if (msg.error) { api.logger.warn('[smart-router] missing Telegram identifiers; not claiming message'); return; }
    const allowed = cfg.allowedTelegramIds || [];
    // Empty list is deliberately NOT open access; safer default for public releases.
    if (!allowed.includes(msg.sender) && !allowed.includes(msg.target)) {
      api.logger.warn('[smart-router] unauthorized Telegram sender; refusing interception');
      return; // Let underlying Telegram/OpenClaw access policy decide handling.
    }
    const key = `${msg.target}:${msg.messageId}`;
    if (inFlight.has(key)) return { handled: true };
    inFlight.add(key);
    try {
      let response;
      let route = 'none';
      if (msg.prompt === 'delivery probe') response = 'SMART ROUTER DELIVERY OK';
      else if (!msg.prompt || msg.prompt.length > cfg.maxPromptChars) response = `Usage: ${cfg.telegramPrefix} <1-${cfg.maxPromptChars} characters>`;
      else {
        // Optional explicit agent overrides; retained for debugging.
        const forced = msg.prompt.match(/^!(pair|cloud)\s+([\s\S]+)$/i);
        const force = forced ? (forced[1].toLowerCase() === 'pair' ? 'local' : 'cloud') : 'auto';
        const actualPrompt = forced ? forced[2] : msg.prompt;
        const result = await deps.dispatch(actualPrompt, cfg, force);
        route = result.finalAgent;
        response = result.ok ? result.output : 'Smart Router failed to generate a reply. Check Gateway logs.';
      }
      await deps.sendTelegram(msg.target, response);
      api.logger.info(`[smart-router] delivered messageId=${msg.messageId} agent=${route}`);
    } catch (e) {
      api.logger.error(`[smart-router] delivery/dispatch failed messageId=${msg.messageId} error=${String(e?.message || e).slice(0, 300)}`);
    } finally { inFlight.delete(key); }
    return { handled: true };
  };
}

export default {
  id: 'smart-router',
  name: 'Smart Router (Local / Cloud)',
  register(api) {
    const cfg = { ...DEFAULTS, ...(api.pluginConfig || {}) };
    api.logger.info(`[smart-router] beta enabled telegramMode=${cfg.telegramMode}`);
    api.on('before_dispatch', createHandler(api, cfg));
    // Log-only: do not override model resolution of main or specialised agents.
    api.on('before_model_resolve', (event, ctx) => {
      if (ctx?.agentId !== cfg.cloudAgent) return;
      const choice = classify(event?.prompt, cfg);
      api.logger.info(`[smart-router] model resolve observed route=${choice.agent} reason=${choice.reason}`);
      return undefined;
    });
  }
};
