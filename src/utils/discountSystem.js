/**
 * Discount System for Discord Bot
 * Handles 10% discount offers for orders under €100
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const db = require('../../database.js');

/**
 * Checks if a price qualifies for discount (under €100)
 * @param {string} priceString - Price string like "€73.00" or "73.00"
 * @returns {boolean} - True if price qualifies for discount
 */
function qualifiesForDiscount(priceString) {
  try {
    // Extract numeric value from price string
    const numericValue = parseFloat(priceString.replace(/[€$,]/g, ''));
    console.log(`[DISCOUNT] Checking price qualification: ${priceString} → ${numericValue}`);
    return numericValue < 100;
  } catch (error) {
    console.error(`[DISCOUNT] Error parsing price ${priceString}: ${error.message}`);
    return false;
  }
}

/**
 * Calculates discounted price (10% off)
 * @param {string} originalPrice - Original price string like "€73.00"
 * @returns {string} - Discounted price string
 */
function calculateDiscountedPrice(originalPrice) {
  try {
    const numericValue = parseFloat(originalPrice.replace(/[€$,]/g, ''));
    const discountedValue = numericValue * 0.9; // 10% discount
    
    // Format back to currency string, maintaining original format
    if (originalPrice.includes('€')) {
      return `€${discountedValue.toFixed(2)}`;
    } else if (originalPrice.includes('$')) {
      return `$${discountedValue.toFixed(2)}`;
    } else {
      return discountedValue.toFixed(2);
    }
  } catch (error) {
    console.error(`[DISCOUNT] Error calculating discount for ${originalPrice}: ${error.message}`);
    return originalPrice;
  }
}

/**
 * Sends discount DM to user with countdown and auto-deletion
 * @param {Client} client - Discord client
 * @param {string} userId - User ID to send DM to
 * @param {string} channelId - Ticket channel ID for database tracking
 * @returns {Promise<boolean>} - Success status
 */
async function sendDiscountDM(client, userId, channelId) {
  try {
    console.log(`[DISCOUNT] Sending discount DM to user ${userId} for channel ${channelId}`);
    
    // Get user
    const user = await client.users.fetch(userId);
    if (!user) {
      console.error(`[DISCOUNT] Could not fetch user ${userId}`);
      return false;
    }
    
    // Calculate expiry time (30 minutes from now)
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 30);
    const discordTimestamp = `<t:${Math.floor(expiryTime.getTime() / 1000)}:R>`;
    
    // Create discount offer embed
    const discountEmbed = new EmbedBuilder()
      .setTitle('Limited Time Discount Unlocked <:moneyy:1391899345208606772>')
      .setDescription(
        'Congratulations! You have unlocked a limited time **10% Discount** on all boosts! <:Reward:1393324450165948429>\n\n' +
        'But be quick, because this offer **expires in 30 Minutes!** <:Timer:1393323592065880286>\n' +
        `> <a:warning:1393326303804919889> Offer expires ${discordTimestamp}\n\n` +
        'Use the **Claim 10% Discount** button to claim your discount now! But be quick, in 30 minutes this offer will expire and will be fully unavailable!\n' +
        '-# This discount only applies to orders of €100 or under.'
      )
      .setColor('#00ff00');
    
    // Create buttons
    const claimButton = new ButtonBuilder()
      .setCustomId('claim_10_percent_discount')
      .setLabel('Claim 10% Discount')
      .setEmoji('<:moneyy:1391899345208606772>')
      .setStyle(ButtonStyle.Success);
    
    const expiryButton = new ButtonBuilder()
      .setCustomId('discount_expires_30m')
      .setLabel('Offer Expires in 30m')
      .setEmoji('<a:warning:1393326303804919889>')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true); // Non-clickable as requested
    
    const buttonRow = new ActionRowBuilder()
      .addComponents(claimButton, expiryButton);
    
    // Send DM
    const dmMessage = await user.send({
      embeds: [discountEmbed],
      components: [buttonRow]
    });
    
    console.log(`[DISCOUNT] Successfully sent discount DM with ID: ${dmMessage.id}`);
    
    // Update database with discount offer information
    await updateDiscountOfferInDatabase(channelId, dmMessage.id, expiryTime);
    
    // Schedule auto-deletion after 30 minutes
    scheduleDiscountDMDeletion(client, user.id, dmMessage.id, 30 * 60 * 1000);
    
    // Schedule countdown updates every minute
    scheduleCountdownUpdates(client, user.id, dmMessage.id, 30);
    
    return true;
    
  } catch (error) {
    console.error(`[DISCOUNT] Error sending discount DM to user ${userId}: ${error.message}`);
    return false;
  }
}

/**
 * Updates database with discount offer information
 * @param {string} channelId - Ticket channel ID
 * @param {string} messageId - DM message ID
 * @param {Date} expiryTime - When offer expires
 */
async function updateDiscountOfferInDatabase(channelId, messageId, expiryTime) {
  try {
    await db.waitUntilConnected();
    
    const query = `
      UPDATE tickets 
      SET discount_offer_sent = TRUE,
          discount_message_id = $1,
          discount_expires_at = $2,
          discount_percentage = 10.0
      WHERE channel_id = $3
    `;
    
    await db.query(query, [messageId, expiryTime, channelId]);
    console.log(`[DISCOUNT] Updated database with discount offer for channel ${channelId}`);
    
  } catch (error) {
    console.error(`[DISCOUNT] Error updating database: ${error.message}`);
  }
}

/**
 * Schedules deletion of discount DM after specified time
 * @param {Client} client - Discord client
 * @param {string} userId - User ID
 * @param {string} messageId - Message ID to delete
 * @param {number} delayMs - Delay in milliseconds
 */
function scheduleDiscountDMDeletion(client, userId, messageId, delayMs) {
  setTimeout(async () => {
    try {
      console.log(`[DISCOUNT] Checking if discount DM ${messageId} should be auto-deleted for user ${userId}`);
      
      // Check if discount was claimed - if so, don't delete
      const activeDiscount = await getActiveDiscountOffer(userId);
      if (!activeDiscount) {
        // Check if there's a claimed discount for this user
        await db.waitUntilConnected();
        const claimedDiscountResult = await db.query(
          'SELECT * FROM tickets WHERE user_id = $1 AND discount_claimed = TRUE AND discount_message_id = $2',
          [userId, messageId]
        );
        
        if (claimedDiscountResult.rows.length > 0) {
          console.log(`[DISCOUNT] Skipping auto-deletion - discount was claimed for user ${userId}`);
          return;
        }
      }
      
      console.log(`[DISCOUNT] Auto-deleting discount DM ${messageId} for user ${userId}`);
      
      const user = await client.users.fetch(userId);
      if (user) {
        // Get the DM channel
        const dmChannel = await user.createDM();
        const message = await dmChannel.messages.fetch(messageId);
        if (message) {
          await message.delete();
          console.log(`[DISCOUNT] Successfully deleted expired discount DM`);
        }
      }
      
    } catch (error) {
      console.error(`[DISCOUNT] Error deleting discount DM: ${error.message}`);
    }
  }, delayMs);
}

/**
 * Schedules countdown button updates every minute
 * @param {Client} client - Discord client
 * @param {string} userId - User ID
 * @param {string} messageId - Message ID to update
 * @param {number} initialMinutes - Starting countdown (30)
 */
function scheduleCountdownUpdates(client, userId, messageId, initialMinutes) {
  let remainingMinutes = initialMinutes;
  
  const updateInterval = setInterval(async () => {
    try {
      remainingMinutes--;
      
      if (remainingMinutes <= 0) {
        clearInterval(updateInterval);
        return;
      }
      
      // Check if discount has been SUCCESSFULLY USED (ticket created with ≤€100) - if so, stop updating
      try {
        await db.waitUntilConnected();
        const usedCheck = await db.query(
          'SELECT discount_claimed FROM tickets WHERE user_id = $1 AND discount_message_id = $2 AND discount_claimed = TRUE',
          [userId, messageId]
        );
        
        if (usedCheck.rows.length > 0) {
          console.log(`[DISCOUNT] Discount successfully used for user ${userId}, stopping countdown updates`);
          clearInterval(updateInterval);
          return;
        }
      } catch (dbError) {
        console.error(`[DISCOUNT] Error checking discount usage status: ${dbError.message}`);
      }
      
      console.log(`[DISCOUNT] Updating countdown to ${remainingMinutes}m for message ${messageId}`);
      
      const user = await client.users.fetch(userId);
      if (!user) {
        clearInterval(updateInterval);
        return;
      }
      
      const dmChannel = await user.createDM();
      const message = await dmChannel.messages.fetch(messageId);
      if (!message) {
        clearInterval(updateInterval);
        return;
      }
      
      // Check if message components still exist and are in the expected format
      if (!message.components || !message.components[0] || !message.components[0].components) {
        console.log(`[DISCOUNT] Message components changed for ${messageId}, stopping countdown updates`);
        clearInterval(updateInterval);
        return;
      }
      
      // Check if buttons were already updated to show discount was used
      const hasUsedButton = message.components[0].components.some(component => 
        component.customId === 'claim_10_percent_discount_used'
      );
      
      if (hasUsedButton) {
        console.log(`[DISCOUNT] Buttons already updated to show discount used for user ${userId}, stopping countdown updates`);
        clearInterval(updateInterval);
        return;
      }
      
      // Update the countdown button
      const updatedRow = new ActionRowBuilder();
      message.components[0].components.forEach(component => {
        if (component.customId === 'claim_10_percent_discount') {
          // Keep claim button unchanged
          updatedRow.addComponents(ButtonBuilder.from(component));
        } else if (component.customId === 'discount_expires_30m') {
          // Update countdown button with new time
          const updatedExpiryButton = new ButtonBuilder()
            .setCustomId('discount_expires_30m')
            .setLabel(`Offer Expires in ${remainingMinutes}m`)
            .setEmoji('<a:warning:1393326303804919889>')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true);
          updatedRow.addComponents(updatedExpiryButton);
        } else {
          // Keep any other buttons unchanged
          updatedRow.addComponents(ButtonBuilder.from(component));
        }
      });
      
      await message.edit({ components: [updatedRow] });
      
    } catch (error) {
      console.error(`[DISCOUNT] Error updating countdown: ${error.message}`);
      // If there's an error, stop the interval to prevent spam
      clearInterval(updateInterval);
    }
  }, 60000); // Update every minute
}

/**
 * Checks if user has an active discount offer
 * @param {string} userId - User ID to check
 * @returns {Promise<Object|null>} - Discount info or null
 */
async function getActiveDiscountOffer(userId) {
  try {
    await db.waitUntilConnected();
    
    const query = `
      SELECT * FROM tickets 
      WHERE user_id = $1 
        AND discount_offer_sent = TRUE 
        AND discount_claimed = FALSE 
        AND discount_expires_at > NOW()
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
    
  } catch (error) {
    console.error(`[DISCOUNT] Error checking active discount: ${error.message}`);
    return null;
  }
}

/**
 * Marks discount as claimed in database
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
async function markDiscountAsClaimed(userId) {
  try {
    await db.waitUntilConnected();
    
    const query = `
      UPDATE tickets 
      SET discount_claimed = TRUE 
      WHERE user_id = $1 
        AND discount_offer_sent = TRUE 
        AND discount_claimed = FALSE 
        AND discount_expires_at > NOW()
    `;
    
    const result = await db.query(query, [userId]);
    console.log(`[DISCOUNT] Marked discount as claimed for user ${userId}`);
    return result.rowCount > 0;
    
  } catch (error) {
    console.error(`[DISCOUNT] Error marking discount as claimed: ${error.message}`);
    return false;
  }
}

module.exports = {
  qualifiesForDiscount,
  calculateDiscountedPrice,
  sendDiscountDM,
  getActiveDiscountOffer,
  markDiscountAsClaimed
}; 