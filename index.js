const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const express = require("express");

const TOKEN = "BOT-TOKEN";
const bot = new TelegramBot(TOKEN);
const app = express();
app.use(express.json());

const URL = process.env.BOT_URL || "https://telegram-anonymous-chat-i3zq.onrender.com"; // Replace with your actual domain
bot.setWebHook(`${URL}/bot${TOKEN}`);

const usersFilePath = path.join(__dirname, "users.json");
let users = loadUsers();
let cooldowns = {};
const COOLDOWN_TIME = 10000; // 10 seconds

const fixedButtons = {
    reply_markup: {
        keyboard: [
            [{ text: "🔍 Find" }, { text: "❌ Stop" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true
    }
};

function loadUsers() {
    if (fs.existsSync(usersFilePath)) {
        const data = fs.readFileSync(usersFilePath, "utf8");
        return JSON.parse(data);
    }
    return {};
}

function saveUsers() {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

function addUser(userId) {
    if (!users[userId]) {
        users[userId] = {
            id: userId,
            isConnected: false,
            partner: null
        };
        saveUsers();
    }
}

function findAvailableUser(excludeId) {
    const userIds = Object.keys(users);
    for (let id of userIds) {
        if (id !== excludeId && !users[id].isConnected) {
            return id;
        }
    }
    return null;
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id.toString();
    addUser(chatId);

    bot.sendMessage(chatId, "👋 Welcome to Anonymous Chat!\n\nUse 🔍 Find to connect with someone, or ❌ Stop to end the chat.", fixedButtons);
});

bot.on("message", (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;

    if (text.startsWith("/")) return;
    addUser(chatId);

    if (text === "🔍 Find") {
        const now = Date.now();
        if (cooldowns[chatId] && now - cooldowns[chatId] < COOLDOWN_TIME) {
            bot.sendMessage(chatId, "⏳ Please wait before trying again.", fixedButtons);
            return;
        }
        cooldowns[chatId] = now;

        if (users[chatId].isConnected) {
            bot.sendMessage(chatId, "⚠️ You are already connected. Click ❌ Stop to end the chat.", fixedButtons);
            return;
        }

        const matchId = findAvailableUser(chatId);
        if (matchId) {
            users[chatId].isConnected = true;
            users[chatId].partner = matchId;

            users[matchId].isConnected = true;
            users[matchId].partner = chatId;

            saveUsers();

            bot.sendMessage(chatId, "✅ You're now connected! Say hi.", fixedButtons);
            bot.sendMessage(matchId, "✅ You're now connected! Say hi.", fixedButtons);
        } else {
            bot.sendMessage(chatId, "❌ No users are available right now. Try again later.", fixedButtons);
        }
        return;
    }

    if (text === "❌ Stop") {
        if (!users[chatId].isConnected) {
            bot.sendMessage(chatId, "⚠️ You're not connected to anyone.", fixedButtons);
            return;
        }

        const partnerId = users[chatId].partner;

        users[chatId].isConnected = false;
        users[chatId].partner = null;

        if (partnerId && users[partnerId]) {
            users[partnerId].isConnected = false;
            users[partnerId].partner = null;
            bot.sendMessage(partnerId, "🚫 Your chat partner has disconnected.", fixedButtons);
        }

        saveUsers();
        bot.sendMessage(chatId, "✅ You have disconnected.", fixedButtons);
        return;
    }

    // Forward messages
    if (users[chatId] && users[chatId].isConnected) {
        const partnerId = users[chatId].partner;
        if (partnerId && users[partnerId] && users[partnerId].isConnected) {
            bot.sendMessage(partnerId, text);
        } else {
            bot.sendMessage(chatId, "⚠️ Your partner has disconnected.", fixedButtons);
            users[chatId].isConnected = false;
            users[chatId].partner = null;
            saveUsers();
        }
    }
});

// Express endpoint for Telegram WebHook
app.post(`/bot${TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Health check route
app.get("/", (req, res) => {
    res.send("Bot is running with webhooks!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Express server is up and running.");
});
