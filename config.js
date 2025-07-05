/**
 * Main configuration file
 */
const config = {
  // Bot configuration
  TOKEN: process.env.TOKEN || '',
  CLIENT_ID: process.env.CLIENT_ID || '',
  GUILD_ID: process.env.GUILD_ID || '',

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
  
  // Command permissions
  // TEST SERVER VALUES - FOR PRODUCTION REPLACE WITH: 
  // ADMIN_ROLES: ['986164993080836096', '658351335967686659']
  ADMIN_ROLES: [
    '1366109737854304286', // Test server role with all permissions
    '658351335967686659'  // User JustRuben ID
  ],
  
  // Business settings
  DEFAULT_CURRENCY: 'EUR',
  PAYMENT_TIMEOUT_MINUTES: 30,
  
  // Added required constants for handlers.js
  // TEST SERVER VALUES - FOR PRODUCTION REPLACE WITH: 
  // TICKET_PANEL_ALLOWED_USERS: ['986164993080836096', '658351335967686659']
  TICKET_PANEL_ALLOWED_USERS: [
    '1366109737854304286', // Test server role with all permissions
    '658351335967686659', // User JustRuben ID
    '969310522866548746', // Additional user ID for ticket panel access
    '1346034712627646524',  // User who needs ticket panel access
    '987751357773672538'  // User who needs ticketpanel access
  ],
  // TEST SERVER VALUE - FOR PRODUCTION REPLACE WITH: '1234567890123456780'
  LIST_COMMAND_ROLE: '1366109737854304286', // Test server role with all permissions
  // TEST SERVER VALUES - FOR PRODUCTION REPLACE WITH: 
  // STAFF_ROLES: ['986164993080836096', '658351335967686659', '1234567890123456784']
  STAFF_ROLES: [
    '1366109737854304286', // Test server role with all permissions
    '658351335967686659', // User JustRuben ID
  ],
  // TEST SERVER VALUES - FOR PRODUCTION REPLACE WITH:
  // MOVE_CATEGORIES: {
  //   paid: '1234567890123456778',
  //   add: '1234567890123456777',
  //   sell: '1234567890123456776',
  //   finished: '1234567890123456775'
  // }
  MOVE_CATEGORIES: {
    paid: '1369951222429388810',
    add: '1369951222429388810',
    sell: '1369951222429388810',
    finished: '1369951222429388810'
  },
  // TEST SERVER VALUES - FOR PRODUCTION REPLACE WITH:
  // TICKET_CATEGORIES: {
  //   order: '1234567890123456789',
  //   help: '1234567890123456788',
  //   purchase: '1234567890123456787'
  // }
  TICKET_CATEGORIES: {
    order: '1369951222429388810', // Test server category ID
    help: '1369951222429388810',  // Test server category ID
    purchase: '1369951222429388810' // Test server category ID
  },
  // TEST SERVER VALUE - FOR PRODUCTION REPLACE WITH: '1234567890123456787'
  PURCHASE_ACCOUNT_CATEGORY: '1369951222429388810', // Test server category ID
  // TEST SERVER VALUE - FOR PRODUCTION REPLACE WITH: '1351281086134747298'
  ADD_115K_ROLE: '1366109737854304286', // Test server role with all permissions
  // TEST SERVER VALUE - FOR PRODUCTION REPLACE WITH: '1351281117445099631'
  MATCHERINO_WINNER_ROLE: '1366109737854304286', // Test server role with all permissions
  // TEST SERVER VALUE - FOR PRODUCTION REPLACE WITH: '1354587880382795836'
  AUTO_CLOSE_LOG_CHANNEL: '1369951226485018714', // Test server channel ID
  MAX_TICKETS_PER_USER: 5, // Maximum number of tickets per user
  
  // Role IDs
  ROLES: {
    OWNER: '1292933200389083196',
    OWNER_ROLE: '1381713866018259075',
    HEAD_ADMIN: '1358101527658627270',
    HEAD_ADMIN_ROLE: '1381713912566775980',
    ADMIN: '1292933924116500532',
    ADMIN_ROLE: '1381713892501356585',
    BOOSTER: '1303702944696504441',
    BOOSTER_ROLE: '1303702944696504441',
    STAFF_ROLE: '1366109737854304286',
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