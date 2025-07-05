const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buttonHandlers, modalHandlers, selectMenuHandlers } = require('./handlers.js');
const reviewCommand = require('./review.js');
const { EMBED_COLOR } = require('./config.js');
const { handleCommand, handleListButtons } = require('./commands.js');
const { Komponenten, Kategorien, NutzerDaten, TicketArten, TicketStatus, TicketPanel } = require('./config');
const handlers = require('./handlers');
const ticketSystem = require('./tickets.js');
const { 
    flowState, 
    showPaymentMethodSelection,
    handleMasteryBrawlerModal,
    handleBulkTrophiesModal,
    handleRankedRankSelection,
    handleMasterySelection,
} = require('./src/modules/ticketFlow.js');
const { InteractionResponseFlags } = require('discord.js');

/**
 * Set up all Discord interaction handlers
 * NOTE: This function no longer registers its own handlers to avoid conflicts.
 * Instead, it provides utility functions that the main handler can call.
 */
function setupInteractions(client) {
  // Store handler functions on the client for use by main handler
  client.interactionUtils = {
    handleSlashCommand: async (interaction) => {
      if (!interaction.isCommand()) return false;

    const { commandName } = interaction;

    if (commandName === 'review') {
      try {
        // Get command arguments
        const user = interaction.options.getUser('user');
        const message = interaction.options.getString('message');
        
        if (!user || !message) {
          return interaction.reply({
            content: 'Missing required arguments: user and message',
            ephemeral: true
          });
        }
        
        // Call the review command handler
        await reviewCommand.execute({
          author: interaction.user,
          channel: interaction.channel,
          reply: (content) => interaction.reply({ content, ephemeral: true }),
          guild: interaction.guild
        }, [user.id, message]);
        
          return true;
      } catch (error) {
        console.error('Error executing review command:', error);
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true
        });
          return true;
      }
    } else if (commandName === 'list') {
      try {
        // Process using the handler from commands.js
        await handleCommand(interaction);
          return true;
      } catch (error) {
        console.error('Error executing list command:', error);
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true
        });
          return true;
    }
      }
      
      return false; // Not handled
    },

    handleButtonInteraction: async (interaction) => {
      if (!interaction.isButton()) return false;

    try {
      const { customId } = interaction;
      
      // Skip if the interaction is no longer repliable
      if (!interaction.isRepliable()) {
        console.log(`[INTERACTION] Skipping non-repliable interaction: ${interaction.id}, button: ${customId}`);
          return true;
      }
      
      // Find the correct handler based on button ID
      let handlerFound = false;
      
      // Handle review accept/deny buttons first (from review.js)
      if (customId.startsWith('review_accept_') || customId.startsWith('review_deny_')) {
        try {
          const { handleButton } = require('./review.js');
          await handleButton(interaction);
          handlerFound = true;
            return true;
        } catch (error) {
          console.error(`[INTERACTION] Error handling review moderation button ${customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing this review action.',
              ephemeral: true
            });
          }
          handlerFound = true;
            return true;
          }
        }

        // Handle ranked and mastery buttons
        if (customId.startsWith('ranked_') && !customId.startsWith('ticket_')) {
        await handleRankedRankSelection(interaction, customId.replace(/^ranked_/, ''));
        handlerFound = true;
      } else if (customId.startsWith('mastery_') && !customId.startsWith('ticket_')) {
        await handleMasterySelection(interaction, customId.replace(/^mastery_/, ''));
        handlerFound = true;
      }
      // Handle review and feedback buttons
      else if (customId.startsWith('review_button_') || customId.startsWith('feedback_button_')) {
        try {
          // Get the base ID (review_button or feedback_button)
          const baseId = customId.split('_').slice(0, 2).join('_');
          
          // Import the review/feedback handlers directly
          const { reviewFeedbackButtonHandlers } = require('./paymentHandlers.js');
          
          if (reviewFeedbackButtonHandlers && reviewFeedbackButtonHandlers[baseId]) {
            await reviewFeedbackButtonHandlers[baseId](interaction);
            handlerFound = true;
          } else {
            console.error(`[INTERACTION] Review/feedback handler not found for ${baseId}`);
            await interaction.reply({
              content: 'This button function is currently unavailable.',
              ephemeral: true
            });
            handlerFound = true;
          }
        } catch (error) {
          console.error(`[INTERACTION] Error handling review/feedback button ${customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing your request.',
              ephemeral: true
            });
          }
          handlerFound = true;
        }
      }
        else {
      // Find the correct handler based on button ID
          if (buttonHandlers && buttonHandlers[customId]) {
        try {
        await buttonHandlers[customId](interaction, client);
        handlerFound = true;
        } catch (handlerError) {
          console.error(`[INTERACTION] Error in button handler for ${customId}:`, handlerError);
          // Don't attempt to respond if the error is about the interaction
          if (!handlerError.message.includes('Unknown interaction') && 
              !handlerError.message.includes('already been acknowledged')) {
            try {
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                  content: 'An error occurred with this action. Please try again later.', 
                  ephemeral: true 
                });
              }
            } catch (replyError) {
              console.error(`[INTERACTION] Failed to send error reply for ${customId}:`, replyError);
            }
          }
          handlerFound = true; // Mark as handled even if there was an error
        }
          }
        // Check for prefix matches (like 'payment_completed_' etc)
          if (!handlerFound && buttonHandlers) {
          for (const key of Object.keys(buttonHandlers)) {
            if (key.endsWith('_') && customId.startsWith(key)) {
              try {
              await buttonHandlers[key](interaction, client);
              handlerFound = true;
              break;
              } catch (prefixHandlerError) {
                console.error(`[INTERACTION] Error in prefix button handler ${key} for ${customId}:`, prefixHandlerError);
                // Don't attempt to respond if the error is about the interaction
                if (!prefixHandlerError.message.includes('Unknown interaction') && 
                    !prefixHandlerError.message.includes('already been acknowledged')) {
                  try {
                    if (!interaction.replied && !interaction.deferred) {
                      await interaction.reply({ 
                        content: 'An error occurred with this action. Please try again later.', 
                        ephemeral: true 
                      });
                    }
                  } catch (replyError) {
                    console.error(`[INTERACTION] Failed to send error reply for ${customId}:`, replyError);
                  }
                }
                handlerFound = true; // Mark as handled even if there was an error
                break;
              }
            }
          }
        }
      }
      
      if (!handlerFound) {
        console.warn(`[INTERACTION] Unhandled button interaction: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'This button does not have a handler.', 
            ephemeral: true 
          }).catch(error => {
            console.error(`[INTERACTION] Error replying to unhandled button: ${error}`);
          });
        }
      }
        
        return handlerFound;
    } catch (error) {
      console.error(`[INTERACTION] Error handling button interaction:`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: 'An error occurred while processing your request.', 
          ephemeral: true 
        }).catch(secondError => {
          console.error(`[INTERACTION] Failed to send error response: ${secondError}`);
        });
      }
        return true; // Return true to indicate we handled the error
    }
    },

    handleSelectMenuInteraction: async (interaction) => {
      if (!interaction.isStringSelectMenu()) return false;
    
    try {
      const { customId } = interaction;
      let handlerFound = false;
      
        console.log(`[INTERACTION] Select menu used: ${customId} by user ${interaction.user.id}, values: ${interaction.values.join(', ')}`);
        
        // Check for exact match first
        if (selectMenuHandlers && selectMenuHandlers[customId]) {
          await selectMenuHandlers[customId](interaction);
          handlerFound = true;
      } else {
        // Check for prefix matches
        if (selectMenuHandlers) {
          for (const key of Object.keys(selectMenuHandlers)) {
            if (key.endsWith('_') && customId.startsWith(key)) {
              try {
                await selectMenuHandlers[key](interaction);
                handlerFound = true;
                break;
              } catch (prefixHandlerError) {
                console.error(`[INTERACTION] Error in prefix select handler ${key} for ${customId}:`, prefixHandlerError);
                if (!interaction.replied && !interaction.deferred) {
                  await interaction.reply({ 
                    content: 'An error occurred with this action. Please try again later.', 
                    ephemeral: true 
                  }).catch(console.error);
                }
                handlerFound = true; // Mark as handled even if there was an error
                break;
              }
            }
          }
        }
      }
      
      if (!handlerFound) {
        console.warn(`[INTERACTION] Unhandled select menu interaction: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'This select menu does not have a handler.', 
            ephemeral: true 
          }).catch(error => {
            console.error(`[INTERACTION] Error replying to unhandled select menu: ${error}`);
          });
        }
      }
        
        return handlerFound;
    } catch (error) {
      console.error(`[INTERACTION] Error handling select menu interaction:`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: 'An error occurred while processing your request.', 
          ephemeral: true 
        }).catch(secondError => {
          console.error(`[INTERACTION] Failed to send error response: ${secondError}`);
        });
      }
        return true;
    }
    },

    handleModalSubmit: async (interaction) => {
      if (!interaction.isModalSubmit()) return false;
    
    try {
        let handlerFound = false;
        const customId = interaction.customId;
        
        // Track processed modal IDs to prevent double handling
        if (!client.processedModalIds) {
          client.processedModalIds = new Set();
        }
        
        // Check if we've already processed this modal
        if (client.processedModalIds.has(interaction.id)) {
          console.log(`[INTERACTION] Modal ${customId} with ID ${interaction.id} already processed, skipping`);
          return true;
        }
        
        // Add this modal ID to the processed set
        client.processedModalIds.add(interaction.id);
        
        // Clean up old IDs occasionally to prevent memory leaks
        if (client.processedModalIds.size > 1000) {
          const oldestIds = Array.from(client.processedModalIds).slice(0, 500);
          oldestIds.forEach(id => client.processedModalIds.delete(id));
        }
        
        console.log(`[INTERACTION] Modal submitted: ${customId} by user ${interaction.user.id}`);
        
        // Handle P11 modal submission
        if (customId === 'modal_p11_count') {
          handlerFound = true; // Set this immediately to prevent double handling
          try {
            console.log(`[INTERACTION] Handling P11 modal submission from ${interaction.user.id}`);
            const { handleP11ModalSubmit } = require('./src/modules/ticketFlow');
            await handleP11ModalSubmit(interaction);
        } catch (error) {
            console.error(`[INTERACTION] Error handling P11 modal:`, error);
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content: 'An error occurred while processing your P11 count. Please try again.',
                ephemeral: true
              });
            }
          }
        }
        
        // Handle other modal types
        if (!handlerFound) {
      // Check for exact match
          if (modalHandlers && modalHandlers[customId]) {
        await modalHandlers[customId](interaction);
        handlerFound = true;
      } 
      // Handle review and feedback modals
      else if (customId.startsWith('review_modal_') || customId.startsWith('feedback_modal_')) {
        try {
          // Get the base ID (review_modal or feedback_modal)
          const baseId = customId.split('_').slice(0, 2).join('_');
              
              console.log(`[INTERACTION] Processing ${baseId} modal with ID: ${customId}`);
          
          // Import the review/feedback modal handlers directly
          const { reviewFeedbackModalHandlers } = require('./paymentHandlers.js');
          
          if (reviewFeedbackModalHandlers && reviewFeedbackModalHandlers[baseId]) {
            await reviewFeedbackModalHandlers[baseId](interaction);
            handlerFound = true;
          } else {
            console.error(`[INTERACTION] Review/feedback modal handler not found for ${baseId}`);
            await interaction.reply({
              content: 'This form cannot be processed. Please try again later.',
              ephemeral: true
            });
            handlerFound = true;
          }
        } catch (error) {
          console.error(`[INTERACTION] Error handling review/feedback modal ${customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing your submission.',
              ephemeral: true
            });
          }
          handlerFound = true;
        }
      }
        }
        
        if (!handlerFound) {
          console.warn(`[INTERACTION] Unhandled modal interaction: ${customId}`);
        }
        
        return handlerFound;
      } catch (error) {
        console.error(`[INTERACTION] Error handling modal submission:`, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'An error occurred while processing your request.', 
            ephemeral: true 
          }).catch(secondError => {
            console.error(`[INTERACTION] Failed to send error response: ${secondError}`);
          });
        }
        return true;
      }
    }
  };
  
  console.log('Interaction utility functions have been set up');
}

module.exports = {
  setupInteractions
}; 