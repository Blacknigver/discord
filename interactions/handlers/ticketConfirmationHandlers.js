const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

// Import ticket flow functions
const {
  flowState,
  getChannelNameByType,
  getCategoryIdByType,
  handleTicketConfirm: originalHandleTicketConfirm,
  handleTicketCancel: originalHandleTicketCancel
} = require('../../src/modules/ticketFlow.js');

const { createTicketChannelWithOverflow } = require('../../src/utils/ticketManager.js');

/**
 * Enhanced ticket confirmation handler with proper success message
 */
const confirmTicketHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    console.log(`[TICKET_CONFIRM] Confirm button clicked by user ${userId}`);
    
    if (!flowState.has(userId)) {
      console.warn(`[TICKET_CONFIRM] No flow state for user ${userId}`);
      return interaction.reply({
        content: 'Your session has expired. Please start a new ticket request.',
        ephemeral: true
      });
    }
    
    const userData = flowState.get(userId);
    
    // Check if the ticket is already being processed
    if (userData.isProcessingTicket) {
      console.log(`[TICKET_CONFIRM] Already processing ticket for ${userId}, ignoring duplicate confirm`);
      return interaction.reply({
        content: 'Your ticket is already being created. Please wait a moment.',
        ephemeral: true
      });
    }
    
    // Set processing flag
    userData.isProcessingTicket = true;
    flowState.set(userId, userData);
    
    // Defer the interaction immediately
    await interaction.deferUpdate();
    
    try {
      // Create ticket channel
      const channelName = getChannelNameByType(userData.type, userData, interaction.user.username);
      const categoryId = getCategoryIdByType(userData.type);
      
      console.log(`[TICKET_CONFIRM] Creating ticket: User=${userId}, Category=${categoryId}, BaseName=${channelName}`);
      
      const ticketChannel = await createTicketChannelWithOverflow(
        interaction.guild,
        userId,
        categoryId,
        channelName,
        {
          type: userData.type,
          current: '',
          desired: '',
          price: userData.price
        }
      );
      
      if (!ticketChannel) {
        // Reset processing flag
        userData.isProcessingTicket = false;
        flowState.set(userId, userData);
        
        return interaction.editReply({
          content: 'Failed to create ticket channel. Please try again or contact staff.',
          components: []
        });
      }
      
      // Send welcome message and order details to the ticket
      await require('../../ticketPayments.js').sendWelcomeEmbed(ticketChannel, userId);
      
      const orderDetails = {
        type: userData.type,
        current: '',
        desired: '',
        price: userData.price,
        paymentMethod: userData.paymentMethod
      };
      
      // Add specific details based on type
      if (userData.type === 'ranked') {
        orderDetails.current = `${userData.currentRank} ${userData.currentRankSpecific}`;
        orderDetails.desired = `${userData.desiredRank} ${userData.desiredRankSpecific}`;
      } else if (userData.type === 'bulk' || userData.type === 'trophies') {
        orderDetails.current = userData.currentTrophies;
        orderDetails.desired = userData.desiredTrophies;
      } else if (userData.type === 'mastery') {
        orderDetails.current = `${userData.currentMastery} ${userData.currentMasterySpecific}`;
        orderDetails.desired = `${userData.desiredMastery} ${userData.desiredMasterySpecific}`;
      }
      
      await require('../../ticketPayments.js').sendOrderDetailsEmbed(ticketChannel, orderDetails);
      
      // Handle payment method-specific actions
      if (userData.paymentMethod === 'PayPal') {
        console.log(`[TICKET_CONFIRM] Sending PayPal Terms of Service for user ${userId}`);
        await require('../../ticketPayments.js').sendPayPalTermsEmbed(ticketChannel, userId);
      } else if (userData.paymentMethod === 'Crypto') {
        // Handle crypto payments
        console.log(`[TICKET_CONFIRM] Processing crypto payment for user ${userId}`);
        // Add crypto-specific handling here if needed
      } else if (userData.paymentMethod === 'IBAN Bank Transfer') {
        // Handle IBAN payments
        console.log(`[TICKET_CONFIRM] Processing IBAN payment for user ${userId}`);
        // Add IBAN-specific handling here if needed
      }
      
      // Send success message to user
      const successEmbed = new EmbedBuilder()
        .setTitle('Ticket Created Successfully!')
        .setDescription(`Your ticket has been created: <#${ticketChannel.id}>`)
        .setColor('#00ff00');
      
      // Update the original interaction with success message
      await interaction.editReply({
        embeds: [successEmbed],
        components: []
      });
      
      // Also send a follow-up message in the original channel
      await interaction.followUp({
        content: `Successfully opened ticket: <#${ticketChannel.id}>`,
        ephemeral: true
      });
      
      console.log(`[TICKET_CONFIRM] Ticket created successfully: ${ticketChannel.id}`);
      
      // Update user data
      userData.ticketCreated = true;
      userData.ticketChannelId = ticketChannel.id;
      flowState.set(userId, userData);
      
    } catch (error) {
      console.error(`[TICKET_CONFIRM] Error creating ticket: ${error.message}`);
      console.error(error.stack);
      
      // Reset processing flag
      userData.isProcessingTicket = false;
      flowState.set(userId, userData);
      
      await interaction.editReply({
        content: 'An error occurred while creating your ticket. Please try again or contact staff.',
        components: []
      });
    }
    
  } catch (error) {
    console.error(`[TICKET_CONFIRM] Error in confirm handler: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

/**
 * Enhanced ticket cancellation handler
 */
const cancelTicketHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    console.log(`[TICKET_CANCEL] Cancel button clicked by user ${userId}`);
    
    // Clear user flow state
    flowState.delete(userId);
    
    // Update the interaction
    await interaction.update({
      content: 'Your ticket request has been cancelled.',
      embeds: [],
      components: []
    });
    
    console.log(`[TICKET_CANCEL] Ticket request cancelled for user ${userId}`);
    
  } catch (error) {
    console.error(`[TICKET_CANCEL] Error in cancel handler: ${error.message}`);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while cancelling your request.',
        ephemeral: true
      });
    }
  }
};

// Export ticket confirmation handlers
const ticketConfirmationHandlers = {
  'confirm_ticket': confirmTicketHandler,
  'cancel_ticket': cancelTicketHandler
};

module.exports = {
  ticketConfirmationHandlers
}; 