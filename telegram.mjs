import { spawn } from 'node:child_process';
export function parseTelegram(event, ctx, cfg) {
  const channel = String(ctx?.channelId ?? event?.channel ?? '').toLowerCase();
  if (channel !== 'telegram' || event?.isGroup) return null;
  const body = String(event?.content ?? event?.body ?? '').trim();
  const prefix = cfg.telegramPrefix || '!route';
  if (!body.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  if (body.length > prefix.length && !/\s/.test(body[prefix.length])) return null;
  const prompt = body.slice(prefix.length).trim();
  const target = [ctx?.conversationId, ctx?.senderId, event?.senderId]
    .map(x => String(x ?? '').replace(/^telegram:/i, ''))
    .find(x => /^-?\d+$/.test(x));
  const sender = String(ctx?.senderId ?? event?.senderId ?? '').replace(/^telegram:/i, '');
  const messageId = String(ctx?.messageId ?? event?.messageId ?? '');
  if (!target || !messageId || !sender) return { error: 'missing-identity', target, messageId, sender };
  return { prompt, target, messageId, sender };
}

export function spawnCapture(command, args, timeoutMs = 45000, maxBytes = 1024 * 1024) {
  return new Promise(resolve => {
    let child;
    try { child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env }); }
    catch (e) { resolve({ ok: false, error: e.message }); return; }
    let stdout = '', stderr = '', settled = false, timedOut = false, truncated = false;
    const append = (s, chunk) => { const next = s + chunk.toString(); if (Buffer.byteLength(next) > maxBytes) { truncated = true; return next.slice(-maxBytes); } return next; };
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 2000).unref(); }, timeoutMs);
    child.stdout?.on('data', b => { stdout = append(stdout, b); });
    child.stderr?.on('data', b => { stderr = append(stderr, b); });
    child.on('error', e => finish({ ok: false, error: e.message }));
    child.on('close', code => finish({ ok: code === 0 && !timedOut && !truncated, stdout, stderr, code, timedOut, truncated, error: timedOut ? 'timeout' : truncated ? 'output-truncated' : code !== 0 ? stderr.slice(-700) : undefined }));
  });
}
export async function sendTelegram(target, text, runner = spawnCapture) {
  if (!/^-?\d+$/.test(String(target))) throw Error('invalid Telegram target');
  if (typeof text !== 'string' || !text.trim()) throw Error('empty Telegram response');
  const parts = text.match(/[\s\S]{1,3900}/g) || [];
  for (const part of parts) {
    const result = await runner('openclaw', ['message', 'send', '--channel', 'telegram', '--target', String(target), '--message', part], 30000);
    if (!result.ok) throw Error(`Telegram delivery failed: ${result.error || result.stderr || 'unknown'}`);
  }
}
