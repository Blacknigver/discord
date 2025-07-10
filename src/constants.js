/**
 * Constants and configuration for the ticket system
 */

// Bot configuration
const PREFIX = '!';
const EMBED_COLOR = '#2B2D31';

// Channel Categories and IDs
const TICKET_CATEGORIES = {
  order: '1369951222429388810', // Replace with actual category ID for order tickets
  help: '1369951222429388810',  // Replace with actual category ID for help tickets
  purchase: '1386011392968232990', // FIXED: Updated to correct purchase category ID
  BOOSTING: '1369951222429388810', // Use the same as order for now
  OTHER: '1369951222429388810' // Use the same as order for now
};

// Staff role IDs - give these roles access to ticket channels
const STAFF_ROLES = [
  '1292933200389083196', // Owner role
  '1358101527658627270', // Head Admin role  
  '1292933924116500532', // Admin role
  '987751357773672538'   // User JustRuben ID
];

// Command permissions
const LIST_COMMAND_ROLE = '1292933924116500532'; // Admin role
const TICKET_PANEL_ALLOWED_USERS = [
  '1292933200389083196', // Owner role
  '1358101527658627270', // Head Admin role
  '1292933924116500532', // Admin role
  '987751357773672538',  // User JustRuben ID
  '969310522866548746',  // Additional user ID for ticket panel access
  '1346034712627646524'  // User who needs ticket panel access
];

// Move categories
const MOVE_CATEGORIES = {
  paid: '1369951222429388810',    // Update with actual paid category ID
  add: '1369951222429388810',     // Update with actual add category ID  
  sell: '1369951222429388810',    // Update with actual sell category ID
  finished: '1369951222429388810' // Update with actual finished category ID
};

// Purchase account category
const PURCHASE_ACCOUNT_CATEGORY = '1386011392968232990'; // FIXED: Updated to correct category ID

// Staff user IDs for payment verification
const PAYMENT_STAFF = {
  PAYPAL_VERIFIER: ['986164993080836096', '987751357773672538'], // Updated verifier IDs
  IBAN_VERIFIER: '987751357773672538',
  APPLE_GIFTCARD_VERIFIER: '1078003651701915779',
  BTC_VERIFIER: '987751357773672538' // Same as IBAN for now
};

// Role IDs for notifications
const ROLE_IDS = {
  BOOST_AVAILABLE: '1303702944696504441',
  APPLE_GIFTCARD_STAFF: '1292933200389083196',
  OWNER: '1292933200389083196',        // Owner role ID (updated)
  HEAD_ADMIN: '1358101527658627270',   // Head admin role ID (updated)
  ADMIN: '1292933924116500532',        // Admin role ID (updated)
  BOOSTER: '1303702944696504441',      // Booster role ID (updated)
  CUSTOMER: '1292934863598653742',     // Customer role ID (updated)
  STAFF_ROLE: '1366109737854304286'    // Staff role ID (unchanged)
};

// System channels
const AUTO_CLOSE_LOG_CHANNEL = '1234567890123456783'; // Replace with channel ID for auto-close logs
const PAYMENT_LOG_CHANNEL = '1234567890123456782'; // Replace with channel ID for payment logs

// Ticket limits
const MAX_TICKETS_PER_USER = 5;
const MAX_TICKET_PANEL_TICKETS = 3;
const MAX_PURCHASE_TICKETS = 2;

// Price Tiers
const TROPHY_PRICE_TIERS = [
  { min: 0, max: 5000, price: 0.4 },     // €0.4 per trophy up to 5000
  { min: 5001, max: 10000, price: 0.8 },  // €0.8 per trophy 5001-10000
  { min: 10001, max: 15000, price: 1.2 },
  { min: 15001, max: 20000, price: 1.6 },
  { min: 20001, max: 25000, price: 2.0 },
  { min: 25001, max: 30000, price: 2.4 },
  { min: 30001, max: 35000, price: 2.8 },
  { min: 35001, max: 40000, price: 3.2 },
  { min: 40001, max: 45000, price: 3.6 },
  { min: 45001, max: 50000, price: 4.0 }
];

const BULK_PRICE_TIERS = [
  { min: 0, max: 5000, price: 0.4 },     // €0.4 per trophy up to 5000
  { min: 5001, max: 10000, price: 0.8 },  // €0.8 per trophy 5001-10000
  { min: 10001, max: 15000, price: 1.2 },
  { min: 15001, max: 20000, price: 1.6 },
  { min: 20001, max: 25000, price: 2.0 },
  { min: 25001, max: 30000, price: 2.4 },
  { min: 30001, max: 35000, price: 2.8 },
  { min: 35001, max: 40000, price: 3.2 },
  { min: 40001, max: 45000, price: 3.6 },
  { min: 45001, max: 50000, price: 4.0 }
];

// Ranked tiers for reference - THIS IS THE DEFINITIVE ORDER
const RANKED_ORDER = [
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Mythic 1', 'Mythic 2', 'Mythic 3',
  'Legendary 1', 'Legendary 2', 'Legendary 3',
  'Masters 1', 'Masters 2', 'Masters 3',
  'Pro'
];

// Step costs for reference ranked pricing - These are CUMULATIVE costs
const RANKED_STEP_COSTS = {
  'Bronze 1': 0,
  'Bronze 2': 0.25,
  'Bronze 3': 0.60,
  'Silver 1': 1.00,
  'Silver 2': 1.50,
  'Silver 3': 2.00,
  'Gold 1': 2.50,
  'Gold 2': 3.20,
  'Gold 3': 3.90,
  'Diamond 1': 4.60,
  'Diamond 2': 6.10,
  'Diamond 3': 7.60,
  'Mythic 1': 9.10,
  'Mythic 2': 11.60,
  'Mythic 3': 14.60,
  'Legendary 1': 18.10,
  'Legendary 2': 25.10,
  'Legendary 3': 35.10,
  'Masters 1': 48.10,
  'Masters 2': 98.10,
  'Masters 3': 178.10,
  'Pro': 298.10
};

// Step prices for reference ranked pricing - These are per-step costs
const RANKED_STEP_PRICES = {
  'Bronze 1 to Bronze 2': 0.25,
  'Bronze 2 to Bronze 3': 0.35,
  'Bronze 3 to Silver 1': 0.40,
  'Silver 1 to Silver 2': 0.50,
  'Silver 2 to Silver 3': 0.50,
  'Silver 3 to Gold 1': 0.50,
  'Gold 1 to Gold 2': 0.70,
  'Gold 2 to Gold 3': 0.70,
  'Gold 3 to Diamond 1': 0.70,
  'Diamond 1 to Diamond 2': 1.50,
  'Diamond 2 to Diamond 3': 1.50,
  'Diamond 3 to Mythic 1': 1.50,
  'Mythic 1 to Mythic 2': 2.50,
  'Mythic 2 to Mythic 3': 3.00,
  'Mythic 3 to Legendary 1': 3.50,
  'Legendary 1 to Legendary 2': 7.00,
  'Legendary 2 to Legendary 3': 10.00,
  'Legendary 3 to Masters 1': 13.00,
  'Masters 1 to Masters 2': 50.00,
  'Masters 2 to Masters 3': 80.00,
  'Masters 3 to Pro': 120.00
};

// Mastery steps for reference pricing
const MASTERY_ORDER = [
    'Level 1', 'Level 2', 'Level 3', // Bronze
    'Level 4', 'Level 5', 'Level 6', // Silver
    'Level 7', 'Level 8', 'Level 9'  // Gold
];

// Update mastery step costs with correct pricing
const MASTERY_STEPS_COST = {
  'Bronze 1': 0,   // Base price
  'Bronze 2': 2,   // Bronze 1 to Bronze 2 = €2
  'Bronze 3': 5,   // Bronze 2 to Bronze 3 = €3 (cumulative: 2 + 3 = 5)
  'Silver 1': 7,   // Bronze 3 to Silver 1 = €2 (cumulative: 5 + 2 = 7)
  'Silver 2': 13,  // Silver 1 to Silver 2 = €6 (cumulative: 7 + 6 = 13)
  'Silver 3': 21,  // Silver 2 to Silver 3 = €8 (cumulative: 13 + 8 = 21)
  'Gold 1': 36,    // Silver 3 to Gold 1 = €15 (cumulative: 21 + 15 = 36)
  'Gold 2': 56,    // Gold 1 to Gold 2 = €20 (cumulative: 36 + 20 = 56)
  'Gold 3': 86     // Gold 2 to Gold 3 = €30 (cumulative: 56 + 30 = 86)
};

// Custom emojis
const EMOJIS = {
  PAYPAL: '<:paypal:1371862922766192680>',
  CRYPTO: '<:crypto:1371863500720177314>',
  BANK: '<:bank:1371863843789209691>',
  TIKKIE: '<:tikkie:1371869238259875922>',
  APPLE_PAY: '<:applepay:1371864533047578755>',
  BOLCOM: '<:bolcom:1371870572237160448>',
  LITECOIN: '<:Litecoin:1371864997012963520>',
  SOLANA: '<:Solana:1371865225824960633>',
  BITCOIN: '<:Bitcoin:1371865397623652443>',
  CHECKMARK: '<:checkmark:1357478063616688304>',
  CROSS: '<:cross:1351689463453061130>',
  COPY: '<:copy:1372240644013035671>',
  SHIELD: '<:shield:1371879600560541756>'
};

// Payment related constants
const CRYPTO_WALLET_ADDRESSES = {
  btc: 'bc1qcxrteqq6rgr4u5s6hg9n4d27zar22ssgzx7s8v',
  ltc: 'LMEBUghAdAKKdNTtUBExHyN33b6JS75TkH',
  sol: 'B9z5EhzPnPFf8t5CptAArYRFhzkrQkv1i7URz1pVSNdH'
};

const PAYMENT_METHODS = {
  PAYPAL: {
    email: 'mathiasbenedetto@gmail.com',
    emoji: EMOJIS.PAYPAL,
    name: 'PayPal',
    description: 'Friends & Family + PayPal Balance Payments ONLY!'
  },
  CRYPTO: {
    emoji: EMOJIS.CRYPTO,
    name: 'Crypto',
    description: 'No memecoins or such.'
  },
  IBAN: {
    account: 'NL12 ABNA 0882 8893 97',
    name: 'Ruben',
    emoji: EMOJIS.BANK,
    description: 'IBAN only. This works for EU banks only.'
  },
  PAYPAL_GIFTCARD: {
    emoji: EMOJIS.PAYPAL,
    name: 'PayPal Giftcard',
    description: 'Purchaseable on G2A.com or Eneba.com - Extra fees may apply.'
  },
  DUTCH_PAYMENT: {
    emoji: EMOJIS.TIKKIE,
    name: 'Dutch Payment Methods',
    description: 'Only for Dutch people - the Netherlands - No other countries.'
  },
  APPLE_GIFTCARD: {
    emoji: EMOJIS.APPLE_PAY,
    name: 'German Apple Giftcard',
    description: 'German Apple giftcards only, other countries are not accepted.'
  },
  TIKKIE: {
    link: 'https://tikkie.me/pay/im6epjm7vgj0d48n04p4',
    emoji: EMOJIS.TIKKIE,
    name: 'Tikkie'
  },
  BOLCOM: {
    emoji: EMOJIS.BOLCOM,
    name: 'Bol.com Giftcard',
    description: 'Additional Fees may Apply - 20-50%'
  }
};

// Crypto payment options
const CRYPTO_OPTIONS = {
  LITECOIN: {
    name: 'Litecoin',
    emoji: EMOJIS.LITECOIN,
    symbol: 'ltc',
    description: ''
  },
  SOLANA: {
    name: 'Solana',
    emoji: EMOJIS.SOLANA,
    symbol: 'sol',
    description: ''
  },
  BITCOIN: {
    name: 'Bitcoin',
    emoji: EMOJIS.BITCOIN,
    symbol: 'btc',
    description: 'We will not be covering transaction fees.'
  },
  OTHER: {
    name: 'Other',
    emoji: EMOJIS.CRYPTO,
    description: 'Mainstream only - No memecoins.'
  }
};

module.exports = {
  PREFIX,
  EMBED_COLOR,
  TICKET_CATEGORIES,
  STAFF_ROLES,
  AUTO_CLOSE_LOG_CHANNEL,
  PAYMENT_LOG_CHANNEL,
  MAX_TICKETS_PER_USER,
  MAX_TICKET_PANEL_TICKETS,
  MAX_PURCHASE_TICKETS,
  TROPHY_PRICE_TIERS,
  BULK_PRICE_TIERS,
  RANKED_ORDER,
  RANKED_STEP_COSTS,
  RANKED_STEP_PRICES,
  MASTERY_ORDER,
  MASTERY_STEPS_COST,
  CRYPTO_WALLET_ADDRESSES,
  PAYMENT_METHODS,
  EMOJIS,
  CRYPTO_OPTIONS,
  PAYMENT_STAFF,
  ROLE_IDS,
  LIST_COMMAND_ROLE,
  TICKET_PANEL_ALLOWED_USERS,
  MOVE_CATEGORIES,
  PURCHASE_ACCOUNT_CATEGORY
}; 