/**
 * Core Invite Tracking Module
 * Handles data persistence, invite tracking, and member data management
 */

const fs = require('fs').promises;
const path = require('path');

// File paths for persistent data
const INVITES_FILE = path.join(process.cwd(), 'data', 'invites.json');
const DATA_DIR = path.join(process.cwd(), 'data');

class InviteTracker {
    constructor(bot) {
        this.bot = bot;
        this.data = {
            guild_invites: {},  // Store invite data by guild -> invite code (like Python)
            inviters: {},       // Store inviter statistics
            members: {}         // Store member join/leave data
        };
        this.inviteLock = false; // Simple lock mechanism like Python
        // Track last known invite uses for update events and cleanup loops
        this.lastInvites = {};
        this.initialized = false;
    }

    /**
     * Initialize the invite tracking system
     */
    async initialize() {
        try {
            console.log('[INVITE TRACKER] Initializing...');
            
            // Ensure data directory exists
            await this.ensureDataDir();
            
            // Load existing invite data
            await this.loadInvitesFile();
            
            // Initialize guild invites and cache current state
            await this.initializeGuildInvites();
            
            // Check for any joins that happened while bot was offline
            await this.initializeWithOfflineDetection();
            
            console.log('[INVITE TRACKER] Successfully initialized');
        } catch (error) {
            console.error('[INVITE TRACKER] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Ensure data directory exists
     */
    async ensureDataDir() {
        try {
            await fs.access(DATA_DIR);
        } catch (error) {
            console.log('[INVITE TRACKER] Creating data directory...');
            await fs.mkdir(DATA_DIR, { recursive: true });
        }
    }

    /**
     * Load invite tracking state from disk
     */
    async loadInvitesFile() {
        try {
            const data = await fs.readFile(INVITES_FILE, 'utf8');
            const parsedData = JSON.parse(data);
            
            this.data = {
                guild_invites: parsedData.guild_invites || {},
                inviters: parsedData.inviters || {},
                members: parsedData.members || {}
            };
            
            // Ensure all inviter data has required fields
            for (const [inviterId, inviterData] of Object.entries(this.data.inviters)) {
                this.data.inviters[inviterId] = {
                    regular: inviterData.regular || 0,
                    fake: inviterData.fake || 0,
                    bonus: inviterData.bonus || 0,
                    leaves: inviterData.leaves || 0,
                    ...inviterData
                };
            }
            
            console.log('[INVITE TRACKER] Loaded existing invite data');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('[INVITE TRACKER] No existing invite data found, starting fresh');
            } else {
                console.error('[INVITE TRACKER] Error loading invite data:', error);
            }
            // Initialize with empty data structure
            this.data = {
                guild_invites: {},
                inviters: {},
                members: {}
            };
        }
    }

    /**
     * Save invite tracking state to disk
     */
    async saveInvites() {
        try {
            const dataToSave = JSON.stringify(this.data, null, 2);
            await fs.writeFile(INVITES_FILE, dataToSave, 'utf8');
            console.log('[INVITE TRACKER] Data saved to JSON successfully');

            /******************
             * Database sync *
             ******************/
            const db = require('../../database');
            console.log(`[INVITE TRACKER] Attempting DB sync – isConnected: ${db.isConnected}`);

            // Wait until the DB connection is ready (up to 10s). This ensures that
            // early joins that happen immediately after bot startup are still
            // persisted once the connection succeeds.
            try {
                await db.waitUntilConnected(10000);
            } catch (waitErr) {
                console.warn('[INVITE TRACKER] DB sync skipped – database did not become ready in time:', waitErr.message);
                return;
            }

            const client = await db.pool.connect();

            // Counters for detailed logging
            let giUpserts = 0;
            let inviterUpserts = 0;
            let memberUpserts = 0;

            try {
                await client.query('BEGIN');

                /* ---------------- guild_invites ---------------- */
                for (const [guildId, inviteMap] of Object.entries(this.data.guild_invites)) {
                    for (const [code, inv] of Object.entries(inviteMap)) {
                        await client.query(
                            `INSERT INTO guild_invites (guild_id, invite_code, uses, inviter_id)
                             VALUES ($1,$2,$3,$4)
                             ON CONFLICT (guild_id, invite_code)
                             DO UPDATE SET uses = EXCLUDED.uses, inviter_id = EXCLUDED.inviter_id`,
                            [guildId, code, inv.uses, inv.inviter_id]
                        );
                        giUpserts += 1;
                    }
                }

                /* ---------------- inviters ---------------- */
                for (const [inviterId, stats] of Object.entries(this.data.inviters)) {
                    await client.query(
                        `INSERT INTO inviters (inviter_id, regular, fake, bonus, leaves)
                         VALUES ($1,$2,$3,$4,$5)
                         ON CONFLICT (inviter_id)
                         DO UPDATE SET regular=$2, fake=$3, bonus=$4, leaves=$5`,
                        [inviterId, stats.regular, stats.fake, stats.bonus, stats.leaves]
                    );
                    inviterUpserts += 1;
                }

                /* ---------------- members ---------------- */
                for (const [memberId, mData] of Object.entries(this.data.members)) {
                    // Skip entries with null/undefined joined_at to avoid constraint violations
                    if (!mData.joined_at) {
                        console.warn(`[INVITE TRACKER] Skipping member ${memberId} with null joined_at`);
                        continue;
                    }
                    
                    await client.query(
                        `INSERT INTO members (member_id, joined_at, left_at, inviter_id, inviter_name, invite_code, is_alt, guild_id)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                         ON CONFLICT (member_id)
                         DO UPDATE SET joined_at=$2, left_at=$3, inviter_id=$4, inviter_name=$5, invite_code=$6, is_alt=$7, guild_id=$8`,
                        [memberId, mData.joined_at, mData.left_at, mData.inviter, mData.inviter_name, mData.invite_code, mData.is_alt, mData.guild_id || require('../../config').GUILD_ID]
                    );
                    memberUpserts += 1;
                }

                await client.query('COMMIT');
                console.log(`[INVITE TRACKER] DB sync committed – guild_invites: ${giUpserts}, inviters: ${inviterUpserts}, members: ${memberUpserts}`);
            } catch (dbErr) {
                await client.query('ROLLBACK');
                console.error('[INVITE TRACKER] Failed to sync with database, transaction rolled back:', dbErr);
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('[INVITE TRACKER] Failed to save invite data:', error);
        }
    }

    /**
     * Initialize guild invites cache for the main guild only
     */
    async initializeGuildInvites() {
        const config = require('../../config');
        const mainGuild = this.bot.guilds.cache.get(config.GUILD_ID);
        
        if (mainGuild) {
            await this.cacheGuildInvites(mainGuild);
        } else {
            console.warn(`[INVITE TRACKER] Main guild ${config.GUILD_ID} not found in bot's guild cache`);
        }
    }

    /**
     * Cache invites for a specific guild
     */
    async cacheGuildInvites(guild) {
        try {
            console.log(`[INVITE TRACKER] Caching invites for guild: ${guild.name} (${guild.id})`);
            
            const invites = await this.fetchGuildInvites(guild);
            if (!invites) return;
            
            const guildIdStr = guild.id.toString();
            
            // Initialize guild structure if it doesn't exist (like Python)
            this.data.guild_invites[guildIdStr] = {};
            
            // Cache current invite data using guild_id -> invite_code structure (like Python)
            for (const invite of invites.values()) {
                this.data.guild_invites[guildIdStr][invite.code] = {
                    uses: invite.uses,
                    inviter_id: invite.inviter ? invite.inviter.id.toString() : null
                };
            }
            
            console.log(`[INVITE TRACKER] Cached ${invites.size} invites for ${guild.name}`);
        } catch (error) {
            console.error(`[INVITE TRACKER] Failed to cache invites for guild ${guild.name}:`, error);
        }
    }

    /**
     * Fetch guild invites with retry logic
     */
    async fetchGuildInvites(guild, retries = 3) {
        // Check if bot has permission to manage invites
        const me = guild.members.me;
        if (!me) {
            console.error(`[INVITE TRACKER] Bot is not a member of guild ${guild.name}`);
            return null;
        }

        const { PermissionFlagsBits } = require('discord.js');
        if (!me.permissions.has(PermissionFlagsBits.ManageGuild)) {
            console.error(`[INVITE TRACKER] Bot lacks MANAGE_GUILD permission in ${guild.name}`);
            console.error(`[INVITE TRACKER] Current bot permissions:`, me.permissions.toArray());
            return null;
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const invites = await guild.invites.fetch();
                console.log(`[INVITE TRACKER] Successfully fetched ${invites.size} invites for ${guild.name}`);
                return invites;
            } catch (error) {
                console.error(`[INVITE TRACKER] Attempt ${attempt}/${retries} failed to fetch invites for ${guild.name}:`, error.message);
                
                // Check specific error types
                if (error.code === 50013) {
                    console.error(`[INVITE TRACKER] Missing permissions to fetch invites in ${guild.name}`);
                    return null;
                }
                
                if (attempt === retries) {
                    console.error(`[INVITE TRACKER] All attempts failed for guild ${guild.name}`);
                    return null;
                }
                
                // Wait before retrying with exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
        return null;
    }

    /**
     * Simple invite detection like Python - no retries, no delays
     */
    async findUsedInviteWithRetry(guild) {
        console.log(`[INVITE TRACKER] Starting invite detection`);
        
        // Call findUsedInvite directly (like Python)
        return await this.findUsedInvite(guild);
    }

    /**
     * Find which invite was used when a member joined - exact copy of Python logic
     */
    async findUsedInvite(guild) {
        // Use async lock like Python script
        while (this.inviteLock) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.inviteLock = true;

        try {
            // Fetch current invites immediately (no delay like Python)
            let currentInvitesFromApi;
            try {
                currentInvitesFromApi = await this.fetchGuildInvites(guild);
                if (!currentInvitesFromApi) {
                    console.error(`[INVITE TRACKER] fetchGuildInvites returned null for ${guild.name}`);
                    return null;
                }
            } catch (error) {
                console.error(`[INVITE TRACKER] Could not fetch invites for ${guild.name}:`, error);
                return null;
            }

            const guildIdStr = guild.id.toString();
            
            // Ensure guild structure exists (like Python)
            this.data.guild_invites[guildIdStr] = this.data.guild_invites[guildIdStr] || {};
            const cachedGuildInvites = this.data.guild_invites[guildIdStr];
            
            // Build API invites dict exactly like Python
            const apiInvitesDict = {};
            for (const inv of currentInvitesFromApi.values()) {
                apiInvitesDict[inv.code] = {
                    uses: inv.uses,
                    inviter_id: inv.inviter ? inv.inviter.id.toString() : null,
                    obj: inv
                };
            }
            
            console.log(`[INVITE TRACKER] Analyzing ${currentInvitesFromApi.size} current invites`);
            console.log(`[INVITE TRACKER] Have cached data for ${Object.keys(cachedGuildInvites).length} invites`);

            // Find used invite using EXACT Python logic
            let usedInviteObj = null;
            for (const [code, apiData] of Object.entries(apiInvitesDict)) {
                const cachedData = cachedGuildInvites[code];
                
                if (cachedData && apiData.uses > cachedData.uses) {
                    console.log(`[INVITE TRACKER] Found used invite: ${code} (uses: ${cachedData.uses} -> ${apiData.uses})`);
                    usedInviteObj = apiData.obj;
                    break;
                } else if (!cachedData && apiData.uses > 0) {
                    console.log(`[INVITE TRACKER] Found new invite used: ${code} (uses: ${apiData.uses})`);
                    usedInviteObj = apiData.obj;
                    break;
                }
            }

            // Update cache AFTER comparison (like Python)
            this.data.guild_invites[guildIdStr] = {};
            for (const [code, data] of Object.entries(apiInvitesDict)) {
                this.data.guild_invites[guildIdStr][code] = {
                    uses: data.uses,
                    inviter_id: data.inviter_id
                };
            }

            return usedInviteObj;
        } catch (error) {
            console.error('[INVITE TRACKER] Error finding used invite:', error);
            return null;
        } finally {
            this.inviteLock = false;
        }
    }

    /**
     * Record a member join
     */
    async recordMemberJoin(member, inviter, inviteCode, isAlt = false) {
        const memberIdStr = member.id.toString();
        const inviterIdStr = inviter ? inviter.id.toString() : null;
        
        // Record member data
        this.data.members[memberIdStr] = {
            joined_at: new Date().toISOString(),
            left_at: null,
            inviter: inviterIdStr,
            inviter_name: inviter ? inviter.username : null,
            invite_code: inviteCode,
            is_alt: isAlt,
            guild_id: member.guild.id.toString()  // Add guild_id to match database schema
        };
        
        // Update inviter statistics
        if (inviterIdStr) {
            this.ensureInviterData(inviterIdStr);
            
            if (isAlt) {
                // For alts, add both regular and fake to net 0 (like Python)
                this.data.inviters[inviterIdStr].regular += 1;
                this.data.inviters[inviterIdStr].fake += 1;
            } else {
                // For legitimate joins, just add regular
                this.data.inviters[inviterIdStr].regular += 1;
            }
        }
        
        await this.saveInvites();
    }

    /**
     * Record a member leave
     */
    async recordMemberLeave(member) {
        const memberIdStr = member.id.toString();
        const memberData = this.data.members[memberIdStr];
        
        if (memberData) {
            // Mark as left
            memberData.left_at = new Date().toISOString();
            
            // Increment inviter's leaves counter
            const inviterIdStr = memberData.inviter;
            if (inviterIdStr) {
                this.ensureInviterData(inviterIdStr);
                this.data.inviters[inviterIdStr].leaves += 1;
            }
            
            await this.saveInvites();
        }
    }

    /**
     * Check if a member is rejoining
     */
    isRejoin(member) {
        const memberIdStr = member.id.toString();
        const memberData = this.data.members[memberIdStr];

        // Consider it a rejoin if we have *any* record for this member.
        // This is more robust in scenarios where the leave event failed to
        // record `left_at` (e.g. bot downtime, Discord outage, race-condition).
        return !!memberData;
    }

    /**
     * Handle member rejoin
     */
    async recordMemberRejoin(member) {
        const memberIdStr = member.id.toString();
        const memberData = this.data.members[memberIdStr];
        
        if (memberData) {
            // Clear left_at timestamp
            memberData.left_at = null;
            await this.saveInvites();
            return memberData;
        }
        
        return null;
    }

    /**
     * Get inviter statistics
     */
    getInviterStats(userId) {
        const userIdStr = userId.toString();
        const data = this.data.inviters[userIdStr];
        
        if (!data) {
            return {
                regular: 0,
                fake: 0,
                bonus: 0,
                leaves: 0,
                total: 0
            };
        }
        
        const regular = data.regular || 0;
        const fake = data.fake || 0;
        const bonus = data.bonus || 0;
        const leaves = data.leaves || 0;
        const leavesDeduction = leaves * 1.0;
        const total = regular - fake + bonus - leavesDeduction;
        
        return {
            regular,
            fake,
            bonus,
            leaves,
            leavesDeduction,
            total
        };
    }

    /**
     * Ensure inviter data exists with default values
     */
    ensureInviterData(inviterIdStr) {
        if (!this.data.inviters[inviterIdStr]) {
            this.data.inviters[inviterIdStr] = {
                regular: 0,
                fake: 0,
                bonus: 0,
                leaves: 0
            };
        }
    }

    /**
     * Update invite cache when invite is created
     */
    async onInviteCreate(invite) {
        if (invite.guild.id !== require('../../config').GUILD_ID) return;
        
        const guildIdStr = invite.guild.id.toString();
        
        // Ensure guild structure exists (like Python)
        this.data.guild_invites[guildIdStr] = this.data.guild_invites[guildIdStr] || {};
        
        this.data.guild_invites[guildIdStr][invite.code] = {
            uses: invite.uses,
            inviter_id: invite.inviter ? invite.inviter.id.toString() : null
        };
        
        await this.saveInvites();
    }

    /**
     * Update invite cache when invite is deleted
     */
    async onInviteDelete(invite) {
        if (invite.guild.id !== require('../../config').GUILD_ID) return;
        
        const guildIdStr = invite.guild.id.toString();
        
        if (this.data.guild_invites[guildIdStr] && this.data.guild_invites[guildIdStr][invite.code]) {
            delete this.data.guild_invites[guildIdStr][invite.code];
            await this.saveInvites();
        }
    }

    /**
     * Get member data
     */
    getMemberData(memberId) {
        const memberIdStr = memberId.toString();
        return this.data.members[memberIdStr] || null;
    }

    /**
     * Add bonus invites to a user
     */
    async addBonusInvites(userId, amount) {
        const userIdStr = userId.toString();
        this.ensureInviterData(userIdStr);
        this.data.inviters[userIdStr].bonus += amount;
        await this.saveInvites();
    }

    /**
     * Remove invites from a user
     */
    async removeInvites(userId, amount) {
        const userIdStr = userId.toString();
        this.ensureInviterData(userIdStr);
        this.data.inviters[userIdStr].fake += amount;
        await this.saveInvites();
    }

    /**
     * Handle bulk invite analysis when bot was offline (simplified like Python)
     */
    async analyzeBulkInviteChanges(guild) {
        console.log(`[INVITE TRACKER] Analyzing bulk invite changes for ${guild.name}`);
        
        try {
            const currentInvites = await this.fetchGuildInvites(guild);
            if (!currentInvites) return [];
            
            const guildIdStr = guild.id.toString();
            
            // Ensure guild structure exists
            this.data.guild_invites[guildIdStr] = this.data.guild_invites[guildIdStr] || {};
            const cachedGuildInvites = this.data.guild_invites[guildIdStr];
            
            const changes = [];
            
            for (const invite of currentInvites.values()) {
                const cachedData = cachedGuildInvites[invite.code];
                
                if (cachedData && invite.uses > cachedData.uses) {
                    const usageIncrease = invite.uses - cachedData.uses;
                    console.log(`[INVITE TRACKER] Bulk change detected: ${invite.code} by ${invite.inviter?.username || 'Unknown'} (+${usageIncrease} uses)`);
                    
                    changes.push({
                        invite: invite,
                        inviter: invite.inviter,
                        usageIncrease: usageIncrease,
                        code: invite.code
                    });
                } else if (!cachedData && invite.uses > 0) {
                    console.log(`[INVITE TRACKER] New invite with usage: ${invite.code} by ${invite.inviter?.username || 'Unknown'} (${invite.uses} uses)`);
                    
                    changes.push({
                        invite: invite,
                        inviter: invite.inviter,
                        usageIncrease: invite.uses,
                        code: invite.code
                    });
                }
            }
            
            // Update cache after analysis (like Python)
            this.data.guild_invites[guildIdStr] = {};
            for (const invite of currentInvites.values()) {
                this.data.guild_invites[guildIdStr][invite.code] = {
                    uses: invite.uses,
                    inviter_id: invite.inviter ? invite.inviter.id.toString() : null
                };
            }
            
            return changes;
        } catch (error) {
            console.error(`[INVITE TRACKER] Error analyzing bulk changes for ${guild.name}:`, error);
            return [];
        }
    }

    /**
     * Initialize with offline join detection
     * Checks if members joined while bot was offline in the main guild only
     */
    async initializeWithOfflineDetection() {
        console.log(`[INVITE TRACKER] Checking for offline joins...`);
        
        try {
            const config = require('../../config');
            const mainGuild = this.bot.guilds.cache.get(config.GUILD_ID);
            
            if (!mainGuild) {
                console.warn(`[INVITE TRACKER] Main guild ${config.GUILD_ID} not found for offline detection`);
                return;
            }
            
            // Check for bulk invite changes in the main guild only
            const bulkChanges = await this.analyzeBulkInviteChanges(mainGuild);
            
            if (bulkChanges.length > 0) {
                console.log(`[INVITE TRACKER] Detected ${bulkChanges.length} invite changes in ${mainGuild.name} while offline`);
                
                // Log the changes for manual review if needed
                for (const change of bulkChanges) {
                    console.log(`[INVITE TRACKER] - ${change.code}: +${change.usageIncrease} uses (${change.inviter?.username || 'Unknown'})`);
                }
            }
        } catch (error) {
            console.error(`[INVITE TRACKER] Error checking offline joins:`, error);
        }
    }
}

module.exports = InviteTracker; 