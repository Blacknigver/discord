/**
 * Alt Detection System
 * Comprehensive point-based scoring algorithm to detect alt accounts
 * Score ≤ 0 = Alt account, Score > 0 = Legitimate account
 */

/**
 * Compute points for a joining member based on profile, status, username, and account age.
 * Returns total points.
 * 
 * @param {import('discord.js').GuildMember} member - The member who joined
 * @param {import('discord.js').Client} bot - The Discord bot client
 * @returns {Promise<number>} Total points calculated
 */
async function computeInvitePoints(member, bot) {
    let points = 0;
    
    console.log(`[ALT DETECTION] Starting evaluation for ${member.user.username} (${member.id})`);
    
    try {
        // ============ PROFILE / COSMETICS ============
        
        // Nitro (boost) status - Check if user is boosting the server
        if (member.premiumSince) {
            points += 15;
            console.log(`[ALT DETECTION] +15 points: User is boosting server`);
        }
        
        // Avatar (custom avatar gives bonus, no avatar gives penalty)
        if (member.user.avatar) {
            points += 2;
            console.log(`[ALT DETECTION] +2 points: Has custom avatar`);
        } else {
            points -= 3;
            console.log(`[ALT DETECTION] -3 points: No custom avatar (default)`);
        }
        
        // ============ BIO ============
        let bio = null;
        try {
            // Fetch full user to get bio information
            const fullUser = await bot.users.fetch(member.id, { force: true });
            bio = fullUser.bio || '';
        } catch (error) {
            console.log(`[ALT DETECTION] Could not fetch bio for ${member.user.username}: ${error.message}`);
        }
        
        if (bio && bio.length > 0) {
            if (bio.length > 5) {
                points += 2;
                console.log(`[ALT DETECTION] +2 points: Bio length > 5 characters (${bio.length})`);
            } else {
                points += 1;
                console.log(`[ALT DETECTION] +1 point: Bio length 1-5 characters (${bio.length})`);
            }
            
            // Check for links in bio
            if (bio.includes('http://') || bio.includes('https://') || bio.includes('www.')) {
                points += 1;
                console.log(`[ALT DETECTION] +1 point: Bio contains links`);
            }
            
            // Check for formatted text (markdown) in bio
            if (bio.includes('**') || bio.includes('*') || bio.includes('__') || 
                bio.includes('~~') || bio.includes('`')) {
                points += 2;
                console.log(`[ALT DETECTION] +2 points: Bio contains markdown formatting`);
            }
        } else {
            points -= 1;
            console.log(`[ALT DETECTION] -1 point: No bio`);
        }
        
        // ============ PRONOUNS ============
        let hasPronouns = false;
        if (bio) {
            const pronounsPatterns = ['he/him', 'she/her', 'they/them', 'he/', 'she/', 'they/', 'xe/', 'ze/', 'pronouns:'];
            hasPronouns = pronounsPatterns.some(pattern => bio.toLowerCase().includes(pattern.toLowerCase()));
        }
        
        if (hasPronouns) {
            points += 2;
            console.log(`[ALT DETECTION] +2 points: Bio contains pronouns`);
        } else {
            points -= 1;
            console.log(`[ALT DETECTION] -1 point: No pronouns found`);
        }
        
        // ============ USERNAME / DISPLAY NAME ============
        
        // Count digits in username
        const digits = (member.user.username.match(/\d/g) || []).length;
        if (digits > 5) {
            points -= 1;
            console.log(`[ALT DETECTION] -1 point: Username has > 5 digits (${digits})`);
        }
        
        // Short & clean name bonus
        if (digits < 3 || member.user.username.length < 10) {
            points += 2;
            console.log(`[ALT DETECTION] +2 points: Clean username (digits: ${digits}, length: ${member.user.username.length})`);
        }
        
        // Check for "!" in display name
        const displayName = member.displayName || member.user.username;
        if (displayName.includes('!')) {
            points += 1;
            console.log(`[ALT DETECTION] +1 point: Display name contains "!"`);
        }
        
        // Check for special characters in display name or bio
        const specialChars = new Set("✧✦✯✰✫✬✭✮✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋❍❏❐❑❒❖❘❙❚❛❜❝❞❡❢❣❤❥❦❧❨❩❪❫❬❭❮❯❰❱❲❳❴❵");
        const hasSpecialChars = [...displayName].some(c => specialChars.has(c)) || 
                               (bio && [...bio].some(c => specialChars.has(c)));
        
        if (hasSpecialChars) {
            points += 1;
            console.log(`[ALT DETECTION] +1 point: Special unicode characters found`);
        }
        
        // ============ STATUS & ACTIVITY ============
        
        if (member.presence && member.presence.status !== 'offline') {
            // Check activities
            let hasCustom = false;
            let hasActivity = false;
            const connectedPlatforms = new Set();
            
            for (const activity of member.presence.activities || []) {
                if (activity.type === 4) { // Custom status
                    hasCustom = true;
                    points += 1;
                    console.log(`[ALT DETECTION] +1 point: Has custom status`);
                } else if ([0, 1, 2, 3].includes(activity.type)) { // Playing, Streaming, Listening, Watching
                    hasActivity = true;
                    points += 3;
                    console.log(`[ALT DETECTION] +3 points: Playing/streaming/watching activity`);
                }
                
                // Track connected platforms
                if (activity.platform) {
                    connectedPlatforms.add(activity.platform);
                } else if (activity.applicationId) {
                    connectedPlatforms.add(`app_${activity.applicationId}`);
                }
            }
            
            // Award points for connected platforms
            if (connectedPlatforms.size > 0) {
                points += 2; // First platform
                console.log(`[ALT DETECTION] +2 points: First connected platform`);
                
                if (connectedPlatforms.size > 1) {
                    const additionalPlatforms = connectedPlatforms.size - 1;
                    points += additionalPlatforms;
                    console.log(`[ALT DETECTION] +${additionalPlatforms} points: ${additionalPlatforms} additional platforms`);
                }
            }
            
            // Status-specific bonuses
            if (['idle', 'dnd'].includes(member.presence.status)) {
                points += 2;
                console.log(`[ALT DETECTION] +2 points: Status is idle/DND`);
            }
            
            if (member.presence.status === 'online' && !hasCustom) {
                points -= 1;
                console.log(`[ALT DETECTION] -1 point: Online without custom status`);
            }
        }
        
        // ============ BADGES & EXTRAS ============
        
        const flags = member.user.flags;
        if (flags) {
            // HypeSquad Houses
            if (flags.has('HypeSquadOnlineHouse1') || flags.has('HypeSquadOnlineHouse2') || flags.has('HypeSquadOnlineHouse3')) {
                points += 2;
                console.log(`[ALT DETECTION] +2 points: HypeSquad house badge`);
            }
            
            // Active Developer Badge
            if (flags.has('ActiveDeveloper')) {
                points += 10;
                console.log(`[ALT DETECTION] +10 points: Active Developer badge`);
            }
        }
        
        // Check for custom banner and avatar decoration
        try {
            const fullUser = await bot.users.fetch(member.id, { force: true });
            
            if (fullUser.banner) {
                points += 10;
                console.log(`[ALT DETECTION] +10 points: Custom profile banner`);
            }
            
            if (fullUser.avatarDecoration) {
                points += 10;
                console.log(`[ALT DETECTION] +10 points: Avatar decoration`);
            }
        } catch (error) {
            console.log(`[ALT DETECTION] Could not fetch extended user data: ${error.message}`);
        }
        
        // ============ ACCOUNT AGE ADJUSTMENT ============
        
        const now = new Date();
        const accountAge = now - member.user.createdAt;
        const ageDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));
        
        console.log(`[ALT DETECTION] Account age: ${ageDays} days`);
        
        if (ageDays < 7) {
            // Instant alt flag for very new accounts
            console.log(`[ALT DETECTION] Account < 7 days old - instant alt flag`);
            return points; // Return current points as-is, will be treated as fake
        } else if (ageDays < 30) {
            points -= 4;
            console.log(`[ALT DETECTION] -4 points: Account 7-29 days old`);
        } else if (ageDays < 90) {
            points -= 2;
            console.log(`[ALT DETECTION] -2 points: Account 30-89 days old`);
        } else if (ageDays < 150) {
            points -= 1;
            console.log(`[ALT DETECTION] -1 point: Account 90-149 days old`);
        } else if (ageDays < 180) {
            // No change
            console.log(`[ALT DETECTION] +0 points: Account 150-179 days old`);
        } else if (ageDays < 365) {
            points += 2;
            console.log(`[ALT DETECTION] +2 points: Account 180-364 days old`);
        } else if (ageDays < 730) {
            points += 3;
            console.log(`[ALT DETECTION] +3 points: Account 1-2 years old`);
        } else {
            points += 4;
            console.log(`[ALT DETECTION] +4 points: Account 2+ years old`);
        }
        
    } catch (error) {
        console.error(`[ALT DETECTION] Error computing points for ${member.user.username}:`, error);
    }
    
    console.log(`[ALT DETECTION] Final score for ${member.user.username}: ${points} points`);
    return points;
}

/**
 * Format invite number (remove decimals if it's a whole number)
 * @param {number} num - The number to format
 * @returns {number|string} Formatted number
 */
function formatInviteNumber(num) {
    if (num % 1 === 0) {
        return parseInt(num);
    }
    return num;
}

module.exports = {
    computeInvitePoints,
    formatInviteNumber
}; 