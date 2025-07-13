const djs = require('discord.js');
const { flowState } = require('./ticketFlow');
const { showPaymentMethodSelection } = require('./ticketFlow');
const { verifyCryptoTransaction, sendCryptoWaitingEmbed, sendCryptoStillWaitingEmbed, sendInsufficientAmountEmbed, sendBoostAvailableEmbed } = require('../../ticketPayments');
const { calculateTrophyPrice } = require('../../utils');
const { EMBED_COLOR } = require('../../config.js');

const InteractionResponseFlags_Ephemeral = 1 << 6;

// Handle bulk trophies form submission
async function handleBulkTrophiesModal(interaction) {
  const currentTrophies = interaction.fields.getTextInputValue('current_trophies').trim();
  const desiredTrophies = interaction.fields.getTextInputValue('desired_trophies').trim();

  // Validate input
  const current = parseInt(currentTrophies);
  const desired = parseInt(desiredTrophies);

  if (isNaN(current) || isNaN(desired) || desired <= current) {
    return interaction.reply({
      content: 'Invalid input. Please make sure your desired trophies are higher than your current trophies.',
      flags: InteractionResponseFlags_Ephemeral
    });
  }

  // Store data and show payment method selection
  const userData = flowState.get(interaction.user.id);
  if (userData) {
    userData.currentTrophies = current;
    userData.desiredTrophies = desired;
    flowState.set(interaction.user.id, userData);
    return showPaymentMethodSelection(interaction);
  }
}

// Handle mastery brawler form submission - REMOVED (feature disabled)
// The mastery feature has been removed from Brawl Stars

// Handle other request form submission
async function handleOtherRequestModal(interaction) {
  const request = interaction.fields.getTextInputValue('other_request').trim();

  // Store data and show payment method selection
  const userData = flowState.get(interaction.user.id);
  if (userData) {
    userData.request = request;
    flowState.set(interaction.user.id, userData);
    return showPaymentMethodSelection(interaction);
  }
}

/**
 * Handle crypto transaction verification form submission
 * @param {ModalSubmitInteraction} interaction - The interaction object
 * @param {string} cryptoType - The type of cryptocurrency (ltc, sol, btc)
 */
async function handleCryptoTxForm(interaction, cryptoType = '') {
  try {
    // Use the crypto type from the modal ID if not provided
    if (!cryptoType && interaction.customId.startsWith('crypto_tx_form_')) {
      cryptoType = interaction.customId.replace('crypto_tx_form_', '');
    }
    
    console.log(`[CRYPTO_TX] Processing transaction form for ${cryptoType}`);
    
    // Get the transaction ID from the form
    const txId = interaction.fields.getTextInputValue('crypto_txid');
    
    if (!txId) {
      return interaction.reply({
        content: 'Please enter a valid transaction ID.',
        ephemeral: true
      });
    }
    
    // Acknowledge the submission
    await interaction.deferReply({ ephemeral: true });
    
    // Process the transaction (can be implemented later with actual verification)
    await interaction.editReply({
      content: `Thank you for submitting your transaction ID. Our staff will verify the payment shortly.`,
        ephemeral: true
      });
    
    // Notify staff about the transaction
    const embed = new djs.EmbedBuilder()
      .setTitle('Transaction Verification Needed')
      .setColor(EMBED_COLOR)
      .setDescription(`User <@${interaction.user.id}> has submitted a transaction ID for verification.\n\nPlease verify this transaction.`)
      .addFields(
        { name: 'Cryptocurrency', value: `${cryptoType.toUpperCase()}` },
        { name: 'Transaction ID', value: `\`${txId}\`` }
      );
    
    // Mention staff and send the embed
    await interaction.channel.send({
      content: `<@&1329510418654744617>`,
      embeds: [embed]
    });
    
    console.log(`[CRYPTO_TX] Transaction form processed for ${cryptoType}, TX ID: ${txId}`);
  } catch (error) {
    console.error(`[CRYPTO_TX] Error handling transaction form: ${error.message}`);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing your submission. Please try again later or contact support.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: 'An error occurred while processing your submission. Please try again later or contact support.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[CRYPTO_TX] Error sending error message: ${replyError.message}`);
    }
  }
}

// Handle trophies start modal submission
async function handleTrophiesStartModal(interaction) {
  try {
    const brawlerName = interaction.fields.getTextInputValue('brawler_name').trim();
    const currentTrophies = parseInt(interaction.fields.getTextInputValue('brawler_current').trim());
    const desiredTrophies = parseInt(interaction.fields.getTextInputValue('brawler_desired').trim());
    const brawlerLevel = interaction.fields.getTextInputValue('brawler_level')?.trim() || '';
    
    // Validate inputs
    if (isNaN(currentTrophies) || isNaN(desiredTrophies)) {
      return interaction.reply({
        content: 'Please enter valid numbers for trophy counts.',
        flags: InteractionResponseFlags_Ephemeral
      });
    }
    
    if (currentTrophies >= desiredTrophies) {
      return interaction.reply({
        content: 'The desired trophy count must be higher than the current trophy count.',
        flags: InteractionResponseFlags_Ephemeral
      });
    }
    
    // Validate and parse brawler level
    let powerLevel = null;
    if (brawlerLevel) {
      powerLevel = parseInt(brawlerLevel);
      if (isNaN(powerLevel) || powerLevel < 1) {
        return interaction.reply({
          content: 'Please enter a valid power level (1-11).',
          flags: InteractionResponseFlags_Ephemeral
        });
      }
    }
    
    // Calculate price using trophy price calculator with power level multiplier
    const price = calculateTrophyPrice(currentTrophies, desiredTrophies, powerLevel);
    
    console.log(`[TROPHIES_MODAL] Calculated price: €${price} for ${currentTrophies} -> ${desiredTrophies}, power level ${powerLevel}`);
    
    // Calculate power level multiplier for display purposes
    let powerLevelMultiplier = 1.0;
    let basePrice = price;
    
    if (powerLevel !== null && powerLevel !== undefined) {
      const { calculateTrophyPowerLevelMultiplier } = require('../../utils');
      powerLevelMultiplier = calculateTrophyPowerLevelMultiplier(desiredTrophies, powerLevel);
      basePrice = price / powerLevelMultiplier;
      console.log(`[TROPHIES_MODAL] Base price: €${basePrice.toFixed(2)}, multiplier: ${powerLevelMultiplier}x, final: €${price.toFixed(2)}`);
    }
    
    // Get existing flow state or create new one, preserving discount flags
    let userData = flowState.get(interaction.user.id) || {};
    
    // Store the data in flowState while preserving existing flags
    userData = {
      ...userData, // Preserve existing data including hasDiscount, discountClaimed
      type: 'trophies',
      brawler: brawlerName,
      brawlerLevel: brawlerLevel,
      powerLevel: powerLevel,
      currentTrophies,
      desiredTrophies,
      price: price.toFixed(2),
      basePrice: basePrice.toFixed(2),
      powerLevelMultiplier: powerLevelMultiplier,
      step: 'payment_method',
      timestamp: Date.now()
    };
    
    flowState.set(interaction.user.id, userData);
    
    console.log(`[TROPHIES] Stored trophy data for ${interaction.user.id}: ${brawlerName}, level ${brawlerLevel}, ${currentTrophies} → ${desiredTrophies}, price €${price}, hasDiscount: ${userData.hasDiscount}`);
    
    // Show payment method selection - will create a new ephemeral message
    return showPaymentMethodSelection(interaction);
  } catch (error) {
    console.error('Error handling trophies start modal:', error);
    return interaction.reply({
      content: 'There was an error processing your request. Please try again later.',
      flags: InteractionResponseFlags_Ephemeral
    });
  }
}

module.exports = {
  handleTrophiesStartModal,
  handleBulkTrophiesModal,
  handleOtherRequestModal,
  handleCryptoTxForm,
  modalHandlers: {
    'crypto_tx_form_ltc': handleCryptoTxForm,
    'crypto_tx_form_sol': handleCryptoTxForm,
    'crypto_tx_form_btc': handleCryptoTxForm,
    'modal_trophies_start': handleTrophiesStartModal,
    'modal_bulk_trophies': handleBulkTrophiesModal,
    'modal_other_request': handleOtherRequestModal
  }
}; 