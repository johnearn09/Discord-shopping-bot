require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { handleCommand } = require('./commands');
const { startScheduler } = require('./scheduler');

// Path to the persistent database file
const dbPath = path.join(__dirname, '..', 'database.json');

// Load database state
let db = {
    guilds: {
        default: {
            prefix: 'sho!',
            channels: { shopee: '', lazada: '', shein: '', r18: '' },
            schedules: {
                shopee: { intervalHours: 5, enabled: true, nextIndex: 0 },
                lazada: { intervalHours: 5, enabled: true, nextIndex: 0 },
                shein: { intervalHours: 5, enabled: true, nextIndex: 0 },
                r18: { intervalHours: 5, enabled: true, nextPage: 1 }
            },
            lastPosted: { shopee: 0, lazada: 0, shein: 0, r18: 0 }
        }
    },
    postedHistory: { shopee: [], lazada: [], shein: [], r18: [] }
};

if (fs.existsSync(dbPath)) {
    try {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        console.log('Database loaded successfully.');
    } catch (err) {
        console.error('Failed to load database.json. Using defaults.', err.message);
    }
}

function saveDb() {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        console.log('Database saved successfully.');
    } catch (err) {
        console.error('Failed to save database.json:', err.message);
    }
}

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    
    client.user.setPresence({
        activities: [{ name: 'sho!help | Auto Posting Deals 🛍️', type: ActivityType.Watching }],
        status: 'online'
    });

    startScheduler(client, db, saveDb);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || message.webhookId) return;

    try {
        await handleCommand(message, db, saveDb);
    } catch (err) {
        console.error(`Error handling command:`, err.message);
    }
});

// Lightweight HTTP Server for Render.com free-tier Web Service port-binding compatibility
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>🛍️ Shop Automation Bot Status: Active</h1><p>Running and listening. Keeping bot awake on Render.com free tier!</p>');
}).listen(PORT, () => {
    console.log(`📡 Lightweight ping HTTP server listening on port ${PORT}`);
});

// Log in the bot
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'YOUR_DISCORD_BOT_TOKEN_HERE') {
    console.error('❌ Error: DISCORD_TOKEN is missing or not configured in your .env file!');
    console.error('Please configure your bot token in the .env file before running.');
    process.exit(1);
}

client.login(token).catch(err => {
    console.error('❌ Failed to login to Discord:', err.message);
    process.exit(1);
});
