import { randomUUID } from 'node:crypto';
import { spawnCapture } from './telegram.mjs';
import { classify } from './dispatch-policy.mjs';

export async function dispatch(message, cfg = {}, force = 'auto', runner = spawnCapture) {
  const decision = classify(message, cfg, force);
  if (decision.blocked) {
    return { ok: false, output: '', finalAgent: 'none', decision, error: 'Explicit cloud authorization required for tool requests. Use !route !cloud.' };
  }
  const id = `smart-router-${randomUUID()}`;
  const localAgent = cfg.localAgent || 'pair';
  const cloudAgent = cfg.cloudAgent || 'main';
  const agentCall = async (agent, suffix = '') => {
    const thinking = agent === localAgent ? 'off' : 'low';
    const result = await runner('openclaw', ['agent', '--agent', agent, '--session-id', `${id}${suffix}`, '--thinking', thinking, '--message', message], (cfg.dispatcherTimeoutSeconds || 45) * 1000);
    const output = String(result.stdout || '').trim();
    const problematic = /Context overflow|Context window exceeded|Unknown model|LLM request timed out|couldn't finish this reply|failed to (?:run|respond)|connection error/i.test(`${output}\n${result.stderr || ''}`);
    return { ok: Boolean(result.ok && output && !problematic), output, error: result.error || result.stderr || (!output ? 'empty output' : undefined) };
  };
  let finalAgent = decision.agent;
  let result = await agentCall(finalAgent);
  // Paid fallback is strictly opt-in. Explicit local and cloud choices are never retried.
  if (!result.ok && finalAgent === localAgent && force === 'auto' && cfg.allowCloudFallback === true) {
    finalAgent = cloudAgent;
    result = await agentCall(finalAgent, '-fallback');
  }
  return { ...result, finalAgent, decision };
}
