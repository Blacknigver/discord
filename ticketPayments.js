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
  const shieldEmoji = EMOJIS.SHIELD ? EMOJIS.SHIELD : '<:shield:1371879600560541756>';
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';
  const crossEmoji = EMOJIS.CROSS ? EMOJIS.CROSS : '<:cross:1351689463453061130>';
  const supportEmoji = '<:Support:1382066889873686608>';

  const termsDescription = 
    `> ${shieldEmoji}[+] If our PayPal Account gets locked, you will have to wait for us to unlock it, if we fail to unlock it no product or refund will be given.\n` +
    `> ${shieldEmoji}[+] We will not be covering any transaction fees.\n` +
    `> ${shieldEmoji}[+] Send **Friends and Family** ONLY - Goods and Services is __Strictly Forbidden__\n` +
    `> ${shieldEmoji}[+] Send from **PayPal Balance** ONLY - Card/Bank Payments are __Strictly Forbidden__\n` +
    `> ${shieldEmoji}[+] Send **Euro Currency** Only.\n` +
    `> ${shieldEmoji}[+] Do **NOT add a note** to the payment.\n` +
    `> ${shieldEmoji}[+] Must send a Summary Screenshot after sending.\n\n` +
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
async function sendLitecoinEmbed(ticketChannel, userId, priceInEuros, interaction) {
  try {
    console.log(`[CRYPTO] Creating LTC embed with price: €${priceInEuros}`);
    if (!priceInEuros || isNaN(parseFloat(priceInEuros)) || parseFloat(priceInEuros) <= 0) {
      console.error(`[CRYPTO] Invalid price for LTC conversion: ${priceInEuros}`);
      priceInEuros = 1.00;
    }
    priceInEuros = parseFloat(priceInEuros);

    const ltcAmount = await convertEuroToCrypto('ltc', priceInEuros);
    console.log(`[CRYPTO] Calculated ${priceInEuros} EUR = ${ltcAmount} LTC`);

    const litecoinEmbed = new EmbedBuilder()
      .setTitle('Litecoin Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
      .setDescription(
        `**Litecoin Address:**\\n\`${CRYPTO_WALLET_ADDRESSES.ltc}\`\\n\\n` +
        `**Amount of Litecoin:**\\n\`${ltcAmount}\`\\n` +
        '**Must be the __EXACT!__ Amount.**\\n\\n' +
        '# You have 30 minutes to send the payment and click \'Payment Completed\'.\\n\\n' +
        'We will not cover any transaction fees.'
      );

    const copyAddressButton = new ButtonBuilder()
      .setCustomId('copy_ltc_address')
      .setLabel('Copy Address')
      .setEmoji(EMOJIS.COPY)
      .setStyle(ButtonStyle.Primary);

    const copyAmountButton = new ButtonBuilder()
      .setCustomId('copy_ltc_amount')
      .setLabel('Copy Amount')
      .setEmoji(EMOJIS.COPY)
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_ltc')
      .setLabel('Payment Completed')
      .setEmoji(EMOJIS.CHECKMARK)
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(copyAddressButton, copyAmountButton, paymentButton);

    const sentMessage = await ticketChannel.send({ 
        content: `<@${userId}>`, 
        embeds: [litecoinEmbed], 
        components: [row] 
    });
    
    sentMessage.cryptoAmountToCopy = ltcAmount;
    setupCryptoTimeout(ticketChannel, 'ltc', sentMessage.id, ltcAmount, priceInEuros, userId);
    return sentMessage;

  } catch (error) {
    console.error(`[CRYPTO] Error in sendLitecoinEmbed for user ${userId} with price €${priceInEuros}:`, error);
    if (ticketChannel && ticketChannel.send) {
      await ticketChannel.send({ 
          content: `<@${userId}>, we encountered an error preparing the Litecoin payment information. Staff: ${error.message}`,
          allowedMentions: { users: [userId, PAYMENT_STAFF.OWNER_ID_FOR_ERRORS] } 
      }).catch(e => console.error("Fallback message send error:", e));
    }
  }
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
async function sendBitcoinEmbed(ticketChannel, userId, priceInEuros, interaction) {
  try {
    console.log(`[CRYPTO] Creating BTC embed with price: €${priceInEuros}`);
    if (!priceInEuros || isNaN(parseFloat(priceInEuros)) || parseFloat(priceInEuros) <= 0) {
      console.error(`[CRYPTO] Invalid price for BTC conversion: ${priceInEuros}`);
      priceInEuros = 1.00;
    }
    priceInEuros = parseFloat(priceInEuros);

    const btcAmount = await convertEuroToCrypto('btc', priceInEuros);
    console.log(`[CRYPTO] Calculated ${priceInEuros} EUR = ${btcAmount} BTC`);

    const bitcoinEmbed = new EmbedBuilder()
      .setTitle('Bitcoin Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
      .setDescription(
        `**Bitcoin Address:**\n\`${CRYPTO_WALLET_ADDRESSES.btc}\`\n\n` +
        `**Amount of Bitcoin:**\n\`${btcAmount}\`\n` +
        '**Must be the __EXACT!__ Amount.**\n\n' +
        '# You have 30 minutes to send the payment and click \'Payment Completed\'.\n\n' +
        'We will not cover any transaction fees.'
      );

    const copyAddressButton = new ButtonBuilder()
      .setCustomId('copy_btc_address')
      .setLabel('Copy Address')
      .setEmoji(EMOJIS.COPY)
      .setStyle(ButtonStyle.Primary);

    const copyAmountButton = new ButtonBuilder()
      .setCustomId('copy_btc_amount')
      .setLabel('Copy Amount')
      .setEmoji(EMOJIS.COPY)
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_btc')
      .setLabel('Payment Completed')
      .setEmoji(EMOJIS.CHECKMARK)
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(copyAddressButton, copyAmountButton, paymentButton);

    const sentMessage = await ticketChannel.send({ 
        content: `<@${userId}>`, 
        embeds: [bitcoinEmbed], 
        components: [row] 
    });
    
    sentMessage.cryptoAmountToCopy = btcAmount;
    setupCryptoTimeout(ticketChannel, 'btc', sentMessage.id, btcAmount, priceInEuros, userId);
    return sentMessage;

  } catch (error) {
    console.error(`[CRYPTO] Error in sendBitcoinEmbed for user ${userId} with price €${priceInEuros}:`, error);
    if (ticketChannel && ticketChannel.send) {
      await ticketChannel.send({ 
          content: `<@${userId}>, we encountered an error preparing the Bitcoin payment information. Staff: ${error.message}`,
          allowedMentions: { users: [userId, PAYMENT_STAFF.OWNER_ID_FOR_ERRORS] } 
      }).catch(e => console.error("Fallback message send error:", e));
    }
  }
}

// Solana Information
async function sendSolanaEmbed(ticketChannel, userId, priceInEuros, interaction) {
  try {
    console.log(`[CRYPTO] Creating SOL embed with price: €${priceInEuros}`);
    if (!priceInEuros || isNaN(parseFloat(priceInEuros)) || parseFloat(priceInEuros) <= 0) {
      console.error(`[CRYPTO] Invalid price for SOL conversion: ${priceInEuros}`);
      priceInEuros = 1.00;
    }
    priceInEuros = parseFloat(priceInEuros);

    const solAmount = await convertEuroToCrypto('sol', priceInEuros);
    console.log(`[CRYPTO] Calculated ${priceInEuros} EUR = ${solAmount} SOL`);

    const solanaEmbed = new EmbedBuilder()
      .setTitle('Solana Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
      .setDescription(
        `**Solana Address:**\n\`${CRYPTO_WALLET_ADDRESSES.sol}\`\n\n` +
        `**Amount of Solana:**\n\`${solAmount}\`\n` +
        '**Must be the __EXACT!__ Amount.**\n\n' +
        '# You have 30 minutes to send the payment and click \'Payment Completed\'.\n\n' +
        'We will not cover any transaction fees.'
      );

    const copyAddressButton = new ButtonBuilder()
      .setCustomId('copy_sol_address')
      .setLabel('Copy Address')
      .setEmoji(EMOJIS.COPY)
      .setStyle(ButtonStyle.Primary);

    const copyAmountButton = new ButtonBuilder()
      .setCustomId('copy_sol_amount')
      .setLabel('Copy Amount')
      .setEmoji(EMOJIS.COPY)
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_sol')
      .setLabel('Payment Completed')
      .setEmoji(EMOJIS.CHECKMARK)
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(copyAddressButton, copyAmountButton, paymentButton);
    
    const sentMessage = await ticketChannel.send({ 
        content: `<@${userId}>`, 
        embeds: [solanaEmbed], 
        components: [row] 
    });

    sentMessage.cryptoAmountToCopy = solAmount;
    setupCryptoTimeout(ticketChannel, 'sol', sentMessage.id, solAmount, priceInEuros, userId);
    return sentMessage;

  } catch (error) {
    console.error(`[CRYPTO] Error in sendSolanaEmbed for user ${userId} with price €${priceInEuros}:`, error);
    if (ticketChannel && ticketChannel.send) {
      await ticketChannel.send({ 
          content: `<@${userId}>, we encountered an error preparing the Solana payment information. Staff: ${error.message}`,
          allowedMentions: { users: [userId, PAYMENT_STAFF.OWNER_ID_FOR_ERRORS] } 
      }).catch(e => console.error("Fallback message send error:", e));
    }
  }
}

// IBAN Bank Transfer Information
async function sendIbanEmbed(ticketChannel, userId, interaction) {
  const ibanAccount = (PAYMENT_METHODS.IBAN && PAYMENT_METHODS.IBAN.account) ? PAYMENT_METHODS.IBAN.account : 'NL12 ABNA 0882 8893 97';
  const ibanName = (PAYMENT_METHODS.IBAN && PAYMENT_METHODS.IBAN.name) ? PAYMENT_METHODS.IBAN.name : 'Ruben';
  const copyEmoji = EMOJIS.COPY ? EMOJIS.COPY : '<:copy:1372240644013035671>';
  const checkmarkEmoji = EMOJIS.CHECKMARK ? EMOJIS.CHECKMARK : '<:checkmark:1357478063616688304>';

  const ibanDescription = 
    `**IBAN:**\\n\`${ibanAccount}\`\\n\\n` +
    '**This is fully automatic, you can send the payment already.**\\n\\n' +
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
    staffToPing = PAYMENT_STAFF.PAYPAL_VERIFIER; // e.g., 986164993080836096
    staffCanClickId = PAYMENT_STAFF.PAYPAL_VERIFIER;
  } else if (paymentTypeString.startsWith('iban') || paymentTypeString.startsWith('tikkie')) {
    staffToPing = PAYMENT_STAFF.IBAN_TIKKIE_VERIFIER; // e.g., 658351335967686659
    staffCanClickId = PAYMENT_STAFF.IBAN_TIKKIE_VERIFIER;
  } else if (paymentTypeString.startsWith('btc')) {
    staffToPing = PAYMENT_STAFF.BTC_VERIFIER; // e.g., 658351335967686659
    staffCanClickId = PAYMENT_STAFF.BTC_VERIFIER;
    title = 'Confirm Transaction';
    description = 'Please confirm you have received the correct amount with all confirms.';
    if (orderDetails.txId) { // orderDetails here is actually verificationData from old spec
        description += `\\nTransaction ID: \`${orderDetails.txId}\``;
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
    .setDescription(description)
    .setFooter({text: `User ID: ${userId} | Verifier: ${staffCanClickId}`}); // Add user ID and who can click

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
  
  return ticketChannel.send({ 
      content: `<@${staffToPing}> <@${userId}>`, // Ping staff and user who initiated payment
      embeds: [embed], 
      components: [row],
      allowedMentions: { users: [staffToPing, userId]}
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
    .setEmoji('1357478063616688304')
    .setStyle(ButtonStyle.Success);

  const rejectButton = new ButtonBuilder()
    .setCustomId('paypal_payment_not_received')
    .setLabel('Payment Not Received')
    .setEmoji('1351689463453061130')
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
  const roleId = boosterRoleId || (ROLE_IDS && ROLE_IDS.BOOSTER ? ROLE_IDS.BOOSTER : '1303702944696504441');
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
  sendSolanaEmbed,
  sendPayPalScreenshotRequestEmbed
}; 