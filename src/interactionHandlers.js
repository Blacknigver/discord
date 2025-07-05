const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');

// Import handlers directly from their files
const {
  handlePayPalAcceptToS,
  handlePayPalDenyToS,
  handlePayPalDenyConfirm,
  handlePayPalDenyCancel,
  handlePayPalCopyEmail,
  handlePayPalPaymentCompleted,
  handlePayPalPaymentReceived,
  handlePayPalPaymentNotReceived,
  handleClaimBoost
} = require('./handlers/paypalButtonHandler');

const {
  handleRankedRankSelection,
  handleMasterySelection,
  handleTicketConfirm,
  handleTicketCancel
} = require('./modules/ticketFlow');

// Map button IDs to their handler functions
const buttonHandlers = {
  // PayPal workflow buttons
  'paypal_accept': handlePayPalAcceptToS,
  'paypal_deny': handlePayPalDenyToS,
  'paypal_deny_confirm': handlePayPalDenyConfirm,
  'paypal_deny_cancel': handlePayPalDenyCancel,
  'copy_email': handlePayPalCopyEmail,
  'payment_received': handlePayPalPaymentReceived,
  'payment_not_received': handlePayPalPaymentNotReceived,
  'claim_boost': handleClaimBoost
};

/**
 * Handle button interactions
 * @param {ButtonInteraction} interaction 
 * @param {Client} client 
 */
async function handleButtonInteraction(interaction, client) {
  const customId = interaction.customId;
  
  try {
    console.log(`[INTERACTION] Button clicked: ${customId} by user ${interaction.user.id}`);
    
    // PayPal payment verification buttons
    if (customId === 'payment_received') {
      console.log(`[INTERACTION] Payment received button clicked by ${interaction.user.id}`);
      return handlePayPalPaymentReceived(interaction);
    }
    
    if (customId === 'payment_not_received') {
      console.log(`[INTERACTION] Payment not received button clicked by ${interaction.user.id}`);
      return handlePayPalPaymentNotReceived(interaction);
    }
    
    // Handle ranked flow buttons
    if (customId.startsWith('ranked_')) {
      const rankInput = customId.replace('ranked_', '');
      return handleRankedRankSelection(interaction, rankInput);
    }
    
    // Check if we have a handler for this button
    const handler = buttonHandlers[customId];
    
    if (handler) {
      // Call the appropriate handler
      await handler(interaction, client);
    } else {
      console.warn(`[BUTTON] No handler found for button: ${customId}`);
      
      // If this is happening in production, we should reply with a message
      if (!interaction.replied) {
        await interaction.reply({
          content: 'This button is no longer in use or has expired.',
          ephemeral: true
        });
      }
    }
  } catch (error) {
    console.error(`[BUTTON] Error handling button interaction: ${error.message}`);
    console.error(error.stack);
    
    // Try to reply if we haven't already
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: 'An error occurred while processing this button. Please try again or contact support.',
          ephemeral: true
        });
      } catch (replyError) {
        console.error(`[BUTTON] Error sending error reply: ${replyError.message}`);
      }
    }
  }
}

/**
 * Handle select menu interactions
 * @param {SelectMenuInteraction} interaction 
 * @param {Client} client 
 */
async function handleSelectMenuInteraction(interaction, client) {
  try {
    const menuId = interaction.customId;
    console.log(`[SELECT] Menu interaction: ${menuId} by user ${interaction.user.id}`);
    
    // Handle select menu interactions based on customId
    // Example: if (menuId === 'payment_method') { ... }
    
  } catch (error) {
    console.error(`[SELECT] Error handling select menu: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while processing your selection. Please try again.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle modal submit interactions
 * @param {ModalSubmitInteraction} interaction 
 * @param {Client} client 
 */
async function handleModalSubmitInteraction(interaction, client) {
  try {
    const modalId = interaction.customId;
    console.log(`[MODAL] Modal submitted: ${modalId} by user ${interaction.user.id}`);
    
    // Handle modal submissions based on customId
    // Example: if (modalId === 'rank_details') { ... }
    
  } catch (error) {
    console.error(`[MODAL] Error handling modal submit: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while processing your submission. Please try again.',
        ephemeral: true
      });
    }
  }
}

module.exports = {
  handleButtonInteraction,
  handleSelectMenuInteraction,
  handleModalSubmitInteraction
}; 