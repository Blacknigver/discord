const db = require('../../database');

// Rate limit bypass users (staff who should never be rate limited)
const RATE_LIMIT_BYPASS_USERS = [
  '987751357773672538', // JustRuben
  '774511191376265217', // Staff member
  '986164993080836096', // Staff member
  '1302269180263010324' // Staff member
];

// Ticket category mappings
const TICKET_CATEGORY_MAPPINGS = {
  'ranked': 'Ranked',
  'trophies': 'Trophies', 
  'bulk': 'Bulk Trophies',
  'other': 'Other',
  'profile': 'Profile' // Profile purchases from account listings
};

// Rate limiting thresholds for button interactions
const BUTTON_RATE_LIMITS = {
  // Time windows in seconds
  WINDOW_60_SEC: 60,
  WINDOW_30_SEC: 30,
  WINDOW_180_SEC: 180,  // 3 minutes
  WINDOW_300_SEC: 300,  // 5 minutes
  WINDOW_600_SEC: 600,  // 10 minutes
  
  // Interaction limits per window
  LIMIT_25_PER_60_SEC: 25,
  LIMIT_15_PER_30_SEC: 15,
  LIMIT_40_PER_180_SEC: 40,
  LIMIT_60_PER_300_SEC: 60,
  LIMIT_75_PER_600_SEC: 75,
  
  // Timeout durations in seconds
  TIMEOUT_15_SEC: 15,
  TIMEOUT_30_SEC: 30,
  TIMEOUT_60_SEC: 60
};

/**
 * Check if user should bypass all rate limits
 * @param {string} userId - User ID to check
 * @returns {boolean} - True if user should bypass rate limits
 */
function shouldBypassRateLimit(userId) {
  return RATE_LIMIT_BYPASS_USERS.includes(userId);
}

/**
 * Get ticket category from boost type
 * @param {string} boostType - Type of boost (ranked, trophies, bulk, other, profile)
 * @returns {string} - Category name
 */
function getTicketCategory(boostType) {
  return TICKET_CATEGORY_MAPPINGS[boostType] || 'Other';
}

/**
 * Check ticket opening rate limits
 * @param {string} userId - User ID
 * @param {string} ticketType - Type of ticket being created
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function checkTicketRateLimit(userId, ticketType) {
  try {
    // Bypass rate limits for staff
    if (shouldBypassRateLimit(userId)) {
      console.log(`[RATE_LIMIT] User ${userId} bypassing ticket rate limits (staff)`);
      return { allowed: true };
    }

    await db.waitUntilConnected();
    
    const category = getTicketCategory(ticketType);
    
    // Get current open tickets for this user
    const ticketQuery = `
      SELECT boost_type, COUNT(*) as count
      FROM tickets 
      WHERE user_id = $1 AND status = 'open'
      GROUP BY boost_type
    `;
    
    const result = await db.query(ticketQuery, [userId]);
    const ticketCounts = {};
    let totalTickets = 0;
    
    // Process current ticket counts
    for (const row of result.rows) {
      const rowCategory = getTicketCategory(row.boost_type);
      ticketCounts[rowCategory] = (ticketCounts[rowCategory] || 0) + parseInt(row.count);
      totalTickets += parseInt(row.count);
    }
    
    console.log(`[RATE_LIMIT] User ${userId} current tickets:`, ticketCounts, `Total: ${totalTickets}`);
    
    // Check total ticket limit (3 maximum)
    if (totalTickets >= 3) {
      return {
        allowed: false,
        reason: `❌ **Ticket Limit Reached**\n\nYou have reached the maximum limit of **3 total tickets** across all categories.\n\n**Current tickets:** ${totalTickets}/3\n\nPlease close an existing ticket before opening a new one.`
      };
    }
    
    // Check per-category limit (2 maximum per category)
    const currentCategoryCount = ticketCounts[category] || 0;
    if (currentCategoryCount >= 2) {
      return {
        allowed: false,
        reason: `❌ **Category Limit Reached**\n\nYou have reached the maximum limit of **2 tickets** in the **${category}** category.\n\n**Current ${category} tickets:** ${currentCategoryCount}/2\n\nPlease close an existing ${category} ticket before opening a new one.`
      };
    }
    
    console.log(`[RATE_LIMIT] User ${userId} ticket creation allowed. Category: ${category} (${currentCategoryCount}/2), Total: ${totalTickets}/3`);
    return { allowed: true };
    
  } catch (error) {
    console.error(`[RATE_LIMIT] Error checking ticket rate limit: ${error.message}`);
    // Allow on error to prevent blocking legitimate users
    return { allowed: true };
  }
}

/**
 * Check button interaction rate limits
 * @param {string} userId - User ID
 * @param {string} interactionType - Type of interaction (for logging)
 * @returns {Promise<{allowed: boolean, reason?: string, timeoutUntil?: Date}>}
 */
async function checkButtonRateLimit(userId, interactionType = 'button') {
  try {
    // Bypass rate limits for staff
    if (shouldBypassRateLimit(userId)) {
      return { allowed: true };
    }

    await db.waitUntilConnected();
    
    const now = new Date();
    
    // Get or create user rate limit record
    let userRecord = await db.query(
      'SELECT * FROM user_rate_limits WHERE user_id = $1',
      [userId]
    );
    
    if (userRecord.rows.length === 0) {
      // Create new record
      await db.query(
        'INSERT INTO user_rate_limits (user_id, interaction_count, last_interaction_at) VALUES ($1, 1, $2)',
        [userId, now]
      );
      console.log(`[RATE_LIMIT] Created new rate limit record for user ${userId}`);
      return { allowed: true };
    }
    
    const record = userRecord.rows[0];
    
    // Check if user is currently timed out
    if (record.timeout_until && new Date(record.timeout_until) > now) {
      const timeoutUntil = new Date(record.timeout_until);
      
      console.log(`[RATE_LIMIT] User ${userId} is timed out until ${timeoutUntil.toISOString()}`);
      return {
        allowed: false,
        reason: `⏰ **Rate Limited**\n\nYou're clicking buttons too quickly! Please wait before trying again.\n\n**Try again:** <t:${Math.floor(timeoutUntil.getTime() / 1000)}:R>`,
        timeoutUntil
      };
    }
    
    // SIMPLIFIED RATE LIMITING - Only check 30 second window
    const lastInteraction = new Date(record.last_interaction_at);
    const timeSinceLastMs = now.getTime() - lastInteraction.getTime();
    const thirtySecondsMs = 30 * 1000;
    
    // Reset counter if more than 30 seconds have passed
    if (timeSinceLastMs > thirtySecondsMs) {
      await db.query(
        'UPDATE user_rate_limits SET interaction_count = 1, last_interaction_at = $1, updated_at = $1, timeout_level = 0, timeout_until = NULL WHERE user_id = $2',
        [now, userId]
      );
      console.log(`[RATE_LIMIT] User ${userId} ${interactionType} interaction allowed (counter reset)`);
      return { allowed: true };
    }
    
    // Check if user has exceeded 15 interactions in 30 seconds
    if (record.interaction_count >= 15) {
      console.log(`[RATE_LIMIT] User ${userId} exceeded 15 interactions in 30 seconds (${record.interaction_count}/15)`);
      
      // Apply progressive timeout
      const newTimeoutLevel = Math.min(record.timeout_level + 1, 4);
      let timeoutDuration;
      
      switch (newTimeoutLevel) {
        case 1: timeoutDuration = 15; break;  // 15 seconds
        case 2: timeoutDuration = 30; break;  // 30 seconds
        case 3: 
        case 4: timeoutDuration = 60; break;  // 60 seconds
        default: timeoutDuration = 15;
      }
      
      const timeoutUntil = new Date(now.getTime() + (timeoutDuration * 1000));
      
      // Update database with timeout and reset counter
      await db.query(
        'UPDATE user_rate_limits SET timeout_level = $1, timeout_until = $2, updated_at = $3, interaction_count = 0, last_interaction_at = $3 WHERE user_id = $4',
        [newTimeoutLevel, timeoutUntil, now, userId]
      );
      
      return {
        allowed: false,
        reason: `⏰ **Rate Limited**\n\nYou're clicking buttons too quickly! You've exceeded **15 interactions** in **30 seconds**.\n\n**Timeout:** ${timeoutDuration} seconds\n**Try again:** <t:${Math.floor(timeoutUntil.getTime() / 1000)}:R>`,
        timeoutUntil
      };
    }
    
    // Increment interaction count
    await db.query(
      'UPDATE user_rate_limits SET interaction_count = interaction_count + 1, last_interaction_at = $1, updated_at = $1 WHERE user_id = $2',
      [now, userId]
    );
    
    console.log(`[RATE_LIMIT] User ${userId} ${interactionType} interaction allowed`);
    return { allowed: true };
    
  } catch (error) {
    console.error(`[RATE_LIMIT] Error checking button rate limit: ${error.message}`);
    // Allow on error to prevent blocking legitimate users
    return { allowed: true };
  }
}



/**
 * Clean up old rate limit records (should be called periodically)
 * @returns {Promise<void>}
 */
async function cleanupOldRateLimits() {
  try {
    await db.waitUntilConnected();
    
    // Remove records older than 24 hours where user is not currently timed out
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await db.query(
      'DELETE FROM user_rate_limits WHERE updated_at < $1 AND (timeout_until IS NULL OR timeout_until < NOW())',
      [oneDayAgo]
    );
    
    if (result.rowCount > 0) {
      console.log(`[RATE_LIMIT] Cleaned up ${result.rowCount} old rate limit records`);
    }
    
  } catch (error) {
    console.error(`[RATE_LIMIT] Error cleaning up old rate limits: ${error.message}`);
  }
}

module.exports = {
  checkTicketRateLimit,
  checkButtonRateLimit,
  shouldBypassRateLimit,
  getTicketCategory,
  cleanupOldRateLimits,
  RATE_LIMIT_BYPASS_USERS,
  TICKET_CATEGORY_MAPPINGS,
  BUTTON_RATE_LIMITS
}; 