const { fetchDeals } = require('./fetcher');
const fs = require('fs');
const path = require('path');

const PLATFORM_NAMES = {
    shopee: 'Shopee Deals',
    lazada: 'Lazada Deals',
    shein: 'Shein Fashion',
    r18: 'Shopilya R18 Toys'
};

function startScheduler(client, db, saveDb) {
    console.log('Scheduler loop started.');

    // Run check immediately and then every 60 seconds
    checkAndPost(client, db, saveDb);
    setInterval(() => {
        checkAndPost(client, db, saveDb);
    }, 60000);
}

async function checkAndPost(client, db, saveDb) {
    const now = Date.now();
    let dbChanged = false;

    const guildSettings = db.guilds.default;
    if (!guildSettings) return;

    for (const category of ['shopee', 'lazada', 'shein', 'r18']) {
        const schedule = guildSettings.schedules[category];
        const channelId = guildSettings.channels[category];
        
        if (!schedule || !schedule.enabled || !channelId) continue;

        const lastPosted = guildSettings.lastPosted[category] || 0;
        const intervalMs = (schedule.intervalHours || 2) * 60 * 60 * 1000;

        if (now - lastPosted >= intervalMs) {
            console.log(`Category [${category}] is due for posting.`);

            // Constrain to exactly 5 items so Discord generates native previews for all of them
            const count = 5; 
            let itemsToPost = [];
            
            const affiliateEnvKey = `${category.toUpperCase()}_AFFILIATE_PARAMS`;
            const affiliateParams = process.env[affiliateEnvKey] || '';

            if (category === 'r18') {
                if (!schedule.nextPage) schedule.nextPage = 1;
                const page = schedule.nextPage;

                const products = await fetchDeals('r18', page, affiliateParams);
                if (products && products.length > 0) {
                    itemsToPost = products.slice(0, count);
                    schedule.nextPage = page >= 5 ? 1 : page + 1;
                }
            } else {
                if (schedule.nextIndex === undefined) schedule.nextIndex = 0;
                const nextIndex = schedule.nextIndex;

                try {
                    const filePath = path.join(__dirname, '..', 'deals', `${category}.json`);
                    if (fs.existsSync(filePath)) {
                        const rawData = fs.readFileSync(filePath, 'utf8');
                        const allItems = JSON.parse(rawData);

                        if (allItems.length > 0) {
                            // Slice with wrap-around based on actual length of pool
                            let sliced = allItems.slice(nextIndex, nextIndex + count);
                            if (sliced.length < count) {
                                const remaining = count - sliced.length;
                                sliced = sliced.concat(allItems.slice(0, remaining));
                            }

                            // Apply affiliate params
                            itemsToPost = sliced.map(item => {
                                const baseUrl = item.url.trim();
                                const cleanAff = affiliateParams ? (affiliateParams.startsWith('?') ? affiliateParams : '?' + affiliateParams) : '';
                                return {
                                    id: item.id,
                                    title: item.title,
                                    price: item.price,
                                    promoType: item.promoType || null,
                                    url: baseUrl + cleanAff,
                                    imageUrl: item.imageUrl
                                };
                            });

                            // Update index pointer using actual array length
                            schedule.nextIndex = (nextIndex + count) % allItems.length;
                        }
                    }
                } catch (err) {
                    console.error(`Error reading database for local category ${category}:`, err.message);
                }
            }

            if (itemsToPost && itemsToPost.length > 0) {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (channel && channel.isTextBased()) {
                        
                        let messageContent = `🔔 **DAILY DEALS INCOMING! Posted ${itemsToPost.length} hot items on schedule:**\n\n`;

                        itemsToPost.forEach((p, index) => {
                            let titleEmoji = '🛍️';
                            let titlePrefix = '';
                            if (p.promoType === 'flash_sale') {
                                titleEmoji = '⚡';
                                titlePrefix = ` [FLASH SALE${p.discountText ? ` - ${p.discountText}` : ''}]`;
                            } else if (p.promoType === 'day_sale') {
                                titleEmoji = '🔥';
                                titlePrefix = ' [DAILY DEAL]';
                            } else if (p.promoType === 'month_sale') {
                                titleEmoji = '📅';
                                titlePrefix = ' [MONTHLY SPECIAL]';
                            }

                            messageContent += `${index + 1}. ${titleEmoji}**${titlePrefix} ${p.title}**\n`;
                            if (p.originalPrice && p.discountText) {
                                messageContent += `   *Price:* ~~${p.originalPrice}~~ **${p.price}** \`(${p.discountText})\`\n`;
                            } else {
                                messageContent += `   *Price:* **${p.price}**\n`;
                            }
                            messageContent += `   👉 ${p.url}\n\n`;
                        });

                        await channel.send({ content: messageContent.trim() });

                        console.log(`Auto-posted ${itemsToPost.length} items for [${category}] to channel ${channelId}.`);

                        guildSettings.lastPosted[category] = now;
                        dbChanged = true;

                        if (!db.postedHistory[category]) db.postedHistory[category] = [];
                        itemsToPost.forEach(item => {
                            if (!db.postedHistory[category].includes(item.id)) {
                                db.postedHistory[category].push(item.id);
                            }
                        });
                        if (db.postedHistory[category].length > 100) {
                            db.postedHistory[category].splice(0, db.postedHistory[category].length - 100);
                        }
                    } else {
                        console.error(`Channel ${channelId} is not accessible.`);
                    }
                } catch (err) {
                    console.error(`Failed to auto-post for ${category}:`, err.message);
                }
            } else {
                console.warn(`No products compiled to post for ${category}.`);
                guildSettings.lastPosted[category] = now - intervalMs + (30 * 60 * 1000);
                dbChanged = true;
            }
        }
    }

    if (dbChanged) {
        saveDb();
    }
}

module.exports = { startScheduler, checkAndPost };
