const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { EMBED_COLOR } = require('../../config');
const ticketPayments = require('../../ticketPayments');
const helpers = require('../utils/helpers');
const { flowState } = require('./ticketFlow');

/**
 * Handles payment method selection
 */
async function handlePaymentMethodSelection(interaction) {
  try {
    const userId = interaction.user.id;
    const selectedValue = interaction.values[0];
    console.log(`[PAYMENT] User ${userId} selected payment method: ${selectedValue}`);
    
    // Extract payment method from the value
    if (selectedValue.startsWith('payment_')) {
      const method = selectedValue.replace('payment_', '');
      
      // Store the selected payment method in userData
      const userData = flowState.get(userId);
      
      if (!userData) {
        console.error(`[PAYMENT] No user data found for ${userId}`);
        return interaction.reply({
          content: 'Session data not found. Please try again.',
          ephemeral: true
        });
      }
      
      // Update payment method in user data
      switch (method) {
        case 'paypal':
          userData.paymentMethod = 'PayPal';
          break;
        case 'crypto':
          userData.paymentMethod = 'Crypto';
          // Redirect to crypto selection
          const { showCryptoSelection } = require('./ticketFlow');
          flowState.set(userId, userData);
          return showCryptoSelection(interaction);
        case 'iban':
          userData.paymentMethod = 'IBAN Bank Transfer';
          break;
        case 'paypal_giftcard':
          userData.paymentMethod = 'PayPal Giftcard';
          break;
        case 'dutch':
          userData.paymentMethod = 'Dutch Payment Methods';
          // Redirect to Dutch payment method selection
          const { showDutchPaymentMethodSelection } = require('./ticketFlow');
          flowState.set(userId, userData);
          return showDutchPaymentMethodSelection(interaction);
        case 'apple_giftcard':
          userData.paymentMethod = 'German Apple Giftcard';
          break;
        default:
          userData.paymentMethod = 'Unknown';
      }
      
      flowState.set(userId, userData);
      
      // If we got here, show price embed
      const { showPriceEmbed } = require('./ticketFlow');
      return showPriceEmbed(interaction);
    }
    
    // Handle purchase account payment methods
    if (selectedValue.startsWith('purchase_account_')) {
      const method = selectedValue.replace('purchase_account_', '');
      
      if (method === 'crypto') {
        // Show crypto selection for purchase accounts
        const { showPurchaseAccountCryptoSelection } = require('./ticketFlow');
        return showPurchaseAccountCryptoSelection(interaction);
      } else if (method === 'dutch') {
        // Show Dutch payment method selection for purchase accounts
        const { showPurchaseAccountDutchPaymentMethodSelection } = require('./ticketFlow');
        return showPurchaseAccountDutchPaymentMethodSelection(interaction);
      }
      
      // Store selection and show price information
      // Implement purchase account flow
    }
  } catch (error) {
    console.error(`[PAYMENT] Error handling payment method selection: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: 'An error occurred while processing your payment method selection. Please try again.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handles crypto type selection
 */
async function handleCryptoTypeSelection(interaction) {
  try {
    const userId = interaction.user.id;
    const selectedValue = interaction.values[0];
    console.log(`[PAYMENT] User ${userId} selected crypto type: ${selectedValue}`);
    
    // Extract crypto type from the value
    if (selectedValue.startsWith('crypto_')) {
      const cryptoType = selectedValue.replace('crypto_', '');
      
      // Store the selected crypto type in userData
      const userData = flowState.get(userId);
      
      if (!userData) {
        console.error(`[PAYMENT] No user data found for ${userId}`);
        return interaction.reply({
          content: 'Session data not found. Please try again.',
          ephemeral: true
        });
      }
      
      // Update crypto type in user data
      switch (cryptoType) {
        case 'litecoin':
          userData.cryptoType = 'Litecoin';
          break;
        case 'solana':
          userData.cryptoType = 'Solana';
          break;
        case 'bitcoin':
          userData.cryptoType = 'Bitcoin';
          break;
        case 'other':
          // Show 'other crypto' form
          const modal = new ModalBuilder()
            .setCustomId('modal_other_crypto')
            .setTitle('Other Crypto Currency');
          
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('crypto_coin')
                .setLabel('Crypto Coin')
                .setPlaceholder('The Crypto you will be sending')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
          
          userData.cryptoType = 'Other';
          flowState.set(userId, userData);
          
          return interaction.showModal(modal);
        default:
          userData.cryptoType = 'Unknown';
      }
      
      flowState.set(userId, userData);
      
      // If we got here, show price embed
      const { showPriceEmbed } = require('./ticketFlow');
      return showPriceEmbed(interaction);
    }
    
    // Handle purchase account crypto selection
    if (selectedValue.startsWith('purchase_account_crypto_')) {
      const cryptoType = selectedValue.replace('purchase_account_crypto_', '');
      
      // Store selection and show purchase account crypto information
      // Implement purchase account crypto flow
    }
  } catch (error) {
    console.error(`[PAYMENT] Error handling crypto type selection: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: 'An error occurred while processing your crypto type selection. Please try again.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handles Dutch payment method selection
 */
async function handleDutchPaymentSelection(interaction) {
  try {
    const userId = interaction.user.id;
    const selectedValue = interaction.values[0];
    console.log(`[PAYMENT] User ${userId} selected Dutch payment method: ${selectedValue}`);
    
    // Extract Dutch payment type from the value
    if (selectedValue.startsWith('dutch_')) {
      const dutchPaymentType = selectedValue.replace('dutch_', '');
      
      // Store the selected Dutch payment type in userData
      const userData = flowState.get(userId);
      
      if (!userData) {
        console.error(`[PAYMENT] No user data found for ${userId}`);
        return interaction.reply({
          content: 'Session data not found. Please try again.',
          ephemeral: true
        });
      }
      
      // Validate Bol.com giftcard is only for amounts under €100
      if (dutchPaymentType === 'bolcom') {
        const price = parseFloat(userData.price || 0);
        if (price >= 100) {
          return interaction.reply({
            content: 'Bol.com Giftcard is only available for amounts under €100. Please choose a different payment method.',
            ephemeral: true
          });
        }
      }
      
      // Update Dutch payment type in user data
      switch (dutchPaymentType) {
        case 'tikkie':
          userData.dutchPaymentType = 'Tikkie';
          break;
        case 'bolcom':
          userData.dutchPaymentType = 'Bol.com Giftcard';
          break;
        default:
          userData.dutchPaymentType = 'Unknown';
      }
      
      flowState.set(userId, userData);
      
      // If we got here, show price embed
      const { showPriceEmbed } = require('./ticketFlow');
      return showPriceEmbed(interaction);
    }
    
    // Handle purchase account Dutch payment selection
    if (selectedValue.startsWith('purchase_account_dutch_')) {
      const dutchPaymentType = selectedValue.replace('purchase_account_dutch_', '');

      // Get flow state to check price
      const userData = flowState.get(userId);
      
      // Validate Bol.com giftcard is only for amounts under €100 for purchase accounts too
      if (dutchPaymentType === 'bolcom' && userData) {
        const price = parseFloat(userData.price || 0);
        if (price >= 100) {
          return interaction.reply({
            content: 'Bol.com Giftcard is only available for amounts under €100. Please choose a different payment method.',
            ephemeral: true
          });
        }
      }
      
      // Store selection and show purchase account Dutch payment information
      // Implement purchase account Dutch payment flow
    }
  } catch (error) {
    console.error(`[PAYMENT] Error handling Dutch payment selection: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: 'An error occurred while processing your Dutch payment selection. Please try again.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handles the "purchase boost" button click
 */
async function handlePurchaseBoostClick(interaction) {
  try {
    const userId = interaction.user.id;
    console.log(`[PAYMENT] User ${userId} clicked purchase boost button`);
    
    // Get user data from flow state
    const userData = flowState.get(userId);
    
    if (!userData) {
      console.error(`[PAYMENT] No user data found for ${userId} during purchase`);
      return interaction.reply({
        content: 'Session data not found. Please restart the boost ordering process.',
        ephemeral: true
      });
    }
    
    // Check if payment method is selected
    if (!userData.paymentMethod) {
      return interaction.reply({
        content: 'Please select a payment method first.',
        ephemeral: true
      });
    }
    
    // Check if crypto payment method has selected a crypto type
    if (userData.paymentMethod === 'Crypto' && !userData.cryptoType) {
      return interaction.reply({
        content: 'Please select a specific cryptocurrency.',
        ephemeral: true
      });
    }
    
    // Check if Dutch payment method has selected a specific type
    if (userData.paymentMethod === 'Dutch Payment Methods' && !userData.dutchPaymentType) {
      return interaction.reply({
        content: 'Please select a specific Dutch payment method.',
        ephemeral: true
      });
    }
    
    // Validate price
    if (!userData.price || isNaN(parseFloat(userData.price)) || parseFloat(userData.price) <= 0) {
      return interaction.reply({
        content: 'Invalid price information. Please restart the ordering process.',
        ephemeral: true
      });
    }
    
    // Ensure price is formatted properly
    userData.price = parseFloat(userData.price).toFixed(2);
    
    // Create the ticket with order information
    const orderRecap = [];
    
    if (userData.type === 'ranked') {
      if (!userData.currentRank || !userData.desiredRank) {
        return interaction.reply({
          content: 'Missing rank information. Please restart the ordering process.',
          ephemeral: true
        });
      }
      orderRecap.push(['Current Rank', `\`${userData.formattedCurrentRank || `${userData.currentRank} ${userData.currentRankSpecific || ''}`}\``]);
      orderRecap.push(['Desired Rank', `\`${userData.formattedDesiredRank || `${userData.desiredRank} ${userData.desiredRankSpecific || ''}`}\``]);
    } else if (userData.type === 'bulk') {
      if (!userData.currentTrophies || !userData.desiredTrophies) {
        return interaction.reply({
          content: 'Missing trophy information. Please restart the ordering process.',
          ephemeral: true
        });
      }
      orderRecap.push(['Current Trophies', `\`${userData.currentTrophies}\``]);
      orderRecap.push(['Desired Trophies', `\`${userData.desiredTrophies}\``]);
    } else if (userData.type === 'mastery') {
      if (!userData.brawler || !userData.currentMastery || !userData.desiredMastery) {
        return interaction.reply({
          content: 'Missing mastery information. Please restart the ordering process.',
          ephemeral: true
        });
      }
      orderRecap.push(['Brawler', `\`${userData.brawler}\``]);
      orderRecap.push(['Current Mastery', `\`${userData.formattedCurrentMastery || `${userData.currentMastery} ${userData.currentMasterySpecific || ''}`}\``]);
      orderRecap.push(['Desired Mastery', `\`${userData.formattedDesiredMastery || `${userData.desiredMastery} ${userData.desiredMasterySpecific || ''}`}\``]);
    }
    
    // Add price and payment information
    orderRecap.push(['Price', `\`€${userData.price || 0}\``]);
    orderRecap.push(['Payment Method', `\`${userData.paymentMethod}\``]);
    
    // Add crypto type if applicable
    if (userData.paymentMethod === 'Crypto' && userData.cryptoType) {
      orderRecap.push(['Crypto Coin', `\`${userData.cryptoType}\``]);
    }
    
    // Add Dutch payment type if applicable
    if (userData.paymentMethod === 'Dutch Payment Methods' && userData.dutchPaymentType) {
      orderRecap.push(['Type of Payment', `\`${userData.dutchPaymentType}\``]);
    }
    
    // Confirm creation of ticket
    await interaction.reply({
      content: 'Creating your ticket with the order information...',
      ephemeral: true
    });
    
    try {
      // Create a ticket with the order recap
      const { createTicket } = require('../utils/ticketManager');
      const categoryId = 'order'; // Replace with the actual category ID or name
      
      // Attempt to create the ticket
      const ticketResult = await createTicket(interaction, categoryId, orderRecap);
      
      // Check if ticket creation was successful
      if (!ticketResult) {
        console.error(`[PAYMENT] Failed to create ticket for user ${userId}`);
        return interaction.followUp({
          content: 'There was an error creating your ticket. Please try again or contact staff.',
          ephemeral: true
        });
      }
      
      // Store ticket information for later use
      const ticketChannelId = ticketResult.id;
      const price = parseFloat(userData.price || 0);
      
      // Inform the user that the ticket was created successfully
      await interaction.followUp({
        content: `Your ticket has been created successfully! Please check <#${ticketChannelId}>.`,
        ephemeral: true
      });
      
      // Add a delay to ensure ticket is ready
      setTimeout(async () => {
        try {
          console.log(`[PAYMENT] Setting up payment in channel ${ticketChannelId} for user ${userId}`);
          const channel = await interaction.client.channels.fetch(ticketChannelId);
          if (!channel) {
            console.error(`[PAYMENT] Could not fetch channel ${ticketChannelId}`);
            return;
          }
          
          // Send payment information based on payment method
          const payments = require('../../ticketPayments');
          
          switch (userData.paymentMethod) {
            case 'PayPal':
              await payments.sendPayPalTermsEmbed(channel, userId);
              break;
            case 'Crypto':
              switch (userData.cryptoType) {
                case 'Litecoin':
                  await payments.sendLitecoinEmbed(channel, userId, price);
                  break;
                case 'Solana':
                  await payments.sendSolanaEmbed(channel, userId, price);
                  break;
                case 'Bitcoin':
                  await payments.sendBitcoinEmbed(channel, userId);
                  break;
                default:
                  // Handle other crypto or unknown types
                  await channel.send(`Please specify which crypto you'd like to use for payment.`);
                  // Ping staff about specific crypto type requested
                  await channel.send(`<@658351335967686659> User requested payment with ${userData.cryptoType}.`);
              }
              break;
            case 'IBAN Bank Transfer':
              await payments.sendIbanEmbed(channel, userId);
              break;
            case 'PayPal Giftcard':
              await payments.sendPayPalGiftcardEmbed(channel, userId);
              break;
            case 'German Apple Giftcard':
              await payments.sendAppleGiftcardEmbed(channel, userId);
              break;
            case 'Dutch Payment Methods':
              if (userData.dutchPaymentType === 'Tikkie') {
                await payments.sendTikkieEmbed(channel, userId);
              } else if (userData.dutchPaymentType === 'Bol.com Giftcard') {
                await payments.sendBolGiftcardEmbed(channel, userId);
              } else {
                await channel.send(`<@658351335967686659> User selected Dutch payment method but didn't specify which one.`);
              }
              break;
            default:
              await channel.send(`<@658351335967686659> Please help set up payment for ${userData.paymentMethod}.`);
          }
          
          console.log(`[PAYMENT] Successfully sent payment information to ticket ${ticketChannelId}`);
        } catch (error) {
          console.error(`[PAYMENT] Error sending payment information to ticket: ${error.message}`);
          console.error(error.stack);
          
          // Try to notify in the ticket channel if possible
          try {
            const channel = await interaction.client.channels.fetch(ticketChannelId);
            if (channel) {
              await channel.send(`<@658351335967686659> There was an error setting up payment information. Please help this user.`);
            }
          } catch (notifyError) {
            console.error(`[PAYMENT] Failed to notify about error: ${notifyError.message}`);
          }
        }
      }, 3000); // Give Discord 3 seconds to fully create the channel
      
      // Clean up flow state
      flowState.delete(userId);
      console.log(`[PAYMENT] Completed purchase flow for user ${userId}`);
      
    } catch (ticketError) {
      console.error(`[PAYMENT] Critical error creating ticket: ${ticketError.message}`);
      console.error(ticketError.stack);
      
      return interaction.followUp({
        content: 'There was an error creating your ticket. Please try again or contact staff.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(`[PAYMENT] Error handling purchase boost click: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      return interaction.reply({
        content: 'An error occurred while processing your purchase. Please try again or contact staff.',
        ephemeral: true
      });
    } else {
      return interaction.followUp({
        content: 'An error occurred while processing your purchase. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handles other crypto form submission
 */
async function handleOtherCryptoModal(interaction) {
  try {
    const userId = interaction.user.id;
    const cryptoCoin = interaction.fields.getTextInputValue('crypto_coin').trim();
    console.log(`[PAYMENT] User ${userId} submitted other crypto: ${cryptoCoin}`);
    
    // Store in userData
    const userData = flowState.get(userId);
    
    if (!userData) {
      console.error(`[PAYMENT] No user data found for ${userId}`);
      return interaction.reply({
        content: 'Session data not found. Please try again.',
        ephemeral: true
      });
    }
    
    // Validate input
    if (!cryptoCoin) {
      return interaction.reply({
        content: 'Please enter a valid cryptocurrency name.',
        ephemeral: true
      });
    }
    
    // Set the crypto type
    userData.cryptoType = cryptoCoin;
    flowState.set(userId, userData);
    
    // We need to respond to the modal first
    await interaction.reply({
      content: `You selected ${cryptoCoin} as your cryptocurrency.`,
      ephemeral: true
    });
    
    // Automatic price calculation and display
    try {
      // Import showPriceEmbed
      const { showPriceEmbed } = require('./ticketFlow');
      
      // Create a wrapped interaction object for followUp
      const wrappedInteraction = {
        ...interaction,
        deferred: false,
        replied: true,
        update: async (options) => {
          return await interaction.followUp({
            ...options,
            ephemeral: true
          });
        },
        editReply: async (options) => {
          return await interaction.followUp({
            ...options,
            ephemeral: true
          });
        }
      };
      
      // Show price embed automatically
      await showPriceEmbed(wrappedInteraction);
    } catch (priceError) {
      console.error(`[PAYMENT] Error showing price after crypto selection: ${priceError.message}`);
      console.error(priceError.stack);
      
      // Send a more informative message if price calculation fails
      await interaction.followUp({
        content: 'There was an error calculating the price with your selected cryptocurrency. Please click the "Purchase Boost" button when you\'re ready to proceed, or select a different payment method.',
        ephemeral: true
      });
      
      // Ping support in server logs or a dedicated channel
      try {
        // This could be a dedicated logging channel
        const logChannel = await interaction.client.channels.fetch('LOGS_CHANNEL_ID');
        if (logChannel) {
          await logChannel.send(`Error calculating price for user ${userId} with crypto ${cryptoCoin}: ${priceError.message}`);
        }
      } catch (logError) {
        console.error(`[PAYMENT] Failed to log price calculation error: ${logError.message}`);
      }
    }
  } catch (error) {
    console.error(`[PAYMENT] Error handling other crypto form: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      return interaction.reply({
        content: 'An error occurred while processing your crypto selection. Please try again.',
        ephemeral: true
      });
    } else {
      return interaction.followUp({
        content: 'An error occurred while processing your crypto selection. Please try again.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handles Send Again button for expired crypto payments
 */
async function handleSendAgainCrypto(interaction) {
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    // Extract crypto type and price from the button customId
    // Format: send_again_${coinType}_${price}
    const parts = customId.split('_');
    if (parts.length < 3) {
      console.error(`[PAYMENT] Invalid send_again button format: ${customId}`);
      return interaction.reply({
        content: 'An error occurred. Please contact staff for assistance.',
        ephemeral: true
      });
    }
    
    const coinType = parts[2];
    let price = 0;
    
    // Bitcoin doesn't include the price in the button ID
    if (parts.length >= 4 && coinType !== 'btc') {
      price = parseFloat(parts[3]);
    }
    
    console.log(`[PAYMENT] User ${userId} clicked send again for ${coinType} payment ${price ? 'of €' + price : ''}`);
    
    // Validate price for non-BTC payments
    if (coinType !== 'btc' && (!price || isNaN(price) || price <= 0)) {
      console.error(`[PAYMENT] Invalid price format in send_again button: ${parts[3]}`);
      return interaction.reply({
        content: 'Invalid price information. Please contact staff for assistance.',
        ephemeral: true
      });
    }
    
    // Acknowledge the interaction
    await interaction.reply({
      content: 'Generating new payment information...',
      ephemeral: true
    });
    
    // Get original message to reply to
    const message = interaction.message;
    
    // Try to delete the failed payment embed
    try {
      await message.delete();
    } catch (deleteError) {
      console.error(`[PAYMENT] Error deleting failed payment message: ${deleteError.message}`);
    }
    
    // Import payment functions
    const payments = require('../../ticketPayments');
    
    // Generate new payment info based on crypto type
    switch (coinType) {
      case 'ltc':
        await payments.resendLitecoinEmbed(interaction, userId, price);
        break;
      case 'sol':
        await payments.resendSolanaEmbed(interaction, userId, price);
        break;
      case 'btc':
        await payments.resendBitcoinEmbed(interaction, userId);
        break;
      default:
        await interaction.followUp({
          content: `Unsupported cryptocurrency type: ${coinType}. Please contact staff for assistance.`,
          ephemeral: true
        });
    }
  } catch (error) {
    console.error(`[PAYMENT] Error handling send again click: ${error.message}`);
    console.error(error.stack);
    
    return interaction.reply({
      content: 'An error occurred while regenerating payment information. Please contact staff for assistance.',
      ephemeral: true
    }).catch(() => {
      // If the reply fails, try followUp
      interaction.followUp({
        content: 'An error occurred while regenerating payment information. Please contact staff for assistance.',
        ephemeral: true
      }).catch(e => console.error('[PAYMENT] Failed to send error message:', e));
    });
  }
}

module.exports = {
  handlePaymentMethodSelection,
  handleCryptoTypeSelection,
  handleDutchPaymentSelection,
  handlePurchaseBoostClick,
  handleOtherCryptoModal,
  handleSendAgainCrypto
}; 