const { EmbedBuilder } = require('discord.js');

/**
 * Deletes payment method related messages but keeps the first 2 messages (Welcome and Information embeds)
 * @param {Object} channel - Discord channel object
 * @param {Object} targetMessage - The message to find (e.g., Boost Available message)
 * @param {string} action - The cleanup action type ('payment_confirmed', 'boost_claimed', 'order_completed')
 */
async function cleanupMessages(channel, targetMessage = null, action = 'payment_confirmed') {
  try {
    console.log(`[CLEANUP] Starting ${action} cleanup in channel ${channel.id}`);
    
    // Fetch all messages in the channel
    const messages = await channel.messages.fetch({ limit: 100 });
    const messageArray = Array.from(messages.values()).reverse(); // Oldest first
    
    // Find bot messages (assuming the bot user ID)
    const botMessages = messageArray.filter(msg => msg.author.bot);
    
    if (botMessages.length < 3) {
      console.log(`[CLEANUP] Not enough bot messages found (${botMessages.length}), skipping cleanup`);
      return;
    }
    
    let messagesToDelete = [];
    
    if (action === 'payment_confirmed') {
      // Delete all payment-related messages except first 2 (Welcome + Information embeds)
      // Skip payment verification embeds and payment method selection embeds
      const messagesToCheck = botMessages.slice(2); // Start after first 2 messages
      
      for (const msg of messagesToCheck) {
        if (msg.embeds.length > 0) {
          const embed = msg.embeds[0];
          const title = embed.title || '';
          const description = embed.description || '';
          
          // Keep important messages, delete payment method/verification messages
          if (
            title.includes('Boost Available') ||
            title.includes('Boost Claimed') ||
            title.includes('Order Completed') ||
            title.includes('Order Information') ||
            title.includes('Welcome')
          ) {
            // Keep these messages
            continue;
          }
          
          // Delete payment-related messages
          if (
            title.includes('Payment') ||
            title.includes('PayPal') ||
            title.includes('Crypto') ||
            title.includes('IBAN') ||
            title.includes('Giftcard') ||
            title.includes('Tikkie') ||
            title.includes('Apple') ||
            description.includes('payment') ||
            description.includes('crypto') ||
            description.includes('PayPal') ||
            embed.fields?.some(field => 
              field.name?.includes('Payment') || 
              field.value?.includes('payment') ||
              field.value?.includes('€')
            )
          ) {
            messagesToDelete.push(msg);
          }
        } else if (msg.content && msg.content.includes('payment')) {
          // Delete non-embed messages about payments
          messagesToDelete.push(msg);
        }
      }
      
    } else if (action === 'boost_claimed') {
      // Delete the Boost Available message only
      const boostAvailableMsg = botMessages.find(msg => 
        msg.embeds.length > 0 && msg.embeds[0].title === 'Boost Available'
      );
      
      if (boostAvailableMsg) {
        messagesToDelete = [boostAvailableMsg];
      }
      
    } else if (action === 'order_completed') {
      // Delete only payment-related messages before Order Completed is sent
      // Keep boost-related messages (Boost Claimed, Boost Completed, etc.)
      const messagesToCheck = botMessages.slice(2); // Start after first 2 messages
      
      for (const msg of messagesToCheck) {
        if (msg.embeds.length > 0) {
          const embed = msg.embeds[0];
          const title = embed.title || '';
          
          // Keep essential and boost-related messages
          if (
            title.includes('Welcome') ||
            title.includes('Order Information') ||
            title.includes('Boost Claimed') ||
            title.includes('Boost Completed') ||
            title.includes('Are you sure?') ||
            title.includes('Boost Available')
          ) {
            // Keep these messages
            continue;
          }
          
          // Delete only payment-related messages
          if (
            title.includes('Payment') ||
            title.includes('PayPal') ||
            title.includes('Crypto') ||
            title.includes('IBAN') ||
            title.includes('Giftcard') ||
            title.includes('Tikkie') ||
            title.includes('Apple')
          ) {
            messagesToDelete.push(msg);
          }
        } else if (msg.content && msg.content.includes('payment')) {
          // Delete non-embed messages about payments only
          messagesToDelete.push(msg);
        }
      }
    }
    
    console.log(`[CLEANUP] Found ${messagesToDelete.length} messages to delete for ${action}`);
    
    // Delete messages one by one with delay to avoid rate limiting
    for (const message of messagesToDelete) {
      try {
        await message.delete();
        console.log(`[CLEANUP] Deleted message: ${message.id} (${message.embeds[0]?.title || message.content?.substring(0, 50) || 'No title'})`);
        
        // Small delay between deletions
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (deleteError) {
        console.error(`[CLEANUP] Error deleting message ${message.id}: ${deleteError.message}`);
      }
    }
    
    console.log(`[CLEANUP] Completed ${action} cleanup, deleted ${messagesToDelete.length} messages`);
    
  } catch (error) {
    console.error(`[CLEANUP] Error during ${action} cleanup: ${error.message}`);
  }
}

module.exports = {
  cleanupMessages
}; 