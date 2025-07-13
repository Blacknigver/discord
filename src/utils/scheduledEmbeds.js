const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('../../database');

// Channel configurations
const EMBED_CONFIGS = {
    '1364565488260223057': {
        type: 'trophy_prices',
        embeds: [
            {
                title: 'Trophy Prices',
                imageUrl: 'https://media.discordapp.net/attachments/987753155360079903/1393703863806070804/trophyprices.png?ex=6874235e&is=6872d1de&hm=e5a8ccbfceb52c184991006ebfed92fd5d322ec570efe322852533103c12f7c1&=&format=webp&quality=lossless&width=1438&height=809'
            },
            {
                title: 'Carries Are 2x Posted Prices'
            }
        ],
        button: {
            customId: 'ticket_trophies',
            label: 'Order Trophy Boost',
            style: ButtonStyle.Danger,
            emoji: '<:trophy:1301901071471345664>'
        }
    },
    '1364565680371929220': {
        type: 'ranked_prices',
        embeds: [
            {
                title: 'Ranked Prices (1/2)',
                imageUrl: 'https://media.discordapp.net/attachments/987753155360079903/1393703816758825010/rankedprices1.png?ex=68742353&is=6872d1d3&hm=2a1335ac07cd58f0f38c279dcda3007e5052e30c183175bed28944abad87ef4e&=&format=webp&quality=lossless&width=1438&height=809'
            },
            {
                title: 'Ranked Prices (2/2)',
                imageUrl: 'https://media.discordapp.net/attachments/987753155360079903/1393703836757000242/rankedprices2.png?ex=68742358&is=6872d1d8&hm=5fcb37a2d481a048824c027b80ad27bca7040d06277197c8590b7a831bd33d36&=&format=webp&quality=lossless&width=550&height=309'
            },
            {
                title: 'Masters - Pro pricing is __Outdated!__ <:caution:1393698677104840745>',
                description: '**Updated Prices:**\n> - Masters 1 > Masters 2 = **€50**\n> - Masters 2 > Masters 3 = **€80**\n> - Masters 3 > Pro = **€120**'
            },
            {
                title: 'Carries Are 2x Posted Prices'
            }
        ],
        button: {
            customId: 'ticket_ranked',
            label: 'Order Ranked Boost',
            style: ButtonStyle.Primary,
            emoji: '<:pro:1351687685328208003>'
        }
    },
    '1364565759698927636': {
        type: 'bulk_trophy',
        embeds: [
            {
                title: 'Bulk Trophy Prices',
                description: 'If you order in bulk, you can get a discount up to 50%',
                imageUrl: 'https://media.discordapp.net/attachments/987753155360079903/1393703799952249004/bulkprices.png?ex=6874234f&is=6872d1cf&hm=0df2006931b66f136ce0af2b696f9bacbe370a94e8e8a2edcb727fce9a320b4d&=&format=webp&quality=lossless&width=550&height=309'
            },
            {
                title: 'Carries Are 2x Posted Prices'
            }
        ],
        button: {
            customId: 'ticket_bulk',
            label: 'Order Bulk Trophy Boost',
            style: ButtonStyle.Success,
            emoji: '<:gold_trophy:1351658932434768025>'
        }
    },
    '1292896201859141722': {
        type: 'ticket_panel',
        useTicketPanel: true
    },
    '1305601966034124851': {
        type: 'verification',
        embeds: [
            {
                title: 'Verification Required',
                description: 'You must verify yourself in order to gain access to the rest of the server! <a:CheckPurple:1393717601376403486>\n\nThis is so that we don\'t lose you in case something bad happens to the server, such as the server facing a ban.'
            }
        ],
        buttons: [
            {
                customId: 'verify_redirect',
                label: 'Verify Now',
                style: ButtonStyle.Link,
                url: 'https://discord.com/oauth2/authorize?client_id=1305599360935133238&redirect_uri=https://vaultcord.win/auth&response_type=code&scope=identify%20guilds.join&state=23130',
                emoji: '<:checkmark:1357478063616688304>'
            },
            {
                customId: 'verification_why',
                label: 'Why',
                style: ButtonStyle.Danger,
                emoji: '❔'
            }
        ]
    }
};

const EMBED_COLOR = '#e68df2';

// Global instance to prevent multiple instances
let globalInstance = null;

class ScheduledEmbedSystem {
    constructor(client) {
        // Prevent multiple instances
        if (globalInstance) {
            return globalInstance;
        }
        
        this.client = client;
        this.initialized = false;
        this.isProcessing = false; // Add processing lock
        this.processingChannels = new Set(); // Track which channels are being processed
        
        // Store as global instance
        globalInstance = this;
    }

    // Static method to get the existing instance
    static getInstance() {
        return globalInstance;
    }

    // Static method to reset the global instance (for testing)
    static resetInstance() {
        globalInstance = null;
    }

    async initialize() {
        if (this.initialized) return;
        
        console.log('[SCHEDULED_EMBEDS] Initializing system...');
        
        // Initialize database entries for all channels
        await this.initializeChannels();
        
        // Start the main interval (check every minute)
        this.startMainInterval();
        
        // Start cleanup interval (every 3 hours)
        this.startCleanupInterval();
        
        this.initialized = true;
        console.log('[SCHEDULED_EMBEDS] System initialized successfully');
    }

    async initializeChannels() {
        // Check if database is available
        if (!db.isConnected) {
            console.warn('[SCHEDULED_EMBEDS] Database not connected, skipping initialization');
            return;
        }

        for (const channelId of Object.keys(EMBED_CONFIGS)) {
            const config = EMBED_CONFIGS[channelId];
            
            try {
                // Check if channel exists in database
                const existing = await db.query(
                    'SELECT * FROM scheduled_embeds WHERE channel_id = $1 AND embed_type = $2',
                    [channelId, config.type]
                );

                if (existing.rows.length === 0) {
                    // Create new entry - set to send in 2 minutes to ensure bot is fully ready
                    const nextSendAt = new Date(Date.now() + 120000); // Send in 2 minutes for immediate start
                    await db.query(
                        'INSERT INTO scheduled_embeds (channel_id, embed_type, next_send_at) VALUES ($1, $2, $3)',
                        [channelId, config.type, nextSendAt]
                    );
                    console.log(`[SCHEDULED_EMBEDS] Initialized channel ${channelId} (${config.type}) - will send at ${nextSendAt}`);
                } else {
                    console.log(`[SCHEDULED_EMBEDS] Channel ${channelId} (${config.type}) already exists in database`);
                }
            } catch (error) {
                console.error(`[SCHEDULED_EMBEDS] Error initializing channel ${channelId}:`, error);
            }
        }
    }

    startMainInterval() {
        setInterval(async () => {
            await this.checkAndSendEmbeds();
        }, 60000); // Check every minute
        
        console.log('[SCHEDULED_EMBEDS] Main interval started (checks every minute)');
    }

    startCleanupInterval() {
        setInterval(async () => {
            await this.cleanupChannels();
        }, 3 * 60 * 60 * 1000); // Every 3 hours
        
        console.log('[SCHEDULED_EMBEDS] Cleanup interval started (every 3 hours)');
    }

    async checkAndSendEmbeds() {
        // Skip if database is not connected
        if (!db.isConnected) {
            console.log('[SCHEDULED_EMBEDS] Database not connected, skipping check');
            return;
        }

        // Prevent concurrent processing
        if (this.isProcessing) {
            console.log('[SCHEDULED_EMBEDS] Already processing embeds, skipping this check to prevent duplicates');
            return;
        }

        this.isProcessing = true;
        console.log('[SCHEDULED_EMBEDS] Starting embed check (processing lock acquired)');
        
        try {
            console.log('[SCHEDULED_EMBEDS] Checking for pending embeds...');
            const pendingEmbeds = await db.query(
                'SELECT * FROM scheduled_embeds WHERE next_send_at <= NOW()'
            );

            console.log(`[SCHEDULED_EMBEDS] Found ${pendingEmbeds.rows.length} pending embeds`);

            if (pendingEmbeds.rows.length > 0) {
                console.log('[SCHEDULED_EMBEDS] Pending embeds:', pendingEmbeds.rows.map(row => ({
                    channel_id: row.channel_id,
                    embed_type: row.embed_type,
                    next_send_at: row.next_send_at
                })));
            }

            for (const embedData of pendingEmbeds.rows) {
                await this.sendScheduledEmbed(embedData);
            }
        } catch (error) {
            console.error('[SCHEDULED_EMBEDS] Error checking pending embeds:', error);
        } finally {
            this.isProcessing = false;
            console.log('[SCHEDULED_EMBEDS] Embed check completed (processing lock released)');
        }
    }

    async sendScheduledEmbed(embedData) {
        const { channel_id, message_id, embed_type } = embedData;
        
        // Prevent concurrent processing of the same channel
        if (this.processingChannels.has(channel_id)) {
            console.log(`[SCHEDULED_EMBEDS] Channel ${channel_id} is already being processed, skipping to prevent duplicates`);
            return;
        }

        this.processingChannels.add(channel_id);
        console.log(`[SCHEDULED_EMBEDS] Processing channel ${channel_id} (${embed_type})`);
        
        try {
            const config = EMBED_CONFIGS[channel_id];
            
            if (!config) {
                console.error(`[SCHEDULED_EMBEDS] No config found for channel ${channel_id}`);
                return;
            }

            const channel = await this.client.channels.fetch(channel_id);
            if (!channel) {
                console.error(`[SCHEDULED_EMBEDS] Channel ${channel_id} not found`);
                return;
            }

            console.log(`[SCHEDULED_EMBEDS] Sending embed to channel ${channel_id} (${embed_type})`);

            // Delete old message if exists
            if (message_id) {
                try {
                    const oldMessage = await channel.messages.fetch(message_id);
                    await oldMessage.delete();
                    console.log(`[SCHEDULED_EMBEDS] Deleted old message ${message_id}`);
                } catch (error) {
                    console.log(`[SCHEDULED_EMBEDS] Could not delete old message ${message_id}:`, error.message);
                }
            }

            // Send new embed
            let messagePayload;
            
            if (config.useTicketPanel) {
                // Use ticket panel embed
                messagePayload = await this.getTicketPanelEmbed();
            } else {
                // Build custom embeds
                messagePayload = await this.buildCustomEmbeds(config);
            }

            const newMessage = await channel.send(messagePayload);
            
            // Update database with new message info
            const nextSendAt = new Date(Date.now() + 60 * 60 * 1000); // Next hour
            
            // Only update database if connected
            if (db.isConnected) {
                await db.query(
                    'UPDATE scheduled_embeds SET message_id = $1, last_sent_at = NOW(), next_send_at = $2 WHERE channel_id = $3 AND embed_type = $4',
                    [newMessage.id, nextSendAt, channel_id, embed_type]
                );
            }

            console.log(`[SCHEDULED_EMBEDS] Successfully sent embed to ${channel_id}, next send at ${nextSendAt}`);
            
        } catch (error) {
            console.error(`[SCHEDULED_EMBEDS] Error sending embed to ${embedData.channel_id}:`, error);
        } finally {
            this.processingChannels.delete(channel_id);
        }
    }

    async buildCustomEmbeds(config) {
        const embeds = [];
        const files = [];

        for (const embedConfig of config.embeds) {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR);

            // Set title if provided
            if (embedConfig.title) {
                embed.setTitle(embedConfig.title);
            }

            // Set description if provided
            if (embedConfig.description) {
                embed.setDescription(embedConfig.description);
            }

            // Handle CDN image URLs (temporary)
            if (embedConfig.imageUrl) {
                embed.setImage(embedConfig.imageUrl);
            }
            // Handle local file images (fallback)
            else if (embedConfig.image) {
                const imagePath = path.join(__dirname, '../../', embedConfig.image);
                if (fs.existsSync(imagePath)) {
                    const attachment = new AttachmentBuilder(imagePath);
                    files.push(attachment);
                    embed.setImage(`attachment://${embedConfig.image}`);
                } else {
                    console.warn(`[SCHEDULED_EMBEDS] Image not found: ${imagePath}`);
                }
            }

            embeds.push(embed);
        }

        const payload = { embeds, files };

        // Add buttons if configured
        if (config.button) {
            // Handle single button (legacy support)
            const button = new ButtonBuilder()
                .setLabel(config.button.label)
                .setStyle(config.button.style);

            // Handle different button types
            if (config.button.url) {
                // Link button
                button.setURL(config.button.url);
            } else if (config.button.customId) {
                // Custom ID button
                button.setCustomId(config.button.customId);
            }

            if (config.button.emoji) {
                button.setEmoji(config.button.emoji);
            }

            const row = new ActionRowBuilder().addComponents(button);
            payload.components = [row];
        } else if (config.buttons) {
            // Handle multiple buttons
            const buttons = [];
            
            for (const buttonConfig of config.buttons) {
                const button = new ButtonBuilder()
                    .setLabel(buttonConfig.label)
                    .setStyle(buttonConfig.style);

                // Handle different button types
                if (buttonConfig.url) {
                    // Link button
                    button.setURL(buttonConfig.url);
                } else if (buttonConfig.customId) {
                    // Custom ID button
                    button.setCustomId(buttonConfig.customId);
                }

                if (buttonConfig.emoji) {
                    button.setEmoji(buttonConfig.emoji);
                }

                buttons.push(button);
            }

            const row = new ActionRowBuilder().addComponents(...buttons);
            payload.components = [row];
        }

        return payload;
    }

    async getTicketPanelEmbed() {
        // Reuse the exact ticket panel structure from messageCommands.js
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
        // Polyfill Components V2 flag
        if (!('IsComponentsV2' in MessageFlags)) {
          MessageFlags.IsComponentsV2 = 1 << 31;
        }
        const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder } = require('@discordjs/builders');
        
        try {
            // Create banner image using MediaGallery
            const bannerGallery = new MediaGalleryBuilder()
                .addItems(
                    mediaGalleryItem => mediaGalleryItem
                        .setDescription('Brawl Shop Banner')
                        .setURL('https://files.catbox.moe/u1wof6.webp')
                );

            // Main container with banner image
            const container = new ContainerBuilder()
                .setAccentColor(0x4a90e2)
                .addMediaGalleryComponents(bannerGallery)
                .addSeparatorComponents(sep =>
                    sep.setDivider(true)
                       .setSpacing(2) // Large spacing
                )
                .addTextDisplayComponents(txt =>
                    txt.setContent('## Welcome to Brawl Shop\nBrawl Shop provides quick delivery Boosts, Account Sales, Carries, and more. We prioritize speed and fair pricing, all of our Boosting & Carry orders are handled by one of our experienced players from our top-tier team.')
                )
                .addSeparatorComponents(sep =>
                    sep.setDivider(false)
                       .setSpacing(1) // Small spacing - middle ground
                )
                .addSectionComponents(
                    section => section
                        .addTextDisplayComponents(txt =>
                            txt.setContent('Start out by selecting the type of Boost or Carry you want by using\none of the buttons attached.')
                        )
                        .setButtonAccessory(
                            button => button
                                .setLabel('⭐ Our Reviews')
                                .setStyle(ButtonStyle.Link)
                                .setURL('https://discord.com/channels/1292895164595175444/1293288484487954512')
                        )
                )
                .addSeparatorComponents(sep =>
                    sep.setDivider(true)
                       .setSpacing(2) // Large spacing
                )
                .addTextDisplayComponents(txt =>
                    txt.setContent('• Purchasing an account? Check out the Accounts category instead.\n• Our prices are shown at <#1364565680371929220>, <#1364565488260223057> & <#1364565759698927636>.')
                );

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
            );

            return {
                components: [container, row1],
                flags: MessageFlags.IsComponentsV2
            };
            
        } catch (err) {
            console.error('[SCHEDULED_EMBEDS] Components V2 failed, using fallback:', err.message);
            
            // Fallback to traditional embed if Components V2 fails
            const embed = new EmbedBuilder()
                .setImage('https://files.catbox.moe/u1wof6.webp')
                .setTitle('Welcome to Brawl Shop')
                .setColor('#4a90e2')
                .setDescription(
                    'Brawl Shop provides quick delivery Boosts, Account Sales, Carries, and more. We prioritize speed and fair pricing, all of our Boosting & Carry orders are handled by one of the members of our top-tier team. Our team is made up of experienced players who will deliver you with fast and reliable results.\n\n' +
                    'Start out by selecting the type of Boost or Carry you want by using one of the buttons attached.\n\n' +
                    '───────────────────────────────────────────────────────\n\n' +
                    '• Purchasing an account? Check out the Accounts category instead.\n' +
                    '• Our prices are shown at <#1364565680371929220>, <#1364565488260223057> & <#1364565759698927636>.'
                );

            const reviewsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('⭐ Our Reviews')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://discord.com/channels/1292895164595175444/1293288484487954512')
            );

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
            );

            return { embeds: [embed], components: [reviewsRow, row1] };
        }
    }

    async cleanupChannels() {
        console.log('[SCHEDULED_EMBEDS] Starting cleanup...');
        
        for (const channelId of Object.keys(EMBED_CONFIGS)) {
            try {
                const channel = await this.client.channels.fetch(channelId);
                if (!channel) continue;

                // Fetch recent messages
                const messages = await channel.messages.fetch({ limit: 10 });
                const botMessages = messages.filter(msg => msg.author.id === this.client.user.id);

                if (botMessages.size > 1) {
                    console.log(`[SCHEDULED_EMBEDS] Found ${botMessages.size} bot messages in ${channelId}, cleaning up...`);
                    
                    // Keep only the most recent message
                    const sortedMessages = Array.from(botMessages.values()).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                    const messagesToDelete = sortedMessages.slice(1); // All except the first (most recent)

                    for (const message of messagesToDelete) {
                        try {
                            await message.delete();
                            console.log(`[SCHEDULED_EMBEDS] Deleted extra message ${message.id} from ${channelId}`);
                        } catch (error) {
                            console.log(`[SCHEDULED_EMBEDS] Could not delete message ${message.id}:`, error.message);
                        }
                    }

                    // Update database with the correct message ID
                    if (db.isConnected) {
                        const embedData = await db.query(
                            'SELECT * FROM scheduled_embeds WHERE channel_id = $1',
                            [channelId]
                        );

                        if (embedData.rows.length > 0 && sortedMessages.length > 0) {
                            await db.query(
                                'UPDATE scheduled_embeds SET message_id = $1 WHERE channel_id = $2',
                                [sortedMessages[0].id, channelId]
                            );
                        }
                    }
                }
            } catch (error) {
                console.error(`[SCHEDULED_EMBEDS] Error during cleanup for channel ${channelId}:`, error);
            }
        }
        
        console.log('[SCHEDULED_EMBEDS] Cleanup completed');
    }
}

module.exports = ScheduledEmbedSystem; 