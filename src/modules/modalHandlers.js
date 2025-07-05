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

// Handle mastery brawler form submission
async function handleMasteryBrawlerModal(interaction) {
  const brawler = interaction.fields.getTextInputValue('brawler_name').trim();

  // Store data and show current mastery selection
  const userData = flowState.get(interaction.user.id);
  if (userData) {
    userData.brawler = brawler;
    userData.step = 'current_mastery';
    flowState.set(interaction.user.id, userData);

    const embed = new djs.EmbedBuilder()
      .setTitle('Current Mastery')
      .setDescription('Please select your current mastery below.')
      .setColor(EMBED_COLOR);

    const row = new djs.ActionRowBuilder().addComponents(
      new djs.ButtonBuilder()
        .setCustomId('mastery_Bronze')
        .setLabel('Bronze')
        .setEmoji('<:mastery_bronze:1357487786394914847>')
        .setStyle(djs.ButtonStyle.Danger),
      new djs.ButtonBuilder()
        .setCustomId('mastery_Silver')
        .setLabel('Silver')
        .setEmoji('<:mastery_silver:1357487832481923153>')
        .setStyle(djs.ButtonStyle.Primary),
      new djs.ButtonBuilder()
        .setCustomId('mastery_Gold')
        .setLabel('Gold')
        .setEmoji('<:mastery_gold:1357487865029722254>')
        .setStyle(djs.ButtonStyle.Success)
    );

    if (!djs.InteractionResponseFlags) {
      console.error("[MODAL_HANDLERS_DEBUG] djs.InteractionResponseFlags is UNDEFINED before reply in handleMasteryBrawlerModal");
    } else if (typeof djs.InteractionResponseFlags.Ephemeral === 'undefined') {
      console.error("[MODAL_HANDLERS_DEBUG] djs.InteractionResponseFlags.Ephemeral is UNDEFINED. Flags object:", djs.InteractionResponseFlags);
    } else {
      console.log("[MODAL_HANDLERS_DEBUG] djs.InteractionResponseFlags.Ephemeral IS DEFINED. Value:", djs.InteractionResponseFlags.Ephemeral);
    }

    return interaction.reply({ embeds: [embed], components: [row], flags: InteractionResponseFlags_Ephemeral });
  }
}

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
    const currentTrophies = parseInt(interaction.fields.getTextInputValue('current_trophies').trim());
    const desiredTrophies = parseInt(interaction.fields.getTextInputValue('desired_trophies').trim());
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
    
    // Calculate price directly - Simple trophies are priced at €0.10 per trophy
    const trophyCount = desiredTrophies - currentTrophies;
    const price = (trophyCount * 0.1).toFixed(2);
    
    // Store the data in flowState
    flowState.set(interaction.user.id, {
      type: 'trophies',
      brawler: brawlerName,
      brawlerLevel: brawlerLevel,
      currentTrophies,
      desiredTrophies,
      price,
      step: 'payment_method',
      timestamp: Date.now()
    });
    
    console.log(`[TROPHIES] Stored trophy data for ${interaction.user.id}: ${brawlerName}, level ${brawlerLevel}, ${currentTrophies} → ${desiredTrophies}, price €${price}`);
    
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
  handleMasteryBrawlerModal,
  handleOtherRequestModal,
  handleCryptoTxForm,
  modalHandlers: {
    'crypto_tx_form_ltc': handleCryptoTxForm,
    'crypto_tx_form_sol': handleCryptoTxForm,
    'crypto_tx_form_btc': handleCryptoTxForm,
    'modal_trophies_start': handleTrophiesStartModal,
    'modal_bulk_trophies': handleBulkTrophiesModal,
    'modal_mastery_brawler': handleMasteryBrawlerModal,
    'modal_other_request': handleOtherRequestModal
  }
}; 