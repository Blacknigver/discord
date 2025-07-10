/**
 * Order completion utilities
 * Shared logic for completing orders (profile purchases, boosts, etc.)
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('../../config.js');

/**
 * Creates the standard Order Completed embed with review/feedback buttons
 * @param {string} userId - User ID for button customization
 * @returns {Object} - Object with embed and components
 */
function createOrderCompletedEmbed(userId) {
  const completionEmbed = new EmbedBuilder()
    .setTitle('Order Completed')
    .setDescription(
      'Your order has been completed! Thanks for choosing us!\n\n' +
      '> Use the **Feedback** button to leave feedback on the way the bot works and your order is handled. This is optional\n' +
      '# Please Review!\n' +
      '> Please use the **Review** button to leave a review for our services. **We would appreciate this very much**\n' +
      '> This **can be done anonymously!** But is is preferred if you do not stay anonymous\n\n' +
      'Have a nice rest of your day! **Please don\'t forget to review!**'
    )
    .setColor('#e68df2');
    
  // Create buttons for review and feedback
  const reviewButton = new ButtonBuilder()
    .setCustomId(`review_button_${userId}`)
    .setLabel('Review')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);
    
  const feedbackButton = new ButtonBuilder()
    .setCustomId(`feedback_button_${userId}`)
    .setLabel('Leave Feedback')
    .setEmoji('<:Feedback:1382060106111389777>')
    .setStyle(ButtonStyle.Success);
    
  const reviewFeedbackRow = new ActionRowBuilder()
    .addComponents(reviewButton, feedbackButton);

  return {
    embed: completionEmbed,
    components: [reviewFeedbackRow]
  };
}

/**
 * Schedules auto-close for a ticket after specified time
 * @param {TextChannel} channel - The channel to auto-close
 * @param {string} userId - User ID for permission handling
 * @param {number} closeTimeMs - Time in milliseconds before closing
 * @param {Client} client - Discord client
 */
async function scheduleAutoClose(channel, userId, closeTimeMs, client) {
  console.log(`[AUTO_CLOSE] Setting up auto-close timer for ${closeTimeMs}ms`);
  const closeTimestamp = Math.floor((Date.now() + closeTimeMs) / 1000);
  
  // Send message about auto-close
  try {
    await channel.send({
      content: `<@${userId}> This ticket will automatically be closed in <t:${closeTimestamp}:R>`,
    });
    console.log(`[AUTO_CLOSE] Successfully sent auto-close notification`);
  } catch (error) {
    console.error(`[AUTO_CLOSE] Error sending auto-close notification: ${error.message}`);
  }
  
  // Set up delayed close
  setTimeout(async () => {
    try {
      // Make sure the channel still exists
      const currentChannel = client.channels.cache.get(channel.id);
      if (!currentChannel) {
        console.log(`[AUTO_CLOSE] Channel ${channel.id} no longer exists, skipping auto-close`);
        return;
      }
      
      // Set permissions so nobody can send messages
      await currentChannel.permissionOverwrites.edit(currentChannel.guild.roles.everyone, {
        SendMessages: false
      });
      
      // Keep read access for the user
      if (userId) {
        await currentChannel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: false,
          ReadMessageHistory: true
        });
      }
      
      // Send close notification
      await currentChannel.send({
        content: `This ticket has been automatically closed after completion.`,
        embeds: [
          new EmbedBuilder()
            .setTitle('Ticket Closed')
            .setDescription('This ticket has been automatically closed since the order was completed.')
            .setColor('#e68df2')
            .setTimestamp()
        ]
      });
      
      console.log(`[AUTO_CLOSE] Auto-closed ticket channel ${channel.id}`);
    } catch (error) {
      console.error(`[AUTO_CLOSE] Error auto-closing channel: ${error.message}`);
    }
  }, closeTimeMs);
  
  console.log(`[AUTO_CLOSE] Scheduled auto-close for channel ${channel.id} in ${closeTimeMs}ms`);
}

/**
 * Adds customer role to a user
 * @param {Guild} guild - Discord guild
 * @param {string} userId - User ID to add role to
 */
async function addCustomerRole(guild, userId) {
  try {
    if (userId) {
      const member = await guild.members.fetch(userId);
      if (member) {
        await member.roles.add(config.ROLES.CUSTOMER_ROLE);
        console.log(`[COMPLETION] Added customer role to ${userId}`);
        return true;
      }
    }
  } catch (error) {
    console.error(`[COMPLETION] Error adding customer role: ${error.message}`);
  }
  return false;
}

/**
 * Moves channel to completed category
 * @param {TextChannel} channel - Channel to move
 */
async function moveToCompletedCategory(channel) {
  try {
    const { moveToCategory } = require('../../utils.js');
    await moveToCategory(channel, 'boost_completed'); // Uses the completed category
    console.log(`[COMPLETION] Moved channel to completed category`);
    return true;
  } catch (error) {
    console.error(`[COMPLETION] Error moving channel to category: ${error.message}`);
    return false;
  }
}

/**
 * Calculates and processes affiliate commission
 * @param {string} buyerId - ID of the user who made the purchase
 * @param {string} priceString - Price string (e.g., "€500")
 * @param {string} orderType - Type of order for logging
 * @param {string} orderId - Ticket/channel ID for logging
 */
async function processAffiliateCommission(buyerId, priceString, orderType, orderId) {
  try {
    const db = require('../../database');
    await db.waitUntilConnected().catch(() => {});
    
    // Parse numeric price
    let numericPrice = 0;
    if (priceString) {
      const match = priceString.replace(/[, ]/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
      if (match) numericPrice = parseFloat(match[1]);
    }
    console.log(`[AFFILIATE_EARNINGS] Price parsed for commission: €${numericPrice.toFixed(2)}`);

    if (numericPrice <= 0) {
      console.warn(`[AFFILIATE_EARNINGS] Commission skipped – unable to determine numeric price`);
      return false;
    }
    
    if (!buyerId) {
      console.warn('[AFFILIATE_EARNINGS] Commission skipped – buyerId not provided');
      return false;
    }

    // Look up possible referrer
    const res = await db.query('SELECT referrer_id FROM affiliate_referrals WHERE referred_id=$1', [buyerId]);

    if (res.rowCount === 0) {
      console.log(`[AFFILIATE_EARNINGS] User ${buyerId} has no referrer – no commission generated.`);
      return false;
    }

    const referrer = res.rows[0].referrer_id;
    const commission = parseFloat((numericPrice * 0.05).toFixed(2));

    try {
      await db.query('UPDATE affiliate_links SET balance = balance + $1 WHERE user_id=$2', [commission, referrer]);
      await db.query('INSERT INTO affiliate_earnings(referrer_id, referred_id, earning_type, amount, order_id) VALUES($1,$2,$3,$4,$5)', [referrer, buyerId, orderType, commission, orderId]);
      console.log(`[AFFILIATE_EARNINGS] Success – €${commission} added to ${referrer} (referrer) for ${orderType} by ${buyerId}`);
      return true;
    } catch (dbWriteErr) {
      console.error('[AFFILIATE_EARNINGS] DB write error:', dbWriteErr.message);
      return false;
    }
  } catch (err) {
    console.error('[AFFILIATE_EARNINGS] Unexpected error while processing earnings:', err);
    return false;
  }
}

/**
 * Cleans up messages in the channel before sending completion embed
 * @param {TextChannel} channel - Channel to clean up
 */
async function cleanupMessagesBeforeCompletion(channel) {
  try {
    const { cleanupMessages } = require('./messageCleanup.js');
    await cleanupMessages(channel, null, 'order_completed');
    console.log(`[COMPLETION] Successfully completed message cleanup`);
  } catch (error) {
    console.error(`[COMPLETION] Error during message cleanup: ${error.message}`);
  }
}

/**
 * Creates a payout log message for profile purchases
 * @param {Guild} guild - Discord guild
 * @param {string} customerId - Customer user ID
 * @param {string} price - Price of the purchase
 * @param {string} paymentMethod - Payment method used
 * @param {string} channelId - Ticket channel ID for reference
 */
async function createProfilePayoutLog(guild, customerId, price, paymentMethod, channelId) {
  try {
    // Profile payout log channel (same as boost for now, or specify different channel)
    const logChannelId = '1382022752474501352'; // Booster/Profile payout log channel
    const logChannel = guild.channels.cache.get(logChannelId);
    
    if (!logChannel) {
      console.error(`[PROFILE_PAYOUT] Log channel not found: ${logChannelId}`);
      return false;
    }
    
    // Determine payout staff based on payment method (same logic as boosts)
    let payoutStaffId = '';
    if (paymentMethod === 'PayPal') {
      payoutStaffId = '986164993080836096';
    } else if (['IBAN Bank Transfer', 'Crypto', 'Dutch Payment Methods'].includes(paymentMethod)) {
      payoutStaffId = '987751357773672538';
    } else {
      // For PayPal Giftcard or other methods, mention the owner role
      payoutStaffId = '1292933200389083196';
    }
    
    // Create the payout log embed
    const logEmbed = new EmbedBuilder()
      .setTitle('New Profile Purchase Completed!')
      .setDescription(
        `**Customer:** <@${customerId}>\n` +
        `**Account Price:** ${price}\n\n` +
        `**Payout Info:**\n` +
        `> **Amount:** ${price}\n` +
        `> **Payment Method:** ${paymentMethod}\n` +
        `> **Payout Done By:** <@${payoutStaffId}>\n` +
        `> **Ticket:** <#${channelId}>`
      )
      .setColor('#e68df2');
    
    // Create the payout button
    const payoutButton = new ButtonBuilder()
      .setCustomId('profile_payout_completed')
      .setLabel('Payout Completed')
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success);
    
    const row = new ActionRowBuilder()
      .addComponents(payoutButton);
    
    // Send the log message
    const logMessage = await logChannel.send({
      embeds: [logEmbed],
      components: [row]
    });
    
    console.log(`[PROFILE_PAYOUT] Successfully sent payout log message with ID: ${logMessage.id} to channel ${logChannel.id}`);
    return true;
    
  } catch (error) {
    console.error(`[PROFILE_PAYOUT] Error creating payout log: ${error.message}`);
    return false;
  }
}

module.exports = {
  createOrderCompletedEmbed,
  scheduleAutoClose,
  addCustomerRole,
  moveToCompletedCategory,
  processAffiliateCommission,
  cleanupMessagesBeforeCompletion,
  createProfilePayoutLog
}; 