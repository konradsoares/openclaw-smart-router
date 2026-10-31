// Deliberately conservative: unknown, tool-heavy, or conversational prompts go cloud.
export const TOOL_PATTERN = /\b(browse|search (?:the )?web|open (?:a )?url|read (?:a )?file|write (?:a )?file|run (?:a )?command|execute|deploy|delete|install|shell|terminal|github|calendar|email|schedule|remember|previous|earlier|attached|attachment|image|photo|pdf|analy[sz]e (?:this )?file|summari[sz]e (?:this )?document)\b/i;
export function classify(message, cfg = {}, force = 'auto') {
  if (force === 'local') return { agent: cfg.localAgent || 'pair', reason: 'forced-local' };
  if (force === 'cloud' || cfg.mode === 'cloud-only') return { agent: cfg.cloudAgent || 'main', reason: 'forced-cloud' };
  if (cfg.mode === 'observe') return { agent: cfg.cloudAgent || 'main', reason: 'observe' };
  const text = String(message || '').trim();
  if (!text || text.length > (cfg.localMaxChars || 800) || TOOL_PATTERN.test(text) || /\n/.test(text)) {
    return { agent: cfg.cloudAgent || 'main', reason: 'context-or-tools' };
  }
  return { agent: cfg.localAgent || 'pair', reason: 'short-text-no-tools' };
}
