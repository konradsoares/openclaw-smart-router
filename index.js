import { dispatch } from './dispatch.mjs';
import { parseTelegram, sendTelegram } from './telegram.mjs';
import { classify } from './dispatch-policy.mjs';
import { callColab, getColabRuntimeStatus } from './colab.mjs';
import { ColabHistory } from './colab-history.mjs';

export const DEFAULTS = { mode: 'route', telegramMode: 'off', telegramPrefix: '!route', localAgent: 'pair', cloudAgent: 'main', localMaxChars: 800, maxPromptChars: 1500, dispatcherTimeoutSeconds: 45, allowedTelegramIds: [], deliveryMethod: 'cli', colabGatewayUrl: 'http://127.0.0.1:18080/v1/chat/completions', colabTimeoutSeconds: 300, colabFallback: 'pair', colabProgress: true, colabProgressDelaySeconds: 15, allowCloudFallback: false };

export function createHandler(api, cfg, deps = { dispatch, sendTelegram, callColab, getColabRuntimeStatus }) {
  const inFlight = new Set();
  const colabHistory = new ColabHistory();
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
        const forced = msg.prompt.match(/^!(pair|cloud|colab)\s+([\s\S]+)$/i);
        const force = forced ? (forced[1].toLowerCase() === 'pair' ? 'local' : forced[1].toLowerCase() === 'cloud' ? 'cloud' : 'colab') : 'auto';
        const actualPrompt = forced ? forced[2] : msg.prompt;
        let result;
        if (force === 'colab') {
          // One-shot authenticated status check; never acts as a keep-alive.
          let before=null;
          try {before=await (deps.getColabRuntimeStatus||getColabRuntimeStatus)(cfg);}
          catch(e) {api.logger.warn('[smart-router] runtime visibility unavailable: '+String(e.message).slice(0,120));}
          let progressTimer;
          let progressSent = Promise.resolve();
          if (cfg.colabProgress !== false) {
            const initial=before?.status==='existing'?'♻️ Colab: GPU existente detectada, verificando Ollama. Deve responder mais rápido.':before?.status==='starting'?'⏳ Colab: runtime existente ainda sendo preparado. Pode demorar alguns minutos.':before?.status==='missing'||before?.status==='absent'?'🆕 Colab: não há GPU própria disponível. Preparando um novo runtime; a primeira resposta pode demorar alguns minutos.':'⏳ Colab selected. Checking the T4 GPU. If no runtime is available, one will be started automatically.';
            await deps.sendTelegram(msg.target,initial);
            progressTimer = setTimeout(() => {
              progressSent = Promise.resolve(deps.sendTelegram(msg.target, '⏳ Still waiting for Colab. The GPU and model may be initializing.')).catch(e => {
                api.logger.warn(`[smart-router] progress delivery failed: ${String(e.message).slice(0,120)}`);
              });
            }, Math.max(5, cfg.colabProgressDelaySeconds || 15) * 1000);
          }
          try {
            try {
              result = await colabHistory.run(msg.target,actualPrompt,messages=>(deps.callColab || callColab)(messages,cfg));
            }
            catch (err) {
              api.logger.warn(`[smart-router] Colab unavailable: ${String(err.message).slice(0,160)}`);
              if (cfg.colabFallback === 'pair') {
                if (cfg.colabProgress !== false) await deps.sendTelegram(msg.target, '⚠️ Colab indisponível. Tentando o agente local.');
                result = await deps.dispatch(actualPrompt, cfg, 'local', undefined, {sessionKey:msg.target});
              } else result = {ok:false,output:'',finalAgent:'colab'};
            }
          } finally {
            if (progressTimer) clearTimeout(progressTimer);
            await progressSent;
          }
          // Show reuse/new-runtime status only after all wait notifications are complete.
          if(cfg.colabProgress!==false && result?.ok && result.finalAgent==='colab' && before) {
            try {
              const after=await (deps.getColabRuntimeStatus||getColabRuntimeStatus)(cfg);
              if(after.runtime && after.status==='existing') {
                const reused=before.runtime===after.runtime && before.status==='existing';
                const label=after.runtime.slice(-8);
                await deps.sendTelegram(msg.target,reused?'♻️ Colab: runtime reutilizado ('+label+').':'✅ Colab: novo runtime preparado ('+label+').');
              }
            } catch(e) {api.logger.warn('[smart-router] postflight status unavailable: '+String(e.message).slice(0,120));}
          }
        } else result = await deps.dispatch(actualPrompt, cfg, force, undefined, {sessionKey:msg.target});
        route = result.finalAgent;
        response = result.ok ? (force === 'colab' ? `[${result.finalAgent === 'colab' ? 'Colab T4' : 'Local / pair'}] ${result.output}` : result.output) : (result.error || 'Smart Router failed to generate a reply. Check Gateway logs.');
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
