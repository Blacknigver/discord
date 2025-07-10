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

// Trusted owner user IDs - these users can complete profiles without customer confirmation
const TRUSTED_OWNERS = ['987751357773672538', '986164993080836096'];

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
    
    // Check if the user is a trusted owner
    const isTrustedOwner = TRUSTED_OWNERS.includes(interaction.user.id);
    console.log(`[PROFILE_COMPLETION] User ${interaction.user.id} is trusted owner: ${isTrustedOwner}`);
    
    if (isTrustedOwner) {
      // Skip confirmation and proceed directly to full completion
      console.log(`[PROFILE_COMPLETION] Trusted owner detected, proceeding directly to completion`);
      
      // Extract buyer ID from the ticket
      const buyerId = extractTicketCreatorId(interaction.channel) || interaction.user.id;
      
      // Extract information from the profile flow and ticket
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
      
      // Proceed directly to the full completion flow
      await executeFullCompletionFlow(interaction.channel, buyerId, price, description, interaction.client, paymentMethod);
      
      console.log(`[PROFILE_COMPLETION] Trusted owner completion flow finished successfully`);
      return true;
    }
    
    // For non-trusted users, continue with the original confirmation flow
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
    
    // Send Profile Delivered confirmation embed (like boost completion)
    console.log(`[PROFILE_COMPLETION] Sending Profile Delivered confirmation`);
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
    
    const profileDeliveredEmbed = new EmbedBuilder()
      .setTitle('Profile Delivered')
      .setDescription(`<@${buyerId}> Your profile has been delivered! Please confirm that you have received your profile.\n\n**This action is irreversible. If you confirm the profile has been delivered, the money you have paid will be released!**`)
      .setColor('#e68df2');
    
    // Create the buttons
    const profileDeliveredButton = new ButtonBuilder()
      .setCustomId(`profile_is_delivered_${buyerId}_${listingId}`)
      .setLabel('Profile is Delivered')
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success);
    
    const notDeliveredButton = new ButtonBuilder()
      .setCustomId('profile_not_delivered')
      .setLabel('Profile is not Delivered')
      .setEmoji('<:cross:1351689463453061130>')
      .setStyle(ButtonStyle.Danger);
    
    const row = new ActionRowBuilder()
      .addComponents(profileDeliveredButton, notDeliveredButton);
    
    // Send the Profile Delivered message
    const deliveredMessage = await interaction.channel.send({
      content: `<@${buyerId}>`,
      embeds: [profileDeliveredEmbed],
      components: [row]
    });
    
    console.log(`[PROFILE_COMPLETION] Sent Profile Delivered message with ID: ${deliveredMessage.id}`);
    console.log(`[PROFILE_COMPLETION] Profile delivery confirmation flow initiated successfully`);
    
    return true;
    
  } catch (error) {
    console.error(`[PROFILE_COMPLETION] Error in completion flow: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

/**
 * Execute the full completion flow (used by both trusted owners and confirmed deliveries)
 * @param {TextChannel} channel - The ticket channel
 * @param {string} buyerId - ID of the user who bought the profile
 * @param {string} price - Price of the account
 * @param {string} description - Description of the account
 * @param {Client} client - Discord client
 * @param {string} paymentMethod - Payment method used
 */
async function executeFullCompletionFlow(channel, buyerId, price, description, client, paymentMethod = 'PayPal') {
  try {
    console.log(`[PROFILE_COMPLETION] Executing full completion flow for buyer ${buyerId}`);
    
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
    
    // 6. Schedule ticket auto-close after 30 minutes
    const closeTimeMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    await scheduleAutoClose(channel, buyerId, closeTimeMs, client);
    
    // 7. Create payout log for this completion
    await createProfilePayoutLog(channel, buyerId, price, description, paymentMethod);
    
    console.log(`[PROFILE_COMPLETION] Full completion flow finished successfully`);
    return true;
    
  } catch (error) {
    console.error(`[PROFILE_COMPLETION] Error in full completion flow: ${error.message}`);
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
    
    // 6. Schedule ticket auto-close after 30 minutes
    const closeTimeMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    await scheduleAutoClose(channel, buyerId, closeTimeMs, client);
    
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

/**
 * Handles the Profile Is Delivered button
 */
const profileIsDeliveredHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    // Extract buyer ID and listing ID from custom ID
    const customIdParts = interaction.customId.split('_');
    const expectedBuyerId = customIdParts[3];
    const listingId = customIdParts[4];
    
    console.log(`[PROFILE] Profile Is Delivered button clicked by user ${userId}`);
    console.log(`[PROFILE] Expected buyer: ${expectedBuyerId}, Listing: ${listingId}`);
    
    // Check if user is authorized to click this button
    if (userId !== expectedBuyerId && 
        userId !== '1346034712627646524' && // Specified authorized user
        userId !== '987751357773672538' && // Specified authorized user
        userId !== '986164993080836096'    // Specified authorized user
    ) {
      console.log(`[PROFILE] User ${userId} is not authorized to confirm profile delivery. Expected buyer: ${expectedBuyerId}`);
      return interaction.reply({
        content: 'You are not authorized to confirm this profile delivery. Only the buyer can confirm delivery.',
        ephemeral: true
      });
    }
    
    console.log(`[PROFILE] User ${userId} is authorized to confirm profile delivery. Processing...`);
    
    // Create final confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('Are you sure?')
      .setDescription('Are you sure your profile has been delivered?\n\nIf you click \'**Confirm**\' the money will be released to the seller.')
      .setColor('#e68df2');
    
    // Create buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId(`profile_confirm_delivered_${expectedBuyerId}_${listingId}`)
      .setLabel('Confirm')
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('profile_cancel_confirmation')
      .setLabel('Cancel')
      .setEmoji('<:cross:1351689463453061130>')
      .setStyle(ButtonStyle.Danger);
    
    const row = new ActionRowBuilder()
      .addComponents(confirmButton, cancelButton);
    
    // Send the confirmation message as a reply without updating the original message
    await interaction.reply({
      embeds: [confirmEmbed],
      components: [row],
      ephemeral: true
    });
    
    console.log(`[PROFILE] Sent confirmation dialog for profile delivery`);
    return true;
  } catch (error) {
    console.error(`[PROFILE] Error in profileIsDeliveredHandler: ${error.message}`);
    console.error(error.stack);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your confirmation.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Profile Confirm Delivered button (final confirmation)
 */
const profileConfirmDeliveredHandler = async (interaction) => {
  try {
    // Defer immediately to prevent timeout
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    
    // Extract buyer ID and listing ID from custom ID
    const customIdParts = interaction.customId.split('_');
    const buyerId = customIdParts[3];
    const listingId = customIdParts[4];
    
    console.log(`[PROFILE] Profile Confirm Delivered button clicked by user ${interaction.user.id}`);
    console.log(`[PROFILE] Buyer: ${buyerId}, Listing: ${listingId}`);
    
    // Get the original message with the "Profile is Delivered" button and update it
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 5 });
      const originalMessage = messages.find(msg => 
        msg.components.length > 0 && 
        msg.components[0].components.some(comp => 
          comp.customId?.includes('profile_is_delivered') || 
          comp.customId === 'profile_not_delivered'
        )
      );
      
      if (originalMessage) {
        // Create a "delivered" button for the original message
        const deliveredButton = new ButtonBuilder()
          .setCustomId('profile_delivered_status')
          .setLabel('Profile has been delivered')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true);
        
        const deliveredRow = new ActionRowBuilder()
          .addComponents(deliveredButton);
        
        // Update the original message with the disabled button
        await originalMessage.edit({ components: [deliveredRow] });
        console.log(`[PROFILE] Updated original message with delivered status`);
      }
    } catch (error) {
      console.error(`[PROFILE] Error updating original message: ${error.message}`);
    }
    
    // Extract information from ticket for completion
    let price = '';
    let description = '';
    let paymentMethod = 'PayPal';
    
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 50 });
      
      for (const message of messages.values()) {
        if (message.embeds.length > 0) {
          const embed = message.embeds[0];
          
          // Look for Order Recap embed
          if (embed.title === 'Order Recap') {
            const priceField = embed.fields?.find(field => field.name.includes('Price'));
            if (priceField) {
              price = priceField.value;
            }
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
    } catch (error) {
      console.error(`[PROFILE] Error extracting ticket information: ${error.message}`);
    }

    // Use the centralized completion flow
    console.log(`[PROFILE] Starting full completion flow via executeFullCompletionFlow`);
    await executeFullCompletionFlow(interaction.channel, buyerId, price, description, interaction.client, paymentMethod);

    // Close the confirmation dialog
    try {
      await interaction.editReply({
        content: 'Profile delivery confirmed successfully.',
        embeds: [],
        components: []
      });
    } catch (error) {
      console.error(`[PROFILE] Error closing confirmation dialog: ${error.message}`);
    }

    console.log(`[PROFILE] Profile delivery confirmation and completion flow finished successfully`);
    return true;
    
  } catch (error) {
    console.error(`[PROFILE] Error in profileConfirmDeliveredHandler: ${error.message}`);
    console.error(error.stack);
    
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({
        content: 'An error occurred while confirming profile delivery.',
        embeds: [],
        components: []
      });
    } else if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while confirming profile delivery.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Profile Not Delivered button
 */
const profileNotDeliveredHandler = async (interaction) => {
  try {
    console.log(`[PROFILE] Profile Not Delivered button clicked by user ${interaction.user.id}`);
    
    // Update the original message to show it was not delivered
    const notDeliveredButton = new ButtonBuilder()
      .setCustomId('profile_not_delivered_status')
      .setLabel('Profile marked as not delivered')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
    
    const row = new ActionRowBuilder()
      .addComponents(notDeliveredButton);
    
    await interaction.update({ components: [row] });
    
    // Send a message indicating profile was not delivered
    await interaction.followUp({
      content: 'Profile delivery has been marked as not completed. Please contact staff if there are any issues.',
      ephemeral: false
    });
    
    console.log(`[PROFILE] Profile marked as not delivered by user ${interaction.user.id}`);
  } catch (error) {
    console.error(`[PROFILE] Error in profileNotDeliveredHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while marking the profile as not delivered.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Profile Cancel Confirmation button
 */
const profileCancelConfirmationHandler = async (interaction) => {
  try {
    await interaction.update({
      content: 'Profile delivery confirmation cancelled.',
      embeds: [],
      components: []
    });
    
    console.log(`[PROFILE] Profile delivery confirmation cancelled by user ${interaction.user.id}`);
  } catch (error) {
    console.error(`[PROFILE] Error in profileCancelConfirmationHandler: ${error.message}`);
  }
};

module.exports = {
  handleProfilePurchaseCompletion,
  extractTicketCreatorId,
  completeProfilePurchase,
  profilePayoutCompletedHandler,
  profileIsDeliveredHandler,
  profileConfirmDeliveredHandler,
  profileNotDeliveredHandler,
  profileCancelConfirmationHandler
}; 