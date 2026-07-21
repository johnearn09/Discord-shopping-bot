# 🛍️ Discord Shop Automation Bot

A premium Discord bot designed to auto-post shopping deals from Shopee, Lazada, Shein, and Shopilya (R18 toys) into specific channels. It supports paginated viewing (pages 1 to 5, 10 items per page), automatic rotating posting, and tracking parameters injection to ensure you receive your affiliate commissions.

---

## 🛠️ Step-by-Step Discord Bot Setup

This bot is designed to be secure and does **not** require broad `Administrator` permissions. Follow these steps to set it up:

### 1. Create the Discord Application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** in the top right. Name it (e.g., `Shop Deals Poster`) and save.
3. Select the **Bot** tab on the left sidebar.
4. Click **Add Bot** and confirm.
5. In the **Privileged Gateway Intents** section on the Bot page, scroll down and enable:
   - **Message Content Intent** (Required so the bot can read commands like `sho!shop` and `sho!help`).
6. Click **Reset Token**, copy the token, and save it in your `.env` file under `DISCORD_TOKEN`.

### 2. Generate the Bot Invite Link (No Admin Perms Required)
1. Select the **OAuth2** tab on the left sidebar, then click **URL Generator**.
2. Under **Scopes**, select only:
   - `bot`
3. A new section **Bot Permissions** will appear below. Select only the following permissions:
   - `View Channels` (Read Messages)
   - `Send Messages`
   - `Embed Links`
   - `Read Message History`
4. Copy the generated URL at the bottom of the page.
5. Open this URL in a browser and add the bot to your Discord Server.

---

## ⚙️ Configuration & Affiliate Commission Setup

Open the `.env` file in the project folder:
- **DISCORD_TOKEN**: Paste your Discord bot token here.
- **Affiliate parameters**: The tracking query strings for Shopee, Lazada, Shein, and Shopilya are pre-loaded. The bot automatically appends these tracking query parameters to all product links it posts.
  
To change tracking parameters, simply update the corresponding variable in `.env`:
```env
DISCORD_TOKEN=your_token_here
LAZADA_AFFILIATE_PARAMS=?exlaz=...
SHEIN_AFFILIATE_PARAMS=?onelink=...
SHOPILYA_AFFILIATE_PARAMS=?src=...
SHOPEE_AFFILIATE_PARAMS=
```

---

## 🎮 Bot Commands

Prefix defaults to `sho!`. If configured as `sho!`, it will also accept `shop!` as a fallback (helpful for non-tech-savvy users). Admin commands require the member to have **Manage Channels** or **Manage Guild** permission.

### Public Commands (Available to everyone)
- `sho!help` (or `shop!help`) - Display the control panel showing active mappings, prefix, and schedule.
- `sho!shop <category>` (or `shop!shop <category>`) - View Page 1 (10 items) of a store (defaults to Page 1 for easy use).
- `sho!shop <category> <page_number>` - View a specific page (pages 1 to 5) showing 10 items.
  - *Categories:* `shopee`, `lazada`, `shein`, `r18`
  - *Example:* `sho!shop r18 3` or `shop!shop shopee`

### Settings Commands (Requires Manage Channels/Guild)
- `sho!prefix <new_prefix>` - Change the command prefix (e.g. `sho!prefix s!`).
- `sho!channel <category> <channel_id>` - Remap the category destination channel. You can mention the channel (e.g. `#shopee-deals`) or paste the channel ID.
- `sho!schedule <category> <interval_hours>` - Change posting frequency (e.g. `sho!schedule shopee 5`).
- `sho!schedule <category> <enable/disable>` - Turn the automatic scheduler for that feed on or off.

---

## 🚀 GitHub Upload Instructions

When uploading this project to GitHub, **never upload your `.env` file** (to protect your bot token). 

The project includes a `.gitignore` file that automatically prevents git from tracking `node_modules` and `.env`. 

To push your project to a new GitHub repository, run these commands in your project root:
```bash
git init
git add .
git commit -m "Initial commit of Discord Shop Automation Bot"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

The files uploaded to GitHub will be:
- `deals/` (Shopee, Lazada, Shein product lists)
- `src/` (bot, commands, fetcher, scheduler)
- `package.json`
- `database.json`
- `.gitignore`
- `start.bat`
- `test.js`
- `README.md`

---

## 🌐 Render.com Deployment Guide (Free Tier)

Render's free tier requires applications to bind to a port and keep receiving traffic, otherwise, they sleep. The bot has a **built-in ping HTTP server** to enable it to run on the free tier.

### 1. Create a Web Service
1. Log in to [Render.com](https://render.com/).
2. Click **New** -> **Web Service**.
3. Connect your GitHub account and select your repository.
4. Set the following configurations:
   - **Name**: `discord-shop-bot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

### 2. Configure Environment Variables
Scroll down and click **Advanced** -> **Add Environment Variable**. Add the keys from your `.env` file:
* `DISCORD_TOKEN` = (Your actual Discord Bot Token)
* `SHOPEE_AFFILIATE_PARAMS` = (Your tracking query)
* `LAZADA_AFFILIATE_PARAMS` = (Your tracking query)
* `SHEIN_AFFILIATE_PARAMS` = (Your tracking query)
* `SHOPILYA_AFFILIATE_PARAMS` = (Your tracking query)

Click **Create Web Service**. Render will build and deploy the bot.

### 3. Keep the Bot Awake 24/7 (UptimeRobot)
Render Free Tier Web Services go to sleep after 15 minutes of inactivity. To keep the bot running 24/7:
1. Copy the unique URL generated by Render for your web service (e.g., `https://discord-shop-bot.onrender.com`).
2. Go to [UptimeRobot](https://uptimerobot.com/) (or any free cron pinger service).
3. Register a free account, click **Add New Monitor**.
4. Monitor Type: **HTTPS**.
5. Friendly Name: `Shop Bot Ping`.
6. URL/IP: Paste your Render URL.
7. Monitoring Interval: **Every 5 minutes**.
8. Click **Create Monitor**. UptimeRobot will ping the bot's HTTP server every 5 minutes, keeping it online 24/7 for free!

---

## 📂 Project Structure

- `src/bot.js` - Main runner. Connects to Discord, starts the scheduler, and runs the Render HTTP server.
- `src/fetcher.js` - Handles pagination and Shopify products fetching (with compare-at-price sales parsing).
- `src/scheduler.js` - Runs the scheduler. Auto-posts a random batch of 5-10 items with special promo badges.
- `src/commands.js` - Command parser with fallback prefix support (`shop!`) and default page pagination.
- `database.json` - Stores persistent configuration.
- `deals/` - Contains the 50 local deals for Shopee, Lazada, and Shein.
- `start.bat` - Windows shortcut script to start the bot with a double-click.

---

## 🚀 Running Locally

Ensure Node.js is installed, then run:
```bash
npm install
npm test
npm start
```
Or double-click **`start.bat`**.
