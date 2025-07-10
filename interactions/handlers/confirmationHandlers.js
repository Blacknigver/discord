const { 
  handleTicketConfirm,
  handleTicketCancel
} = require('../../src/modules/ticketFlow.js');

/**
 * Handlers for ticket confirmation and cancellation
 */
const confirmationHandlers = {
  // Primary ticket confirmation handlers
  'confirm_ticket': handleTicketConfirm,
  'cancel_ticket': handleTicketCancel,
  
  // Alternative naming patterns
  'ticket_confirm': handleTicketConfirm,
  'ticket_cancel': handleTicketCancel,
  'confirm_order': handleTicketConfirm,
  'cancel_order': handleTicketCancel,
  
  // Dynamic handlers for tickets with IDs
  'confirm_ticket_': async (interaction) => {
    return handleTicketConfirm(interaction);
  },
  'cancel_ticket_': async (interaction) => {
    return handleTicketCancel(interaction);
  }
};

/**
 * Enhanced ticket confirmation handler with better error handling
 */
const enhancedConfirmTicketHandler = async (interaction) => {
  try {
    console.log(`[TICKET_CONFIRM] Enhanced handler called by user ${interaction.user.id}`);
    
    // Call the original handler
    const result = await handleTicketConfirm(interaction);
    
    // If the original handler didn't handle it or failed, provide fallback
    if (!result) {
      console.log(`[TICKET_CONFIRM] Original handler returned false, trying fallback`);
      
      // Check if user has flow state
      const { flowState } = require('../../src/modules/ticketFlow.js');
      if (!flowState.has(interaction.user.id)) {
        await interaction.reply({
          content: 'Your session has expired. Please start a new ticket request.',
          ephemeral: true
        });
        return;
      }
      
      // Try to process the ticket confirmation
      return handleTicketConfirm(interaction);
    }
    
    return result;
  } catch (error) {
    console.error(`[TICKET_CONFIRM] Enhanced handler error: ${error.message}`);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while confirming your ticket. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

module.exports = {
  confirmationHandlers,
  enhancedConfirmTicketHandler
}; 