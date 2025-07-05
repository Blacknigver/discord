const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { EMBED_COLOR, EMOJIS, PAYMENT_METHODS, PAYMENT_STAFF } = require('../constants');
const { 
  showCryptoSelection, 
  showDutchPaymentMethodSelection, 
  sendPaymentConfirmationEmbed
} = require('../../ticketPayments');

/**
 * Handle payment method selection buttons
 */
const paymentMethodButtonHandlers = {
  'payment_paypal': async (interaction) => {
    await sendPaymentConfirmationEmbed(interaction.channel, 'paypal');
    await interaction.deferUpdate();
  },
  
  'payment_crypto': async (interaction) => {
    await showCryptoSelection(interaction);
  },
  
  'payment_iban': async (interaction) => {
    await sendPaymentConfirmationEmbed(interaction.channel, 'iban');
    await interaction.deferUpdate();
  },
  
  'payment_paypal_giftcard': async (interaction) => {
    await sendPaymentConfirmationEmbed(interaction.channel, 'paypal_giftcard');
    await interaction.deferUpdate();
  },
  
  'payment_apple_giftcard': async (interaction) => {
    await sendPaymentConfirmationEmbed(interaction.channel, 'apple_giftcard');
    await interaction.deferUpdate();
    
    // Send and delete ping (appears as "Someone pinged everyone...")
    try {
      const pingMsg = await interaction.channel.send(`<@&${PAYMENT_STAFF.APPLE_GIFTCARD_STAFF}> <@${PAYMENT_STAFF.APPLE_GIFTCARD_VERIFIER}>`);
      setTimeout(() => {
        pingMsg.delete().catch(() => {});
      }, 1000);
    } catch (error) {
      console.error('Error sending ping message:', error);
    }
  },
  
  'payment_dutch': async (interaction) => {
    // Try to extract price from the ticket
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
    
    await showDutchPaymentMethodSelection(interaction, price);
  },
  
  'payment_paypal_account': async (interaction) => {
    try {
      // For accounts, just ping the staff and don't show PayPal info
      await interaction.deferUpdate();
      
      const pingMsg = await interaction.channel.send(`<@${PAYMENT_STAFF.IBAN_VERIFIER}>`);
      setTimeout(() => {
        pingMsg.delete().catch(() => {});
      }, 100);
    } catch (error) {
      console.error('Error handling PayPal account payment:', error);
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
 * Handle Dutch payment method selection buttons
 */
const dutchButtonHandlers = {
  'dutch_tikkie': async (interaction) => {
    await sendPaymentConfirmationEmbed(interaction.channel, 'dutch', 'tikkie');
    await interaction.deferUpdate();
  },
  
  'dutch_bolcom': async (interaction) => {
    await sendPaymentConfirmationEmbed(interaction.channel, 'dutch', 'bolcom');
    await interaction.deferUpdate();
    
    // Send and delete ping
    try {
      const pingMsg = await interaction.channel.send(`<@${PAYMENT_STAFF.IBAN_VERIFIER}>`);
      setTimeout(() => {
        pingMsg.delete().catch(() => {});
      }, 100);
    } catch (error) {
      console.error('Error sending ping message:', error);
    }
  }
};

/**
 * Handle copy button interactions
 */
const copyButtonHandlers = {
  'copy_paypal_email': async (interaction) => {
    await interaction.reply({
      content: PAYMENT_METHODS.PAYPAL.email,
      ephemeral: true
    });
  },
  
  'copy_iban': async (interaction) => {
    await interaction.reply({
      content: PAYMENT_METHODS.IBAN.account,
      ephemeral: true
    });
  },
  
  'copy_tikkie_link': async (interaction) => {
    await interaction.reply({
      content: PAYMENT_METHODS.TIKKIE.link,
      ephemeral: true
    });
  }
};

/**
 * Handle payment method selection dropdown
 */
const paymentMethodSelectHandler = async (interaction) => {
  try {
    const selectedValue = interaction.values[0];
    
    // Clear any existing messages/components
    await interaction.update({ components: [] });
    
    // Handle different payment methods
    switch (selectedValue) {
      case 'payment_paypal':
        // Show PayPal terms of service
        const userId = interaction.user.id;
        const { sendPayPalTermsEmbed } = require('../../ticketPayments');
        await sendPayPalTermsEmbed(interaction.message, userId);
        break;
        
      case 'payment_crypto':
        // Show crypto selection menu
        await showCryptoSelection(interaction);
        break;
        
      case 'payment_iban':
        // Show IBAN information
        const { sendIbanEmbed } = require('../../ticketPayments');
        await sendIbanEmbed(interaction.message, interaction.user.id);
        break;
        
      case 'payment_paypal_giftcard':
        // Show PayPal giftcard information
        const { sendPayPalGiftcardEmbed } = require('../../ticketPayments');
        await sendPayPalGiftcardEmbed(interaction.message, interaction.user.id);
        break;
        
      case 'payment_dutch':
        // Show Dutch payment methods
        // Extract price if available from the message
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
        
        await showDutchPaymentMethodSelection(interaction, price);
        break;
        
      case 'payment_apple_giftcard':
        // Show Apple giftcard information
        const { sendAppleGiftcardEmbed } = require('../../ticketPayments');
        await sendAppleGiftcardEmbed(interaction.message, interaction.user.id);
        break;
        
      case 'payment_paypal_account':
        // Just ping staff for PayPal account payments
        const mentionMessage = await interaction.channel.send('<@658351335967686659>');
        setTimeout(() => mentionMessage.delete().catch(e => console.error('Error deleting message:', e)), 100);
        
        await interaction.update({ content: 'Staff has been notified about your PayPal payment request.' });
        break;
    }
  } catch (error) {
    console.error('[PAYMENT] Error handling payment method selection:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred processing your payment method selection. Please try again.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle Dutch payment method selection dropdown
 */
const dutchMethodSelectHandler = async (interaction) => {
  try {
    const selectedValue = interaction.values[0];
    
    // Clear any existing messages/components
    await interaction.update({ components: [] });
    
    const userId = interaction.user.id;
    const { sendTikkieEmbed, sendBolGiftcardEmbed } = require('../../ticketPayments');
    
    // Handle different Dutch payment methods
    switch (selectedValue) {
      case 'dutch_tikkie':
        await sendTikkieEmbed(interaction.message, userId);
        break;
        
      case 'dutch_bolcom':
        await sendBolGiftcardEmbed(interaction.message, userId);
        break;
    }
  } catch (error) {
    console.error('[PAYMENT] Error handling Dutch payment method selection:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred processing your payment method selection. Please try again.',
        ephemeral: true
      });
    }
  }
};

// Combine all payment method handlers
const paymentMethodHandlers = {
  ...paymentMethodButtonHandlers,
  ...dutchButtonHandlers,
  ...copyButtonHandlers,
  'payment_method_select': paymentMethodSelectHandler,
  'dutch_method_select': dutchMethodSelectHandler
};

module.exports = {
  paymentMethodHandlers
}; 