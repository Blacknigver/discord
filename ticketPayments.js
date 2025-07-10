// Ticket payment method handling
const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { EMBED_COLOR } = require('./config');
const { fetchCryptoPrice, convertEuroToCrypto } = require('./src/utils/helpers');
const { flowState } = require('./src/modules/ticketFlow'); // Import flowState
const { 
  CRYPTO_WALLET_ADDRESSES,
  PAYMENT_METHODS,
  EMOJIS,
  PAYMENT_STAFF,
  ROLE_IDS
} = require('./src/constants');

// Define colors
const DEFAULT_EMBED_COLOR = '#e68df2';
const PAYPAL_BLUE_COLOR = '#0079C1';

// Track active crypto payments with their timeout IDs
const activeCryptoPayments = new Map();

// Track used transaction IDs to prevent reuse
const usedTransactionIds = new Set();

// Create order information embed
async function createOrderInformationEmbed(orderDetails) {
  return new EmbedBuilder()
    .setTitle('Order Information')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(orderDetails.description || '')
    .addFields(orderDetails.fields || []);
}

// Welcome embed for new tickets
async function sendWelcomeEmbed(channel, userId) {
  const ownerRoleId = ROLE_IDS && ROLE_IDS.OWNER ? ROLE_IDS.OWNER : '1292933200389083196';
  const adminRoleId = ROLE_IDS && ROLE_IDS.ADMIN ? ROLE_IDS.ADMIN : '1292933924116500532';
  const welcomeEmbed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.\n\nIf there is any more details or information you would like to share, feel free to do so!');
  
  const closeButtonEmoji = EMOJIS.LOCK ? EMOJIS.LOCK : '<:Lock:1349157009244557384>';
  const closeBtnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setEmoji(closeButtonEmoji)
      .setStyle(ButtonStyle.Danger)
  );
  
  return await channel.send({ 
    content: `<@${userId}> <@&${ownerRoleId}> <@&${adminRoleId}>`, 
    embeds: [welcomeEmbed], 
    components: [closeBtnRow] 
  });
}

// PayPal Terms of Service embed
async function sendPayPalTermsEmbed(ticketChannel, userId, options = {}) {
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';
  const crossEmoji = EMOJIS.CROSS ? EMOJIS.CROSS : '<:cross:1351689463453061130>';
  const supportEmoji = '<:Support:1382066889873686608>';

  const termsDescription = 
    `> ${EMOJIS.SHIELD}[+] If our PayPal Account gets locked, you will have to wait for us to unlock it, if we fail to unlock it no product or refund will be given.\n` +
    `> ${EMOJIS.SHIELD}[+] We will not be covering any transaction fees.\n` +
    `> ${EMOJIS.SHIELD}[+] Send **Friends and Family** ONLY - Goods and Services is __Strictly Forbidden__\n` +
    `> ${EMOJIS.SHIELD}[+] Send from **PayPal Balance** ONLY - Card/Bank Payments are __Strictly Forbidden__\n` +
    `> ${EMOJIS.SHIELD}[+] Send **Euro Currency** Only.\n` +
    `> ${EMOJIS.SHIELD}[+] Do **NOT add a note** to the payment.\n` +
    `> ${EMOJIS.SHIELD}[+] Must send a Summary Screenshot after sending.\n\n` +
    '**Breaking any will result in additional fees being added - and may also result in no Product and no Refund.**\n\n' +
    'By clicking \'Confirm\' you **Confirm you have read and agreed to the Terms of Services.**';

  const termsEmbed = new EmbedBuilder()
    .setTitle('PayPal Terms of Services')
    .setColor(PAYPAL_BLUE_COLOR)
    .setDescription(termsDescription);

  const acceptButton = new ButtonBuilder()
    .setCustomId('paypal_accept')
    .setLabel('Accept')
    .setEmoji(checkmarkEmoji)
    .setStyle(ButtonStyle.Success);

  const denyButton = new ButtonBuilder()
    .setCustomId('paypal_deny')
    .setLabel('Deny')
    .setEmoji(crossEmoji)
    .setStyle(ButtonStyle.Danger);
    
  const supportButton = new ButtonBuilder()
    .setCustomId('request_support')
    .setLabel('Request Support')
    .setEmoji(supportEmoji)
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(acceptButton, denyButton, supportButton);
  
  // Find the most recent message in the channel (should be the order details embed)
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 5 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].description?.includes('Current Rank') || 
       msg.embeds[0].description?.includes('Current Mastery') || 
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (orderDetailsMsg) {
      return await orderDetailsMsg.reply({ 
      content: `<@${userId}>`,
      embeds: [termsEmbed],
      components: [row]
    });
    }
  } catch (error) {
    console.error(`[PAYPAL_TERMS] Error finding order details message to reply to: ${error.message}`);
  }
  
  // Fallback if we couldn't find the message to reply to
  return await ticketChannel.send({ 
    content: `<@${userId}>`,
    embeds: [termsEmbed],
    components: [row]
  });
}

// PayPal payment information (sent after ToS confirmation)
async function sendPayPalInfoEmbed(ticketChannel, userId, interaction, showAcceptedMessage = false) { 
  const paypalEmailString = (PAYMENT_METHODS.PAYPAL && PAYMENT_METHODS.PAYPAL.email) ? PAYMENT_METHODS.PAYPAL.email : 'mathiasbenedetto@gmail.com';
  const copyEmoji = EMOJIS.COPY ? EMOJIS.COPY : '<:copy:1372240644013035671>';
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';

  const paypalInfoDescription = 
    '**PayPal E-Mail:**\n' +
    `\`${paypalEmailString}\`\n\n` + 
    'Once you have sent the payment, click on the \'Payment Completed\' button.';

  const paypalInfoEmbed = new EmbedBuilder()
    .setTitle('PayPal Payment Information')
    .setColor('#e68df2')
    .setDescription(paypalInfoDescription);

  const copyButton = new ButtonBuilder()
    .setCustomId('copy_email') 
    .setLabel('Copy E-Mail')
    .setEmoji(copyEmoji)
    .setStyle(ButtonStyle.Primary);

  const paymentButton = new ButtonBuilder()
    .setCustomId('payment_completed') 
    .setLabel('Payment Completed')
    .setEmoji(checkmarkEmoji)
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyButton, paymentButton);

  // Set the content text based on whether to show the acceptance message
  const contentText = showAcceptedMessage 
    ? `<@${userId}> Has accepted the Terms of Services.`
    : `<@${userId}>`;

  // Find the PayPal Terms message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const paypalTermsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      msg.embeds[0].title === 'PayPal Terms of Services'
    );
    
    if (paypalTermsMsg) {
      return await paypalTermsMsg.reply({ 
        content: contentText, 
        embeds: [paypalInfoEmbed], 
        components: [row] 
      });
    }
  } catch (error) {
    console.error(`[PAYPAL_INFO] Error finding PayPal Terms message to reply to: ${error.message}`);
  }
  
  // Fallback if we couldn't find the PayPal Terms message
  return await ticketChannel.send({ 
    content: contentText, 
    embeds: [paypalInfoEmbed], 
    components: [row] 
  });
}

// Payment verification embed requesting screenshot
async function sendPayPalScreenshotRequestEmbed(ticketChannel, userId) {
  const verificationEmbed = new EmbedBuilder()
    .setTitle('Payment Verification')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      '**Please send an uncropped screenshot of the summary in the chat.**\n\n' +
      '**What should we be able to see:**\n' +
      '> A screenshot on the PayPal App/Website or from the E-Mail you received.\n' +
      '> Make sure it includes way you paid: **PayPal Balance**\n\n' +
      'Please paste your screenshot in the chat.'
    );

  // Make sure the user can upload files
  try {
    await ticketChannel.permissionOverwrites.edit(userId, {
      AttachFiles: true
    });
    console.log(`[PAYPAL_SCREENSHOT] Granted file upload permissions to user ${userId}`);
  } catch (error) {
    console.error(`[PAYPAL_SCREENSHOT] Error granting file upload permissions: ${error.message}`);
  }
  
  return await ticketChannel.send({
    content: `<@${userId}>`,
    embeds: [verificationEmbed]
  });
}

// PayPal Giftcard Information
async function sendPayPalGiftcardEmbed(ticketChannel, userId, interaction) {
  const giftcardDescription = 
    '**Where to purchase:**\\n' +
    '> https://www.g2a.com/paypal-gift-card-5-eur-by-rewarble-global-i10000339995019\\n' +
    '> https://www.eneba.com/rewarble-paypal-rewarble-paypal-20-eur-voucher-global\\n\\n' +
    'Purchase a **Global** and **Euro Currency** Giftcard only.\\n\\n' +
    'Please wait for a Admin or above, since fees apply, they will tell you what Giftcard amount you need to purchase.\\n\\n' +
    '**Do __NOT__ send the Code to someone below Admin role, and only send the code in __DMS__, not in the ticket.**\\n' +
    '-# If you do this, we are not responsible if you somehow get scammed.';

  const giftcardEmbed = new EmbedBuilder()
    .setTitle('PayPal Giftcard Information')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(giftcardDescription);

  try {
    const staff1Id = (PAYMENT_STAFF && PAYMENT_STAFF.PAYPAL_GIFTCARD_ADMIN_1) ? PAYMENT_STAFF.PAYPAL_GIFTCARD_ADMIN_1 : '774511191376265217'; 
    const staff2Id = (PAYMENT_STAFF && PAYMENT_STAFF.PAYPAL_GIFTCARD_ADMIN_2) ? PAYMENT_STAFF.PAYPAL_GIFTCARD_ADMIN_2 : '986164993080836096';
    const mentionMessage = await ticketChannel.send(`<@${staff1Id}> <@${staff2Id}>`);
    console.log(`[PAYMENT] Sent PayPal giftcard ping for user ${userId} to ${staff1Id}, ${staff2Id}`);
    
    setTimeout(() => {
      mentionMessage.delete().catch(e => console.error('[PAYMENT] Error deleting PayPal giftcard ping message:', e));
    }, 100); // 0.1 second as per spec
  } catch (error) {
    console.error('[PAYMENT] Error sending PayPal giftcard ping:', error);
  }

  return await ticketChannel.send({ 
    content: `<@${userId}>`,
    embeds: [giftcardEmbed] // No buttons on this one as per spec
  });
}

// Litecoin Information
async function sendLitecoinEmbed(ticketChannel, userId, price = null, interaction = null) {
  const litecoinAddress = 'LMEBUghAdAKKdNTtUBExHyN33b6JS75TkH';
  const copyEmoji = EMOJIS.COPY ? EMOJIS.COPY : '<:copy:1372240644013035671>';
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';

  const litecoinDescription = 
    `**Litecoin Address:**\n\`${litecoinAddress}\`\n\n` +
    '**We will not cover any transaction fees.**\n' +
    'Make sure to check on the fees yourself, we use Exodus wallet to receive your payment.';

    const litecoinEmbed = new EmbedBuilder()
      .setTitle('Litecoin Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(litecoinDescription);

  const copyButton = new ButtonBuilder()
      .setCustomId('copy_ltc_address')
      .setLabel('Copy Address')
    .setEmoji(copyEmoji)
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_ltc')
      .setLabel('Payment Completed')
    .setEmoji(checkmarkEmoji)
      .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyButton, paymentButton);

  // Find the order details message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].title === 'Order Information' || 
       msg.embeds[0].description?.includes('Current Rank') ||
       msg.embeds[0].description?.includes('Current Mastery') ||
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (orderDetailsMsg) {
      return await orderDetailsMsg.reply({ 
        content: `<@${userId}>`, 
        embeds: [litecoinEmbed], 
        components: [row] 
    });
    }
  } catch (error) {
    console.error(`[LITECOIN] Error finding order details message to reply to: ${error.message}`);
  }

  // Fallback: send as regular message
  return await ticketChannel.send({ 
    content: `<@${userId}>`, 
    embeds: [litecoinEmbed], 
    components: [row] 
  });
}

// Show crypto selection options
async function showCryptoSelection(interaction, userId = null, priceInEuros = null) {
  try {
    // Handle both interaction and direct ticketChannel usage
    if (!interaction) {
      console.error('[CRYPTO_FLOW] No interaction or ticketChannel provided');
      return null;
    }
    
    // Check if this is a ticket channel call (not an interaction)
    const isTicketChannel = interaction && interaction.send && typeof interaction.send === 'function';
    
    if (isTicketChannel) {
      console.log(`[CRYPTO_FLOW] Showing crypto selection in ticket channel for user ${userId}`);
      const ticketChannel = interaction; // rename for clarity
      
      const embed = new EmbedBuilder()
        .setTitle('Crypto Currency')
        .setDescription('Please select what type of Crypto Coin you will be sending.')
        .setColor(DEFAULT_EMBED_COLOR);

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('crypto_type_select')
        .setPlaceholder('Select Crypto Currency')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Litecoin')
            .setValue('crypto_litecoin')
            .setEmoji('<:Litecoin:1371864997012963520>'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Solana')
            .setValue('crypto_solana')
            .setEmoji('<:Solana:1371865225824960633>'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Bitcoin')
            .setDescription('We will not be covering transaction fees.')
            .setValue('crypto_bitcoin')
            .setEmoji('<:Bitcoin:1371865397623652443>'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Other')
            .setDescription('Mainstream only - No memecoins.')
            .setValue('crypto_other')
            .setEmoji('<:crypto:1371863500720177314>')
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      // Send directly to the ticket channel
      return await ticketChannel.send({ 
        content: `<@${userId}>`, 
        embeds: [embed], 
        components: [row] 
      });
    }
    
    // Normal interaction flow
    console.log(`[CRYPTO_FLOW] Showing crypto selection for user ${interaction.user.id}`);
    
    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      console.error(`[CRYPTO_FLOW] No user data found for ${interaction.user.id} in crypto selection`);
      return interaction.reply({ 
        content: 'Session data not found. Please try again.',
        ephemeral: true
      });
    }
    
    // Update user state
    userData.paymentMethod = 'Crypto';
    userData.step = 'crypto_selection';
    flowState.set(interaction.user.id, userData);
    
    const embed = new EmbedBuilder()
      .setTitle('Crypto Currency')
      .setDescription('Please select what type of Crypto Coin you will be sending.')
      .setColor(DEFAULT_EMBED_COLOR);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('crypto_type_select')
      .setPlaceholder('Select Crypto Currency')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Litecoin')
          .setValue('crypto_litecoin')
          .setEmoji('<:Litecoin:1371864997012963520>'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Solana')
          .setValue('crypto_solana')
          .setEmoji('<:Solana:1371865225824960633>'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Bitcoin')
          .setDescription('We will not be covering transaction fees.')
          .setValue('crypto_bitcoin')
          .setEmoji('<:Bitcoin:1371865397623652443>'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Other')
          .setDescription('Mainstream only - No memecoins.')
          .setValue('crypto_other')
          .setEmoji('<:crypto:1371863500720177314>')
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Try to use the appropriate interaction response method
    if (interaction.deferred) {
      return interaction.editReply({ embeds: [embed], components: [row] });
    } else if (interaction.replied) {
      return interaction.followUp({ embeds: [embed], components: [row], ephemeral: true });
    } else {
      return interaction.update({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    console.error(`[CRYPTO_FLOW] Error in showCryptoSelection: ${error.message}`);
    console.error(error.stack);
    
    if (interaction && !interaction.replied && !interaction.deferred && interaction.reply) {
      return interaction.reply({ 
        content: 'An error occurred while loading crypto options. Please try again later.',
        ephemeral: true 
      });
    }
  }
}

// Bitcoin Information
async function sendBitcoinEmbed(ticketChannel, userId, interaction) {
  const bitcoinAddress = 'bc1qcxrteqq6rgr4u5s6hg9n4d27zar22ssgzx7s8v';
  const copyEmoji = EMOJIS.COPY ? EMOJIS.COPY : '<:copy:1372240644013035671>';
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';

  const bitcoinDescription = 
    `**Bitcoin Address:**\n\`${bitcoinAddress}\`\n\n` +
    '**We will not cover any transaction fees.**\n' +
    'Make sure to check on the fees yourself, we use Exodus wallet to receive your payment.';

    const bitcoinEmbed = new EmbedBuilder()
      .setTitle('Bitcoin Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(bitcoinDescription);

  const copyButton = new ButtonBuilder()
      .setCustomId('copy_btc_address')
      .setLabel('Copy Address')
    .setEmoji(copyEmoji)
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_btc')
      .setLabel('Payment Completed')
    .setEmoji(checkmarkEmoji)
      .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyButton, paymentButton);

  // Find the order details message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].description?.includes('Current Rank') || 
       msg.embeds[0].description?.includes('Current Mastery') || 
       msg.embeds[0].description?.includes('Current Trophies') ||
       msg.embeds[0].description?.includes('Final Price'))
    );
    
    if (orderDetailMsg) {
      return await orderDetailMsg.reply({ 
        content: `<@${userId}>`, 
        embeds: [bitcoinEmbed], 
        components: [row] 
    });
    }
  } catch (error) {
    console.error(`[BITCOIN_INFO] Error finding order details message to reply to: ${error.message}`);
  }
  
  // Fallback to sending as normal message
  return await ticketChannel.send({ 
    content: `<@${userId}>`,
    embeds: [bitcoinEmbed],
    components: [row]
  });
}

// Create Bitcoin Transfer ID modal
async function createBitcoinTxModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('bitcoin_tx_modal')
    .setTitle('Bitcoin Payment Confirmation');

  const txIdInput = new TextInputBuilder()
    .setCustomId('bitcoin_tx_id')
    .setLabel('Transfer ID / TXid')
    .setPlaceholder('The ID of the transaction.')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const firstActionRow = new ActionRowBuilder().addComponents(txIdInput);
  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

// Handle Bitcoin Transfer ID modal submission
async function handleBitcoinTxModalSubmission(interaction) {
  try {
    const txId = interaction.fields.getTextInputValue('bitcoin_tx_id');
    
    // Send staff verification embed with Transfer ID
    await sendStaffPaymentVerificationEmbed(interaction.channel, interaction.user.id, 'btc', { txId });
    
    await interaction.reply({
      content: 'Payment confirmation sent to staff for verification.',
      ephemeral: true
    });
    
    console.log(`[BITCOIN_TX] User ${interaction.user.id} submitted Bitcoin payment with TX ID: ${txId}`);
  } catch (error) {
    console.error(`[BITCOIN_TX] Error handling Bitcoin TX modal submission: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
}

// Create Litecoin Transfer ID modal
async function createLitecoinTxModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('litecoin_tx_modal')
    .setTitle('Litecoin Payment Confirmation');

  const txIdInput = new TextInputBuilder()
    .setCustomId('litecoin_tx_id')
    .setLabel('Transfer ID / TXid')
    .setPlaceholder('The ID of the transaction.')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const firstActionRow = new ActionRowBuilder().addComponents(txIdInput);
  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

// Handle Litecoin Transfer ID modal submission
async function handleLitecoinTxModalSubmission(interaction) {
  try {
    const txId = interaction.fields.getTextInputValue('litecoin_tx_id');
    
    // Send staff verification embed with Transfer ID
    await sendStaffPaymentVerificationEmbed(interaction.channel, interaction.user.id, 'ltc', { txId });
    
    await interaction.reply({
      content: 'Payment confirmation sent to staff for verification.',
      ephemeral: true
    });
    
    console.log(`[LITECOIN_TX] User ${interaction.user.id} submitted Litecoin payment with TX ID: ${txId}`);
  } catch (error) {
    console.error(`[LITECOIN_TX] Error handling Litecoin TX modal submission: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
}

// Create Solana Transfer ID modal
async function createSolanaTxModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('solana_tx_modal')
    .setTitle('Solana Payment Confirmation');

  const txIdInput = new TextInputBuilder()
    .setCustomId('solana_tx_id')
    .setLabel('Transfer ID / TXid')
    .setPlaceholder('The ID of the transaction.')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const firstActionRow = new ActionRowBuilder().addComponents(txIdInput);
  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

// Handle Solana Transfer ID modal submission
async function handleSolanaTxModalSubmission(interaction) {
  try {
    const txId = interaction.fields.getTextInputValue('solana_tx_id');
    
    // Send staff verification embed with Transfer ID
    await sendStaffPaymentVerificationEmbed(interaction.channel, interaction.user.id, 'sol', { txId });
    
    await interaction.reply({
      content: 'Payment confirmation sent to staff for verification.',
      ephemeral: true
    });
    
    console.log(`[SOLANA_TX] User ${interaction.user.id} submitted Solana payment with TX ID: ${txId}`);
  } catch (error) {
    console.error(`[SOLANA_TX] Error handling Solana TX modal submission: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
}

// Resend Bitcoin embed (simplified version without crypto conversion)
async function resendBitcoinEmbed(ticketChannel, userId, interaction) {
  try {
    // Just call the regular sendBitcoinEmbed function
    return await sendBitcoinEmbed(ticketChannel, userId, interaction);
  } catch (error) {
    console.error(`[RESEND_BITCOIN] Error resending Bitcoin embed: ${error.message}`);
    if (ticketChannel && ticketChannel.send) {
      await ticketChannel.send({ 
        content: `<@${userId}>, we encountered an error preparing the Bitcoin payment information. Please try again.`,
        allowedMentions: { users: [userId] } 
      }).catch(e => console.error("Fallback message send error:", e));
    }
  }
}

// Resend Litecoin embed (simplified version without crypto conversion)
async function resendLitecoinEmbed(ticketChannel, userId, price = null, interaction = null) {
  try {
    // Just call the regular sendLitecoinEmbed function
    return await sendLitecoinEmbed(ticketChannel, userId, price, interaction);
  } catch (error) {
    console.error(`[RESEND_LITECOIN] Error resending Litecoin embed: ${error.message}`);
    if (ticketChannel && ticketChannel.send) {
      await ticketChannel.send({ 
        content: `<@${userId}>, we encountered an error preparing the Litecoin payment information. Please try again.`,
        allowedMentions: { users: [userId] } 
      }).catch(e => console.error("Fallback message send error:", e));
    }
  }
}

// Resend Solana embed (simplified version without crypto conversion)
async function resendSolanaEmbed(ticketChannel, userId, price = null, interaction = null) {
  try {
    // Just call the regular sendSolanaEmbed function
    return await sendSolanaEmbed(ticketChannel, userId, price, interaction);
  } catch (error) {
    console.error(`[RESEND_SOLANA] Error resending Solana embed: ${error.message}`);
    if (ticketChannel && ticketChannel.send) {
      await ticketChannel.send({ 
        content: `<@${userId}>, we encountered an error preparing the Solana payment information. Please try again.`,
        allowedMentions: { users: [userId] } 
      }).catch(e => console.error("Fallback message send error:", e));
    }
  }
}

// Solana Information
async function sendSolanaEmbed(ticketChannel, userId, price = null, interaction = null) {
  const solanaAddress = 'B9z5EhzPnPFf8t5CptAArYRFhzkrQkv1i7URz1pVSNdH';
  const copyEmoji = EMOJIS.COPY ? EMOJIS.COPY : '<:copy:1372240644013035671>';
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';

  const solanaDescription = 
    `**Solana Address:**\n\`${solanaAddress}\`\n\n` +
    '**We will not cover any transaction fees.**\n' +
    'Make sure to check on the fees yourself, we use Exodus wallet to receive your payment.';

    const solanaEmbed = new EmbedBuilder()
      .setTitle('Solana Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(solanaDescription);

  const copyButton = new ButtonBuilder()
      .setCustomId('copy_sol_address')
      .setLabel('Copy Address')
    .setEmoji(copyEmoji)
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_sol')
      .setLabel('Payment Completed')
    .setEmoji(checkmarkEmoji)
      .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyButton, paymentButton);

  // Find the order details message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].title === 'Order Information' || 
       msg.embeds[0].description?.includes('Current Rank') ||
       msg.embeds[0].description?.includes('Current Mastery') ||
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (orderDetailsMsg) {
      return await orderDetailsMsg.reply({ 
        content: `<@${userId}>`, 
        embeds: [solanaEmbed], 
        components: [row] 
    });
    }
  } catch (error) {
    console.error(`[SOLANA] Error finding order details message to reply to: ${error.message}`);
  }

  // Fallback: send as regular message
  return await ticketChannel.send({ 
    content: `<@${userId}>`, 
    embeds: [solanaEmbed], 
    components: [row] 
  });
}

// IBAN Bank Transfer Information
async function sendIbanEmbed(ticketChannel, userId, interaction) {
  const ibanAccount = (PAYMENT_METHODS.IBAN && PAYMENT_METHODS.IBAN.account) ? PAYMENT_METHODS.IBAN.account : 'NL12 ABNA 0882 8893 97';
  const ibanName = (PAYMENT_METHODS.IBAN && PAYMENT_METHODS.IBAN.name) ? PAYMENT_METHODS.IBAN.name : 'Ruben';
  const copyEmoji = EMOJIS.COPY ? EMOJIS.COPY : '<:copy:1372240644013035671>';
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';

  const ibanDescription = 
    `**IBAN**: \`${ibanAccount}\` **This is fully automatic, you can send the payment already.**\n\n` +
    'Once you have sent the payment, click on the \'Payment Completed\' button.';

  const ibanEmbed = new EmbedBuilder()
    .setTitle('IBAN Payment Information')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(ibanDescription);

  const copyButton = new ButtonBuilder()
    .setCustomId('copy_iban') // Static ID
    .setLabel('Copy IBAN')
    .setEmoji(copyEmoji)
    .setStyle(ButtonStyle.Primary);
    
  const paymentButton = new ButtonBuilder()
    .setCustomId('payment_completed_iban') // Static ID for IBAN
    .setLabel('Payment Completed')
    .setEmoji(checkmarkEmoji)
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyButton, paymentButton);
  
  return await ticketChannel.send({ 
    content: `<@${userId}>`,
    embeds: [ibanEmbed],
    components: [row]
  });
}

// German Apple Giftcard Information
async function sendAppleGiftcardEmbed(ticketChannel, userId, interaction) {
  const appleGiftcardEmbed = new EmbedBuilder()
    .setTitle('Apple Giftcard Payment Information')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      `Please wait for <@${PAYMENT_STAFF.APPLE_GIFTCARD_VERIFIER}> to assist you.\\n\\n` +
      `**__ONLY__ send the code to <@${PAYMENT_STAFF.APPLE_GIFTCARD_VERIFIER}> or an Owner, and only send the code in __DMS__, not in the ticket.**\\n\\n` +
      'For payments above €100 using a German Apple Giftcard please do not send anything yet, and wait for an **Owner**\\n' +
      '-# If you do this, we are not responsible if you somehow get scammed.'
    );

  try {
    const mentionMessage = await ticketChannel.send(`<@&${ROLE_IDS.APPLE_GIFTCARD_STAFF_ROLE}> <@${PAYMENT_STAFF.APPLE_GIFTCARD_VERIFIER}>`);
    console.log(`[PAYMENT] Sent German Apple Giftcard ping for user ${userId}`);
    
    setTimeout(() => {
      mentionMessage.delete().catch(e => console.error('Error deleting German Apple Giftcard ping message:', e));
    }, 1000);
  } catch (error) {
    console.error('[PAYMENT] Error sending German Apple Giftcard ping:', error);
  }
  
  return await ticketChannel.send({ 
    content: `<@${userId}>`, 
    embeds: [appleGiftcardEmbed] 
  });
}

// Bol.com Giftcard Information
async function sendBolGiftcardEmbed(ticketChannel, userId, interaction) {
  const bolGiftcardEmbed = new EmbedBuilder()
    .setTitle('Bol.com Giftcard Payment Information')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      `Please wait for <@${PAYMENT_STAFF.OWNER_ID_FOR_GIFTCARDS}> to assist you. Since fees apply, they will tell you what Giftcard amount you need to purchase.\\n\\n` +
      '**__ONLY__ send the Code to an __Owner__, and only send the code in __DMS__, not in the ticket.**\\n' +
      '-# If you do this, we are not responsible if you somehow get scammed.'
    );

  try {
    const mentionMessage = await ticketChannel.send(`<@${PAYMENT_STAFF.OWNER_ID_FOR_GIFTCARDS}>`);
    console.log(`[PAYMENT] Sent Bol.com giftcard ping for user ${userId}`);
    
    setTimeout(() => {
      mentionMessage.delete().catch(e => console.error('Error deleting Bol.com giftcard ping message:', e));
    }, 100);
  } catch (error) {
    console.error('[PAYMENT] Error sending Bol.com giftcard ping:', error);
  }
  
  return await ticketChannel.send({ 
    content: `<@${userId}>`, 
    embeds: [bolGiftcardEmbed] 
  });
}

// Tikkie Information
async function sendTikkieEmbed(ticketChannel, userId, interaction) {
  const tikkieEmbed = new EmbedBuilder()
    .setTitle('Tikkie Payment Information')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      `**Payment Link:**\\n${PAYMENT_METHODS.TIKKIE.link}\\n\\n` +
      'The link may have expired, if so, please click the \'Link Expired\' button.'
    );

  const copyLinkButton = new ButtonBuilder()
    .setCustomId('copy_tikkie_link')
    .setLabel('Copy Link')
    .setEmoji(EMOJIS.COPY)
    .setStyle(ButtonStyle.Primary);

  const linkExpiredButton = new ButtonBuilder()
    .setCustomId('tikkie_link_expired')
    .setLabel('Link Expired')
    .setEmoji(EMOJIS.CROSS)
    .setStyle(ButtonStyle.Danger);
    
  const paymentButton = new ButtonBuilder()
    .setCustomId('payment_completed_tikkie')
    .setLabel('Payment Completed')
    .setEmoji(EMOJIS.CHECKMARK)
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyLinkButton, linkExpiredButton, paymentButton);
  
  return await ticketChannel.send({ 
    content: `<@${userId}>`,
    embeds: [tikkieEmbed],
    components: [row]
  });
}

// Link expired embed (for Tikkie)
async function sendLinkExpiredEmbed(interaction) {
  const expiredEmbed = new EmbedBuilder()
    .setTitle('Link Expired')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription('The Payment Link has expired.\\n\\nPlease send a new, non-expired one.');

  return await interaction.reply({ 
    content: `<@${PAYMENT_STAFF.TIKKIE_LINK_EXPIRED_CONTACT}>`,
    embeds: [expiredEmbed],
    ephemeral: false
  });
}

// Create payment confirmation ephemeral embed with countdown
async function sendPaymentConfirmationEmbedWithCountdown(interaction, paymentMethodType) {
  const confirmEmbed = new EmbedBuilder()
    .setTitle('Payment Completed')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription('Are you sure you have successfully sent the money?');

  const confirmButtonDisabled = new ButtonBuilder()
    .setCustomId(`confirm_payment_countdown_${paymentMethodType}`)
    .setLabel('(5s) Confirm')
    .setEmoji(EMOJIS.CHECKMARK)
    .setStyle(ButtonStyle.Success)
    .setDisabled(true);
    
  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_payment_confirm')
    .setLabel('Cancel')
    .setEmoji(EMOJIS.CROSS)
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(confirmButtonDisabled, cancelButton);
  
  const reply = await interaction.reply({ 
    embeds: [confirmEmbed], 
    components: [row],
    ephemeral: true
  });
  
  let countdown = 5;
  const intervalId = setInterval(async () => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(intervalId);
      const confirmButtonEnabled = new ButtonBuilder()
        .setCustomId(`confirm_payment_${paymentMethodType}`)
        .setLabel('Confirm')
        .setEmoji(EMOJIS.CHECKMARK)
        .setStyle(ButtonStyle.Success);
      const newRow = new ActionRowBuilder().addComponents(confirmButtonEnabled, cancelButton);
      try {
        await interaction.editReply({ embeds: [confirmEmbed], components: [newRow] });
      } catch (editError) {
        console.error(`[PAYMENT_COUNTDOWN] Error editing reply for ${paymentMethodType}:`, editError);
      }
      return;
    }
    const updatedButton = new ButtonBuilder()
      .setCustomId(`confirm_payment_countdown_${paymentMethodType}_${countdown}`)
      .setLabel(`(${countdown}s) Confirm`)
      .setEmoji(EMOJIS.CHECKMARK)
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
    const updatedRow = new ActionRowBuilder().addComponents(updatedButton, cancelButton);
    try {
      await interaction.editReply({ embeds: [confirmEmbed], components: [updatedRow] });
    } catch (editError) {
      console.error(`[PAYMENT_COUNTDOWN] Error editing reply during countdown for ${paymentMethodType}:`, editError);
      clearInterval(intervalId);
    }
  }, 1000);
}

// Create staff payment verification embed (generic for PayPal, IBAN, Tikkie)
async function sendStaffPaymentVerificationEmbed(ticketChannel, userId, paymentTypeString, orderDetails = {}) {
  let staffToPing = '';
  let title = 'Payment Confirmed';
  let description = 'Please confirm you have received the payment.';
  let staffCanClickId = ''; // ID of staff who can click confirm/cancel

  // paymentTypeString will be like 'paypal', 'iban', 'tikkie', 'btc'
  if (paymentTypeString.startsWith('paypal')) {
    // Handle PAYPAL_VERIFIER as array or single ID
    if (Array.isArray(PAYMENT_STAFF.PAYPAL_VERIFIER)) {
      staffToPing = PAYMENT_STAFF.PAYPAL_VERIFIER[0]; // Use first verifier
      staffCanClickId = PAYMENT_STAFF.PAYPAL_VERIFIER[0];
    } else {
      staffToPing = PAYMENT_STAFF.PAYPAL_VERIFIER;
    staffCanClickId = PAYMENT_STAFF.PAYPAL_VERIFIER;
    }
  } else if (paymentTypeString.startsWith('iban') || paymentTypeString.startsWith('tikkie')) {
    staffToPing = PAYMENT_STAFF.IBAN_VERIFIER; // e.g., 987751357773672538
    staffCanClickId = PAYMENT_STAFF.IBAN_VERIFIER;
  } else if (paymentTypeString.startsWith('btc')) {
    staffToPing = PAYMENT_STAFF.BTC_VERIFIER; // e.g., 987751357773672538
    staffCanClickId = PAYMENT_STAFF.BTC_VERIFIER;
    title = 'Confirm Transaction';
    description = 'Please confirm you have received the correct amount with all confirms.';
    if (orderDetails.txId) { // orderDetails here is actually verificationData from old spec
        description += `\n**Transfer ID:** \`${orderDetails.txId}\``;
    }
  } else if (paymentTypeString.startsWith('ltc')) {
    staffToPing = PAYMENT_STAFF.BTC_VERIFIER; // Use same verifier as Bitcoin
    staffCanClickId = PAYMENT_STAFF.BTC_VERIFIER;
    title = 'Confirm Transaction';
    description = 'Please confirm you have received the correct amount with all confirms.';
    if (orderDetails.txId) {
        description += `\n**Transfer ID:** \`${orderDetails.txId}\``;
    }
  } else if (paymentTypeString.startsWith('sol')) {
    staffToPing = PAYMENT_STAFF.BTC_VERIFIER; // Use same verifier as Bitcoin
    staffCanClickId = PAYMENT_STAFF.BTC_VERIFIER;
    title = 'Confirm Transaction';
    description = 'Please confirm you have received the correct amount with all confirms.';
    if (orderDetails.txId) {
        description += `\n**Transfer ID:** \`${orderDetails.txId}\``;
    }
  } else {
    console.error(`[STAFF_VERIFY] Unknown payment type for staff verification: ${paymentTypeString}`);
    return;
  }
  
  if (!staffCanClickId) { // Fallback if a specific verifier ID isn't set for the type
      staffCanClickId = staffToPing; 
      console.warn(`[STAFF_VERIFY] staffCanClickId not set for ${paymentTypeString}, defaulting to staffToPing: ${staffToPing}`);
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(description);

  const confirmButton = new ButtonBuilder()
    // Custom ID format: staff_confirm_payment_<type>_<userId>_<verifierId>
    .setCustomId(`staff_confirm_payment_${paymentTypeString}_${userId}_${staffCanClickId}`)
    .setLabel('Confirm')
    .setEmoji(EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>')
    .setStyle(ButtonStyle.Success);
    
  const cancelButton = new ButtonBuilder()
    .setCustomId(`staff_cancel_payment_${paymentTypeString}_${userId}_${staffCanClickId}`)
    .setLabel('Cancel')
    .setEmoji(EMOJIS.CROSS ? EMOJIS.CROSS : '<:cross:1351689463453061130>')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
  
  // Avoid duplicate pings if staff and user are the same person
  const contentPing = staffToPing === userId ? `<@${userId}>` : `<@${staffToPing}> <@${userId}>`;
  const allowedUsers = staffToPing === userId ? [userId] : [staffToPing, userId];
  
  return ticketChannel.send({ 
      content: contentPing, // Ping staff and user who initiated payment (avoid duplicates)
      embeds: [embed], 
      components: [row],
      allowedMentions: { users: allowedUsers}
  });
}

// Send PayPal verification embed for staff to confirm payment
async function sendPayPalPaymentVerificationEmbed(ticketChannel, userId, replyToMessage = null, screenshotUrl = null) {
  // Get verifier ID from config or fallback to hardcoded value
  const paypalVerifier = '986164993080836096';
  
  const verificationEmbed = new EmbedBuilder()
    .setTitle('Payment Verification')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(`<@${userId}> has sent a payment screenshot. Please verify if the payment has been received.`);
    
  // Add screenshot to embed if provided
  if (screenshotUrl) {
    verificationEmbed.setImage(screenshotUrl);
  }

  const confirmButton = new ButtonBuilder()
    .setCustomId('paypal_payment_received')
    .setLabel('Payment Received')
    .setEmoji('<:checkmark:1357478063616688304>')
    .setStyle(ButtonStyle.Success);

  const rejectButton = new ButtonBuilder()
    .setCustomId('paypal_payment_not_received')
    .setLabel('Payment Not Received')
    .setEmoji('<:cross:1351689463453061130>')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(confirmButton, rejectButton);

  // If we have a message to reply to, use that
  if (replyToMessage && typeof replyToMessage.reply === 'function') {
    return await replyToMessage.reply({ 
      content: `<@${paypalVerifier}>`, 
      embeds: [verificationEmbed], 
      components: [row] 
    });
  }
  
  // Otherwise send as a normal message
  return await ticketChannel.send({
    content: `<@${paypalVerifier}>`, 
    embeds: [verificationEmbed], 
    components: [row] 
  });
}

// Send boost available embed after payment verification
async function sendBoostAvailableEmbed(ticketChannel, orderDetails, userId, boosterRoleId = null, replyToMessage = null) {
  const roleId = boosterRoleId || ROLE_IDS.BOOSTER || ROLE_IDS.BOOST_AVAILABLE || '1303702944696504441';
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';

  // Prepare the description based on order details
  let orderDescription = '';
  let amountText = '';
  let p11Text = '';
  
  // First try to extract order details from message history if they're not provided
  if (!orderDetails.current && !orderDetails.desired && !orderDetails.price) {
    try {
      const messages = await ticketChannel.messages.fetch({ limit: 20 });
      const orderDetailMsg = messages.find(msg => 
        msg.embeds.length > 0 && 
        (msg.embeds[0].description?.includes('Current Rank') || 
         msg.embeds[0].description?.includes('Current Mastery') || 
         msg.embeds[0].description?.includes('Current Trophies') ||
         msg.embeds[0].description?.includes('Final Price'))
      );
      
      if (orderDetailMsg && orderDetailMsg.embeds[0]) {
        const embedDesc = orderDetailMsg.embeds[0].description;
        
        // Try to parse current rank/mastery/trophies
        const currentMatch = embedDesc.match(/\*\*Current .*?:\*\*\s*`([^`]+)`/i);
        if (currentMatch && currentMatch[1]) {
          orderDetails.current = currentMatch[1];
        }
        
        // Try to parse desired rank/mastery/trophies
        const desiredMatch = embedDesc.match(/\*\*Desired .*?:\*\*\s*`([^`]+)`/i);
        if (desiredMatch && desiredMatch[1]) {
          orderDetails.desired = desiredMatch[1];
        }
        
        // Try to parse price
        const priceMatch = embedDesc.match(/\*\*Final Price:\*\*\s*`([^`]+)`/i);
        if (priceMatch && priceMatch[1]) {
          orderDetails.price = priceMatch[1];
        }
        
        // Try to parse P11 count for ranked boosts
        const p11Match = embedDesc.match(/\*\*P11 Count:\*\*\s*`([^`]+)`/i);
        if (p11Match && p11Match[1]) {
          orderDetails.p11Count = p11Match[1];
        }
        
        console.log(`[BOOST_EMBED] Found order details in message history: ${JSON.stringify(orderDetails)}`);
      }
    } catch (error) {
      console.error(`[BOOST_EMBED] Error fetching order details from messages: ${error.message}`);
    }
  }
  
  // Format the order information
  if (orderDetails.current && orderDetails.desired) {
    orderDescription = `**From:** \`${orderDetails.current}\`\n**To:** \`${orderDetails.desired}\``;
  }
  
  if (orderDetails.price) {
    amountText = `\n**Price:** \`${orderDetails.price}\``;
  }
  
  // Add P11 count if available for ranked boosts
  if (orderDetails.p11Count) {
    p11Text = `\n**Amount of P11:** \`${orderDetails.p11Count}\``;
  }
  
  // Default text if we still don't have order details
  if (!orderDescription) {
    orderDescription = "Details not available";
  }

  const boostEmbed = new EmbedBuilder()
    .setTitle('Boost Available')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(`<@&${roleId}> This boost has been paid for and is available.\n\nClaim this boost by clicking the 'Claim Boost' button below.\n\n**Order Information:**\n${orderDescription}${amountText}${p11Text}`);

  const claimButton = new ButtonBuilder()
    .setCustomId('claim_boost')
    .setLabel('Claim Boost')
    .setEmoji(checkmarkEmoji)
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(claimButton);

  // If we have a message to reply to, use that
  if (replyToMessage && typeof replyToMessage.reply === 'function') {
    return await replyToMessage.reply({ 
      content: `<@&${roleId}>`, 
      embeds: [boostEmbed], 
      components: [row] 
    });
  }

  // Otherwise send as a normal message
  return await ticketChannel.send({ 
    content: `<@&${roleId}>`, 
    embeds: [boostEmbed], 
    components: [row] 
  });
}

// Handle PayPal ToS denial embed
async function sendPayPalTosDeniedEmbed(interaction) {
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';
  const crossEmoji = EMOJIS.CROSS ? EMOJIS.CROSS : '<:cross:1351689463453061130>';

  const deniedEmbed = new EmbedBuilder()
    .setTitle('Are you sure?')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription('Please confirm if you are sure you would like to deny the Terms of Services.\n\nThis means we can **not continue** with your order.');

  const continueButton = new ButtonBuilder()
    .setCustomId('paypal_deny_confirmed')
    .setLabel('Continue')
    .setEmoji(crossEmoji)
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('paypal_deny_cancelled')
    .setLabel('Cancel')
    .setEmoji(checkmarkEmoji)
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(continueButton, cancelButton);

  return await interaction.reply({ 
    embeds: [deniedEmbed], 
    components: [row],
    ephemeral: true
  });
}

// Handle PayPal ToS confirmation of denial
async function sendPayPalTosDenialConfirmedEmbed(ticketChannel, userId) {
  const denialConfirmedEmbed = new EmbedBuilder()
    .setDescription('Please explain why you denied the Terms of Services.\n\nIf no other solution can be found, this order will have to be cancelled.');

  return await ticketChannel.send({ 
    content: `<@${userId}> Has denied the Terms of Services.`, 
    embeds: [denialConfirmedEmbed]
  });
}

// PayPal ToS accepted message
async function sendPayPalTosAcceptedEmbed(ticketChannel, userId) {
  return await ticketChannel.send({
    content: `<@${userId}> Has accepted the Terms of Services.`
  });
}

// Send order details embed for tickets
async function sendOrderDetailsEmbed(ticketChannel, orderDetails) {
  // Default color
  const embedColor = DEFAULT_EMBED_COLOR;

  // Create the embed based on order type
  let embedDescription = '';
  
  if (orderDetails.type === 'ranked') {
    embedDescription = 
      `**Current Rank:**\n` +
      `\`${orderDetails.current}\`\n\n` + 
      `**Desired Rank:**\n` +
      `\`${orderDetails.desired}\`\n\n` +
      `**Final Price:**\n` +
      `\`${orderDetails.price}\``;
  } 
  else if (orderDetails.type === 'mastery') {
    embedDescription = 
      `**Current Mastery:**\n` +
      `\`${orderDetails.current}\`\n\n` + 
      `**Desired Mastery:**\n` +
      `\`${orderDetails.desired}\`\n\n` +
      `**Final Price:**\n` +
      `\`${orderDetails.price}\``;
  }
  else if (orderDetails.type === 'bulk' || orderDetails.type === 'trophies') {
    embedDescription = 
      `**Current Trophies:**\n` +
      `\`${orderDetails.current}\`\n\n` + 
      `**Desired Trophies:**\n` +
      `\`${orderDetails.desired}\`\n\n` +
      `**Final Price:**\n` +
      `\`${orderDetails.price}\``;
  }
  else {
    embedDescription = 
      `**Order Details:**\n` +
      `\`${orderDetails.description || 'Custom order'}\`\n\n` +
      `**Final Price:**\n` +
      `\`${orderDetails.price || 'To be determined'}\``;
  }
  
  // Add payment method if available
  if (orderDetails.paymentMethod) {
    embedDescription += `\n\n**Payment Method:**\n\`${orderDetails.paymentMethod}\``;
    
    // Add crypto coin if applicable
    if (orderDetails.cryptoCoin) {
      embedDescription += `\n\n**Crypto Coin:**\n\`${orderDetails.cryptoCoin}\``;
    }
    
    // Add Dutch payment type if applicable
    if (orderDetails.dutchPaymentType) {
      embedDescription += `\n\n**Type of Payment:**\n\`${orderDetails.dutchPaymentType}\``;
    }
  }
  
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setDescription(embedDescription);
  
  return await ticketChannel.send({ embeds: [embed] });
}

// Send crypto other payment requested embed (for "Other" crypto types)
async function sendCryptoOtherPaymentEmbed(ticketChannel, userId, cryptoCoin) {
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';
  const cryptoVerifier = PAYMENT_STAFF.BTC_VERIFIER; // Use same verifier as other crypto payments

  const cryptoOtherEmbed = new EmbedBuilder()
    .setTitle('Crypto Payment Requested')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(`<@${userId}> Has requested to pay with \`${cryptoCoin}\`.`);

  const paymentReceivedButton = new ButtonBuilder()
    .setCustomId('payment_received_crypto_other')
    .setLabel('Payment Received')
    .setEmoji(checkmarkEmoji)
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(paymentReceivedButton);

  // Find the order details message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].title === 'Order Information' || 
       msg.embeds[0].description?.includes('Current Rank') ||
       msg.embeds[0].description?.includes('Current Mastery') ||
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (orderDetailsMsg) {
      return await orderDetailsMsg.reply({ 
        content: `<@${cryptoVerifier}>`, 
        embeds: [cryptoOtherEmbed], 
        components: [row] 
      });
    }
  } catch (error) {
    console.error(`[CRYPTO_OTHER] Error finding order details message to reply to: ${error.message}`);
  }

  // Fallback if we couldn't find the message to reply to
  return await ticketChannel.send({ 
    content: `<@${cryptoVerifier}>`, 
    embeds: [cryptoOtherEmbed], 
    components: [row] 
  });
}

async function sendPayPalGiftcardOtherPaymentEmbed(ticketChannel, userId, giftcardInfo) {
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';
  
  const paypalGiftcardEmbed = new EmbedBuilder()
    .setTitle('PayPal Giftcard Payment Information')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(`**Where to purchase:**
> https://www.g2a.com/paypal-gift-card-5-eur-by-rewarble-global-i10000339995019
> https://www.eneba.com/rewarble-paypal-rewarble-paypal-20-eur-voucher-global

The giftcard must be from **\`REWARBLE\`**, so it must be a **Rewarble PayPal Giftcard**.

Purchase a **Global** and **Euro Currency** Giftcard only.

Please wait for an owner to assist you, since fees apply, they will tell you what Giftcard amount you need to purchase.`);

  const paymentReceivedButton = new ButtonBuilder()
    .setCustomId('payment_received_paypal_giftcard')
    .setLabel('Payment Received')
    .setEmoji(checkmarkEmoji)
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(paymentReceivedButton);

  // Find the order details message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].title === 'Order Information' || 
       msg.embeds[0].description?.includes('Current Rank') ||
       msg.embeds[0].description?.includes('Current Mastery') ||
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (orderDetailsMsg) {
      return await orderDetailsMsg.reply({ 
        content: `<@${userId}> <@&${ROLE_IDS.OWNER}>`, 
        embeds: [paypalGiftcardEmbed], 
        components: [row] 
      });
    }
  } catch (error) {
    console.error(`[PAYPAL_GIFTCARD] Error finding order details message to reply to: ${error.message}`);
  }

  // Fallback if we couldn't find the message to reply to
  return await ticketChannel.send({ 
    content: `<@${userId}> <@&${ROLE_IDS.OWNER}>`, 
    embeds: [paypalGiftcardEmbed], 
    components: [row] 
  });
}

// === Helper: Notify boosters once payment is confirmed ===
async function sendPaymentConfirmedNotification(ticketChannel, orderDetails = {}) {
  try {
    const boosterRoleId = ROLE_IDS.BOOSTER || ROLE_IDS.BOOST_AVAILABLE || '1303702944696504441';

    // Fallback text for order info
    const descriptionLines = [];
    if (orderDetails.current || orderDetails.target) {
      descriptionLines.push(`**Current:** \`${orderDetails.current || 'N/A'}\``);
      descriptionLines.push(`**Target:** \`${orderDetails.target || 'N/A'}\``);
    }
    if (orderDetails.amount) {
      descriptionLines.push(`**Price:** \`${orderDetails.amount}\``);
    }

    const embed = new EmbedBuilder()
      .setTitle('Boost Available')
      .setColor(DEFAULT_EMBED_COLOR)
      .setDescription(
        descriptionLines.length > 0
          ? descriptionLines.join('\n')
          : 'A new boost is ready to be claimed.'
      );

    await ticketChannel.send({
      content: `<@&${boosterRoleId}>`,
      embeds: [embed]
    });
  } catch (error) {
    console.error('[PAYMENT_NOTIFY] Error sending payment confirmed notification:', error);
  }
}

module.exports = {
  sendWelcomeEmbed,
  sendPayPalTermsEmbed,
  sendPayPalInfoEmbed,
  sendPayPalGiftcardEmbed,
  sendLitecoinEmbed,
  showCryptoSelection,
  sendIbanEmbed,
  sendAppleGiftcardEmbed,
  sendBolGiftcardEmbed,
  sendTikkieEmbed,
  sendLinkExpiredEmbed,
  sendPaymentConfirmationEmbedWithCountdown,
  sendStaffPaymentVerificationEmbed,
  sendPayPalPaymentVerificationEmbed,
  sendBoostAvailableEmbed,
  sendPayPalTosDeniedEmbed,
  sendPayPalTosDenialConfirmedEmbed,
  sendPayPalTosAcceptedEmbed,
  sendOrderDetailsEmbed,
  sendBitcoinEmbed,
  resendBitcoinEmbed,
  sendSolanaEmbed,
  resendSolanaEmbed,
  resendLitecoinEmbed,
  sendPayPalScreenshotRequestEmbed,
  createBitcoinTxModal,
  handleBitcoinTxModalSubmission,
  createLitecoinTxModal,
  handleLitecoinTxModalSubmission,
  createSolanaTxModal,
  handleSolanaTxModalSubmission,
  sendCryptoOtherPaymentEmbed,
  sendPayPalGiftcardOtherPaymentEmbed
  ,sendPaymentConfirmedNotification
}; 