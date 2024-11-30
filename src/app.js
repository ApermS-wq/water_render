const express = require('express');
const { Client } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Настройка базы данных
const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

dbClient.connect()
    .then(() => console.log('Connected to database'))
    .catch((err) => console.error('Database connection error:', err));

// Настройка middleware
app.use(express.json());
app.use(express.static(path.join( 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join('public', 'index.html'));
});

// Пример API для получения данных пользователя
app.get('/get-user-data', async (req, res) => {
    const userId = req.query.user_id;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        const result = await dbClient.query('SELECT balance, buckets, username FROM users WHERE user_id = $1', [userId]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
