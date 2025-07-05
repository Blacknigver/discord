// Interaction handler for button clicks, select menus, modals, etc.
const { 
  handleRankedRankSelection, 
  handleMasterySelection, 
  handlePaymentMethodSelect,
  handleDutchMethodSelect,
  handleTicketConfirm,
  handleTicketCancel
} = require('../modules/ticketFlow.js');

// Import modal handlers from modalHandlers.js
const {
  handleMasteryBrawlerModal, 
  handleBulkTrophiesModal
} = require('../modules/modalHandlers.js');
const { handleCryptoButtons, handleCryptoTxFormSubmit } = require('./cryptoPaymentHandler.js');
const { 
  handlePayPalPaymentCompleted, 
  handlePayPalPaymentReceived, 
  handlePayPalPaymentNotReceived,
  handlePayPalAcceptToS,
  handlePayPalDenyToS,
  handlePayPalDenyConfirm,
  handlePayPalDenyCancel,
  handlePayPalCopyEmail,
  handleClaimBoost
} = require('./paypalButtonHandler.js');

// Handle button interactions
async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;
  
  try {
    console.log(`[INTERACTION] Button clicked: ${customId} by user ${interaction.user.id}`);
    
    // Handle ranked flow buttons
    if (customId.startsWith('ranked_')) {
      const rankInput = customId.replace('ranked_', '');
      return handleRankedRankSelection(interaction, rankInput);
    }
    
    // Handle mastery flow buttons
    if (customId.startsWith('mastery_')) {
      const masteryInput = customId.replace('mastery_', '');
      return handleMasterySelection(interaction, masteryInput);
    }
    
    // Handle ticket confirmation buttons
    if (customId === 'confirm_ticket') {
      return handleTicketConfirm(interaction);
    }
    
    // Handle ticket cancellation buttons
    if (customId === 'cancel_ticket') {
      return handleTicketCancel(interaction);
    }
    
    // Handle crypto payment buttons
    if (customId.startsWith('payment_completed_') || customId.startsWith('copy_')) {
      return handleCryptoButtons(interaction);
    }
    
    // Remove handler for payment_completed_paypal to prevent duplicates
    
    if (customId === 'payment_received') {
      console.log(`[PAYMENT_HANDLER] PayPal payment confirmed by staff ${interaction.user.id}`);
      return handlePayPalPaymentReceived(interaction);
    }
    
    if (customId === 'payment_not_received') {
      console.log(`[PAYMENT_HANDLER] PayPal payment rejected by staff ${interaction.user.id}`);
      return handlePayPalPaymentNotReceived(interaction);
    }
    
    // Handle PayPal ToS buttons
    if (customId === 'paypal_accept') {
      return handlePayPalAcceptToS(interaction);
    }
    
    if (customId === 'paypal_deny') {
      return handlePayPalDenyToS(interaction);
    }
    
    if (customId === 'paypal_deny_confirm') {
      return handlePayPalDenyConfirm(interaction);
    }
    
    if (customId === 'paypal_deny_cancel') {
      return handlePayPalDenyCancel(interaction);
    }
    
    if (customId === 'copy_email') {
      return handlePayPalCopyEmail(interaction);
    }
    
    if (customId === 'claim_boost') {
      return handleClaimBoost(interaction);
    }
    
    // Handle PayPal verification buttons
    if (customId.startsWith('paypal_verify_approve_') || customId.startsWith('paypal_verify_reject_')) {
      const paypalVerifier = interaction.client.handlers.get('paypalVerifier');
      if (paypalVerifier) {
        return paypalVerifier.handleVerificationResponse(interaction);
      }
    }
    
    // Handle other button types here...
    
    console.warn(`[INTERACTION] Unhandled button interaction: ${customId}`);
    return false;
  } catch (error) {
    console.error(`[INTERACTION] Error handling button ${customId}: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred processing your request. Please try again.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'An error occurred processing your request. Please try again.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[INTERACTION] Error replying to interaction: ${replyError.message}`);
    }
    
    return false;
  }
}

// Handle select menu interactions
async function handleSelectMenuInteraction(interaction) {
  const customId = interaction.customId;
  
  try {
    console.log(`[INTERACTION] Select menu used: ${customId} by user ${interaction.user.id}, values: ${interaction.values}`);
    
    // Handle payment method selection
    if (customId === 'payment_method_select') {
      return handlePaymentMethodSelect(interaction);
    }
    
    // Handle Dutch payment method selection
    if (customId === 'dutch_method_select') {
      return handleDutchMethodSelect(interaction);
    }
    
    // Handle crypto type selection
    if (customId === 'crypto_type_select') {
      return handleCryptoTypeSelect(interaction);
    }
    
    // Handle other select menu types here...
    
    console.warn(`[INTERACTION] Unhandled select menu interaction: ${customId}`);
    return false;
  } catch (error) {
    console.error(`[INTERACTION] Error handling select menu ${customId}: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred processing your selection. Please try again.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'An error occurred processing your selection. Please try again.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[INTERACTION] Error replying to interaction: ${replyError.message}`);
    }
    
    return false;
  }
}

// Handle modal submissions
async function handleModalSubmit(interaction) {
  const customId = interaction.customId;
  
  try {
    console.log(`[INTERACTION] Modal submitted: ${customId} by user ${interaction.user.id}`);
    
    // Handle bulk trophies modal
    if (customId === 'modal_bulk_trophies') {
      return handleBulkTrophiesModal(interaction);
    }
    
    // Handle mastery brawler modal
    if (customId === 'modal_mastery_brawler') {
      return handleMasteryBrawlerModal(interaction);
    }
    
    // Handle review modal submissions
    if (customId.startsWith('review_modal_')) {
      const { reviewFeedbackModalHandlers } = require('../../paymentHandlers.js');
      if (reviewFeedbackModalHandlers && reviewFeedbackModalHandlers['review_modal']) {
        return reviewFeedbackModalHandlers['review_modal'](interaction);
      }
    }
    
    // Handle feedback modal submissions
    if (customId.startsWith('feedback_modal_')) {
      const { reviewFeedbackModalHandlers } = require('../../paymentHandlers.js');
      if (reviewFeedbackModalHandlers && reviewFeedbackModalHandlers['feedback_modal']) {
        return reviewFeedbackModalHandlers['feedback_modal'](interaction);
      }
    }
    
    // Handle crypto transaction form
    if (customId.startsWith('crypto_tx_form_')) {
      return handleCryptoTxFormSubmit(interaction);
    }
    
    // Handle other modal types here...
    
    console.warn(`[INTERACTION] Unhandled modal interaction: ${customId}`);
    return false;
  } catch (error) {
    console.error(`[INTERACTION] Error handling modal ${customId}: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred processing your submission. Please try again.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'An error occurred processing your submission. Please try again.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[INTERACTION] Error replying to interaction: ${replyError.message}`);
    }
    
    return false;
  }
}

// Main interaction handler
async function handleInteraction(interaction) {
  try {
    // Route to the appropriate handler based on interaction type
    if (interaction.isButton()) {
      return handleButtonInteraction(interaction);
    } else if (interaction.isStringSelectMenu()) {
      return handleSelectMenuInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      return handleModalSubmit(interaction);
    }
    
    console.warn(`[INTERACTION] Unhandled interaction type: ${interaction.type}`);
    return false;
  } catch (error) {
    console.error(`[INTERACTION] Error in main interaction handler: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

module.exports = {
  handleInteraction,
  handleButtonInteraction,
  handleSelectMenuInteraction,
  handleModalSubmit
}; 