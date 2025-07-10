const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { EMBED_COLOR, EMOJIS, PAYMENT_METHODS, PAYMENT_STAFF } = require('../constants');
const { 
  sendPaymentConfirmationEmbed, 
  createCryptoTxForm
} = require('../../ticketPayments');

// Set of used crypto transaction IDs to prevent reuse
const usedTxIds = new Set();
// Map to track crypto payment timeouts
const cryptoTimeouts = new Map();

/**
 * Handle crypto selection buttons
 */
const cryptoButtonHandlers = {
  'crypto_ltc': async (interaction) => {
    // Extract price from ticket
    let price = 0;
    try {
      const priceField = interaction.message.embeds[0]?.fields?.find(f => f.name === 'Price' || f.name === 'Estimated Price');
      if (priceField) {
        const priceText = priceField.value;
        const priceMatch = priceText.match(/€(\d+(\.\d+)?)/);
        if (priceMatch && priceMatch[1]) {
          price = parseFloat(priceMatch[1]);
        }
      }
    } catch (error) {
      console.error('Error extracting price:', error);
    }
    
    await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'ltc', price);
    await interaction.deferUpdate();
    
    // Set timeout for 30 minutes
    setupCryptoTimeout(interaction.channel, 'ltc', price);
  },
  
  'crypto_sol': async (interaction) => {
    // Extract price from ticket
    let price = 0;
    try {
      const priceField = interaction.message.embeds[0]?.fields?.find(f => f.name === 'Price' || f.name === 'Estimated Price');
      if (priceField) {
        const priceText = priceField.value;
        const priceMatch = priceText.match(/€(\d+(\.\d+)?)/);
        if (priceMatch && priceMatch[1]) {
          price = parseFloat(priceMatch[1]);
        }
      }
    } catch (error) {
      console.error('Error extracting price:', error);
    }
    
    await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'sol', price);
    await interaction.deferUpdate();
    
    // Set timeout for 30 minutes
    setupCryptoTimeout(interaction.channel, 'sol', price);
  },
  
  'crypto_btc': async (interaction) => {
    await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'btc', 0);
    await interaction.deferUpdate();
  },
  
  'crypto_other': async (interaction) => {
    await showCryptoOtherForm(interaction);
  }
};

/**
 * Handle crypto selection dropdown
 */
const cryptoSelectHandler = async (interaction) => {
  try {
    const selectedValue = interaction.values[0];
    
    // Clear any existing messages/components
    await interaction.update({ components: [] });
    
    // Get price from message if available
    let price = 0;
    try {
      const priceField = interaction.message.embeds[0].fields.find(f => f.name === 'Price' || f.name === '**Price:**');
      if (priceField) {
        const priceMatch = priceField.value.match(/€?(\d+(?:\.\d+)?)/);
        if (priceMatch && priceMatch[1]) {
          price = parseFloat(priceMatch[1]);
        }
      }
    } catch (error) {
      console.error('[PAYMENT] Error extracting price:', error);
    }
    
    const userId = interaction.user.id;
    const { sendLitecoinEmbed, sendSolanaEmbed, sendBitcoinEmbed } = require('../../ticketPayments');
    
    // Handle different crypto options
    switch (selectedValue) {
      case 'crypto_ltc':
        await sendLitecoinEmbed(interaction.message, userId, price);
        break;
        
      case 'crypto_sol':
        await sendSolanaEmbed(interaction.message, userId, price);
        break;
        
      case 'crypto_btc':
        await sendBitcoinEmbed(interaction.message, userId);
        break;
        
      case 'crypto_other':
        const { showCryptoOtherForm } = require('../../ticketPayments');
        await showCryptoOtherForm(interaction);
        break;
    }
  } catch (error) {
    console.error('[PAYMENT] Error handling crypto selection:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred processing your crypto selection. Please try again.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle crypto payment completed buttons
 */
const cryptoPaymentCompletedHandlers = {
  // These are handled in interactions/buttonHandlers.js to prevent duplicates
  // payment_completed_ltc: handled in interactions/buttonHandlers.js
  // payment_completed_sol: handled in interactions/buttonHandlers.js  
  // payment_completed_btc: handled in interactions/buttonHandlers.js

  'payment_completed_crypto_ltc': async (interaction) => {
    await createCryptoTxForm(interaction, 'ltc');
  },
  
  'payment_completed_crypto_sol': async (interaction) => {
    await createCryptoTxForm(interaction, 'sol');
  },
  
  'payment_completed_crypto_btc': async (interaction) => {
    await createCryptoTxForm(interaction, 'btc');
  }
};

/**
 * Handle crypto copy address buttons
 */
const cryptoCopyHandlers = {
  // These are handled in interactions/buttonHandlers.js to prevent duplicates
  // copy_ltc_address: handled in interactions/buttonHandlers.js
  // copy_sol_address: handled in interactions/buttonHandlers.js
  // copy_btc_address: handled in interactions/buttonHandlers.js
  
  'copy_ltc_amount': async (interaction) => {
    try {
      // Extract amount from customId
      const customIdParts = interaction.customId.split('_');
      const amount = customIdParts[3];
      
      await interaction.reply({
        content: amount,
        ephemeral: true
      });
    } catch (error) {
      console.error('[PAYMENT] Error handling copy LTC amount:', error);
      await interaction.reply({
        content: 'An error occurred while copying the amount.',
        ephemeral: true
      });
    }
  },

  'copy_sol_amount': async (interaction) => {
    try {
      // Extract amount from customId
      const customIdParts = interaction.customId.split('_');
      const amount = customIdParts[3];
      
      await interaction.reply({
        content: amount,
        ephemeral: true
      });
    } catch (error) {
      console.error('[PAYMENT] Error handling copy SOL amount:', error);
      await interaction.reply({
        content: 'An error occurred while copying the amount.',
        ephemeral: true
      });
    }
  },
  
  'copy_btc_amount': async (interaction) => {
    try {
      // Extract amount from customId
      const customIdParts = interaction.customId.split('_');
      const amount = customIdParts[3];
      
      await interaction.reply({
        content: amount,
        ephemeral: true
      });
    } catch (error) {
      console.error('[PAYMENT] Error handling copy BTC amount:', error);
      await interaction.reply({
        content: 'An error occurred while copying the amount.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle crypto resend buttons
 */
const cryptoResendHandlers = {
  'resend_ltc_payment': async (interaction) => {
    try {
      // Extract price from previous messages
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      let price = 0;
      
      for (const [_, msg] of messages) {
        if (msg.embeds?.length > 0) {
          const embed = msg.embeds[0];
          if (embed.title === 'Order Information' || embed.title === 'Order Recap') {
            // Look for price field
            const priceField = embed.fields.find(f => f.name.includes('Price'));
            if (priceField) {
              const priceMatch = priceField.value.match(/€?(\d+(?:\.\d+)?)/);
              if (priceMatch && priceMatch[1]) {
                price = parseFloat(priceMatch[1]);
              }
            }
            break;
          }
        }
      }
      
      const { resendLitecoinEmbed } = require('../../ticketPayments');
      await resendLitecoinEmbed(interaction.channel, interaction.user.id);
      await interaction.update({ components: [] });
    } catch (error) {
      console.error('[PAYMENT] Error handling resend LTC payment:', error);
      await interaction.reply({
        content: 'An error occurred while resending the payment information. Please try again.',
        ephemeral: true
      });
    }
  },

  'resend_sol_payment': async (interaction) => {
    try {
      // Extract price from previous messages
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      let price = 0;
      
      for (const [_, msg] of messages) {
        if (msg.embeds?.length > 0) {
          const embed = msg.embeds[0];
          if (embed.title === 'Order Information' || embed.title === 'Order Recap') {
            // Look for price field
            const priceField = embed.fields.find(f => f.name.includes('Price'));
            if (priceField) {
              const priceMatch = priceField.value.match(/€?(\d+(?:\.\d+)?)/);
              if (priceMatch && priceMatch[1]) {
                price = parseFloat(priceMatch[1]);
              }
            }
            break;
          }
        }
      }
      
      const { resendSolanaEmbed } = require('../../ticketPayments');
      await resendSolanaEmbed(interaction.channel, interaction.user.id);
      await interaction.update({ components: [] });
    } catch (error) {
      console.error('[PAYMENT] Error handling resend SOL payment:', error);
      await interaction.reply({
        content: 'An error occurred while resending the payment information. Please try again.',
        ephemeral: true
      });
    }
  },

  'resend_btc_payment': async (interaction) => {
    try {
      const { resendBitcoinEmbed } = require('../../ticketPayments');
      await resendBitcoinEmbed(interaction.channel, interaction.user.id);
      await interaction.update({ components: [] });
    } catch (error) {
      console.error('[PAYMENT] Error handling resend BTC payment:', error);
      await interaction.reply({
        content: 'An error occurred while resending the payment information. Please try again.',
        ephemeral: true
      });
    }
  },

  'resend_crypto_ltc': async (interaction) => {
    try {
      // Extract price from ticket again
      let price = 0;
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const orderMsg = messages.find(msg => {
          if (!msg.embeds || msg.embeds.length === 0) return false;
          const embed = msg.embeds[0];
          return embed.title?.includes('Order');
        });
        
        if (orderMsg) {
          const priceField = orderMsg.embeds[0]?.fields?.find(f => 
            f.name === 'Price' || f.name === 'Estimated Price'
          );
          
          if (priceField) {
            const priceText = priceField.value;
            const priceMatch = priceText.match(/€(\d+(\.\d+)?)/);
            if (priceMatch && priceMatch[1]) {
              price = parseFloat(priceMatch[1]);
            }
          }
        }
      } catch (error) {
        console.error('Error extracting price for resend:', error);
      }
      
      // Send updated payment information
      await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'ltc', price);
      await interaction.update({
        content: 'Payment information has been resent.',
        embeds: [],
        components: []
      });
      
      // Set new timeout
      setupCryptoTimeout(interaction.channel, 'ltc', price);
    } catch (error) {
      console.error('Error resending LTC payment info:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred. Please try again or contact staff.',
          ephemeral: true
        });
      }
    }
  },
  
  'resend_crypto_sol': async (interaction) => {
    try {
      // Extract price from ticket again
      let price = 0;
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const orderMsg = messages.find(msg => {
          if (!msg.embeds || msg.embeds.length === 0) return false;
          const embed = msg.embeds[0];
          return embed.title?.includes('Order');
        });
        
        if (orderMsg) {
          const priceField = orderMsg.embeds[0]?.fields?.find(f => 
            f.name === 'Price' || f.name === 'Estimated Price'
          );
          
          if (priceField) {
            const priceText = priceField.value;
            const priceMatch = priceText.match(/€(\d+(\.\d+)?)/);
            if (priceMatch && priceMatch[1]) {
              price = parseFloat(priceMatch[1]);
            }
          }
        }
      } catch (error) {
        console.error('Error extracting price for resend:', error);
      }
      
      // Send updated payment information
      await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'sol', price);
      await interaction.update({
        content: 'Payment information has been resent.',
        embeds: [],
        components: []
      });
      
      // Set new timeout
      setupCryptoTimeout(interaction.channel, 'sol', price);
    } catch (error) {
      console.error('Error resending SOL payment info:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred. Please try again or contact staff.',
          ephemeral: true
        });
      }
    }
  }
};

/**
 * Setup a timeout for crypto payment
 */
function setupCryptoTimeout(channel, coinType, price) {
  try {
    // Clear any existing timeout for this channel
    if (cryptoTimeouts.has(channel.id)) {
      clearTimeout(cryptoTimeouts.get(channel.id));
    }
    
    // Set a new 30-minute timeout
    const timeoutId = setTimeout(async () => {
      try {
        // Find the crypto payment message
        const messages = await channel.messages.fetch({ limit: 50 });
        const paymentMsg = messages.find(msg => {
          if (!msg.embeds || msg.embeds.length === 0) return false;
          
          const embed = msg.embeds[0];
          return (
            (embed.title === 'Litecoin Information' && coinType === 'ltc') ||
            (embed.title === 'Solana Information' && coinType === 'sol')
          );
        });
        
        if (paymentMsg) {
          // Delete the old message
          await paymentMsg.delete();
          
          // Create the failure message
          const failedEmbed = new EmbedBuilder()
            .setTitle('Payment Failed')
            .setDescription('Client failed to send the money in a 30 minute time frame.')
            .setColor(EMBED_COLOR);
            
          const resendButton = new ButtonBuilder()
            .setCustomId(`resend_crypto_${coinType}`)
            .setLabel('Send Again')
            .setEmoji(coinType === 'ltc' ? EMOJIS.LITECOIN : EMOJIS.SOLANA)
            .setStyle(ButtonStyle.Success);
            
          await channel.send({
            embeds: [failedEmbed],
            components: [new ActionRowBuilder().addComponents(resendButton)]
          });
        }
      } catch (error) {
        console.error('Error handling crypto timeout:', error);
      } finally {
        // Remove from the timeouts map
        cryptoTimeouts.delete(channel.id);
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    // Store the timeout
    cryptoTimeouts.set(channel.id, timeoutId);
  } catch (error) {
    console.error('Error setting up crypto timeout:', error);
  }
}

// Handle modal submissions for crypto transaction verification
async function handleCryptoTxForm(interaction, cryptoType) {
  try {
    const txId = interaction.fields.getTextInputValue('tx_id');
    
    // Check if this transaction ID has been used before
    if (usedTxIds.has(txId)) {
      return interaction.reply({
        content: 'This transaction ID has already been used. Please provide a valid transaction ID.',
        ephemeral: true
      });
    }
    
    // Check if transaction is recent (within 30 minutes)
    // In a real implementation, you would validate this with a blockchain API
    const isRecent = true; // Placeholder
    
    if (!isRecent) {
      return interaction.reply({
        content: 'This transaction is not recent. Please provide a transaction from the last 30 minutes.',
        ephemeral: true
      });
    }
    
    // For Litecoin and Solana, send "please wait" messages
    if (cryptoType === 'ltc' || cryptoType === 'sol') {
      // Add transaction ID to used set
      usedTxIds.add(txId);
      
      // Show waiting embed
      const waitingEmbed = new EmbedBuilder()
        .setTitle('Please wait 20 minutes ⏰')
        .setDescription('This is so the transaction can be confirmed.')
        .setColor(EMBED_COLOR);
        
      await interaction.reply({
        embeds: [waitingEmbed],
        ephemeral: false
      });
      
      // Set a timeout to check confirmation after 20 minutes
      setTimeout(async () => {
        try {
          // In a real implementation, check if transaction is confirmed via blockchain API
          const isConfirmed = true; // Placeholder
          
          if (isConfirmed) {
            // Get order information
            let orderInfo = {
              current: 'Current Value',
              target: 'Target Value',
              amount: 'Amount'
            };
            
            try {
              const messages = await interaction.channel.messages.fetch({ limit: 100 });
              const orderMsg = messages.find(msg => {
                if (!msg.embeds || msg.embeds.length === 0) return false;
                const embed = msg.embeds[0];
                return embed.title?.includes('Order');
              });
              
              if (orderMsg) {
                const embed = orderMsg.embeds[0];
                const currentField = embed.fields.find(f => 
                  f.name === 'Current Rank' || 
                  f.name === 'Current Trophies' || 
                  f.name === 'Current Mastery Rank'
                );
                
                const targetField = embed.fields.find(f => 
                  f.name === 'Target Rank' || 
                  f.name === 'Target Trophies' || 
                  f.name === 'Target Mastery Rank'
                );
                
                const priceField = embed.fields.find(f => 
                  f.name === 'Price' || 
                  f.name === 'Estimated Price'
                );
                
                if (currentField && targetField && priceField) {
                  orderInfo = {
                    current: currentField.value,
                    target: targetField.value,
                    amount: priceField.value
                  };
                }
              }
            } catch (error) {
              console.error('Error getting order info for confirmed crypto payment:', error);
            }
            
            // Send boost available notification
            const { sendPaymentConfirmedNotification } = require('../../ticketPayments');
            await sendPaymentConfirmedNotification(interaction.channel, orderInfo);
          } else {
            // Still not confirmed, wait another 20 minutes
            const stillWaitingEmbed = new EmbedBuilder()
              .setTitle('Please wait another 20 minutes ⏰')
              .setDescription('This is so the transaction can be confirmed.')
              .setColor(EMBED_COLOR);
              
            await interaction.channel.send({
              content: 'After 20 minutes the transaction is still not fully confirmed.',
              embeds: [stillWaitingEmbed]
            });
            
            // Set another timeout
            setTimeout(async () => {
              try {
                // Check again
                const isConfirmedFinal = true; // Placeholder
                
                if (isConfirmedFinal) {
                  // Get order information
                  let orderInfo = {
                    current: 'Current Value',
                    target: 'Target Value',
                    amount: 'Amount'
                  };
                  
                  try {
                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    const orderMsg = messages.find(msg => {
                      if (!msg.embeds || msg.embeds.length === 0) return false;
                      const embed = msg.embeds[0];
                      return embed.title?.includes('Order');
                    });
                    
                    if (orderMsg) {
                      const embed = orderMsg.embeds[0];
                      const currentField = embed.fields.find(f => 
                        f.name === 'Current Rank' || 
                        f.name === 'Current Trophies' || 
                        f.name === 'Current Mastery Rank'
                      );
                      
                      const targetField = embed.fields.find(f => 
                        f.name === 'Target Rank' || 
                        f.name === 'Target Trophies' || 
                        f.name === 'Target Mastery Rank'
                      );
                      
                      const priceField = embed.fields.find(f => 
                        f.name === 'Price' || 
                        f.name === 'Estimated Price'
                      );
                      
                      if (currentField && targetField && priceField) {
                        orderInfo = {
                          current: currentField.value,
                          target: targetField.value,
                          amount: priceField.value
                        };
                      }
                    }
                  } catch (error) {
                    console.error('Error getting order info for confirmed crypto payment:', error);
                  }
                  
                  // Send boost available notification
                  const { sendPaymentConfirmedNotification } = require('../../ticketPayments');
                  await sendPaymentConfirmedNotification(interaction.channel, orderInfo);
                } else {
                  // Still not confirmed after 40 minutes total, notify staff
                  await interaction.channel.send({
                    content: `<@${PAYMENT_STAFF.IBAN_VERIFIER}>`,
                    embeds: [
                      new EmbedBuilder()
                        .setTitle('Transaction Still Not Confirmed')
                        .setDescription('The crypto transaction is still not confirmed after 40 minutes. Please check manually.')
                        .setColor(EMBED_COLOR)
                    ]
                  });
                }
              } catch (error) {
                console.error('Error checking crypto confirmation (second check):', error);
              }
            }, 20 * 60 * 1000); // After another 20 minutes
          }
        } catch (error) {
          console.error('Error checking crypto confirmation:', error);
        }
      }, 20 * 60 * 1000); // After 20 minutes
    } else if (cryptoType === 'btc') {
      // For Bitcoin, ask staff to confirm manually
      // Add transaction ID to used set
      usedTxIds.add(txId);
      
      // Send staff verification embed
      const { sendStaffPaymentVerificationEmbed } = require('../../ticketPayments');
      await sendStaffPaymentVerificationEmbed(
        interaction.channel,
        interaction.user.id,
        'btc',
        { txId }
      );
      await interaction.reply({
        content: 'Your transaction has been submitted for verification by staff.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(`Error handling ${cryptoType} transaction form:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred processing your transaction. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
}

// Modal handler mapping
const cryptoModalHandlers = {
  'crypto_tx_form_ltc': (interaction) => handleCryptoTxForm(interaction, 'ltc'),
  'crypto_tx_form_sol': (interaction) => handleCryptoTxForm(interaction, 'sol'),
  'crypto_tx_form_btc': (interaction) => handleCryptoTxForm(interaction, 'btc')
};

// Combine all crypto handlers
const cryptoPaymentHandlers = {
  ...cryptoButtonHandlers,
  ...cryptoPaymentCompletedHandlers,
  ...cryptoCopyHandlers,
  ...cryptoResendHandlers,
  'crypto_select': cryptoSelectHandler
};

module.exports = {
  cryptoPaymentHandlers,
  cryptoModalHandlers,
  setupCryptoTimeout,
  usedTxIds
}; 