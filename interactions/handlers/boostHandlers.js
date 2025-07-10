const { 
  boostManagementHandlers 
} = require('../../src/handlers/boostManagementHandlers.js');

// Re-export all boost management handlers for easy access
const boostHandlers = {
  // Core boost buttons
  'claim_boost': boostManagementHandlers['claim_boost'],
  'boost_completed': boostManagementHandlers['boost_completed'],
  'boost_cancel': boostManagementHandlers['boost_cancel'],
  
  // Boost completion confirmation buttons
  'boost_is_completed': boostManagementHandlers['boost_is_completed'],
  'boost_not_completed': boostManagementHandlers['boost_not_completed'],
  'boost_confirm_completed': boostManagementHandlers['boost_confirm_completed'],
  'boost_confirm_not_completed': boostManagementHandlers['boost_confirm_not_completed'],
  'boost_cancel_confirmation': boostManagementHandlers['boost_cancel_confirmation'],
  
  // Payout completion buttons
  'payout_completed': boostManagementHandlers['payout_completed']
};

module.exports = boostHandlers; 