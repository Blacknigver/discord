/**
 * Utilities and price calculation functions for the ticket system
 */

const axios = require('axios');
const { RANKED_STEP_COSTS, MASTERY_STEPS_COST, RANKED_ORDER } = require('../constants'); // Import step costs

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

function calculateMasteryPrice(brawler, currentMastery, currentMasterySpecific, desiredMastery, desiredMasterySpecific) {
  const curMasteryNum = parseInt(currentMasterySpecific) || 1;
  const desMasteryNum = parseInt(desiredMasterySpecific) || 1;

  // Format consistently, e.g., "Gold 1", "Silver 3"
  const currentFormatted = `${currentMastery} ${curMasteryNum}`.trim();
  const desiredFormatted = `${desiredMastery} ${desMasteryNum}`.trim();
  
  console.log(`[MASTERY_PRICE_DEBUG] Current formatted: '${currentFormatted}', Desired formatted: '${desiredFormatted}'`);

  // Validate that the masteries exist in MASTERY_STEPS_COST keys
  if (!MASTERY_STEPS_COST.hasOwnProperty(currentFormatted)) {
    console.error(`[PRICE ERROR] Current mastery '${currentFormatted}' not found in MASTERY_STEPS_COST.`);
    
    // Try a different formatting if the original format failed
    if (currentMastery && currentMasterySpecific) {
      // Check if this is a case where we have values like "Silver 1" instead of "Silver_1"
      // The constants.js file expects "Silver 1" format
      return calculateMasteryPrice(brawler, currentMastery, curMasteryNum, desiredMastery, desMasteryNum);
    }
    
    return 0;
  }
  if (!MASTERY_STEPS_COST.hasOwnProperty(desiredFormatted)) {
    console.error(`[PRICE ERROR] Desired mastery '${desiredFormatted}' not found in MASTERY_STEPS_COST.`);
    return 0;
  }

  const currentPrice = MASTERY_STEPS_COST[currentFormatted];
  const desiredPrice = MASTERY_STEPS_COST[desiredFormatted];

  // Ensure prices are numbers
  if (typeof currentPrice !== 'number' || typeof desiredPrice !== 'number') {
    console.error(`[PRICE ERROR] Price for '${currentFormatted}' (cost: ${currentPrice}) or '${desiredFormatted}' (cost: ${desiredPrice}) is not a number.`);
    return 0;
  }

  // Calculate the difference, ensuring it's not negative
  const priceDifference = Math.max(0, desiredPrice - currentPrice);
  
  console.log(`[MASTERY_PRICE_DEBUG] Calculating for Brawler '${brawler}': ${currentFormatted} (Cost: €${currentPrice}) to ${desiredFormatted} (Cost: €${desiredPrice}). Final Price: €${priceDifference.toFixed(2)}`);
  return parseFloat(priceDifference.toFixed(2));
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
  calculateMasteryPrice,
  isCategoryFull,
  hasAnyRole,
  fetchCryptoPrice,
  convertEuroToCrypto
}; 