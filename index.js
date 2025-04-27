const TelegramBot = require('node-telegram-bot-api');

// Replace this with your bot token
const token = process.env.BOT_TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// In-memory storage
const users = {}; // userId => { signedUp: bool, isConnected: bool, partnerId: userId }
const waitingUsers = []; // list of online users waiting to connect

// Start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  if (!users[chatId]) {
    users[chatId] = { signedUp: false, isConnected: false, partnerId: null };
    await bot.sendMessage(chatId, `Welcome! Please /signup or /login to start chatting.`);
  } else {
    await bot.sendMessage(chatId, `Welcome back! Please /login to continue.`);
  }
});

// Signup
bot.onText(/\/signup/, async (msg) => {
  const chatId = msg.chat.id;

  if (users[chatId]?.signedUp) {
    await bot.sendMessage(chatId, `You already have an account. Just /login.`);
    return;
  }

  users[chatId] = { signedUp: true, isConnected: false, partnerId: null };
  await bot.sendMessage(chatId, `Signup successful! 🎉 Now /login to continue.`);
});

// Login
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;

  if (!users[chatId]?.signedUp) {
    await bot.sendMessage(chatId, `You don't have an account. Please /signup first.`);
    return;
  }

  await sendHome(chatId);
});

// Home Interface
async function sendHome(chatId) {
  await bot.sendMessage(chatId, `You are logged in. Click "Connect" to find a stranger!`, {
    reply_markup: {
      inline_keyboard: [[
        { text: "🔗 Connect", callback_data: 'connect' }
      ]]
    }
  });
}

// Handle button clicks
bot.on('callback_query', async (callbackQuery) => {
  const { message, data } = callbackQuery;
  const chatId = message.chat.id;

  if (data === 'connect') {
    if (users[chatId].isConnected) {
      await bot.sendMessage(chatId, `You're already connected!`);
      return;
    }
    await findPartner(chatId);
  }

  if (data === 'disconnect') {
    await disconnect(chatId);
  }
});

// Find a partner
async function findPartner(chatId) {
  if (waitingUsers.length > 0) {
    const partnerId = waitingUsers.shift();

    if (!users[partnerId]) {
      // partner disconnected before matching
      return await findPartner(chatId);
    }

    users[chatId].isConnected = true;
    users[chatId].partnerId = partnerId;

    users[partnerId].isConnected = true;
    users[partnerId].partnerId = chatId;

    await bot.sendMessage(chatId, `✅ Connected! Say hi to your stranger!`, disconnectMarkup());
    await bot.sendMessage(partnerId, `✅ Connected! Say hi to your stranger!`, disconnectMarkup());
  } else {
    waitingUsers.push(chatId);
    await bot.sendMessage(chatId, `Waiting for a stranger to connect...`);
  }
}

// Disconnect from partner
async function disconnect(chatId) {
  const partnerId = users[chatId]?.partnerId;

  if (partnerId && users[partnerId]) {
    users[partnerId].isConnected = false;
    users[partnerId].partnerId = null;

    await bot.sendMessage(partnerId, `🚫 Your partner disconnected.`, homeMarkup());
  }

  users[chatId].isConnected = false;
  users[chatId].partnerId = null;

  await bot.sendMessage(chatId, `🚫 Disconnected.`, homeMarkup());
}

// Inline keyboards
function homeMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "🔗 Connect", callback_data: 'connect' }
      ]]
    }
  };
}

function disconnectMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "❌ Disconnect", callback_data: 'disconnect' }
      ]]
    }
  };
}

// Handling messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Ignore system messages like button clicks
  if (msg.text.startsWith('/')) return;

  if (!users[chatId]?.isConnected) {
    await bot.sendMessage(chatId, `You are not connected to anyone. Click "Connect" first.`);
    return;
  }

  const partnerId = users[chatId].partnerId;

  if (partnerId && users[partnerId]) {
    await bot.sendMessage(partnerId, msg.text);
  } else {
    await bot.sendMessage(chatId, `Your partner is no longer available. Please /connect again.`);
    users[chatId].isConnected = false;
    users[chatId].partnerId = null;
  }
});
