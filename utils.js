// Utilities and price calculation functions

const { ChannelType, PermissionsBitField } = require('discord.js');
// Import from config.js
const { MAX_CATEGORY_CHANNELS } = require('./config');
// Import from constants.js
const { RANKED_ORDER, RANKED_STEP_COSTS } = require('./src/constants');
const axios = require('axios');

/**
 * Check if a category is full (≥ MAX_CATEGORY_CHANNELS channels)
 */
function isCategoryFull(categoryId, guild) {
  // Default category limit if not specified
  const limit = MAX_CATEGORY_CHANNELS || 50;
  
  console.log(`[CATEGORY DEBUG] Checking if category ${categoryId} is full, limit: ${limit}`);
  
  // Validate inputs
  if (!categoryId) {
    console.log(`[CATEGORY DEBUG] No category ID provided`);
    return false;
  }
  
  if (!guild) {
    console.log(`[CATEGORY DEBUG] No guild provided`);
    return false;
  }
  
  try {
    const category = guild.channels.cache.get(categoryId);
    if (!category) {
      console.log(`[CATEGORY DEBUG] Category ${categoryId} not found in guild ${guild.id}`);
      return false;
    }
    
    if (!category.children || !category.children.cache) {
      console.log(`[CATEGORY DEBUG] Category ${categoryId} does not have valid children collection`);
      return true; // Assume full if we can't check
    }
    
    const childrenCount = category.children.cache.size;
    const isFull = childrenCount >= limit;
    
    console.log(`[CATEGORY DEBUG] Category ${categoryId} has ${childrenCount} channels, full: ${isFull} (limit: ${limit})`);
    return isFull;
  } catch (error) {
    console.error(`[CATEGORY DEBUG] Error checking if category ${categoryId} is full:`, error);
    return true; // Assume full if there's an error to prevent overflowing
  }
}

/**
 * Checks if a user has any of the specified roles
 */
function hasAnyRole(member, roleIds) {
  if (!member || !member.roles) return false;
  return roleIds.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Fetches the current price of a cryptocurrency in EUR using CoinGecko API
 */
async function fetchCryptoPrice(cryptoName) {
  try {
    console.log(`[CRYPTO_PRICE] Fetching current price for ${cryptoName}`);
    
    // Map crypto names to CoinGecko IDs
    const coinGeckoIds = {
      'litecoin': 'litecoin',
      'ltc': 'litecoin',
      'solana': 'solana',
      'sol': 'solana',
      'bitcoin': 'bitcoin',
      'btc': 'bitcoin'
    };

    // Default fallback rates in EUR if API fails
    const fallbackRates = {
      'litecoin': 70,  // €70 per LTC
      'ltc': 70,
      'solana': 130,   // €130 per SOL
      'sol': 130,
      'bitcoin': 60000, // €60,000 per BTC
      'btc': 60000
    };

    const coinName = cryptoName.toLowerCase();
    const coinId = coinGeckoIds[coinName];
    
    if (!coinId) {
      console.warn(`[CRYPTO_PRICE] Unsupported cryptocurrency: ${cryptoName}, using fallback`);
      return fallbackRates[coinName] || 100; // Default fallback
    }

    // Check if we've recently fetched this price (cache for 5 minutes)
    const cacheKey = `crypto_price_${coinId}`;
    const cachedPrice = global.priceCache ? global.priceCache[cacheKey] : null;
    
    if (cachedPrice && cachedPrice.timestamp > Date.now() - 5 * 60 * 1000) {
      console.log(`[CRYPTO_PRICE] Using cached price for ${cryptoName}: €${cachedPrice.price} (${Math.round((Date.now() - cachedPrice.timestamp) / 1000)}s old)`);
      return cachedPrice.price;
    }
    
    // Try to get real-time price from CoinGecko
    try {
      // Add a random delay between 0-500ms to avoid hitting rate limits when multiple requests happen at once
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
      
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`,
        { 
          timeout: 5000, // Timeout after 5 seconds
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Discord-Bot/1.0' // Identify our application
          }
        }
      );
      
      if (response.data && response.data[coinId] && response.data[coinId].eur) {
        const price = response.data[coinId].eur;
        console.log(`[CRYPTO_PRICE] Successfully fetched price for ${cryptoName}: €${price}`);
        
        // Cache the price
        if (!global.priceCache) global.priceCache = {};
        global.priceCache[cacheKey] = {
          price,
          timestamp: Date.now()
        };
        
        return price;
      } else {
        throw new Error('Invalid API response format');
      }
    } catch (apiError) {
      // Check for specific API errors
      if (apiError.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.warn(`[CRYPTO_PRICE] API error ${apiError.response.status}: ${apiError.response.data ? JSON.stringify(apiError.response.data) : 'No data'}`);
        
        if (apiError.response.status === 429) {
          console.warn('[CRYPTO_PRICE] Rate limited by CoinGecko API, using fallback price');
        }
      } else if (apiError.request) {
        // The request was made but no response was received
        console.warn(`[CRYPTO_PRICE] No response from API: ${apiError.message}`);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.warn(`[CRYPTO_PRICE] API request setup error: ${apiError.message}`);
      }
      
      // Use fallback if API fails
      return fallbackRates[coinName] || 100;
    }
  } catch (error) {
    console.error(`[CRYPTO_PRICE] Error fetching crypto price for ${cryptoName}: ${error.message}`);
    console.error(error.stack);
    
    // Use fallback values based on current market estimates
    const fallbacks = {
      'litecoin': 70,
      'ltc': 70,
      'solana': 130,
      'sol': 130,
      'bitcoin': 60000,
      'btc': 60000
    };
    
    return fallbacks[cryptoName.toLowerCase()] || 100;
  }
}

/**
 * Calculate power level price multiplier for trophies
 * @param {number} desiredTrophies - The desired trophy count
 * @param {number} powerLevel - The brawler power level (1-11, above 11 treated as 11)
 * @returns {number} - The price multiplier
 */
function calculateTrophyPowerLevelMultiplier(desiredTrophies, powerLevel) {
  console.log(`[TROPHY_POWER_MULTIPLIER] Calculating multiplier for ${desiredTrophies} trophies, power level ${powerLevel}`);
  
  // Cap power level at 11
  const cappedPowerLevel = Math.min(powerLevel, 11);
  console.log(`[TROPHY_POWER_MULTIPLIER] Capped power level: ${cappedPowerLevel}`);
  
  let multiplier = 1.0;
  
  // Define multipliers based on trophy ranges and power levels
  if (desiredTrophies <= 500) {
    // 500 and below
    if (cappedPowerLevel <= 2) multiplier = 3.0;
    else if (cappedPowerLevel >= 3 && cappedPowerLevel <= 5) multiplier = 2.0;
    else if (cappedPowerLevel >= 6 && cappedPowerLevel <= 7) multiplier = 1.5;
    else if (cappedPowerLevel === 8) multiplier = 1.2;
    else if (cappedPowerLevel === 11) multiplier = 0.9;
  } else if (desiredTrophies <= 750) {
    // 750 and below
    if (cappedPowerLevel <= 2) multiplier = 3.0;
    else if (cappedPowerLevel >= 3 && cappedPowerLevel <= 5) multiplier = 2.0;
    else if (cappedPowerLevel >= 6 && cappedPowerLevel <= 7) multiplier = 1.75;
    else if (cappedPowerLevel === 8) multiplier = 1.4;
    else if (cappedPowerLevel === 11) multiplier = 0.9;
  } else if (desiredTrophies <= 1000) {
    // 1000 and below
    if (cappedPowerLevel <= 2) multiplier = 3.0;
    else if (cappedPowerLevel >= 3 && cappedPowerLevel <= 5) multiplier = 2.5;
    else if (cappedPowerLevel >= 6 && cappedPowerLevel <= 7) multiplier = 2.0;
    else if (cappedPowerLevel === 8) multiplier = 1.5;
    // No multiplier for power 9-11 in this range
  } else if (desiredTrophies <= 1200) {
    // 1200 and below
    if (cappedPowerLevel <= 2) multiplier = 4.0;
    else if (cappedPowerLevel >= 3 && cappedPowerLevel <= 5) multiplier = 3.0;
    else if (cappedPowerLevel >= 6 && cappedPowerLevel <= 7) multiplier = 2.5;
    else if (cappedPowerLevel === 8) multiplier = 1.75;
    else if (cappedPowerLevel === 9) multiplier = 1.2;
    // No multiplier for power 10-11 in this range
  } else if (desiredTrophies <= 1500) {
    // 1500 and below (1200-1500)
    if (cappedPowerLevel <= 2) multiplier = 4.0;
    else if (cappedPowerLevel >= 3 && cappedPowerLevel <= 5) multiplier = 3.0;
    else if (cappedPowerLevel >= 6 && cappedPowerLevel <= 7) multiplier = 2.5;
    else if (cappedPowerLevel === 8) multiplier = 1.8;
    else if (cappedPowerLevel === 9) multiplier = 1.4;
    else if (cappedPowerLevel === 10) multiplier = 1.05;
    // No multiplier for power 11 in this range
  } else if (desiredTrophies <= 1750) {
    // 1750 and below
    if (cappedPowerLevel <= 2) multiplier = 5.0;
    else if (cappedPowerLevel >= 3 && cappedPowerLevel <= 5) multiplier = 4.0;
    else if (cappedPowerLevel >= 6 && cappedPowerLevel <= 7) multiplier = 3.0;
    else if (cappedPowerLevel === 8) multiplier = 2.0;
    else if (cappedPowerLevel === 9) multiplier = 1.5;
    else if (cappedPowerLevel === 10) multiplier = 1.1;
    // No multiplier for power 11 in this range
  } else if (desiredTrophies <= 1900) {
    // 1900 and below
    if (cappedPowerLevel <= 2) multiplier = 5.0;
    else if (cappedPowerLevel >= 3 && cappedPowerLevel <= 5) multiplier = 4.0;
    else if (cappedPowerLevel >= 6 && cappedPowerLevel <= 7) multiplier = 3.5;
    else if (cappedPowerLevel === 8) multiplier = 2.25;
    else if (cappedPowerLevel === 9) multiplier = 1.6;
    else if (cappedPowerLevel === 10) multiplier = 1.15;
    // No multiplier for power 11 in this range
  } else {
    // 1901 and above
    if (cappedPowerLevel <= 2) multiplier = 6.0;
    else if (cappedPowerLevel >= 3 && cappedPowerLevel <= 5) multiplier = 4.5;
    else if (cappedPowerLevel >= 6 && cappedPowerLevel <= 7) multiplier = 3.75;
    else if (cappedPowerLevel === 8) multiplier = 2.5;
    else if (cappedPowerLevel === 9) multiplier = 1.65;
    else if (cappedPowerLevel === 10) multiplier = 1.25;
    // No multiplier for power 11 in this range
  }
  
  console.log(`[TROPHY_POWER_MULTIPLIER] Final multiplier for ${desiredTrophies} trophies, power ${cappedPowerLevel}: ${multiplier}x`);
  return multiplier;
}

/**
 * Calculate price for trophies boost with power level multiplier
 * This function calculates the price per 50 trophies based on the trophy range and applies power level multiplier
 */
function calculateTrophyPrice(current, desired, powerLevel = null) {
  console.log(`[TROPHY PRICE DEBUG] Function called with params: current=${current}, desired=${desired}, powerLevel=${powerLevel}`);
  console.log(`[TROPHY PRICE DEBUG] Parameter types: current=${typeof current}, desired=${typeof desired}, powerLevel=${typeof powerLevel}`);
  
  // Validate inputs
  if (current === undefined || desired === undefined) {
    console.error(`[TROPHY PRICE ERROR] Undefined values: current=${current}, desired=${desired}`);
    return 0;
  }
  
  // Convert to numbers if they're strings
  if (typeof current === 'string') current = Number(current);
  if (typeof desired === 'string') desired = Number(desired);
  
  if (isNaN(current) || isNaN(desired) || current >= desired) {
    console.error(`[TROPHY PRICE ERROR] Invalid values: current=${current}, desired=${desired}`);
    return 0;
  }

  // Ensure we're working with integers
  current = Math.floor(Number(current));
  desired = Math.floor(Number(desired));
  
  if (current < 0 || desired < 0) {
    console.error(`[TROPHY PRICE ERROR] Negative values not allowed: current=${current}, desired=${desired}`);
    return 0;
  }

  console.log(`[TROPHY PRICE DEBUG] Validated and converted inputs: current=${current}, desired=${desired}, powerLevel=${powerLevel}`);

  // Trophy price brackets with prices per 50 trophies
  const brackets = [
    { min: 0, max: 499, price: 0.50 },        // 0-500: €0.50 per 50
    { min: 500, max: 749, price: 0.75 },      // 500-750: €0.75 per 50
    { min: 750, max: 999, price: 1.00 },      // 750-1000: €1.00 per 50
    { min: 1000, max: 1099, price: 2.00 },    // 1000-1100: €2.00 per 50
    { min: 1100, max: 1199, price: 2.50 },    // 1100-1200: €2.50 per 50
    { min: 1200, max: 1299, price: 3.00 },    // 1200-1300: €3.00 per 50
    { min: 1300, max: 1399, price: 3.50 },    // 1300-1400: €3.50 per 50
    { min: 1400, max: 1499, price: 4.00 },    // 1400-1500: €4.00 per 50
    { min: 1500, max: 1599, price: 4.50 },    // 1500-1600: €4.50 per 50
    { min: 1600, max: 1699, price: 5.00 },    // 1600-1700: €5.00 per 50
    { min: 1700, max: 1799, price: 5.50 },    // 1700-1800: €5.50 per 50
    { min: 1800, max: 1899, price: 6.50 },    // 1800-1900: €6.50 per 50
    { min: 1900, max: 1999, price: 7.50 },    // 1900-2000: €7.50 per 50
    { min: 2000, max: Infinity, price: 7.50 } // 2000+: €7.50 per 50
  ];

  console.log(`[TROPHY PRICE DEBUG] Using ${brackets.length} price brackets`);
  
  let basePrice = 0;
  let currentPosition = current;
  
  console.log(`[TROPHY PRICE] Calculating base price for ${current} -> ${desired}`);

  // Process trophy increases in 50-trophy increments
  try {
    while (currentPosition < desired) {
      // Find the tier for the current position
      const tier = brackets.find(b => currentPosition >= b.min && currentPosition <= b.max);
      
      if (!tier) {
        console.error(`[TROPHY PRICE ERROR] Could not find tier for trophy count ${currentPosition}`);
        console.log(`[TROPHY PRICE DEBUG] Available tiers:`, brackets.map(b => `${b.min}-${b.max}`).join(', '));
        return 0;
      }
      
      // Calculate how many 50-trophy blocks to process in this tier
      const remainingInTier = Math.min(tier.max + 1, desired) - currentPosition;
      const blocksInTier = Math.ceil(remainingInTier / 50);
      const trophiesToProcess = Math.min(blocksInTier * 50, desired - currentPosition);
      
      console.log(`[TROPHY PRICE DEBUG] Processing tier ${tier.min}-${tier.max}, rate €${tier.price}/50`);
      console.log(`[TROPHY PRICE DEBUG] Remaining in tier: ${remainingInTier}, blocks: ${blocksInTier}, trophies: ${trophiesToProcess}`);
      
      // Calculate the price for these trophies
      const blocks = Math.ceil(trophiesToProcess / 50);
      const priceForBlocks = blocks * tier.price;
      
      console.log(`[TROPHY PRICE] ${currentPosition} to ${currentPosition + trophiesToProcess}: ${blocks} blocks @ €${tier.price} = €${priceForBlocks.toFixed(2)}`);
      
      basePrice += priceForBlocks;
      currentPosition += trophiesToProcess;
    }
  } catch (error) {
    console.error(`[TROPHY PRICE ERROR] Error in calculation loop:`, error);
    return 0;
  }

  // Validate the base price
  if (isNaN(basePrice) || basePrice < 0) {
    console.error(`[TROPHY PRICE ERROR] Invalid base price: ${basePrice}`);
    return 0;
  }

  console.log(`[TROPHY PRICE] Base price calculated: €${basePrice.toFixed(2)}`);

  // Apply power level multiplier if provided
  let finalPrice = basePrice;
  if (powerLevel !== null && powerLevel !== undefined && !isNaN(powerLevel)) {
    const powerLevelMultiplier = calculateTrophyPowerLevelMultiplier(desired, powerLevel);
    finalPrice = basePrice * powerLevelMultiplier;
    console.log(`[TROPHY PRICE] Applied power level ${powerLevel} multiplier ${powerLevelMultiplier}x: €${basePrice.toFixed(2)} -> €${finalPrice.toFixed(2)}`);
  } else {
    console.log(`[TROPHY PRICE] No power level provided, using base price: €${finalPrice.toFixed(2)}`);
  }

  // Round to 2 decimal places
  const roundedPrice = Math.round(finalPrice * 100) / 100;
  
  console.log(`[TROPHY PRICE] Final price for ${current}-${desired} (power ${powerLevel}): €${roundedPrice.toFixed(2)}`);
  return roundedPrice;
}

/**
 * Calculate price for bulk trophies
 * This function properly calculates the price for bulk trophy boost based on current total trophies
 */
function calculateBulkPrice(current, desired) {
  // Validate inputs
  if (isNaN(current) || isNaN(desired) || current >= desired) {
    console.log(`[BULK PRICE ERROR] Invalid values: current=${current}, desired=${desired}`);
    return 0;
  }
  
  // Ensure we're working with integers
  current = Math.floor(Number(current));
  desired = Math.floor(Number(desired));
  
  if (current < 0 || desired < 0) {
    console.log(`[BULK PRICE ERROR] Negative values not allowed: current=${current}, desired=${desired}`);
    return 0;
  }

  const trophyDifference = desired - current;

  // Bulk price tiers per 1000 trophies
  const bulkTiers = [
    { min: 0, max: 9999, price: 5.00 },
    { min: 10000, max: 19999, price: 7.50 },
    { min: 20000, max: 29999, price: 10.00 },
    { min: 30000, max: 39999, price: 11.00 },
    { min: 40000, max: 49999, price: 12.50 },
    { min: 50000, max: 59999, price: 15.00 },
    { min: 60000, max: 69999, price: 17.50 },
    { min: 70000, max: 79999, price: 20.00 },
    { min: 80000, max: 89999, price: 25.00 },
    { min: 90000, max: 99999, price: 30.00 },
    { min: 100000, max: 109999, price: 45.00 },
    { min: 110000, max: 119999, price: 60.00 },
    { min: 120000, max: 129999, price: 75.00 },
    { min: 130000, max: 139999, price: 100.00 },
    { min: 140000, max: 149999, price: 150.00 },
    { min: 150000, max: Infinity, price: 150.00 }
  ];

  let totalPrice = 0;
  let remainingTrophies = trophyDifference;
  let currentPosition = current;

  // Split into 1000-trophy blocks and price each block according to the tier it falls in
  while (remainingTrophies > 0) {
    // Find the tier for the current position
    const tier = bulkTiers.find(t => currentPosition >= t.min && currentPosition <= t.max) || bulkTiers[bulkTiers.length - 1];
    
    // Calculate how many trophies to process in this tier (max 1000 at a time)
    const trophiesInThisBatch = Math.min(1000, remainingTrophies);
    const tierPrice = tier.price;
    
    // Calculate price for this batch
    const batchPrice = (trophiesInThisBatch / 1000) * tierPrice;
    totalPrice += batchPrice;

    // Update tracking variables
    remainingTrophies -= trophiesInThisBatch;
    currentPosition += trophiesInThisBatch;
  }

  // Round to 2 decimal places
  const finalPrice = Math.round(totalPrice * 100) / 100;

  console.log(`[BULK PRICE] ${current}-${desired} = €${finalPrice.toFixed(2)}`);
  return finalPrice;
}

/**
 * Calculate ranked boost price
 */
function calculateRankedPrice(currentRank, currentRankSpecific, desiredRank, desiredRankSpecific) {
  const normalizeSpecific = (specific) => {
    if (typeof specific === 'string') {
      const upper = specific.toUpperCase();
      if (upper === 'I') return '1';
      if (upper === 'II') return '2';
      if (upper === 'III') return '3';
    }
    // If it's already a number or a string like "1", convert to string.
    // If it's undefined/null, it will become "undefined" or "null" which is fine for formatRank checks
    return String(specific); 
  };

  const formatRank = (rank, specific) => {
    const normalizedSpecific = normalizeSpecific(specific); // Normalize here
    if (!rank) return null;
    
    // Special case for Pro rank - it has no specific number
    if (rank === 'Pro') {
      return 'Pro';
    }
    
    if (!normalizedSpecific || normalizedSpecific === 'null' || normalizedSpecific === 'undefined' || normalizedSpecific === '') return null;
    return `${rank} ${normalizedSpecific}`; 
  };
  
  const currentRankFormatted = formatRank(currentRank, currentRankSpecific);
  const desiredRankFormatted = formatRank(desiredRank, desiredRankSpecific);
  
  if (!currentRankFormatted || !desiredRankFormatted) {
    console.log(`[PRICE DEBUG] Invalid rank input: current=${currentRank}/${currentRankSpecific}, desired=${desiredRank}/${desiredRankSpecific}`);
    return 0;
  }
  
  console.log(`[PRICE DEBUG] Formatted ranks for price calculation: current=${currentRankFormatted}, desired=${desiredRankFormatted}`);
  
  const idxStart = RANKED_ORDER.indexOf(currentRankFormatted);
  const idxEnd = RANKED_ORDER.indexOf(desiredRankFormatted);
  
  console.log(`[PRICE DEBUG] Indices in RANKED_ORDER: current=${idxStart}, desired=${idxEnd}`);
  
  if (idxStart === -1) {
    console.log(`[PRICE DEBUG] Current rank ${currentRankFormatted} not found in RANKED_ORDER.`);
    return 0;
  }
  if (idxEnd === -1) {
    console.log(`[PRICE DEBUG] Desired rank ${desiredRankFormatted} not found in RANKED_ORDER.`);
    return 0;
  }
  
  if (idxEnd <= idxStart) {
    console.log(`[PRICE DEBUG] Desired rank (${desiredRankFormatted}) is not higher than current rank (${currentRankFormatted}).`);
    return 0;
  }
  
  // Check if ranks exist in the cost table
  if (!(currentRankFormatted in RANKED_STEP_COSTS)) {
      console.log(`[PRICE DEBUG] Current rank ${currentRankFormatted} not found in RANKED_STEP_COSTS.`);
      return 0;
  }
  if (!(desiredRankFormatted in RANKED_STEP_COSTS)) {
      console.log(`[PRICE DEBUG] Desired rank ${desiredRankFormatted} not found in RANKED_STEP_COSTS.`);
      return 0;
  }

  const price = RANKED_STEP_COSTS[desiredRankFormatted] - RANKED_STEP_COSTS[currentRankFormatted];
  
  if (price < 0) {
      console.log(`[PRICE DEBUG] Calculated negative price (€${price}) for ${currentRankFormatted} to ${desiredRankFormatted}. This should not happen if desired rank is higher. Clamping to 0.`);
      return 0;
  }
  
  console.log(`[PRICE DEBUG] Total price for ${currentRankFormatted} to ${desiredRankFormatted}: €${price.toFixed(2)}`);
  return parseFloat(price.toFixed(2)); // Ensure it returns a number
}

/**
 * Moves a channel to a specific category based on event type and user ID
 * @param {Object} channel - Discord channel object to move
 * @param {String} eventType - 'payment_received', 'claim_boost', or 'boost_completed'
 * @param {String} userId - User ID of the person who triggered the event (for claim_boost)
 * @returns {Promise<Boolean>} - Whether the operation was successful
 */
async function moveToCategory(channel, eventType, userId = null) {
  try {
    let categoryId = null;
    
    if (eventType === 'payment_received') {
      // When payment is received
      categoryId = '1347969048553586822';
    } 
    else if (eventType === 'claim_boost') {
      // When boost is claimed - choose category based on user ID
      switch (userId) {
        case '986164993080836096':
          categoryId = '1351687962907246753';
          break;
        case '600022344349515780':
          categoryId = '1356728486412288068';
          break;
        case '774511191376265217':
          categoryId = '1356728522407936122';
          break;
        case '1078003651701915779':
          categoryId = '1356728546394902648';
          break;
        case '535549367990616068':
          categoryId = '1356728602766610482';
          break;
        case '923351396399587329':
          categoryId = '1356728624337911848';
          break;
        default:
          categoryId = '1382433431140434001'; // Default for other boosters
      }
    }
    else if (eventType === 'boost_completed') {
      // When boost is completed
      categoryId = '1347969418898051164';
    }
    
    if (categoryId) {
      console.log(`[CATEGORY] Moving channel ${channel.id} to category ${categoryId} for event ${eventType}`);
      await channel.setParent(categoryId, { lockPermissions: false });
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[CATEGORY] Error moving channel: ${error.message}`);
    return false;
  }
}

module.exports = {
  isCategoryFull,
  hasAnyRole,
  fetchCryptoPrice,
  calculateTrophyPrice,
  calculateTrophyPowerLevelMultiplier,
  calculateBulkPrice,
  calculateRankedPrice,
  moveToCategory
}; 