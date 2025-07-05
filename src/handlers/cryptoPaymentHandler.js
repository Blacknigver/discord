// Crypto payment handler
const { 
  handleCryptoPaymentCompleted, 
  createCryptoTxForm, 
  verifyCryptoTransaction,
  sendCryptoWaitingEmbed,
  sendPaymentConfirmationEmbedWithCountdown,
  sendInsufficientAmountEmbed
} = require('../../ticketPayments.js');
const { activeCryptoPayments } = require('../../ticketPayments.js');

// Handle crypto button interactions
async function handleCryptoButtons(interaction) {
  try {
    const customId = interaction.customId;
    
    // Handle crypto payment completed buttons
    if (customId === 'payment_completed_btc') {
      return handleCryptoPaymentCompleted(interaction, 'btc');
    } else if (customId === 'payment_completed_ltc') {
      return handleCryptoPaymentCompleted(interaction, 'ltc');
    } else if (customId === 'payment_completed_sol') {
      return handleCryptoPaymentCompleted(interaction, 'sol');
    }
    
    // Handle copy address/amount buttons
    if (customId.startsWith('copy_')) {
      const parts = customId.split('_');
      const coinType = parts[1];
      const what = parts[2]; // 'address' or 'amount'
      
      return handleCryptoCopy(interaction, coinType, what);
    }
    
    console.warn(`[CRYPTO_HANDLER] Unhandled crypto button: ${customId}`);
    return false;
  } catch (error) {
    console.error(`[CRYPTO_HANDLER] Error handling crypto button: ${error.message}`);
    console.error(error.stack);
    
    try {
      await interaction.reply({
        content: 'An error occurred processing your request. Please try again or contact staff.',
        ephemeral: true
      });
    } catch (replyError) {
      console.error(`[CRYPTO_HANDLER] Error replying to interaction: ${replyError.message}`);
    }
    
    return false;
  }
}

// Handle copy buttons for crypto addresses and amounts
async function handleCryptoCopy(interaction, coinType, what) {
  try {
    await interaction.deferUpdate();
    
    let copyText = '';
    const messageId = interaction.message.id;
    
    if (what === 'address') {
      // Get the wallet address for this coin type
      const { CRYPTO_WALLET_ADDRESSES } = require('../../src/constants');
      copyText = CRYPTO_WALLET_ADDRESSES[coinType.toLowerCase()];
    } else if (what === 'amount') {
      // Get the amount to copy from the message's stored data
      copyText = interaction.message.cryptoAmountToCopy;
    }
    
    if (!copyText) {
      await interaction.followUp({
        content: `Failed to get ${what} to copy. Please try again or contact staff.`,
        ephemeral: true
      });
      return false;
    }
    
    await interaction.followUp({
      content: `${what.charAt(0).toUpperCase() + what.slice(1)} copied: \`${copyText}\``,
      ephemeral: true
    });
    
    return true;
  } catch (error) {
    console.error(`[CRYPTO_HANDLER] Error handling copy: ${error.message}`);
    console.error(error.stack);
    
    try {
      await interaction.followUp({
        content: 'An error occurred copying the information. Please try again.',
        ephemeral: true
      });
    } catch (replyError) {
      console.error(`[CRYPTO_HANDLER] Error following up: ${replyError.message}`);
    }
    
    return false;
  }
}

// Handle crypto transaction form submission
async function handleCryptoTxFormSubmit(interaction) {
  try {
    await interaction.deferReply();
    
    // Extract coinType from the customId (format: crypto_tx_form_[cointype])
    const customId = interaction.customId;
    const coinType = customId.split('_').pop();
    
    if (!coinType) {
      console.error(`[CRYPTO_TX] Could not extract coin type from ${customId}`);
      return interaction.editReply('An error occurred processing your transaction. Please contact staff.');
    }
    
    console.log(`[CRYPTO_TX] Processing ${coinType} transaction form for ${interaction.user.id}`);
    
    // Get the transaction ID from the form
    const txId = interaction.fields.getTextInputValue('tx_id').trim();
    
    if (!txId) {
      return interaction.editReply('Please provide a valid transaction ID.');
    }
    
    // Get the price info from the original message (stored on activeCryptoPayments)
    const paymentInfo = activeCryptoPayments.get(interaction.channel.id);
    const expectedPrice = paymentInfo?.price || 0;
    
    console.log(`[CRYPTO_TX] Verifying transaction ${txId} for amount €${expectedPrice}`);
    
    // Send waiting message
    await sendCryptoWaitingEmbed(interaction, coinType);
    
    // Verify the transaction
    const verificationResult = await verifyCryptoTransaction(txId, coinType, expectedPrice, interaction.channel);
    
    if (verificationResult.verified) {
      // Success - send confirmation and remove from active payments
      await sendPaymentConfirmationEmbedWithCountdown(interaction, coinType);
      activeCryptoPayments.delete(interaction.channel.id);
    } else {
      // Failed - handle different failure reasons
      if (verificationResult.reason === 'ALREADY_USED') {
        await interaction.followUp({
          content: `⚠️ This transaction ID has already been used. Please provide a different transaction or contact staff.`,
          ephemeral: true
        });
      } else if (verificationResult.reason === 'INSUFFICIENT_AMOUNT') {
        await sendInsufficientAmountEmbed(interaction.channel, coinType);
      } else {
        // Generic failure
        await interaction.followUp({
          content: `⚠️ Transaction verification failed. Reason: ${verificationResult.reason}. Please try again or contact staff.`,
          ephemeral: true
        });
      }
    }
  } catch (error) {
    console.error(`[CRYPTO_TX] Error processing transaction form: ${error.message}`);
    console.error(error.stack);
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'An error occurred while verifying your transaction. Please contact staff for assistance.',
        ephemeral: true
      }).catch(console.error);
    } else {
      await interaction.reply({
        content: 'An error occurred while verifying your transaction. Please contact staff for assistance.',
        ephemeral: true
      }).catch(console.error);
    }
  }
}

module.exports = {
  handleCryptoButtons,
  handleCryptoCopy,
  handleCryptoTxFormSubmit
}; 