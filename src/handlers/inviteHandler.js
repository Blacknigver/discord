/**
 * Invite Handler
 * Manages Discord events for invite tracking, member joins/leaves, and alt detection
 */

const { Events } = require('discord.js');
const config = require('../../config');
const { computeInvitePoints, formatInviteNumber } = require('../utils/altDetection');
const InviteTracker = require('../modules/inviteTracking');
const InviteMonitoring = require('../utils/inviteMonitoring');

// Add proper debugging for guild ID
console.log(`[INVITE HANDLER] Config GUILD_ID: "${config.GUILD_ID}"`);
const MAIN_GUILD_ID = config.GUILD_ID || '1292895164595175444'; // Fallback to main guild (Brawl Shop)
console.log(`[INVITE HANDLER] Using MAIN_GUILD_ID: "${MAIN_GUILD_ID}"`);

// Constants
const JOIN_CHANNEL_ID = '1381758315561746453';

// Custom emojis
const EMOJIS = {
    SPARKLE: '<:sparkle:1391737301490728960>',
    MEMBER: '<:member:1391736156353204226>',
    CROSS: '<:cross:1351689463453061130>'
};

class InviteHandler {
    constructor(bot) {
        this.bot = bot;
        this.inviteTracker = new InviteTracker(bot);
        this.processingLock = new Set(); // Track members being processed to prevent duplicates
        this.monitoring = null; // Will be initialized after inviteTracker
    }

    /**
     * Initialize the invite handler
     */
    async initialize() {
        try {
            console.log('[INVITE HANDLER] Initializing...');
            
            // Initialize the invite tracker
            await this.inviteTracker.initialize();
            
            // Initialize monitoring system
            this.monitoring = new InviteMonitoring(this.inviteTracker, {
                suspiciousJoinThreshold: 15, // 15 joins per minute triggers alert
                altDetectionAlertThreshold: 8, // 8 alts in an hour triggers alert
                performanceLogInterval: 300000 // 5 minutes
            });
            
            // Register event listeners
            this.registerEventListeners();
            
            // Start welcome message cleanup task
            this.startWelcomeMessageCleanup();

            console.log('[INVITE HANDLER] Successfully initialized');
        } catch (error) {
            console.error('[INVITE HANDLER] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Register Discord event listeners
     */
    registerEventListeners() {
        // Member join event
        this.bot.on(Events.GuildMemberAdd, async (member) => {
            await this.handleMemberJoin(member);
        });

        // Member leave event
        this.bot.on(Events.GuildMemberRemove, async (member) => {
            await this.handleMemberLeave(member);
        });

        // Invite create event
        this.bot.on(Events.InviteCreate, async (invite) => {
            await this.handleInviteCreate(invite);
        });

        // Invite delete event
        this.bot.on(Events.InviteDelete, async (invite) => {
            await this.handleInviteDelete(invite);
        });

        console.log('[INVITE HANDLER] Event listeners registered');
    }

    /**
     * Handle member join event
     */
    async handleMemberJoin(member) {
        const startTime = Date.now();

        // Debug logging for guild information
        console.log(`[INVITE HANDLER] Member ${member.user.username} joined guild: ${member.guild.name} (${member.guild.id})`);
        console.log(`[INVITE HANDLER] Checking against MAIN_GUILD_ID: ${MAIN_GUILD_ID}`);
        console.log(`[INVITE HANDLER] Guild ID match: ${member.guild.id === MAIN_GUILD_ID}`);
        console.log(`[INVITE HANDLER] Is bot: ${member.user.bot}`);

        // Only process joins for the main guild and ignore bots
        if (member.guild.id !== MAIN_GUILD_ID || member.user.bot) {
            console.log(`[INVITE HANDLER] Skipping join processing - Guild mismatch or bot user`);
            return;
        }

        // Prevent duplicate processing
        if (this.processingLock.has(member.id)) {
            console.log(`[INVITE HANDLER] Already processing join for ${member.user.username}, skipping`);
            return;
        }

        this.processingLock.add(member.id);
        let isAlt = false;

        try {
            console.log(`[INVITE HANDLER] Processing join for ${member.user.username} (${member.id})`);

            // Try to find which invite was used
            console.log(`[INVITE HANDLER] Attempting to find used invite...`);
            let usedInvite = await this.inviteTracker.findUsedInviteWithRetry(member.guild, 3);
            let inviter = null;
            let inviteCode = null;

            if (usedInvite && usedInvite.inviter) {
                inviter = usedInvite.inviter;
                inviteCode = usedInvite.code;
                console.log(`[INVITE HANDLER] Found inviter: ${inviter.username} (${inviter.id}) via invite ${inviteCode}`);
            } else {
                console.log(`[INVITE HANDLER] Could not determine inviter - treating as vanity URL join`);
                await this.handleVanityJoin(member);
                return;
            }

            // Check if this is a rejoin
            const memberData = this.inviteTracker.getMemberData(member.id);
            console.log(`[INVITE HANDLER] Member data for ${member.user.username}:`, memberData);
            
            if (this.inviteTracker.isRejoin(member)) {
                console.log(`[INVITE HANDLER] Detected rejoin for ${member.user.username}`);
                await this.handleRejoin(member);
                return;
            } else {
                console.log(`[INVITE HANDLER] Not a rejoin for ${member.user.username} - processing as new join`);
            }

            // Self-invite / bot-invite guard – silently ignore.
            if (inviter.id === member.id || inviter.bot) {
                console.log(`[INVITE HANDLER] Self-invite detected for ${member.user.username}; no credit or message.`);
                // Do NOT send a join message and do NOT record any stats.
                return;
            }

            // Run alt detection
            const points = await computeInvitePoints(member, this.bot);

            if (points <= 0) {
                // Member is detected as alt
                isAlt = true;
                await this.handleAltJoin(member, inviter, inviteCode);
            } else {
                // Legitimate member
                await this.handleLegitimateJoin(member, inviter, inviteCode);
            }

        } catch (error) {
            console.error(`[INVITE HANDLER] Error processing join for ${member.user.username}:`, error);
            if (this.monitoring) {
                this.monitoring.recordError(error, 'handleMemberJoin');
            }
            await this.sendJoinMessage(
                `${EMOJIS.MEMBER} **${member.user.username}** joined, but there was an error processing their invite.`
            );
        } finally {
            // Record monitoring data
            if (this.monitoring) {
                const processingTime = Date.now() - startTime;
                this.monitoring.recordJoin(member, isAlt, processingTime);
            }
            
            // Remove from processing lock after a delay
            setTimeout(() => {
                this.processingLock.delete(member.id);
            }, 5000);
        }
    }

    /**
     * Handle rejoin scenario
     */
    async handleRejoin(member) {
        console.log(`[INVITE HANDLER] Handling rejoin for ${member.user.username}`);

        // Get the current invite information to check for affiliate referrals
        let currentInviter = null;
        let currentInviteCode = null;
        
        try {
            const usedInvite = await this.inviteTracker.findUsedInviteWithRetry(member.guild, 3);
            if (usedInvite && usedInvite.inviter) {
                currentInviter = usedInvite.inviter;
                currentInviteCode = usedInvite.code;
                console.log(`[INVITE HANDLER] Rejoin via invite: ${currentInviter.username} (${currentInviter.id}) - ${currentInviteCode}`);
            }
        } catch (error) {
            console.log(`[INVITE HANDLER] Could not determine current invite for rejoin: ${error.message}`);
        }

        // Check if this rejoin came through an affiliate bot link
        const AFFILIATE_BOT_IDS = ['1351695670909861982', '1370848171231543356'];
        if (currentInviter && AFFILIATE_BOT_IDS.includes(currentInviter.id)) {
            console.log(`[AFFILIATE_REFERRAL] Rejoin via affiliate bot ${currentInviter.id}, checking for affiliate credit...`);
            
            try {
                const db = require('../../database');
                await db.waitUntilConnected().catch(() => {});
                
                // Find who owns this affiliate link
                const ownerQuery = await db.query('SELECT user_id FROM affiliate_links WHERE invite_code=$1', [currentInviteCode]);
                
                if (ownerQuery.rowCount > 0) {
                    const realAffiliate = ownerQuery.rows[0].user_id;
                    
                    // Check if this referral was already logged
                    const existingReferral = await db.query('SELECT 1 FROM affiliate_referrals WHERE referrer_id=$1 AND referred_id=$2', [realAffiliate, member.id]);
                    
                    if (existingReferral.rowCount === 0) {
                        // Log the affiliate referral for rejoin
                        await db.query(
                            'INSERT INTO affiliate_referrals(referrer_id, referred_id, invite_code, joined_at) VALUES($1,$2,$3,NOW())', 
                            [realAffiliate, member.id, currentInviteCode]
                        );
                        
                        // Get affiliate's username
                        let affiliateName = `User ${realAffiliate}`;
                        try {
                            const affiliateUser = await this.bot.users.fetch(realAffiliate);
                            affiliateName = affiliateUser.username;
                        } catch (fetchErr) {
                            console.log(`[AFFILIATE_REFERRAL] Could not fetch username for affiliate ${realAffiliate}`);
                        }
                        
                        console.log(`[AFFILIATE_REFERRAL] Logged referral for rejoin: ${realAffiliate} (${affiliateName}) -> ${member.id}`);
                        
                        // Send special message for affiliate rejoin
                        await this.sendJoinMessage(
                            `${EMOJIS.MEMBER} **${member.user.username}** rejoined via **${affiliateName}**'s affiliate link.\n` +
                            `${EMOJIS.SPARKLE} Welcome back!`
                        );

                        // Send welcome messages for affiliate rejoins too
                        await this.sendWelcomeMessages(member);
                        return;
                    } else {
                        console.log(`[AFFILIATE_REFERRAL] Referral already exists for ${realAffiliate} -> ${member.id}`);
                    }
                } else {
                    console.log(`[AFFILIATE_REFERRAL] No affiliate owner found for invite code ${currentInviteCode}`);
                }
            } catch (err) {
                console.error('[AFFILIATE_REFERRAL] Failed to process affiliate referral for rejoin:', err.message);
            }
        }

        const memberData = await this.inviteTracker.recordMemberRejoin(member);
        
        let originalInviterName = 'Unknown Inviter';

        if (memberData && memberData.inviter) {
            // Try to get current member object from guild
            const inviterMember = member.guild.members.cache.get(memberData.inviter);
            
            if (inviterMember) {
                originalInviterName = inviterMember.user.username;
            } else if (memberData.inviter_name) {
                // Use stored name if inviter no longer in guild
                originalInviterName = memberData.inviter_name;
            } else {
                // Last resort: try to fetch user by ID
                try {
                    const inviterUser = await this.bot.users.fetch(memberData.inviter);
                    originalInviterName = inviterUser.username;
                } catch (error) {
                    console.log(`[INVITE HANDLER] Could not fetch original inviter: ${error.message}`);
                    originalInviterName = `Inviter ID ${memberData.inviter}`;
                }
            }
        }

        await this.sendJoinMessage(
            `${EMOJIS.MEMBER} **${member.user.username}** rejoined.\n` +
            `${EMOJIS.CROSS} Originally invited by **${originalInviterName}**. No new invite counted for this rejoin.`
        );

        // Send welcome messages to rejoining members too
        await this.sendWelcomeMessages(member);
    }

    /**
     * Handle vanity URL join (when we can't determine which invite was used)
     */
    async handleVanityJoin(member) {
        console.log(`[INVITE HANDLER] Handling vanity URL join for ${member.user.username}`);
        
        await this.sendJoinMessage(
            `${EMOJIS.MEMBER} **${member.user.username}** just joined.\n` +
            `${EMOJIS.SPARKLE} **Welcome to the server!**`
        );

        // Send welcome messages for vanity joins too
        await this.sendWelcomeMessages(member);
    }

    /**
     * Handle alt account join
     */
    async handleAltJoin(member, inviter, inviteCode) {
        console.log(`[INVITE HANDLER] Processing alt join for ${member.user.username}`);

        // Record the alt join
        await this.inviteTracker.recordMemberJoin(member, inviter, inviteCode, true);

        await this.sendJoinMessage(
            `${EMOJIS.MEMBER} **${member.user.username}** joined but is an **alt**.\n` +
            `${EMOJIS.CROSS} **${inviter.username}** received **0 new invites** for this join.`
        );

        // Send welcome messages to alt accounts too
        await this.sendWelcomeMessages(member);
    }

    /**
     * Handle legitimate member join
     */
    async handleLegitimateJoin(member, inviter, inviteCode) {
        console.log(`[INVITE HANDLER] Processing legitimate join for ${member.user.username}`);

        // Record the legitimate join
        await this.inviteTracker.recordMemberJoin(member, inviter, inviteCode, false);

        // Look up the actual affiliate referrer for affiliate bot invites
        const AFFILIATE_BOT_IDS = ['1351695670909861982', '1370848171231543356'];
        let actualReferrerId = inviter.id;
        let actualReferrerName = inviter.username;

        if (AFFILIATE_BOT_IDS.includes(inviter.id)) {
            console.log(`[AFFILIATE_REFERRAL] Join via affiliate bot ${inviter.id}, looking up real affiliate owner...`);
            
            try {
                const db = require('../../database');
                await db.waitUntilConnected().catch(() => {});
                
                // Find who owns this affiliate link
                const ownerQuery = await db.query('SELECT user_id FROM affiliate_links WHERE invite_code=$1', [inviteCode]);
                
                if (ownerQuery.rowCount > 0) {
                    actualReferrerId = ownerQuery.rows[0].user_id;
                    
                    // Get the real affiliate's username  
                    try {
                        const realAffiliate = await this.bot.users.fetch(actualReferrerId);
                        actualReferrerName = realAffiliate.username;
                        console.log(`[AFFILIATE_REFERRAL] Real affiliate owner: ${actualReferrerName} (${actualReferrerId})`);
                    } catch (fetchErr) {
                        console.log(`[AFFILIATE_REFERRAL] Could not fetch real affiliate username for ${actualReferrerId}`);
                        actualReferrerName = `User ${actualReferrerId}`;
                    }
                } else {
                    console.log(`[AFFILIATE_REFERRAL] No affiliate owner found for invite code ${inviteCode}`);
                }
            } catch (err) {
                console.error('[AFFILIATE_REFERRAL] Failed to lookup affiliate owner:', err.message);
            }
        }

        // Log affiliate referral in database using actual referrer
        try {
            const db = require('../../database');
            await db.waitUntilConnected().catch(() => {});
            
            // For affiliate bot invites, we already confirmed the invite_code exists in affiliate_links
            // For regular user invites, verify the invite code matches their registered affiliate link
            let shouldLogReferral = false;
            
            if (AFFILIATE_BOT_IDS.includes(inviter.id)) {
                // Affiliate bot invite - we already found the owner above
                shouldLogReferral = true;
            } else {
                // Regular user invite - verify they have this as their affiliate link
                const check = await db.query('SELECT 1 FROM affiliate_links WHERE user_id=$1 AND invite_code=$2', [actualReferrerId, inviteCode]);
                shouldLogReferral = check.rowCount > 0;
            }
            
            if (shouldLogReferral) {
                await db.query(
                    'INSERT INTO affiliate_referrals(referrer_id, referred_id, invite_code, joined_at) VALUES($1,$2,$3,NOW()) ON CONFLICT DO NOTHING', 
                    [actualReferrerId, member.id, inviteCode]
                );
                console.log(`[AFFILIATE_REFERRAL] Logged referral: ${actualReferrerId} (${actualReferrerName}) -> ${member.id}`);
            } else {
                console.log('[AFFILIATE_REFERRAL] Invite used was not a registered affiliate link; no referral logged.');
            }
        } catch (err) {
            console.error('[AFFILIATE_REFERRAL] Failed to process referral logging:', err.message);
        }

        // Get updated invite count (use original inviter for invite statistics)
        const inviterStats = this.inviteTracker.getInviterStats(inviter.id);
        const formattedTotal = formatInviteNumber(inviterStats.total);

        await this.sendJoinMessage(
            `${EMOJIS.SPARKLE} **${member.user.username}** just joined.\n` +
            `${EMOJIS.MEMBER} **${actualReferrerName}** now has **${formattedTotal} invites**!`
        );

        // Send welcome messages to new legitimate members
        await this.sendWelcomeMessages(member);
    }

    /**
     * Handle member leave event
     */
    async handleMemberLeave(member) {
        // Only process leaves for the main guild
        if (member.guild.id !== MAIN_GUILD_ID || member.user.bot) {
            return;
        }

        try {
            console.log(`[INVITE HANDLER] Processing leave for ${member.user.username} (${member.id})`);

            const memberDataBefore = this.inviteTracker.getMemberData(member.id);
            console.log(`[INVITE HANDLER] Member data before leave:`, memberDataBefore);

            await this.inviteTracker.recordMemberLeave(member);
            
            const memberDataAfter = this.inviteTracker.getMemberData(member.id);
            console.log(`[INVITE HANDLER] Member data after leave:`, memberDataAfter);
            
            console.log(`[INVITE HANDLER] Recorded leave for ${member.user.username}`);
        } catch (error) {
            console.error(`[INVITE HANDLER] Error processing leave for ${member.user.username}:`, error);
        }
    }

    /**
     * Handle invite creation
     */
    async handleInviteCreate(invite) {
        if (invite.guild.id !== MAIN_GUILD_ID) {
            return;
        }

        try {
            console.log(`[INVITE HANDLER] New invite created: ${invite.code} by ${invite.inviter?.username || 'Unknown'}`);
            await this.inviteTracker.onInviteCreate(invite);
        } catch (error) {
            console.error(`[INVITE HANDLER] Error handling invite create:`, error);
        }
    }

    /**
     * Handle invite deletion
     */
    async handleInviteDelete(invite) {
        if (invite.guild.id !== MAIN_GUILD_ID) {
            return;
        }

        try {
            console.log(`[INVITE HANDLER] Invite deleted: ${invite.code}`);
            await this.inviteTracker.onInviteDelete(invite);
        } catch (error) {
            console.error(`[INVITE HANDLER] Error handling invite delete:`, error);
        }
    }

    /**
     * Send join message to the designated channel
     */
    async sendJoinMessage(content) {
        try {
            console.log(`[INVITE HANDLER] Attempting to send message to channel ${JOIN_CHANNEL_ID}`);
            const channel = this.bot.channels.cache.get(JOIN_CHANNEL_ID);
            
            if (!channel) {
                console.error(`[INVITE HANDLER] Join channel not found in cache: ${JOIN_CHANNEL_ID}`);
                // Try fetching the channel
                try {
                    const fetchedChannel = await this.bot.channels.fetch(JOIN_CHANNEL_ID);
                    if (fetchedChannel) {
                        await fetchedChannel.send(content);
                        console.log(`[INVITE HANDLER] Join message sent via fetch: ${content.substring(0, 100)}...`);
                        return;
                    }
                } catch (fetchError) {
                    console.error(`[INVITE HANDLER] Failed to fetch channel ${JOIN_CHANNEL_ID}:`, fetchError);
                }
                return;
            }

            await channel.send(content);
            console.log(`[INVITE HANDLER] Join message sent: ${content.substring(0, 100)}...`);
        } catch (error) {
            console.error(`[INVITE HANDLER] Failed to send join message:`, error);
        }
    }

    /**
     * Send welcome messages to specific channels and delete them after 1 second
     */
    async sendWelcomeMessages(member) {
        const welcomeChannels = [
            {
                channelId: '1305601966034124851',
                message: `${member} **Please verify to access the full server __HERE!__**`
            },
            {
                channelId: '1352022023307657359', 
                message: `${member} **Purchase cheap 𝐩𝐫𝐨𝐟𝐢𝐥𝐞𝐬 __HERE!__**`
            },
            {
                channelId: '1292896201859141722',
                message: `${member} **Place your order __HERE!__**`
            }
        ];

        for (const welcomeChannel of welcomeChannels) {
            try {
                const channel = this.bot.channels.cache.get(welcomeChannel.channelId);
                if (!channel) {
                    console.warn(`[INVITE_HANDLER] Welcome channel ${welcomeChannel.channelId} not found`);
                    continue;
                }

                // Send the message
                const sentMessage = await channel.send(welcomeChannel.message);
                console.log(`[INVITE_HANDLER] Sent welcome message to ${channel.name} for ${member.user.username}`);

                // Delete after 1 second
                setTimeout(async () => {
                    try {
                        await sentMessage.delete();
                        console.log(`[INVITE_HANDLER] Deleted welcome message in ${channel.name} for ${member.user.username}`);
                    } catch (deleteError) {
                        console.error(`[INVITE_HANDLER] Failed to delete welcome message in ${channel.name}:`, deleteError.message);
                    }
                }, 1000);

            } catch (error) {
                console.error(`[INVITE_HANDLER] Failed to send welcome message to channel ${welcomeChannel.channelId}:`, error.message);
            }
        }
    }

    /**
     * Cleanup any leftover messages in welcome channels every 15 minutes
     */
    startWelcomeMessageCleanup() {
        const welcomeChannelIds = [
            '1305601966034124851', // verify channel
            '1352022023307657359', // profiles channel  
            '1292896201859141722'  // orders channel
        ];

        setInterval(async () => {
            console.log('[INVITE_HANDLER] Running welcome message cleanup...');
            
            for (const channelId of welcomeChannelIds) {
                try {
                    const channel = this.bot.channels.cache.get(channelId);
                    if (!channel) {
                        console.warn(`[INVITE_HANDLER] Cleanup channel ${channelId} not found`);
                        continue;
                    }

                    // Fetch recent messages (last 50)
                    const messages = await channel.messages.fetch({ limit: 50 });
                    let deletedCount = 0;

                    for (const message of messages.values()) {
                        // Delete messages from our bot that contain welcome patterns
                        if (message.author.id === this.bot.user.id) {
                            const content = message.content.toLowerCase();
                            if (content.includes('verify to access') || 
                                content.includes('purchase cheap') || 
                                content.includes('place your order')) {
                                try {
                                    await message.delete();
                                    deletedCount++;
                                } catch (deleteError) {
                                    console.error(`[INVITE_HANDLER] Failed to delete leftover message:`, deleteError.message);
                                }
                            }
                        }
                    }

                    if (deletedCount > 0) {
                        console.log(`[INVITE_HANDLER] Cleaned up ${deletedCount} leftover welcome messages in ${channel.name}`);
                    }

                } catch (error) {
                    console.error(`[INVITE_HANDLER] Error during cleanup in channel ${channelId}:`, error.message);
                }
            }
        }, 15 * 60 * 1000); // 15 minutes in milliseconds

        console.log('[INVITE_HANDLER] Welcome message cleanup task started (runs every 15 minutes)');
    }

    /**
     * Get the invite tracker instance
     */
    getInviteTracker() {
        return this.inviteTracker;
    }
}

module.exports = InviteHandler; 