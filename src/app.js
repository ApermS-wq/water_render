const express = require('express');
const { Client } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    keepAlive: true,
    idleTimeoutMillis: 30000,
});

dbClient.connect()
    .then(() => console.log('Подключение к базе данных установлено'))
    .catch((err) => console.error('Ошибка подключения к базе данных:', err));

app.use(express.json());
app.use(express.static(path.join( 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join('public', 'index.html'));
});

// Генерация уникального ключа
function generateUniqueKey() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 6 }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
}

// Функция для проверки/добавления пользователя
async function ensureUserExists(userId, username) {
    const uniqueKey = generateUniqueKey();
    const query = `
        INSERT INTO users (user_id, username, unique_key, balance, buckets)
        VALUES ($1, $2, $3, 0, 3)
        ON CONFLICT (user_id) DO UPDATE SET username = $2;
    `;
    await dbClient.query(query, [userId, username, uniqueKey]);
}

// Команда /start для Telegram-бота
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'unknown';

    await ensureUserExists(userId, username);

    // Извлечение данных пользователя
    const result = await dbClient.query('SELECT balance, buckets, username FROM users WHERE user_id = $1', [userId]);
    const { balance, buckets } = result.rows[0];

    // Ссылка на приложение
    const link = `${process.env.DEPLOYED_URL}/?user_id=${userId}`;

    bot.sendPhoto(chatId, 'https://ideogram.ai/assets/progressive-image/balanced/response/jd7xFqMLSaSerpA8uQl1Dw', {
        caption: `Привет, ${username}!\nВаш текущий баланс: ${balance}\nОсталось вёдер: ${buckets}`,
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Открыть приложение', web_app: { url: link } }]
            ]
        }
    });
});

// Эндпоинт для получения данных пользователя
app.get('/get-user-data', async (req, res) => {
    const userId = req.query.user_id;

    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    try {
        const result = await dbClient.query('SELECT balance, buckets, username FROM users WHERE user_id = $1', [userId]);
        if (result.rows.length > 0) {
            const { balance, buckets, username } = result.rows[0];
            res.json({ balance, buckets, username });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Ошибка при получении данных:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Эндпоинт для игры
app.post('/play-game', async (req, res) => {
    const userId = req.query.user_id;

    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    try {
        const result = await dbClient.query('SELECT balance, buckets FROM users WHERE user_id = $1', [userId]);
        const { balance, buckets } = result.rows[0];

        if (buckets <= 0) {
            res.json({
                balance,
                buckets,
                message: "У вас кончились вёдра",
                bucketIconUrl: "https://cdn-icons-png.flaticon.com/256/482/482463.png"
            });
        } else {
            const earnedAmount = Math.floor(Math.random() * 1000);
            await dbClient.query('UPDATE users SET balance = balance + $1, buckets = buckets - 1 WHERE user_id = $2', [earnedAmount, userId]);

            const updatedResult = await dbClient.query('SELECT balance, buckets FROM users WHERE user_id = $1', [userId]);
            const { balance: newBalance, buckets: newBuckets } = updatedResult.rows[0];

            res.json({ balance: newBalance, buckets: newBuckets, earnedAmount });
        }
    } catch (error) {
        console.error('Ошибка при игре:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Эндпоинт для сохранения кошелька
app.post('/save-wallet', async (req, res) => {
    const { user_id, wallet_address } = req.body;

    if (!user_id || !wallet_address) {
        return res.status(400).send('User ID and wallet address are required.');
    }

    try {
        await dbClient.query(
            'UPDATE users SET wallet_address = $1 WHERE user_id = $2',
            [wallet_address, user_id]
        );
        res.status(200).send('Wallet address saved successfully.');
    } catch (error) {
        console.error('Ошибка при сохранении кошелька:', error);
        res.status(500).send('Error saving wallet address.');
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
