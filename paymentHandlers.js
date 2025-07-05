const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { EMBED_COLOR, EMOJIS, PAYMENT_METHODS, PAYMENT_STAFF } = require('./src/constants');
const { 
  showCryptoSelection, 
  showDutchPaymentMethodSelection, 
  sendPaymentConfirmationEmbed, 
  createCryptoTxForm,
  sendStaffPaymentVerificationEmbed,
  sendPaymentConfirmedNotification
} = require('./ticketPayments');
const config = require('./config');

// Import all the new split handlers
const { paymentMethodHandlers } = require('./src/handlers/paymentMethodHandlers');
const { cryptoPaymentHandlers, cryptoModalHandlers } = require('./src/handlers/cryptoPaymentHandlers');
const { paypalWorkflowHandlers } = require('./src/handlers/paypalWorkflowHandlers');
const { boostManagementHandlers } = require('./src/handlers/boostManagementHandlers');
const { staffOperationsHandlers } = require('./src/handlers/staffOperationsHandlers');
const { reviewFeedbackButtonHandlers, reviewFeedbackModalHandlers } = require('./src/handlers/reviewFeedbackHandlers');

// Set of used crypto transaction IDs to prevent reuse
const usedTxIds = new Set();
// Map to track crypto payment timeouts
const cryptoTimeouts = new Map();

/**
 * Combine all button handlers from split modules
 */
const allButtonHandlers = {
  ...paymentMethodHandlers,
  ...cryptoPaymentHandlers,
  ...paypalWorkflowHandlers,
  ...boostManagementHandlers,
  ...staffOperationsHandlers,
  ...reviewFeedbackButtonHandlers
};

/**
 * Combine all modal handlers from split modules
 */
const paymentModalHandlers = {
  ...cryptoModalHandlers,
  ...reviewFeedbackModalHandlers
};

module.exports = {
  allButtonHandlers,
  paymentModalHandlers,
  reviewFeedbackButtonHandlers,
  reviewFeedbackModalHandlers,
  usedTxIds
}; 