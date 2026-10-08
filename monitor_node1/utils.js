const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { connectDb } = require('./db');
require('dotenv').config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN mancante in .env');
}
const bot = botToken ? new TelegramBot(botToken) : null;
const ALERT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1001777798084';

async function sendTelegramMessage(chatId, message) {
    if (!bot) {
        console.warn('[Telegram] Bot non configurato, messaggio non inviato.');
        return;
    }
    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Failed to send Telegram message:', error);
    }
}

async function fetchAddresses() {
    console.log('------------------Inizio controllo----------------');
    const connection = await connectDb();
    try {
    const [rows] = await connection.execute("SELECT i.*, p.nome FROM indirizzi AS i JOIN proprietari AS p ON i.proid = p.id WHERE i.monitoring = 1");

    let btcAddresses = [];
    let ethAddresses = [];
    for (let row of rows) {
        if (row.blockchain === 'BTC') {
            btcAddresses.push(row.indirizzo);
        } else if (row.blockchain === 'ETH') {
            ethAddresses.push(row.indirizzo);
            const balance = await getBalance('ETH', row.indirizzo);
            if (balance !== null) {
                await processBalanceChange(row, balance, connection);
            }
        }
    }
    console.log("Processo " + ethAddresses.length + " Indirizzi ETH.");
    console.log("Processo " + btcAddresses.length + " Indirizzi BTC.");

    // Process BTC addresses in batches of 100
    for (let i = 0; i < btcAddresses.length; i += 100) {
        let batch = btcAddresses.slice(i, Math.min(i + 100, btcAddresses.length));
        let balances = await getBalancesBTC(batch);
        for (let j = 0; j < batch.length; j++) {
            let balance = balances[batch[j]];
            if (balance !== undefined) {
                // Assuming you can map each BTC address back to its corresponding row data
                let row = rows.find(r => r.indirizzo === batch[j]);
                await processBalanceChange(row, balance, connection);
            }
        }
    }

    console.log('------------------Fine controllo----------------\n\n');
    } finally {
        try { await connection.end(); } catch (_) { /* ignore */ }
    }
}

async function getBalance(chain, address) {
    let url = (chain === 'ETH') ? `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=EK-5jF4G-kyjTNYu-3Sjfw` : null;
    try {
        const response = await axios.get(url);
        const data = response.data;
        return parseFloat(data.ETH.balance);
    } catch (error) {
        console.error('Failed to get balance:', error);
        return null;
    }
}

async function getBalancesBTC(addresses) {
    let url = `https://blockchain.info/balance?active=${addresses.join('|')}`;
    try {
        const response = await axios.get(url);
        const data = response.data;
        return Object.keys(data).reduce((acc, key) => {
            acc[key] = data[key]['final_balance'] / 100000000; // Convert from satoshi to BTC
            return acc;
        }, {});
    } catch (error) {
        console.error('Failed to get BTC balances:', error);
        return {};
    }
}

// Funzione per processare il cambio di saldo
async function processBalanceChange(row, balance, connection) {
    console.log("Processo " + row.indirizzo + " balance " + balance);
    const { indirizzo: address, balance: prev_balance, id, blockchain: chain, nome: owner, note } = row;

    const newBalance = parseFloat(balance);
    const oldBalance = parseFloat(prev_balance);
    // Soglia allineata a toFixed(4) nei messaggi: sotto 0.0001 è rumore API/float, non un movimento visibile.
    const MIN_ALERT_DELTA = 0.0001;

    if (!Number.isFinite(newBalance)) return;
    if (!Number.isFinite(oldBalance)) {
        try {
            await connection.execute('UPDATE indirizzi SET balance = ? WHERE id = ?', [newBalance, id]);
            console.log(`Balance iniziale salvata per ${address}: ${newBalance}`);
        } catch (error) {
            console.error('Failed to set initial balance:', error);
        }
        return;
    }

    if (Math.abs(newBalance - oldBalance) >= MIN_ALERT_DELTA) {
        console.log('Differenza di balance rilevata');
        const query = 'UPDATE indirizzi SET balance = ? WHERE id = ?';
        const values = [newBalance, id];

        try {
            const [result] = await connection.execute(query, values);
            console.log(`Updated balance for address ${address}. Rows affected: ${result.affectedRows}`);

            const delta = Math.abs(newBalance - oldBalance);
            const shortF = address.substring(0, 5);
            const shortL = address.substring(address.length - 5);
            let message;

            if (newBalance > oldBalance) {
                message = `- *${owner}* ha ricevuto *${delta.toFixed(4)} ${chain}*\nDa: [${shortF}...${shortL}](https://www.blockchain.com/explorer/addresses/${chain.toLowerCase()}/${address})\nVecchio Balance: ${oldBalance.toFixed(4)}\nNuovo Balance: ${newBalance.toFixed(4)}\nNote: ${note}`;
            } else {
                message = `- *${owner}* ha inviato *${delta.toFixed(4)} ${chain}*\nDa: [${shortF}...${shortL}](https://www.blockchain.com/explorer/addresses/${chain.toLowerCase()}/${address})\nVecchio Balance: ${oldBalance.toFixed(4)}\nNuovo Balance: ${newBalance.toFixed(4)}\nNote: ${note}`;
            }

            await sendTelegramMessage(ALERT_CHAT_ID, message);
        } catch (error) {
            console.error('Failed to update balance:', error);
        }
    }
}


module.exports = { sendTelegramMessage, fetchAddresses };
