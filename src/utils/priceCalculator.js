/**
 * Price calculator for various boost types - this is a helper for constants-based calculations
 * For full implementations, see helpers.js which directly calculates prices
 */
const { TROPHY_PRICE_TIERS, BULK_PRICE_TIERS, RANKED_STEP_COSTS } = require('../constants');

// This is a basic implementation using tiers defined in constants
// For a more detailed implementation, see utils.js which includes power level multipliers
function calculateTrophyPrice(current, desired, powerLevel = null) {
  if (current >= desired) return 0;
  
  let basePrice = 0;
  const trophyDiff = desired - current;
  
  // Use tiers from constants
  for (const tier of TROPHY_PRICE_TIERS) {
    if (current < tier.max) {
      const trophiesInTier = Math.min(tier.max - Math.max(current, tier.min), trophyDiff);
      if (trophiesInTier > 0) {
        basePrice += trophiesInTier * tier.price;
      }
    }
  }
  
  // Apply power level multiplier if provided
  if (powerLevel !== null && powerLevel !== undefined && !isNaN(powerLevel)) {
    // Import the multiplier function from utils.js
    try {
      const { calculateTrophyPowerLevelMultiplier } = require('../utils');
      const multiplier = calculateTrophyPowerLevelMultiplier(desired, powerLevel);
      return basePrice * multiplier;
    } catch (error) {
      console.error('[PRICE_CALCULATOR] Error applying power level multiplier:', error);
      return basePrice;
    }
  }
  
  return basePrice;
}

// This is a basic implementation using tiers defined in constants
// For a more detailed implementation, see helpers.js
function calculateBulkPrice(current, desired) {
  if (current >= desired) return 0;
  
  let totalPrice = 0;
  const trophyDiff = desired - current;
  
  // Use tiers from constants  
  for (const tier of BULK_PRICE_TIERS) {
    if (current < tier.max) {
      const trophiesInTier = Math.min(tier.max - Math.max(current, tier.min), trophyDiff);
      if (trophiesInTier > 0) {
        totalPrice += trophiesInTier * tier.price;
      }
    }
  }
  
  return totalPrice;
}

// This is a simplified implementation for reference only
// For the full implementation with specific tier handling, see helpers.js
function calculateRankedPrice(currentRank, currentRankSpecific, desiredRank, desiredRankSpecific) {
  // Redirect to the proper implementation in helpers.js
  console.log(`[PRICE CALCULATOR] Redirecting to helpers.js for calculateRankedPrice: ${currentRank} ${currentRankSpecific} -> ${desiredRank} ${desiredRankSpecific}`);
  
  // Import the proper implementation dynamically to avoid circular dependencies
  const helpers = require('./helpers');
  return helpers.calculateRankedPrice(currentRank, currentRankSpecific, desiredRank, desiredRankSpecific);
}

module.exports = {
  calculateTrophyPrice,
  calculateBulkPrice,
  calculateRankedPrice
}; 