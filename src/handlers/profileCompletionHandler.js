/**
 * Profile Purchase Completion Handler
 * Handles the complete flow when a profile purchase is completed
 */

const { EmbedBuilder } = require('discord.js');
const {
  createOrderCompletedEmbed,
  scheduleAutoClose,
  addCustomerRole,
  moveToCompletedCategory,
  processAffiliateCommission,
  cleanupMessagesBeforeCompletion,
  createProfilePayoutLog
} = require('../utils/completionUtils.js');

/**
 * Main handler for profile purchase completion
 * Called after the Upload Description modal is submitted
 * 
 * @param {ModalSubmitInteraction} interaction - The modal submit interaction
 * @param {string} listingId - The listing ID from the button
 * @param {Object} profileFlow - The profile purchase flow data
 */
async function handleProfilePurchaseCompletion(interaction, listingId, profileFlow) {
  try {
    console.log(`[PROFILE_COMPLETION] Starting completion flow for listing ${listingId}`);
    
    // Extract information from the profile flow and ticket
    const buyerId = interaction.user.id;
    let price = '';
    let description = '';
    let paymentMethod = 'PayPal'; // Default to PayPal
    
    // Get information from ticket messages to find price, description, and payment method
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 50 });
      
      for (const message of messages.values()) {
        if (message.embeds.length > 0) {
          const embed = message.embeds[0];
          
          // Look for Order Recap embed
          if (embed.title === 'Order Recap') {
            // Extract price from fields
            const priceField = embed.fields?.find(field => field.name.includes('Price'));
            if (priceField) {
              price = priceField.value;
            }
            
            // Extract description from embed description
            if (embed.description) {
              description = embed.description;
            }
          }
          
          // Look for payment method in various embeds
          const title = embed.title || '';
          if (title.includes('PayPal')) {
            paymentMethod = 'PayPal';
          } else if (title.includes('IBAN') || title.includes('Bank Transfer')) {
            paymentMethod = 'IBAN Bank Transfer';
          } else if (title.includes('Crypto') || title.includes('Bitcoin') || title.includes('Litecoin') || title.includes('Solana')) {
            paymentMethod = 'Crypto';
          } else if (title.includes('Tikkie')) {
            paymentMethod = 'Dutch Payment Methods';
          } else if (title.includes('Apple') || title.includes('Giftcard')) {
            paymentMethod = 'PayPal Giftcard';
          }
        }
      }
      
      console.log(`[PROFILE_COMPLETION] Extracted price: ${price}, description: ${description}, payment method: ${paymentMethod}`);
    } catch (error) {
      console.error(`[PROFILE_COMPLETION] Error extracting ticket information: ${error.message}`);
    }
    
    // 1. Move the channel to completed category
    console.log(`[PROFILE_COMPLETION] Moving channel to completed category`);
    await moveToCompletedCategory(interaction.channel);
    
    // 2. Add customer role to the buyer
    console.log(`[PROFILE_COMPLETION] Adding customer role to buyer`);
    await addCustomerRole(interaction.guild, buyerId);
    
    // 3. Process affiliate commission (5% of account price)
    console.log(`[PROFILE_COMPLETION] Processing affiliate commission`);
    await processAffiliateCommission(buyerId, price, 'Profile Purchase', interaction.channel.id);
    
    // 4. Clean up messages before sending completion embed
    console.log(`[PROFILE_COMPLETION] Cleaning up messages`);
    await cleanupMessagesBeforeCompletion(interaction.channel);
    
    // 5. Send Order Completed embed with review/feedback buttons
    console.log(`[PROFILE_COMPLETION] Sending Order Completed embed`);
    const { embed: completionEmbed, components } = createOrderCompletedEmbed(buyerId);
    
    try {
      const completionMessage = await interaction.channel.send({
        content: `<@${buyerId}>`,
        embeds: [completionEmbed],
        components
      });
      
      console.log(`[PROFILE_COMPLETION] Successfully sent Order Completed embed with ID: ${completionMessage.id}`);
    } catch (error) {
      console.error(`[PROFILE_COMPLETION] Error sending Order Completed embed: ${error.message}`);
    }
    
    // 6. Schedule ticket auto-close after 30 minutes - DATABASE PERSISTENT VERSION
    console.log(`[PROFILE_COMPLETION] Scheduling database-persistent auto-close`);
    const closeTimeMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    try {
      const { scheduleAutoCloseDatabase } = require('../utils/completionUtils.js');
      await scheduleAutoCloseDatabase(interaction.channel, buyerId, closeTimeMs, interaction.client, 'profile');
      console.log(`[PROFILE_COMPLETION] Successfully set up database-persistent auto-close`);
    } catch (error) {
      console.error(`[PROFILE_COMPLETION] Error setting up database-persistent auto-close: ${error.message}`);
      console.log(`[PROFILE_COMPLETION] Falling back to legacy setTimeout method`);
      // Fallback to old setTimeout method
      await scheduleAutoClose(interaction.channel, buyerId, closeTimeMs, interaction.client);
    }
    
    // 7. Create payout log for staff tracking
    console.log(`[PROFILE_COMPLETION] Creating payout log`);
    await createProfilePayoutLog(interaction.guild, buyerId, price, paymentMethod, interaction.channel.id);

    console.log(`[PROFILE_COMPLETION] Profile purchase completion flow finished successfully`);
    return true;
    
  } catch (error) {
    console.error(`[PROFILE_COMPLETION] Error in completion flow: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

/**
 * Helper to extract ticket creator ID from various sources
 * @param {TextChannel} channel - The ticket channel
 * @returns {string|null} - The ticket creator ID or null
 */
function extractTicketCreatorId(channel) {
  try {
    // Method 1: Check channel topic
    if (channel.topic) {
      const topicMatch = channel.topic.match(/<@!?(\d+)>|User ID:\s*(\d+)/);
      if (topicMatch) {
        return topicMatch[1] || topicMatch[2];
      }
    }
    
    // Method 2: Try to extract from channel name (profile-username format)
    const channelName = channel.name;
    if (channelName.startsWith('𝐩𝐫𝐨𝐟𝐢𝐥𝐞-')) {
      // This is a profile ticket, but we can't reliably get user ID from username
      // Will need to rely on other methods
    }
    
    return null;
  } catch (error) {
    console.error(`[PROFILE_COMPLETION] Error extracting ticket creator ID: ${error.message}`);
    return null;
  }
}

/**
 * Alternative completion handler that takes explicit parameters
 * Useful when called from button handlers where we have more context
 * 
 * @param {TextChannel} channel - The ticket channel
 * @param {string} buyerId - ID of the user who bought the profile
 * @param {string} price - Price of the account
 * @param {string} description - Description of the account
 * @param {Client} client - Discord client
 */
async function completeProfilePurchase(channel, buyerId, price, description, client) {
  try {
    console.log(`[PROFILE_COMPLETION] Starting alternative completion flow`);
    
    // 1. Move the channel to completed category
    await moveToCompletedCategory(channel);
    
    // 2. Add customer role to the buyer
    await addCustomerRole(channel.guild, buyerId);
    
    // 3. Process affiliate commission (5% of account price)
    await processAffiliateCommission(buyerId, price, 'Profile Purchase', channel.id);
    
    // 4. Clean up messages before sending completion embed
    await cleanupMessagesBeforeCompletion(channel);
    
    // 5. Send Order Completed embed with review/feedback buttons
    const { embed: completionEmbed, components } = createOrderCompletedEmbed(buyerId);
    
    const completionMessage = await channel.send({
      content: `<@${buyerId}>`,
      embeds: [completionEmbed],
      components
    });
    
    // 6. Schedule ticket auto-close after 30 minutes - DATABASE PERSISTENT VERSION
    const closeTimeMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    try {
      const { scheduleAutoCloseDatabase } = require('../utils/completionUtils.js');
      await scheduleAutoCloseDatabase(channel, buyerId, closeTimeMs, client, 'profile');
      console.log(`[PROFILE_COMPLETION] Alternative flow: Successfully set up database-persistent auto-close`);
    } catch (error) {
      console.error(`[PROFILE_COMPLETION] Alternative flow: Error setting up database-persistent auto-close: ${error.message}`);
      // Fallback to old setTimeout method
      await scheduleAutoClose(channel, buyerId, closeTimeMs, client);
    }
    
    console.log(`[PROFILE_COMPLETION] Alternative completion flow finished successfully`);
    return true;
    
  } catch (error) {
    console.error(`[PROFILE_COMPLETION] Error in alternative completion flow: ${error.message}`);
    return false;
  }
}

/**
 * Handles the profile payout completed button
 */
const profilePayoutCompletedHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    // Get the payout staff ID from the embed
    let payoutStaffId = '';
    if (interaction.message.embeds.length > 0) {
      const description = interaction.message.embeds[0].description;
      if (description) {
        const match = description.match(/\*\*Payout Done By:\*\* <@(\d+)>/);
        if (match && match[1]) {
          payoutStaffId = match[1];
        }
      }
    }
    
    // Check if user is authorized (must be the payout staff or have the owner role)
    const isOwner = interaction.member.roles.cache.has('1292933200389083196');
    
    if (userId !== payoutStaffId && !isOwner) {
      return interaction.reply({
        content: 'You are not authorized to confirm this payout.',
        ephemeral: true
      });
    }
    
    // Update the button to be disabled and show completion
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
    const disabledButton = new ButtonBuilder()
      .setCustomId('profile_payout_completed_done')
      .setLabel('Payout has been completed.')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
    
    const row = new ActionRowBuilder()
      .addComponents(disabledButton);
    
    // Update the message
    await interaction.update({ components: [row] });
    console.log(`[PROFILE_PAYOUT] Payout completed button clicked by user ${userId}`);
  } catch (error) {
    console.error(`[PROFILE_PAYOUT] Error in profilePayoutCompletedHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while confirming the payout.',
        ephemeral: true
      });
    }
  }
};

module.exports = {
  handleProfilePurchaseCompletion,
  extractTicketCreatorId,
  completeProfilePurchase,
  profilePayoutCompletedHandler
}; 