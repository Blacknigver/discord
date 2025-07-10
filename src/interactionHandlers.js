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
    // Verbose interaction logging suppressed to keep output focused on errors
    
    // PayPal payment verification buttons
    if (customId === 'payment_received') {
      return handlePayPalPaymentReceived(interaction);
    }
    
    if (customId === 'payment_not_received') {
      return handlePayPalPaymentNotReceived(interaction);
    }

    // (payment_completed handled centrally in interactions/buttonHandlers.js)
    
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
    // Verbose select menu logging suppressed to keep output focused on errors
    
    // ===== Profile purchase payment flow =====
    if (menuId.startsWith('profile_payment_primary_')) {
      const { handlePrimarySelect } = require('./handlers/profilePurchasePayment');
      await handlePrimarySelect(interaction);
      return;
    }
    if (menuId.startsWith('profile_payment_crypto_')) {
      const { handleCryptoSelect } = require('./handlers/profilePurchasePayment');
      await handleCryptoSelect(interaction);
      return;
    }
    if (menuId.startsWith('profile_payment_dutch_')) {
      const { handleDutchSelect } = require('./handlers/profilePurchasePayment');
      await handleDutchSelect(interaction);
      return;
    }
    
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
    // Verbose modal submission logging suppressed to keep output focused on errors
    
    // ===== Profile purchase description modal =====
    if (modalId.startsWith('description_modal_')) {
      const parts = modalId.split('_'); // description modal <listingId> <userId>
      if (parts.length < 4) return;
      const listingId = parts[2];
      const authorizedUserId = parts[3];

      if (interaction.user.id !== authorizedUserId) {
        await interaction.reply({ content: 'You are not authorized to submit this description.', ephemeral: true });
        return;
      }

      const description = interaction.fields.getTextInputValue('account_description');

      const announcementChannelId = '1293288739669413928';
      try {
        const targetChannel = await interaction.client.channels.fetch(announcementChannelId);
        if (targetChannel) {
          const { EmbedBuilder } = require('discord.js');
          
          // Get the image from profilePurchaseFlow
          let imageUrl = null;
          const profilePurchaseFlow = require('../interactions/buttonHandlers.js').profilePurchaseFlow;
          if (profilePurchaseFlow && profilePurchaseFlow.has && profilePurchaseFlow.has(interaction.channel.id)) {
            const flowData = profilePurchaseFlow.get(interaction.channel.id);
            imageUrl = flowData?.imageUrl;
          }

          const msgEmbed = new EmbedBuilder()
            .setDescription(`**# ${description} 𝐏𝐫𝐨𝐟𝐢𝐥𝐞 <:winmatcherino:1298703851934711848>**\n**Get yours now at:**\n> <#1352022023307657359> \n> <#1352956136197984297> \n> <#1364568631194681344>`);

          let messageOptions = { 
            embeds: [msgEmbed]
            // files: [] // Removed BrawlShop.png file attachment due to guild restrictions
          };
          
          // If we have an image URL, handle it properly
          if (imageUrl) {
            if (imageUrl.includes('media.discordapp.net') || imageUrl.includes('cdn.discordapp.com')) {
              // For Discord CDN URLs, we need to download and re-upload as attachment
              try {
                const axios = require('axios');
                const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                if (response.status === 200) {
                  const buffer = Buffer.from(response.data);
                  const { AttachmentBuilder } = require('discord.js');
                  const attachment = new AttachmentBuilder(buffer, { name: 'profile_image.png' });
                  messageOptions.files.push(attachment); // Add the user's image as additional file
                  msgEmbed.setImage('attachment://profile_image.png'); // Set as main image (bottom)
                }
              } catch (fetchError) {
                console.error('[DESCRIPTION_MODAL] Failed to fetch Discord CDN image:', fetchError);
                // Fallback: just set the image URL in embed
                msgEmbed.setImage(imageUrl);
                messageOptions = { 
                  embeds: [msgEmbed],
                  files: [] // Removed BrawlShop.png file attachment due to guild restrictions
                };
              }
            } else {
              // For other URLs, set directly as image
              msgEmbed.setImage(imageUrl);
              messageOptions = { 
                embeds: [msgEmbed],
                files: [] // Removed BrawlShop.png file attachment due to guild restrictions
              };
            }
          }

          await targetChannel.send(messageOptions);
        }
        
        // Clean up the profilePurchaseFlow entry
        const profilePurchaseFlow = require('../interactions/buttonHandlers.js').profilePurchaseFlow;
        if (profilePurchaseFlow && profilePurchaseFlow.delete) {
          profilePurchaseFlow.delete(interaction.channel.id);
        }
        
        await interaction.reply({ content: '✅ Description uploaded and announcement sent.', ephemeral: true });
        
        // ===== START PROFILE COMPLETION FLOW =====
        console.log('[PROFILE_COMPLETION] Starting completion flow after announcement sent');
        try {
          const { handleProfilePurchaseCompletion } = require('./handlers/profileCompletionHandler.js');
          await handleProfilePurchaseCompletion(interaction, listingId, null);
        } catch (completionError) {
          console.error('[PROFILE_COMPLETION] Error in completion flow:', completionError);
        }
      } catch (err) {
        console.error('[DESCRIPTION_MODAL] Failed to send description embed:', err);
        await interaction.reply({ content: 'An error occurred while sending the announcement.', ephemeral: true });
      }
      return;
    }

    // Handle modal submissions based on other customIds
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