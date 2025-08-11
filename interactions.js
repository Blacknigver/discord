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
  
    handleBulkTrophiesModal,
    handleRankedRankSelection,
  
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
        // Use the correct review command from review.js
        await reviewCommand.execute(interaction);
        return true;
      } catch (error) {
        console.error('Error executing review command:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true
          });
        }
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
        // Use the comprehensive button handler from interactions/buttonHandlers.js
        const { handleButtonInteraction } = require('./interactions/buttonHandlers.js');
        await handleButtonInteraction(interaction);
        return true;
        } catch (error) {
        console.error(`[INTERACTION] Error in comprehensive button handler:`, error);
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
      
        // Logging only errors: remove verbose select menu usage logs
        
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
        
        // ===== Profile purchase description modal =====
        if (customId.startsWith('description_modal_')) {
          const parts = customId.split('_'); // description modal <listingId> <userId>
          if (parts.length < 4) return true;
          const listingId = parts[2];
          const authorizedUserId = parts[3];

          if (interaction.user.id !== authorizedUserId) {
            await interaction.reply({ content: 'You are not authorized to submit this description.', ephemeral: true });
            return true;
          }

          const description = interaction.fields.getTextInputValue('account_description');

          const announcementChannelId = '1293288739669413928';
          try {
            const targetChannel = await interaction.client.channels.fetch(announcementChannelId);
            if (targetChannel) {
              const { EmbedBuilder } = require('discord.js');
              
              // Get the image from profilePurchaseFlow
              let imageUrl = null;
              const { profilePurchaseFlow } = require('./interactions/buttonHandlers.js');
              if (profilePurchaseFlow && profilePurchaseFlow.has && profilePurchaseFlow.has(interaction.channel.id)) {
                const flowData = profilePurchaseFlow.get(interaction.channel.id);
                imageUrl = flowData?.imageUrl;
              }

              // Create announcement text
              const announcementText = `**# ${description} 𝐏𝐫𝐨𝐟𝐢𝐥𝐞 <:winmatcherino:1298703851934711848>**\n**Get yours now at:**\n> <#1352022023307657359> \n> <#1352956136197984297> \n> <#1364568631194681344>`;
              
              // Determine if image is a link or attachment (same logic as boost system)
              const isImageLink = imageUrl && (
                imageUrl.includes('media.discordapp.net') || 
                imageUrl.includes('i.imgur.com') ||
                imageUrl.includes('imgur.com') ||
                imageUrl.includes('cdn.discordapp.com')
              );
              
              console.log(`[PROFILE_ANNOUNCEMENT] Image URL: ${imageUrl}, Is link: ${isImageLink}`);

              if (isImageLink) {
                // Send as embed with image (no title, just image)
              const msgEmbed = new EmbedBuilder()
                  .setDescription(announcementText)
                  .setImage(imageUrl)
                  .setColor('#e68df2');

                await targetChannel.send({
                embeds: [msgEmbed]
                });
                
                console.log(`[PROFILE_ANNOUNCEMENT] Sent embed announcement with image link`);
              } else {
                // Send as regular message with image attachment
                const messageOptions = {
                  content: announcementText
              };
              
                // If we have an image URL, try to download and attach it
              if (imageUrl) {
                  try {
                    const axios = require('axios');
                    const { AttachmentBuilder } = require('discord.js');
                    
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    if (response.status === 200) {
                      const buffer = Buffer.from(response.data);
                      const attachment = new AttachmentBuilder(buffer, { name: 'profile_completed.png' });
                      messageOptions.files = [attachment];
                      console.log(`[PROFILE_ANNOUNCEMENT] Attached image file to regular message`);
                    }
                  } catch (downloadError) {
                    console.error(`[PROFILE_ANNOUNCEMENT] Error downloading image: ${downloadError.message}`);
                    // Continue without attachment
                  }
                }

                await targetChannel.send(messageOptions);
                console.log(`[PROFILE_ANNOUNCEMENT] Sent regular message announcement`);
              }
            }
            
            // Clean up the profilePurchaseFlow entry
            const { profilePurchaseFlow } = require('./interactions/buttonHandlers.js');
            if (profilePurchaseFlow && profilePurchaseFlow.delete) {
              profilePurchaseFlow.delete(interaction.channel.id);
            }
            
            await interaction.reply({ content: '✅ Description uploaded and announcement sent.', ephemeral: true });
            
            // ===== START PROFILE COMPLETION FLOW =====
            console.log('[PROFILE_COMPLETION] Starting completion flow after announcement sent');
            try {
              const { handleProfilePurchaseCompletion } = require('./src/handlers/profileCompletionHandler.js');
              await handleProfilePurchaseCompletion(interaction, listingId, null);
            } catch (completionError) {
              console.error('[PROFILE_COMPLETION] Error in completion flow:', completionError);
            }
          } catch (err) {
            console.error('[DESCRIPTION_MODAL] Failed to send description embed:', err);
            await interaction.reply({ content: 'An error occurred while sending the announcement.', ephemeral: true });
          }
          return true;
        }

        // Handle modal submissions based on other customId
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