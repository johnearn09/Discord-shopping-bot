const { EmbedBuilder } = require('discord.js');
const { fetchDeals } = require('./fetcher');
const fs = require('fs');
const path = require('path');

const BRAND_COLORS = {
    shopee: '#EE4D2D',
    lazada: '#0F136D',
    shein: '#000000',
    r18: '#9B111E'
};

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
        const intervalMs = (schedule.intervalHours || 5) * 60 * 60 * 1000;

        if (now - lastPosted >= intervalMs) {
            console.log(`Category [${category}] is due for posting.`);

            // Get random count of items between 5 and 10
            const count = Math.floor(Math.random() * (10 - 5 + 1)) + 5;
            let itemsToPost = [];
            
            const affiliateEnvKey = `${category.toUpperCase()}_AFFILIATE_PARAMS`;
            const affiliateParams = process.env[affiliateEnvKey] || '';

            if (category === 'r18') {
                // R18 dynamic rotation page logic
                if (!schedule.nextPage) schedule.nextPage = 1;
                const page = schedule.nextPage;

                const products = await fetchDeals('r18', page, affiliateParams);
                if (products && products.length > 0) {
                    itemsToPost = products.slice(0, count);
                    // Rotate page (1 to 5)
                    schedule.nextPage = page >= 5 ? 1 : page + 1;
                }
            } else {
                // Local deals continuous rotation index logic
                if (schedule.nextIndex === undefined) schedule.nextIndex = 0;
                const nextIndex = schedule.nextIndex;

                try {
                    const filePath = path.join(__dirname, '..', 'deals', `${category}.json`);
                    if (fs.existsSync(filePath)) {
                        const rawData = fs.readFileSync(filePath, 'utf8');
                        const allItems = JSON.parse(rawData);

                        // Slice with wrap-around
                        let sliced = allItems.slice(nextIndex, nextIndex + count);
                        if (sliced.length < count) {
                            const remaining = count - sliced.length;
                            sliced = sliced.concat(allItems.slice(0, remaining));
                        }

                        // Apply affiliate params
                        itemsToPost = sliced.map(item => {
                            const baseUrl = item.url;
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

                        // Update index pointer
                        schedule.nextIndex = (nextIndex + count) % 50;
                    }
                } catch (err) {
                    console.error(`Error reading database for local category ${category}:`, err.message);
                }
            }

            if (itemsToPost && itemsToPost.length > 0) {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (channel && channel.isTextBased()) {
                        
                        const embeds = itemsToPost.map(p => {
                            const embed = new EmbedBuilder()
                                .setURL(p.url)
                                .setColor(BRAND_COLORS[category] || '#7289DA')
                                .setImage(p.imageUrl || null)
                                .setFooter({ text: `${PLATFORM_NAMES[category]}` });

                            let titleEmoji = '🛍️';
                            let titlePrefix = '';
                            let descText = '';

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

                            embed.setTitle(`${titleEmoji}${titlePrefix} ${p.title}`);

                            if (p.originalPrice && p.discountText) {
                                descText = `~~${p.originalPrice}~~ **${p.price}** \`(${p.discountText})\`\n\n`;
                            } else {
                                descText = `**Price:** ${p.price}\n\n`;
                            }

                            descText += `[Click to View Product](${p.url})`;
                            embed.setDescription(descText);

                            return embed;
                        });

                        // Post in a single message (up to 10 embeds)
                        await channel.send({
                            content: `🔔 **DAILY DEALS INCOMING! Posted ${itemsToPost.length} hot items on schedule:**`,
                            embeds: embeds
                        });

                        console.log(`Auto-posted ${itemsToPost.length} items for [${category}] to channel ${channelId}.`);

                        guildSettings.lastPosted[category] = now;
                        dbChanged = true;

                        // Save history
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
