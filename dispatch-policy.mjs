// Tool-capable requests require explicit cloud authorization.
export const TOOL_PATTERN = /\b(browse|search (?:the )?web|open (?:a )?url|read (?:a )?file|write (?:a )?file|run (?:a )?command|execute|deploy|delete|install|shell|terminal|github|calendar|email|schedule|remember|previous|earlier|attached|attachment|image|photo|pdf|analy[sz]e (?:this )?file|summari[sz]e (?:this )?document)\b/i;

export function classify(message, cfg = {}, force = 'auto') {
  const local = cfg.localAgent || 'pair';
  const cloud = cfg.cloudAgent || 'main';
  if (force === 'local') return { agent: local, reason: 'forced-local' };
  if (force === 'cloud' || cfg.mode === 'cloud-only') return { agent: cloud, reason: 'forced-cloud' };
  if (cfg.mode === 'observe') return { agent: cloud, reason: 'observe' };
  const text = String(message || '').trim();
  if (!text) return { agent: 'none', reason: 'empty-message', blocked: true };
  if (TOOL_PATTERN.test(text)) {
    return { agent: cloud, reason: 'tool-authorization-required', blocked: true };
  }
  // Long and multiline prompts do not imply consent to paid inference.
  return { agent: local, reason: 'local-default' };
}
