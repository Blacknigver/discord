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

  handleTicketConfirm,
  handleTicketCancel,
  handleRankedFlow,
  handleBulkFlow,
  handleTrophyFlow,

  handleOtherFlow
} = require('./modules/ticketFlow');

const { handleCryptoButtons } = require('./handlers/cryptoPaymentHandler');

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
    
    // CHECK BUTTON RATE LIMITS FIRST
    const { checkButtonRateLimit } = require('./utils/rateLimitSystem');
    const rateLimitCheck = await checkButtonRateLimit(interaction.user.id, `button:${customId}`);
    
    if (!rateLimitCheck.allowed) {
      console.log(`[INTERACTION] User ${interaction.user.id} blocked by button rate limit: ${customId}`);
      return await interaction.reply({
        content: rateLimitCheck.reason,
        ephemeral: true
      });
    }
    
    // === DISCOUNT SYSTEM HANDLERS ===
    if (customId === 'claim_10_percent_discount') {
      const { handleClaimDiscountButton } = require('./handlers/discountHandlers.js');
      return handleClaimDiscountButton(interaction);
    }
    
    // Handle discount ticket buttons (same as regular but with discount flag)
    if (customId.startsWith('discount_ticket_')) {
      const ticketType = customId.replace('discount_ticket_', '');
      console.log(`[DISCOUNT_TICKET] User ${interaction.user.id} clicked discount ticket button: ${ticketType}`);
      
      // Mark this user as having a discount for the flow
      const { flowState } = require('./modules/ticketFlow.js');
      
      // Create flow state with discount flag
      const initialUserData = {
        type: ticketType,
        hasDiscount: true,
        discountClaimed: true,
        timestamp: Date.now()
      };
      
      flowState.set(interaction.user.id, initialUserData);
      
      // Route to appropriate handler based on ticket type
      if (ticketType === 'ranked') {
        return handleRankedFlow(interaction);
      } else if (ticketType === 'bulk') {
        return handleBulkFlow(interaction);
      } else if (ticketType === 'trophies') {
        // Handle trophies with modal (same as regular ticket_trophies)
        try {
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
          
          const modal = new ModalBuilder()
            .setCustomId('modal_trophies_start')
            .setTitle('Trophies Boost');

          const brawlerNameInput = new TextInputBuilder()
            .setCustomId('brawler_name')
            .setLabel('Brawler Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the name of the brawler')
            .setRequired(true);

          const currentInput = new TextInputBuilder()
            .setCustomId('brawler_current')
            .setLabel('Current Trophies')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the current trophy count')
            .setRequired(true);

          const desiredInput = new TextInputBuilder()
            .setCustomId('brawler_desired')
            .setLabel('Desired Trophies')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the desired trophy count')
            .setRequired(true);

          const brawlerLevelInput = new TextInputBuilder()
            .setCustomId('brawler_level')
            .setLabel('Brawler Power Level (1-11)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the power level of the brawler (1-11)')
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(brawlerNameInput),
            new ActionRowBuilder().addComponents(currentInput),
            new ActionRowBuilder().addComponents(desiredInput),
            new ActionRowBuilder().addComponents(brawlerLevelInput)
          );
          
          return interaction.showModal(modal);
        } catch (error) {
          console.error('[DISCOUNT_TROPHIES] Error:', error);
          return interaction.reply({
            content: 'An error occurred while showing the trophy form.',
            ephemeral: true
          });
        }
      } else if (ticketType === 'other') {
        // Handle other with modal (same as regular ticket_other)
        try {
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
          
          const modal = new ModalBuilder()
            .setCustomId('modal_other_request')
            .setTitle('Other Request');

          const requestDetailsInput = new TextInputBuilder()
            .setCustomId('other_request')
            .setLabel('Request Details')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Please describe your request in detail')
            .setRequired(true)
            .setMaxLength(1000);

          modal.addComponents(
            new ActionRowBuilder().addComponents(requestDetailsInput)
          );
          
          return interaction.showModal(modal);
        } catch (error) {
          console.error('[DISCOUNT_OTHER] Error:', error);
          return interaction.reply({
            content: 'An error occurred while showing the request form.',
            ephemeral: true
          });
        }
      }
    }
    
    // Handle ranked flow buttons
    if (customId.startsWith('ranked_')) {
      const rankInput = customId.replace('ranked_', '');
      return handleRankedRankSelection(interaction, rankInput);
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
      // These are handled in interactions/buttonHandlers.js to prevent duplicates
      // Only handle if not already handled by the main button handlers
      if (customId.startsWith('payment_completed_crypto_') || customId.startsWith('copy_') && !customId.includes('address')) {
      return handleCryptoButtons(interaction);
      }
      // Let other handlers handle the main crypto buttons
      return false;
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
    
    // Handle boost management buttons
    if (customId === 'claim_boost') {
      const { claimBoostHandler } = require('./handlers/boostManagementHandlers.js');
      return claimBoostHandler(interaction);
    }
    
    if (customId === 'boost_completed') {
      const { boostCompletedHandler } = require('./handlers/boostManagementHandlers.js');
      return boostCompletedHandler(interaction);
    }
    
    if (customId === 'boost_is_completed') {
      const { boostIsCompletedHandler } = require('./handlers/boostManagementHandlers.js');
      return boostIsCompletedHandler(interaction);
    }
    
    if (customId === 'boost_confirm_completed') {
      const { boostConfirmCompletedHandler } = require('./handlers/boostManagementHandlers.js');
      return boostConfirmCompletedHandler(interaction);
    }
    
    if (customId === 'boost_not_completed') {
      const { boostNotCompletedHandler } = require('./handlers/boostManagementHandlers.js');
      return boostNotCompletedHandler(interaction);
    }
    
    if (customId === 'boost_confirm_not_completed') {
      const { boostConfirmNotCompletedHandler } = require('./handlers/boostManagementHandlers.js');
      return boostConfirmNotCompletedHandler(interaction);
    }
    
    if (customId === 'boost_cancel_confirmation') {
      const { boostCancelConfirmationHandler } = require('./handlers/boostManagementHandlers.js');
      return boostCancelConfirmationHandler(interaction);
    }
    
    if (customId === 'payout_completed') {
      const { payoutCompletedHandler } = require('./handlers/boostManagementHandlers.js');
      return payoutCompletedHandler(interaction);
    }
    
    // Regular ticket panel buttons (non-discount)
    if (customId === 'ticket_ranked') {
      return handleRankedFlow(interaction);
    }
    
    if (customId === 'ticket_bulk') {
      return handleBulkFlow(interaction);
    }
    
    if (customId === 'ticket_trophies') {
      return handleTrophyFlow(interaction);
    }
    
    if (customId === 'ticket_other') {
      return handleOtherFlow(interaction);
    }

    if (customId === 'ticket_prestige') {
      const { handlePrestigeFlow } = require('./modules/ticketFlow.js');
      return handlePrestigeFlow(interaction);
    }
    
    // Profile completion handlers
    if (customId.startsWith('upload_description_')) {
      const { handleUploadDescription } = require('./handlers/profileCompletionHandler.js');
      return handleUploadDescription(interaction);
    }
    
    if (customId.startsWith('payment_completed_')) {
      const listingId = customId.split('_')[2];
      const { handleProfilePurchaseCompletion } = require('./handlers/profileCompletionHandler.js');
      return handleProfilePurchaseCompletion(interaction, listingId, true);
    }
    
    console.log(`[INTERACTION] No handler found for button: ${customId}`);
    return false;
    
  } catch (error) {
    console.error(`[INTERACTION] Error handling button ${customId}: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: 'An error occurred while processing your request. Please try again.',
          ephemeral: true
        });
      } catch (replyError) {
        console.error(`[INTERACTION] Error sending error reply: ${replyError.message}`);
      }
    }
    
    return false;
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
    if (modalId === 'modal_prestige_brawler') {
      const { handlePrestigeBrawlerModal } = require('./modules/modalHandlers.js');
      return handlePrestigeBrawlerModal(interaction);
    }
    
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