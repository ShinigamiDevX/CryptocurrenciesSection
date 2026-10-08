'use strict';
/**
 * Bot Telegram per avvisi Criptogram (notifica cieca, solo al destinatario).
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME (senza @), PORTAL_URL
 */
const crypto = require('crypto');

function createTelegramCriptogram({ TelegramLinks, portalUrl }) {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
    const base = `https://api.telegram.org/bot${token}`;
    let pollOffset = 0;
    let polling = false;

    function enabled() {
        return !!(token && botUsername);
    }

    async function api(method, body) {
        if (!token) return null;
        const res = await fetch(`${base}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
            const desc = (data && data.description) || res.statusText || 'errore';
            throw new Error(desc);
        }
        return data.result;
    }

    async function sendText(chatId, text) {
        try {
            await api('sendMessage', {
                chat_id: chatId,
                text,
                disable_web_page_preview: true,
            });
            return true;
        } catch (err) {
            console.warn('[Telegram Criptogram] sendMessage:', err.message || err);
            return false;
        }
    }

    function deepLink(code) {
        return `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`;
    }

    function createLinkForUser(userId) {
        if (!enabled()) {
            return { error: 'Bot Telegram non configurato sul server (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME).' };
        }
        const pending = TelegramLinks.getPendingCode(userId);
        if (pending) {
            return {
                code: pending.code,
                expiresAt: pending.expiresAt,
                botUsername,
                linkUrl: deepLink(pending.code),
                reused: true,
            };
        }
        const code = crypto.randomBytes(18).toString('base64url');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        TelegramLinks.createCode(userId, code, expiresAt);
        return {
            code,
            expiresAt,
            botUsername,
            linkUrl: deepLink(code),
            reused: false,
        };
    }

    function accountHintForUser(user) {
        if (!user) return '';
        const uname = String(user.username || '').trim();
        if (uname) return uname;
        const nome = String(user.nome || '').trim();
        const cognome = String(user.cognome || '').trim();
        if (cognome && nome) return cognome.toUpperCase() + ' ' + nome;
        if (nome) return nome;
        if (cognome) return cognome.toUpperCase();
        return String(user.email || '').trim() || user.id || '';
    }

    function isSuperadminUser(user) {
        return !!(user && user.role === 'superadmin' && user.accountType !== 'strumento');
    }

    function statusForUser(userId, accountLabel) {
        const links = TelegramLinks.listByUserId(userId);
        let mustShareDevice = false;
        let Users = null;
        try {
            Users = require('./db').Users;
            mustShareDevice = isSuperadminUser(Users.findById(userId));
        } catch { /* ignore */ }

        const devices = links.map((link) => {
            const peers = TelegramLinks.listByChatId(link.chatId)
                .filter((r) => String(r.userId) !== String(userId));
            const sharedWith = peers.map((r) => {
                const u = Users ? Users.findById(r.userId) : null;
                return accountHintForUser(u) || r.userId;
            }).filter(Boolean);
            const shared = peers.length >= 1;
            return {
                chatId: link.chatId,
                telegramUsername: link.telegramUsername || '',
                linkedAt: link.linkedAt,
                shared,
                sharedWith,
                notifyActive: !mustShareDevice || shared,
            };
        });

        const deviceShared = devices.some((d) => d.shared);
        const notifyActive = devices.some((d) => d.notifyActive);
        const allPeers = [...new Set(devices.flatMap((d) => d.sharedWith))];
        const primary = devices[devices.length - 1] || null;

        return {
            configured: enabled(),
            botUsername: botUsername || null,
            linked: devices.length > 0,
            telegramUsername: primary ? (primary.telegramUsername || '') : '',
            linkedAt: primary ? primary.linkedAt : null,
            portalAccount: accountLabel || '',
            mustShareDevice,
            multiDevice: mustShareDevice,
            deviceCount: devices.length,
            devices,
            deviceShared,
            sharedWith: allPeers,
            notifyActive,
        };
    }

    async function handleUpdate(update) {
        const msg = update && update.message;
        if (!msg || !msg.chat) return;
        const chatId = String(msg.chat.id);
        const chatType = String(msg.chat.type || '');
        const text = String(msg.text || '').trim();
        const from = msg.from || {};
        const username = from.username ? String(from.username) : '';

        if (text === '/start' || text.startsWith('/start ')) {
            if (chatType !== 'private') {
                await sendText(chatId, 'Per privacy, collega Criptogram solo in chat privata con il bot (non in gruppi).');
                return;
            }
            const payload = text === '/start' ? '' : text.slice(7).trim();
            if (!payload) {
                await sendText(chatId,
                    'Per collegare Criptogram inquadra il QR dal tuo Profilo sul portale.');
                return;
            }
            const row = TelegramLinks.consumeCode(payload);
            if (!row) {
                await sendText(chatId, 'Codice non valido o scaduto. Apri di nuovo il Profilo sul portale e scansiona il QR.');
                return;
            }
            let isSa = false;
            let accountHint = row.userId;
            try {
                const { Users } = require('./db');
                const u = Users.findById(row.userId);
                accountHint = accountHintForUser(u) || row.userId;
                isSa = isSuperadminUser(u);
            } catch { /* ignore */ }
            TelegramLinks.upsertLink(row.userId, chatId, username, { multiDevice: isSa });
            const shareCount = TelegramLinks.countByChatId(chatId);
            const deviceCount = TelegramLinks.countByUserId(row.userId);
            let extra = 'Qui riceverai avvisi quando qualcuno ti scrive su Criptogram.';
            if (isSa && shareCount < 2) {
                extra = 'Il Super Admin deve condividere QUESTO dispositivo con almeno un altro utente del portale.\n'
                    + 'Fai scansionare (da questo telefono) il QR dell\'altro account.\n'
                    + 'Puoi collegare altri dispositivi allo stesso modo (anche tutti gli utenti, su più telefoni).'
                    + (deviceCount > 1 ? ('\nDispositivi Super Admin collegati: ' + deviceCount + '.') : '');
            } else if (shareCount >= 2) {
                extra = 'Dispositivo condiviso tra ' + shareCount + ' account portale.\n'
                    + 'Qui riceverai avvisi quando qualcuno scrive a uno di questi account.'
                    + (isSa && deviceCount > 1 ? ('\nSuper Admin attivo su ' + deviceCount + ' dispositivi.') : '');
            }
            await sendText(chatId,
                'Collegato all\'account Criptogram:\n'
                + accountHint + '\n\n'
                + extra);
            return;
        }

        if (text === '/stop' || text === '/unlink') {
            const links = TelegramLinks.listByChatId(chatId);
            if (links.length) TelegramLinks.unlinkChat(chatId);
            await sendText(chatId,
                links.length > 1
                    ? ('Criptogram scollegato da ' + links.length + ' account su questo dispositivo. Non riceverai più avvisi qui.')
                    : 'Criptogram scollegato. Non riceverai più avvisi qui.');
            return;
        }

        if (text === '/help') {
            await sendText(chatId,
                'Bot avvisi Criptogram.\n/start — collega col QR dal Profilo\n/stop — scollega tutti gli account su questo dispositivo\n'
                + 'Il Super Admin può condividere più dispositivi (ognuno con almeno un altro utente).\n'
                + 'Gli avvisi non contengono il testo dei messaggi.');
        }
    }

    async function pollOnce() {
        if (!enabled()) return;
        const result = await api('getUpdates', {
            offset: pollOffset,
            timeout: 25,
            allowed_updates: ['message'],
        });
        if (!Array.isArray(result)) return;
        for (const upd of result) {
            pollOffset = Math.max(pollOffset, (upd.update_id || 0) + 1);
            try {
                await handleUpdate(upd);
            } catch (err) {
                console.warn('[Telegram Criptogram] update:', err.message || err);
            }
        }
    }

    function startPolling() {
        if (!enabled() || polling) return;
        polling = true;
        console.log(`[Telegram Criptogram] Bot @${botUsername} attivo (notifiche cieche, solo destinatari).`);
        const loop = async () => {
            try {
                await api('deleteWebhook', { drop_pending_updates: false });
            } catch (err) {
                console.warn('[Telegram Criptogram] deleteWebhook:', err.message || err);
            }
            while (polling) {
                try {
                    await pollOnce();
                } catch (err) {
                    console.warn('[Telegram Criptogram] poll:', err.message || err);
                    await new Promise((r) => setTimeout(r, 3000));
                }
            }
        };
        loop();
    }

    /**
     * Notifica SOLO gli userId indicati (destinatari), mai il mittente.
     * Niente body del messaggio; include etichetta mittente se fornita.
     */
    function notifyBlind(recipientUserIds, { excludeUserIds, fromLabel, groupName, event } = {}) {
        if (!enabled() || !recipientUserIds || !recipientUserIds.length) return;
        const exclude = new Set(
            (Array.isArray(excludeUserIds) ? excludeUserIds : [])
                .map((id) => String(id || '').trim())
                .filter(Boolean)
        );
        const uniq = [...new Set(
            recipientUserIds.map((id) => String(id || '').trim()).filter((id) => id && !exclude.has(id))
        )];
        if (!uniq.length) return;

        const who = String(fromLabel || '').trim() || 'un utente';
        const group = String(groupName || '').replace(/\s+/g, ' ').trim();
        let text;
        if (event === 'added-to-group') {
            text = 'Sei stato aggiunto al gruppo ' + (group || 'gruppo') + ' da ' + who + '.';
        } else {
            const first = group
                ? ('Hai un nuovo messaggio sul gruppo ' + group + ' da ' + who + '.')
                : ('Hai un nuovo messaggio da ' + who + '.');
            text = [first, 'Apri il portale per leggerlo.'].join('\n');
        }

        setImmediate(() => {
            (async () => {
                const sentChats = new Set();
                let Users = null;
                try { Users = require('./db').Users; } catch { /* ignore */ }
                for (const userId of uniq) {
                    const links = TelegramLinks.listByUserId(userId);
                    if (!links.length) continue;
                    const u = Users ? Users.findById(userId) : null;
                    const isSa = isSuperadminUser(u);
                    for (const link of links) {
                        if (!link || !link.chatId) continue;
                        if (String(link.userId) !== String(userId)) continue;
                        if (isSa && TelegramLinks.countByChatId(link.chatId) < 2) {
                            console.warn('[Telegram Criptogram] skip: Super Admin dispositivo non condiviso', link.chatId);
                            continue;
                        }
                        const n = Number(link.chatId);
                        if (!Number.isFinite(n) || n <= 0) {
                            console.warn('[Telegram Criptogram] skip: chat non privata', link.chatId);
                            continue;
                        }
                        if (sentChats.has(String(link.chatId))) continue;
                        sentChats.add(String(link.chatId));
                        console.log('[Telegram Criptogram] notify → user', String(userId).slice(0, 8), 'chat', link.chatId);
                        await sendText(link.chatId, text);
                    }
                }
            })().catch((err) => console.warn('[Telegram Criptogram] notify loop:', err.message || err));
        });
    }

    return {
        enabled,
        botUsername: () => botUsername,
        statusForUser,
        createLinkForUser,
        unlink: (userId) => TelegramLinks.unlink(userId),
        notifyBlind,
        startPolling,
        handleUpdate,
    };
}

module.exports = { createTelegramCriptogram };
