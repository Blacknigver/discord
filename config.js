/**
 * Main configuration file
 */
const config = {
  // Bot configuration
  TOKEN: process.env.TOKEN || '',
  CLIENT_ID: process.env.CLIENT_ID || '',
  GUILD_ID: process.env.GUILD_ID || '1292895164595175444', // Main guild (Brawl Shop)

  // Discord settings
  PREFIX: '!',
  EMBED_COLOR: 0x2b2d31,
  
  // Environment settings
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // API keys for third-party services
  COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || '',
  
  // Database settings (if using a database)
  DATABASE_URL: process.env.DATABASE_URL || '',
  
  // Ticket system settings
  MAX_CATEGORY_CHANNELS: 50, // Discord limitation
  TICKET_AUTO_CLOSE_HOURS: 48,
  TICKET_INITIAL_REMINDER_HOURS: 6,
  
  // Logging
  ENABLE_DEBUG_LOGS: process.env.ENABLE_DEBUG_LOGS === 'true' || false,
  
  // Feature toggles
  ENABLE_AUTO_CLOSE: process.env.ENABLE_AUTO_CLOSE === 'true' || true,
  ENABLE_CRYPTO_PAYMENTS: process.env.ENABLE_CRYPTO_PAYMENTS === 'true' || true,
  
  // Command permissions - Updated to production values
  ADMIN_ROLES: [
    '1292933200389083196', // Owner role
    '1358101527658627270', // Head Admin role  
    '1292933924116500532', // Admin role
    '987751357773672538'   // User JustRuben ID
  ],
  
  // Business settings
  DEFAULT_CURRENCY: 'EUR',
  PAYMENT_TIMEOUT_MINUTES: 30,
  
  // Production values for ticket system
  TICKET_PANEL_ALLOWED_USERS: [
    '1292933200389083196', // Owner role
    '1358101527658627270', // Head Admin role
    '1292933924116500532', // Admin role
    '987751357773672538',  // User JustRuben ID
    '969310522866548746',  // Additional user ID for ticket panel access
    '1346034712627646524'  // User who needs ticket panel access
  ],
  LIST_COMMAND_ROLE: '1292933924116500532', // Admin role
  STAFF_ROLES: [
    '1292933200389083196', // Owner role
    '1358101527658627270', // Head Admin role
    '1292933924116500532', // Admin role
    '987751357773672538'   // User JustRuben ID
  ],
  // You'll need to provide the actual category IDs for your main server
  // These are placeholder values - update with your actual category IDs
  MOVE_CATEGORIES: {
    paid: '1369951222429388810',    // Update with actual paid category ID
    add: '1369951222429388810',     // Update with actual add category ID  
    sell: '1369951222429388810',    // Update with actual sell category ID
    finished: '1369951222429388810' // Update with actual finished category ID
  },
  TICKET_CATEGORIES: {
    order: '1369951222429388810',    // Update with actual order category ID
    help: '1369951222429388810',     // Update with actual help category ID
    purchase: '1369951222429388810'  // Update with actual purchase category ID
  },
  PURCHASE_ACCOUNT_CATEGORY: '1369951222429388810', // Update with actual purchase category ID
  ADD_115K_ROLE: '1292933924116500532',             // Using Admin role - update if you have specific role
  MATCHERINO_WINNER_ROLE: '1292933924116500532',    // Using Admin role - update if you have specific role
  AUTO_CLOSE_LOG_CHANNEL: '1369951226485018714',   // Update with actual log channel ID
  MAX_TICKETS_PER_USER: 5, // Maximum number of tickets per user
  
  // Role IDs
  ROLES: {
    OWNER: '1292933200389083196',
    OWNER_ROLE: '1292933200389083196',
    HEAD_ADMIN: '1358101527658627270',
    HEAD_ADMIN_ROLE: '1358101527658627270',
    ADMIN: '1292933924116500532',
    ADMIN_ROLE: '1292933924116500532',
    BOOSTER: '1303702944696504441',
    BOOSTER_ROLE: '1303702944696504441',
    CUSTOMER_ROLE: '1292934863598653742',
    STAFF_ROLE: '1292933924116500532', // Updated to use actual Admin role
    CRYPTO_ADMIN_ROLE: '1381713912566775980'
  },
  
  // Payment settings
  PAYPAL_EMAIL: 'mathiasbenedetto@gmail.com',
  
  // Payment staff
  PAYMENT_STAFF: {
    PAYPAL_VERIFIER: ['986164993080836096', '1346034712627646524'], // ID of users who verify PayPal payments
    CRYPTO_VERIFIER: '986164993080836096', // ID of user who verifies crypto payments
    IBAN_VERIFIER: '986164993080836096'  // ID of user who verifies IBAN payments
  },
  
  // Ticket permissions
  TICKET_PERMISSIONS: {
    // Default permissions for ticket creators
    CREATOR: {
      VIEW_CHANNEL: true,
      SEND_MESSAGES: true,
      READ_MESSAGE_HISTORY: true,
      ATTACH_FILES: true,
      EMBED_LINKS: true,
      USE_EXTERNAL_EMOJIS: true,
      // Explicitly deny these
      MENTION_EVERYONE: false,
      USE_EXTERNAL_STICKERS: false
    },
    // Permissions for staff (admin/head admin/owner)
    STAFF: {
      VIEW_CHANNEL: true,
      SEND_MESSAGES: true,
      READ_MESSAGE_HISTORY: true,
      EMBED_LINKS: true,
      ATTACH_FILES: true,
      USE_EXTERNAL_EMOJIS: true,
      MENTION_EVERYONE: true,
      MANAGE_MESSAGES: true,
      MANAGE_CHANNELS: true
    },
    // Permissions for boosters after claiming a boost
    BOOSTER: {
      VIEW_CHANNEL: true,
      SEND_MESSAGES: true,
      READ_MESSAGE_HISTORY: true,
      ADD_REACTIONS: true,
      EMBED_LINKS: true,
      ATTACH_FILES: true
    }
  }
};

module.exports = config; 