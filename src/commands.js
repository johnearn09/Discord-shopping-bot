const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchDeals } = require('./fetcher');

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

/**
 * Handles incoming bot commands.
 * @param {object} message - Discord message object
 * @param {object} db - Database state object
 * @param {function} saveDb - Function to save database state to file
 */
async function handleCommand(message, db, saveDb) {
    const guildId = message.guildId || 'default';
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = JSON.parse(JSON.stringify(db.guilds.default || {
            prefix: 'sho!',
            channels: { shopee: '', lazada: '', shein: '', r18: '' },
            schedules: {
                shopee: { intervalHours: 2, enabled: true, nextIndex: 0 },
                lazada: { intervalHours: 2, enabled: true, nextIndex: 0 },
                shein: { intervalHours: 2, enabled: true, nextIndex: 0 },
                r18: { intervalHours: 2, enabled: true, nextPage: 1 }
            },
            lastPosted: { shopee: 0, lazada: 0, shein: 0, r18: 0 }
        }));
        saveDb();
    }

    const guildSettings = db.guilds[guildId];
    const prefix = guildSettings.prefix;

    // Flexible prefix check
    let usedPrefix = '';
    if (message.content.startsWith(prefix)) {
        usedPrefix = prefix;
    } else if (prefix === 'sho!' && message.content.startsWith('shop!')) {
        usedPrefix = 'shop!';
    } else {
        return;
    }

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const isAuthorized = message.member && (
        message.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        message.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        message.author.id === message.guild?.ownerId
    );

    switch (command) {
        case 'help': {
            const helpEmbed = new EmbedBuilder()
                .setTitle('🛒 Discord Shop Automation Bot Control Panel')
                .setColor('#2F3136')
                .setDescription('View shopping deals and manage posting schedules without Administrator permissions.')
                .addFields(
                    { name: '📖 Commands Available to Everyone', value: 
                        `\`${prefix}help\` - Show this configuration panel.\n` +
                        `\`${prefix}shop <category> [page_number]\` - View 5 items from a category page (1 to 10).\n` +
                        `*Categories: \`shopee\`, \`lazada\`, \`shein\`, \`r18\`*\n` +
                        `*Examples: \`${prefix}shop shopee\`, \`${prefix}shop r18 2\`*`
                    },
                    { name: '⚙️ Settings Commands (Requires Manage Channels/Guild Perms)', value:
                        `\`${prefix}prefix <new_prefix>\` - Modify command prefix (e.g. \`sho!\`).\n` +
                        `\`${prefix}channel <category> <channel_id>\` - Change destination channel for a category.\n` +
                        `\`${prefix}schedule <category> <interval_hours>\` - Set posting frequency (e.g. \`2\`).\n` +
                        `\`${prefix}schedule <category> <enable/disable>\` - Enable or disable the schedule.`
                    },
                    { name: '📊 Current Configurations', value:
                        `**Command Prefix:** \`${prefix}\` (accepts \`shop!\` as fallback)\n\n` +
                        `**Shopee Feed:** <#${guildSettings.channels.shopee || 'Not Set'}> (\`${guildSettings.channels.shopee || 'None'}\`)\n` +
                        `• Auto-post: ${guildSettings.schedules.shopee.enabled ? `✅ Every ${guildSettings.schedules.shopee.intervalHours}h` : '❌ Disabled'}\n\n` +
                        `**Lazada Feed:** <#${guildSettings.channels.lazada || 'Not Set'}> (\`${guildSettings.channels.lazada || 'None'}\`)\n` +
                        `• Auto-post: ${guildSettings.schedules.lazada.enabled ? `✅ Every ${guildSettings.schedules.lazada.intervalHours}h` : '❌ Disabled'}\n\n` +
                        `**Shein Feed:** <#${guildSettings.channels.shein || 'Not Set'}> (\`${guildSettings.channels.shein || 'None'}\`)\n` +
                        `• Auto-post: ${guildSettings.schedules.shein.enabled ? `✅ Every ${guildSettings.schedules.shein.intervalHours}h` : '❌ Disabled'}\n\n` +
                        `**R18 Toys (Shopilya):** <#${guildSettings.channels.r18 || 'Not Set'}> (\`${guildSettings.channels.r18 || 'None'}\`)\n` +
                        `• Auto-post: ${guildSettings.schedules.r18.enabled ? `✅ Every ${guildSettings.schedules.r18.intervalHours}h` : '❌ Disabled'}`
                    }
                )
                .setFooter({ text: 'Discord Shop Automation Bot' })
                .setTimestamp();

            await message.reply({ embeds: [helpEmbed] });
            break;
        }

        case 'shop': {
            const categoryInput = args[0] ? args[0].toLowerCase() : null;
            let pageInput = args[1] ? parseInt(args[1]) : 1;

            const validCategories = ['shopee', 'lazada', 'shein', 'r18'];
            if (!categoryInput || !validCategories.includes(categoryInput)) {
                return message.reply(`❌ Please specify a valid category: \`shopee\`, \`lazada\`, \`shein\`, or \`r18\`.\n*Example: \`${prefix}shop shopee\` or \`${prefix}shop r18 2\`*`);
            }

            if (isNaN(pageInput) || pageInput < 1 || pageInput > 10) {
                return message.reply('❌ Please specify a valid page number between 1 and 10.\n*Example: `sho!shop r18 2`*');
            }

            const feedbackMsg = await message.reply(`⏳ Fetching **${PLATFORM_NAMES[categoryInput]}** items (Page ${pageInput}/10)...`);

            try {
                // Fetch affiliate parameters
                const affiliateEnvKey = `${categoryInput.toUpperCase()}_AFFILIATE_PARAMS`;
                const affiliateParams = process.env[affiliateEnvKey] || '';

                const products = await fetchDeals(categoryInput, pageInput, affiliateParams);

                if (!products || products.length === 0) {
                    return feedbackMsg.edit(`❌ Failed to fetch products for **${PLATFORM_NAMES[categoryInput]}** (Page ${pageInput}). Please try again later.`);
                }

                if (categoryInput === 'shopee') {
                    // Send Shopee as clean text links so Discord generates previews and thumbnails natively
                    let messageContent = `🛍️ **Showing 5 items from ${PLATFORM_NAMES[categoryInput]} (Page ${pageInput}/10):**\n\n`;

                    products.forEach((p, index) => {
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

                    // Split content by paragraphs and send in chunks under 1900 chars to prevent 2000 char limit errors
                    const paragraphs = messageContent.trim().split('\n\n');
                    let currentBatch = '';
                    for (const para of paragraphs) {
                        if (currentBatch.length + para.length + 2 > 1900) {
                            await message.channel.send({ content: currentBatch.trim() });
                            currentBatch = para + '\n\n';
                        } else {
                            currentBatch += para + '\n\n';
                        }
                    }
                    if (currentBatch.trim().length > 0) {
                        await message.channel.send({ content: currentBatch.trim() });
                    }
                } else {
                    // Send Lazada, Shein, R18 as beautiful Discord Embeds (since they worked fine before)
                    const embeds = products.map(p => {
                        const embed = new EmbedBuilder()
                            .setURL(p.url)
                            .setColor(BRAND_COLORS[categoryInput] || '#7289DA')
                            .setImage(p.imageUrl || null)
                            .setFooter({ text: `${PLATFORM_NAMES[categoryInput]} • Page ${pageInput}/10` });

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

                    await message.channel.send({
                        content: `🛍️ **Showing 5 items from ${PLATFORM_NAMES[categoryInput]} (Page ${pageInput}/10):**`,
                        embeds: embeds
                    });
                }

                await feedbackMsg.delete().catch(() => {});
            } catch (err) {
                console.error(`Error executing shop command:`, err.message);
                await feedbackMsg.edit(`❌ Error executing command: ${err.message}`).catch(() => {});
            }
            break;
        }

        case 'prefix': {
            if (!isAuthorized) {
                return message.reply('❌ You need the **Manage Channels** or **Manage Guild** permission to modify the prefix.');
            }

            const newPrefix = args[0];
            if (!newPrefix || newPrefix.length > 5) {
                return message.reply('❌ Please specify a new prefix (max 5 characters). E.g. `sho!prefix s!`');
            }

            guildSettings.prefix = newPrefix;
            saveDb();
            await message.reply(`✅ Command prefix successfully changed to \`${newPrefix}\``);
            break;
        }

        case 'channel': {
            if (!isAuthorized) {
                return message.reply('❌ You need the **Manage Channels** or **Manage Guild** permission to modify channels.');
            }

            const categoryInput = args[0] ? args[0].toLowerCase() : null;
            let channelIdInput = args[1];

            const validCategories = ['shopee', 'lazada', 'shein', 'r18'];
            if (!categoryInput || !validCategories.includes(categoryInput)) {
                return message.reply(`❌ Please specify a valid category: \`shopee\`, \`lazada\`, \`shein\`, or \`r18\`.`);
            }

            if (!channelIdInput) {
                return message.reply(`❌ Please provide a channel ID or mention a channel.\n*Example: \`${prefix}channel shopee 1528544690515742720\`*`);
            }

            if (channelIdInput.startsWith('<#') && channelIdInput.endsWith('>')) {
                channelIdInput = channelIdInput.slice(2, -1);
            }

            guildSettings.channels[categoryInput] = channelIdInput;
            saveDb();
            await message.reply(`✅ Successfully mapped **${PLATFORM_NAMES[categoryInput]}** to channel <#${channelIdInput}> (\`${channelIdInput}\`).`);
            break;
        }

        case 'schedule': {
            if (!isAuthorized) {
                return message.reply('❌ You need the **Manage Channels** or **Manage Guild** permission to modify schedules.');
            }

            const categoryInput = args[0] ? args[0].toLowerCase() : null;
            const actionInput = args[1] ? args[1].toLowerCase() : null;

            const validCategories = ['shopee', 'lazada', 'shein', 'r18'];
            if (!categoryInput || !validCategories.includes(categoryInput)) {
                return message.reply(`❌ Please specify a valid category: \`shopee\`, \`lazada\`, \`shein\`, or \`r18\`.`);
            }

            if (!actionInput) {
                return message.reply(`❌ Please specify an action: an interval in hours (e.g. \`2\`), \`enable\`, or \`disable\`.\n*Example: \`${prefix}schedule shopee disable\` or \`${prefix}schedule shopee 2\`*`);
            }

            if (actionInput === 'disable') {
                guildSettings.schedules[categoryInput].enabled = false;
                saveDb();
                await message.reply(`✅ Auto-posting schedule for **${PLATFORM_NAMES[categoryInput]}** has been **disabled**.`);
            } else if (actionInput === 'enable') {
                guildSettings.schedules[categoryInput].enabled = true;
                saveDb();
                await message.reply(`✅ Auto-posting schedule for **${PLATFORM_NAMES[categoryInput]}** has been **enabled** (currently every ${guildSettings.schedules[categoryInput].intervalHours} hours).`);
            } else {
                const intervalHours = parseFloat(actionInput);
                if (isNaN(intervalHours) || intervalHours < 0.1 || intervalHours > 168) {
                    return message.reply('❌ Please specify a valid interval in hours between 0.1 (6 minutes) and 168 (1 week).');
                }

                guildSettings.schedules[categoryInput].intervalHours = intervalHours;
                guildSettings.schedules[categoryInput].enabled = true;
                saveDb();
                await message.reply(`✅ Auto-posting schedule for **${PLATFORM_NAMES[categoryInput]}** set to every **${intervalHours} hours**.`);
            }
            break;
        }
    }
}

module.exports = { handleCommand };
