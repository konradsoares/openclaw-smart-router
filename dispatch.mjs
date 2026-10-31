import { randomUUID } from 'node:crypto';
import { spawnCapture } from './telegram.mjs';
import { classify } from './dispatch-policy.mjs';
export async function dispatch(message, cfg = {}, force = 'auto', runner = spawnCapture) {
  const decision = classify(message, cfg, force);
  const id = `smart-router-${randomUUID()}`;
  const agentCall = async (agent, suffix = '') => {
    const result = await runner('openclaw', ['agent', '--agent', agent, '--session-id', `${id}${suffix}`, '--thinking', agent === cfg.localAgent ? 'off' : 'low', '--message', message], (cfg.dispatcherTimeoutSeconds || 45) * 1000);
    const output = String(result.stdout || '').trim();
    const problematic = /Context overflow|Context window exceeded|Unknown model|LLM request timed out|couldn't finish this reply|failed to (?:run|respond)|connection error/i.test(`${output}\n${result.stderr || ''}`);
    return { ok: Boolean(result.ok && output && !problematic), output, error: result.error || result.stderr || (!output ? 'empty output' : undefined) };
  };
  let finalAgent = decision.agent;
  let result = await agentCall(finalAgent);
  // Never replay the main agent automatically: it could use tools with side effects.
  if (!result.ok && finalAgent === (cfg.localAgent || 'pair') && force !== 'local') {
    finalAgent = cfg.cloudAgent || 'main';
    result = await agentCall(finalAgent, '-fallback');
  }
  return { ...result, finalAgent, decision };
}
