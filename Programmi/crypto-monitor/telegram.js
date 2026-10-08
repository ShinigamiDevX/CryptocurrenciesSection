import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const out = {};
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i < 0) continue;
      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function resolveTelegramConfig() {
  const shared = readEnvFile(path.resolve(__dirname, '../../monitor_node1/.env'));
  const token = process.env.TELEGRAM_BOT_TOKEN || shared.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.TELEGRAM_CHAT_ID || shared.TELEGRAM_CHAT_ID || '-1001777798084';
  return { token: String(token).trim(), chatId: String(chatId).trim() };
}

export async function sendTelegramMessage(message, chatIdOverride) {
  const { token, chatId } = resolveTelegramConfig();
  const dest = chatIdOverride || chatId;
  if (!token || !dest) {
    console.warn('[Telegram] Token o chatId mancanti: notifica non inviata.');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: dest,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[Telegram] sendMessage failed:', res.status, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Telegram] sendMessage error:', e.message);
    return false;
  }
}

function fmtAmount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n ?? '');
  if (Math.abs(x) >= 1) return x.toLocaleString('it-IT', { maximumFractionDigits: 8 });
  return x.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function buildQuantityMessage(changes, actorEmail) {
  const who = actorEmail || 'utente';
  const lines = changes.map((c) => {
    const symbol = String(c.symbol || '').toUpperCase() || '?';
    const name = c.assetName || symbol;
    if (c.type === 'create') {
      return `• *Nuovo sequestro* ${name} (*${symbol}*): *${fmtAmount(c.newAmount)}*\n  Procedimento: ${c.proceeding || '—'}\n  Wallet: \`${c.walletAddress || '—'}\``;
    }
    const delta = Number(c.newAmount) - Number(c.oldAmount);
    const sign = delta > 0 ? '+' : '';
    return `• *${name}* (*${symbol}*): ${fmtAmount(c.oldAmount)} → *${fmtAmount(c.newAmount)}* (${sign}${fmtAmount(delta)})\n  Procedimento: ${c.proceeding || '—'}\n  Wallet: \`${c.walletAddress || '—'}\``;
  });
  return `📦 *CryptoMonitor — variazione quantità*\nOperatore: ${who}\n\n${lines.join('\n\n')}`;
}

/**
 * Notifica solo variazioni di quantità (amount), non di prezzo.
 */
export async function notifyQuantityChanges(changes, actorEmail) {
  if (!Array.isArray(changes) || !changes.length) return;
  const msg = buildQuantityMessage(changes, actorEmail);
  if (msg.length <= 4000) {
    await sendTelegramMessage(msg);
    return;
  }
  // Spezza per limiti Telegram
  const header = `📦 *CryptoMonitor — variazione quantità*\nOperatore: ${actorEmail || 'utente'}\n`;
  let buf = header;
  for (const c of changes) {
    const piece = '\n' + buildQuantityMessage([c], actorEmail).split('\n\n').slice(1).join('\n\n');
    if ((buf + piece).length > 3800) {
      await sendTelegramMessage(buf);
      buf = header + piece;
    } else {
      buf += piece;
    }
  }
  if (buf.trim()) await sendTelegramMessage(buf);
}
