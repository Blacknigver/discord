/**
 * Utilities and price calculation functions for the ticket system
 */

const axios = require('axios');
const { RANKED_STEP_COSTS, RANKED_ORDER } = require('../constants'); // Import step costs

function calculateRankedPrice(currentRank, currentRankSpecific, desiredRank, desiredRankSpecific) {
  // Format ranks for lookup
  const currentFormatted = (currentRank === 'Pro') ? 'Pro' : (currentRankSpecific ? `${currentRank} ${currentRankSpecific}` : currentRank);
  const desiredFormatted = (desiredRank === 'Pro') ? 'Pro' : (desiredRankSpecific ? `${desiredRank} ${desiredRankSpecific}` : desiredRank);

  const currentIndex = RANKED_ORDER.indexOf(currentFormatted);
  const desiredIndex = RANKED_ORDER.indexOf(desiredFormatted);

  if (currentIndex === -1) {
    console.error(`[PRICE ERROR] Current rank '${currentFormatted}' not found in RANKED_ORDER.`);
    return 0;
  }
  if (desiredIndex === -1) {
    console.error(`[PRICE ERROR] Desired rank '${desiredFormatted}' not found in RANKED_ORDER.`);
    return 0;
  }

  if (desiredIndex <= currentIndex) {
    console.warn(`[PRICE WARN] Desired rank '${desiredFormatted}' is not higher than current rank '${currentFormatted}'. Price will be 0.`);
    return 0; 
  }

  // Calculate price using cumulative costs
  const currentCost = RANKED_STEP_COSTS[currentFormatted] || 0;
  const desiredCost = RANKED_STEP_COSTS[desiredFormatted] || 0;
  
  if (typeof currentCost !== 'number' || typeof desiredCost !== 'number') {
    console.error(`[PRICE ERROR] Invalid cost values: current=${currentCost}, desired=${desiredCost}`);
    return 0;
  }
  
  const total = desiredCost - currentCost;
  console.log(`[RANKED_PRICE_DEBUG] Calculated total price from ${currentFormatted} to ${desiredFormatted}: €${total.toFixed(2)}`);
  return parseFloat(total.toFixed(2));
}

function calculateBulkPrice(currentTrophies, desiredTrophies) {
  // Validate inputs
  if (isNaN(currentTrophies) || isNaN(desiredTrophies) || desiredTrophies <= currentTrophies) {
    console.error(`[BULK PRICE ERROR] Invalid values: current=${currentTrophies}, desired=${desiredTrophies}`);
    return 0;
  }
  if (currentTrophies < 0 || desiredTrophies < 0) {
    console.error(`[BULK PRICE ERROR] Negative trophy values: current=${currentTrophies}, desired=${desiredTrophies}`);
    return 0;
  }

  // New tiered pricing structure (rate per 1000 trophies)
  const newTiers = [
    { min: 0, max: 10000, ratePer1k: 5 },
    { min: 10000, max: 20000, ratePer1k: 7.5 },
    { min: 20000, max: 30000, ratePer1k: 10 },
    { min: 30000, max: 40000, ratePer1k: 10 }, // Assuming 30k-40k is same as 20k-30k based on user format, adjust if different
    { min: 40000, max: 50000, ratePer1k: 12.5 },
    { min: 50000, max: 60000, ratePer1k: 15 },
    { min: 60000, max: 70000, ratePer1k: 17.5 },
    { min: 70000, max: 80000, ratePer1k: 20 },
    { min: 80000, max: 90000, ratePer1k: 25 },
    { min: 90000, max: 100000, ratePer1k: 30 },
    { min: 100000, max: Infinity, ratePer1k: 30 } // Assuming rate stays same for >100k
  ];

  let totalPrice = 0;
  let trophiesToCalculate = desiredTrophies - currentTrophies;
  let currentTierStart = currentTrophies;

  console.log(`[BULK_PRICE_DEBUG] Calculating for ${currentTrophies} -> ${desiredTrophies} (${trophiesToCalculate} total)`);

  for (const tier of newTiers) {
    if (trophiesToCalculate <= 0) break;

    // Skip tiers that are entirely below our current starting point
    if (currentTierStart >= tier.max) continue;

    const trophiesInThisTierRange = Math.min(tier.max - currentTierStart, trophiesToCalculate);
    
    if (trophiesInThisTierRange > 0) {
      const costForThisPortion = (trophiesInThisTierRange / 1000) * tier.ratePer1k;
      totalPrice += costForThisPortion;
      console.log(`[BULK_PRICE_DEBUG] Tier ${tier.min}-${tier.max}: ${trophiesInThisTierRange} trophies @ €${tier.ratePer1k}/1k = €${costForThisPortion.toFixed(2)}`);
      
      trophiesToCalculate -= trophiesInThisTierRange;
      currentTierStart += trophiesInThisTierRange;
    }
  }
  
  console.log(`[BULK_PRICE_DEBUG] Total calculated price: €${totalPrice.toFixed(2)}`);
  return Math.round(totalPrice * 100) / 100; // Round to 2 decimal places
}

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

// Utility functions
function isCategoryFull(categoryId, guild) {
  const category = guild.channels.cache.get(categoryId);
  if (!category) return false;
  return category.children.cache.size >= 50;
}

function hasAnyRole(member, roles) {
  return roles.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Fetches the current price of a cryptocurrency in EUR using CoinGecko API
 */
async function fetchCryptoPrice(cryptoName) {
  try {
    // Map crypto names to CoinGecko IDs
    const coinGeckoIds = {
      'litecoin': 'litecoin',
      'ltc': 'litecoin',
      'solana': 'solana',
      'sol': 'solana',
      'bitcoin': 'bitcoin',
      'btc': 'bitcoin'
    };

    const coinId = coinGeckoIds[cryptoName.toLowerCase()];
    if (!coinId) {
      throw new Error(`Unsupported cryptocurrency: ${cryptoName}`);
    }

    // Add retry logic and timeout
    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
      try {
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`, 
          { timeout: 5000 } // 5 second timeout
        );
        
        if (!response.data[coinId] || !response.data[coinId].eur) {
          throw new Error(`Failed to fetch price for ${cryptoName}`);
        }
        
        return response.data[coinId].eur;
      } catch (error) {
        lastError = error;
        retries--;
        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // If we get here, all retries failed
    console.error(`Error fetching crypto price for ${cryptoName} after multiple attempts:`, lastError);
    throw lastError;
  } catch (error) {
    console.error(`Error fetching crypto price for ${cryptoName}:`, error);
    throw error;
  }
}

/**
 * Converts a Euro amount to the equivalent amount in a cryptocurrency
 */
async function convertEuroToCrypto(cryptoSymbol, euroAmount) {
  try {
    if (isNaN(euroAmount) || euroAmount <= 0) {
      throw new Error(`Invalid Euro amount: ${euroAmount}`);
    }
    
    const cryptoPrice = await fetchCryptoPrice(cryptoSymbol);
    if (!cryptoPrice || cryptoPrice <= 0) {
      throw new Error(`Invalid crypto price for ${cryptoSymbol}: ${cryptoPrice}`);
    }
    
    // Calculate how much crypto is needed for this euro amount
    const cryptoAmount = euroAmount / cryptoPrice;
    
    // Format based on crypto type - more decimal places for high-value coins
    if (cryptoSymbol.toLowerCase() === 'bitcoin' || cryptoSymbol.toLowerCase() === 'btc') {
      return cryptoAmount.toFixed(8); // 8 decimal places for BTC
    } else if (cryptoSymbol.toLowerCase() === 'litecoin' || cryptoSymbol.toLowerCase() === 'ltc') {
      return cryptoAmount.toFixed(6); // 6 decimal places for LTC
    } else {
      return cryptoAmount.toFixed(4); // 4 decimal places for others
    }
  } catch (error) {
    console.error(`Error converting ${euroAmount}€ to ${cryptoSymbol}:`, error);
    throw error;
  }
}

module.exports = {
  calculateRankedPrice,
  calculateBulkPrice,
  calculateTrophyPrice,
  isCategoryFull,
  hasAnyRole,
  fetchCryptoPrice,
  convertEuroToCrypto
}; 