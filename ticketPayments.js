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
const { fetchCryptoPricesFromBinance, convertEurToCrypto, formatCryptoAmount } = require('./src/utils/cryptoPrices');
const { flowState } = require('./src/modules/ticketFlow'); // Import flowState
const { 
  CRYPTO_WALLET_ADDRESSES,
  PAYMENT_METHODS,
  EMOJIS,
  PAYMENT_STAFF,
  ROLE_IDS
} = require('./src/constants');
const axios = require('axios'); // Added for Solana verification

// Define colors
const DEFAULT_EMBED_COLOR = '#e68df2';
const PAYPAL_BLUE_COLOR = '#0079C1';

// Track active crypto payments with their timeout IDs
const activeCryptoPayments = new Map();

// Track active payment timeouts
const activePaymentTimeouts = new Map();

/**
 * Check if transaction ID has been used before (database check)
 * @param {string} txId - Transaction ID to check
 * @returns {Promise<boolean>} - True if transaction has been used
 */
async function isTransactionIdUsed(txId) {
  try {
    const db = require('./database');
    await db.waitUntilConnected();
    
    const result = await db.query(
      'SELECT 1 FROM crypto_payments WHERE transaction_id = $1 LIMIT 1',
      [txId]
    );
    
    const isUsed = result.rows.length > 0;
    console.log(`[CRYPTO_SECURITY] Transaction ID ${txId} usage check: ${isUsed ? 'USED' : 'UNUSED'}`);
    return isUsed;
    
  } catch (error) {
    console.error('[CRYPTO_SECURITY] Error checking transaction ID usage:', error);
    // On database error, err on the side of security - reject transaction
    return true;
  }
}

/**
 * Store transaction ID in database to prevent reuse
 * @param {string} txId - Transaction ID to store
 * @param {string} channelId - Channel ID where transaction occurred
 * @param {string} userId - User ID who submitted transaction
 * @param {string} cryptoType - Type of crypto (bitcoin, litecoin, solana)
 * @param {number} eurAmount - EUR amount
 * @param {string} senderAddress - Sender's wallet address
 * @returns {Promise<boolean>} - Success status
 */
async function storeTransactionId(txId, channelId, userId, cryptoType, eurAmount, senderAddress) {
  try {
    const db = require('./database');
    await db.waitUntilConnected();
    
    // Get our receiving address based on crypto type
    let ourAddress = '';
    switch (cryptoType.toLowerCase()) {
      case 'bitcoin':
        ourAddress = 'bc1qcxrteqq6rgr4u5s6hg9n4d27zar22ssgzx7s8v';
        break;
      case 'litecoin':
        ourAddress = 'LMEBUghAdAKKdNTtUBExHyN33b6JS75TkH';
        break;
      case 'solana':
        ourAddress = 'B9z5EhzPnPFf8t5CptAArYRFhzkrQkv1i7URz1pVSNdH';
        break;
      default:
        console.error(`[CRYPTO_SECURITY] Unknown crypto type: ${cryptoType}`);
        return false;
    }
    
    const result = await db.query(`
      INSERT INTO crypto_payments (
        ticket_channel_id, user_id, crypto_type, eur_amount, crypto_amount,
        exchange_rate, our_address, transaction_id, sender_address, status,
        confirmation_target, timeout_at, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted', $10, NOW() + INTERVAL '30 minutes', NOW())
      ON CONFLICT (transaction_id) DO NOTHING
      RETURNING id
    `, [
      channelId, userId, cryptoType.toLowerCase(), eurAmount, 0, // crypto_amount and exchange_rate will be calculated
      0, ourAddress, txId, senderAddress, 1 // confirmation_target
    ]);
    
    const success = result.rows.length > 0;
    if (success) {
      console.log(`[CRYPTO_SECURITY] Successfully stored transaction ID ${txId} for user ${userId}`);
    } else {
      console.log(`[CRYPTO_SECURITY] Transaction ID ${txId} already exists in database`);
    }
    return success;
    
  } catch (error) {
    console.error('[CRYPTO_SECURITY] Error storing transaction ID:', error);
    return false;
  }
}

/**
 * Validate transaction age (must be within 30 minutes)
 * @param {Date} transactionTime - Time when transaction was created
 * @returns {boolean} - True if transaction is recent enough
 */
function isTransactionRecent(transactionTime) {
  const now = new Date();
  const ageInMinutes = (now - transactionTime) / (1000 * 60);
  const isRecent = ageInMinutes <= 30;
  
  console.log(`[CRYPTO_SECURITY] Transaction age: ${ageInMinutes.toFixed(2)} minutes, recent: ${isRecent}`);
  return isRecent;
}

/**
 * Set up 30-minute timeout for payment information embed
 */
function setupPaymentTimeout(messageId, channelId, cryptoType, price) {
  try {
    console.log(`[PAYMENT_TIMEOUT] Setting up 30-minute timeout for ${cryptoType} payment embed ${messageId}`);
    
    // Clear any existing timeout for this message
    if (activePaymentTimeouts.has(messageId)) {
      clearTimeout(activePaymentTimeouts.get(messageId).timeoutId);
    }
    
    // Set 30-minute timeout
    const timeoutId = setTimeout(async () => {
      try {
        console.log(`[PAYMENT_TIMEOUT] Executing timeout for ${cryptoType} payment embed ${messageId}`);
        
        // Get the Discord client
        let client;
        if (global.discordClient) {
          client = global.discordClient;
        } else {
          const { Client } = require('discord.js');
          client = Client.prototype._client || require('./index.js').client;
        }
        
        if (!client) {
          console.error('[PAYMENT_TIMEOUT] Discord client not available');
          return;
        }
        
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
          console.log(`[PAYMENT_TIMEOUT] Channel ${channelId} no longer exists`);
          activePaymentTimeouts.delete(messageId);
          return;
        }
        
        const message = await channel.messages.fetch(messageId);
        if (!message) {
          console.log(`[PAYMENT_TIMEOUT] Message ${messageId} no longer exists`);
          activePaymentTimeouts.delete(messageId);
          return;
        }
        
        // Create timeout embed
        const timeoutEmbed = new EmbedBuilder()
          .setTitle('Transaction Timed Out')
          .setDescription('The transaction has been timed out because you were inactive for 30 minutes.\n\nIf you would like to re-send the payment, please click the `Refresh Payment Information` button')
          .setColor('#e68df2');
        
        const refreshButton = new ButtonBuilder()
          .setCustomId(`refresh_payment_${cryptoType.toLowerCase()}_${channelId}_${price}`)
          .setLabel('Refresh Payment Information')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('<:7_refresh:1395111615254364181>');
        
        await message.edit({
          embeds: [timeoutEmbed],
          components: [new ActionRowBuilder().addComponents(refreshButton)]
        });
        
        console.log(`[PAYMENT_TIMEOUT] Updated ${cryptoType} payment embed to timeout state`);
        
      } catch (error) {
        console.error(`[PAYMENT_TIMEOUT] Error handling timeout for ${cryptoType}:`, error);
      } finally {
        activePaymentTimeouts.delete(messageId);
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    // Store timeout info
    activePaymentTimeouts.set(messageId, {
      timeoutId,
      cryptoType,
      price,
      channelId
    });
    
  } catch (error) {
    console.error('[PAYMENT_TIMEOUT] Error setting up payment timeout:', error);
  }
}

/**
 * Cancel payment timeout (called when user submits payment form)
 */
function cancelPaymentTimeout(channelId) {
  try {
    // Find and cancel timeout for this channel
    for (const [messageId, timeoutInfo] of activePaymentTimeouts.entries()) {
      if (timeoutInfo.channelId === channelId) {
        clearTimeout(timeoutInfo.timeoutId);
        activePaymentTimeouts.delete(messageId);
        console.log(`[PAYMENT_TIMEOUT] Cancelled timeout for message ${messageId} in channel ${channelId}`);
        break;
      }
    }
  } catch (error) {
    console.error('[PAYMENT_TIMEOUT] Error cancelling timeout:', error);
  }
}

// Create order information embed
async function createOrderInformationEmbed(orderDetails) {
  return new EmbedBuilder()
    .setTitle('Order Information')
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(orderDetails.description || '')
    .addFields(orderDetails.fields || []);
}

// Welcome embed for new tickets with optional staff pings
async function sendWelcomeEmbed(channel, userId, isAutomatedPayment = false) {
  const ownerRoleId = ROLE_IDS && ROLE_IDS.OWNER ? ROLE_IDS.OWNER : '1292933200389083196';
  const adminRoleId = ROLE_IDS && ROLE_IDS.ADMIN ? ROLE_IDS.ADMIN : '1292933924116500532';
  const welcomeEmbed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.\n\nIf there is any more details or information you would like to share, feel free to do so!');
  
  const closeButtonEmoji = EMOJIS.LOCK ? EMOJIS.LOCK : '<:Lock:1349157009244557384>';
  const supportButtonEmoji = '<:Support:1382066889873686608>';
  
  const closeBtnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setEmoji(closeButtonEmoji)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('request_support')
      .setLabel('Request Support')
      .setEmoji(supportButtonEmoji)
      .setStyle(ButtonStyle.Primary)
  );
  
  // For automated payments (PayPal + Crypto) from ticket panel for boosts/carries, only ping user
  // For everything else (semi-automatic payments, profile purchases), ping staff as usual
  const contentPing = isAutomatedPayment 
    ? `<@${userId}>` 
    : `<@${userId}> <@&${ownerRoleId}> <@&${adminRoleId}>`;
  
  console.log(`[WELCOME_EMBED] Sending welcome ${isAutomatedPayment ? '(automated payment - no staff ping)' : '(with staff ping)'} to channel ${channel.id}`);
  
  return await channel.send({ 
    content: contentPing, 
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
    
  const row = new ActionRowBuilder().addComponents(acceptButton, denyButton);
  
  // Find the most recent message in the channel (should be the order details embed)
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 5 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].description?.includes('Current Rank') || 
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
    'This process is fully automatic, you may send the payment already.\n\n' +
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
      '**How to provide the screenshot:**\n' +
      '> • Upload an image file directly to chat\n' +
      '> • Or paste an image URL (imgur, Discord attachment links, etc.)\n\n' +
      'Please paste your screenshot or image URL in the chat.'
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

  // Get price and calculate Litecoin amount
  let eurPrice = price;
  let litecoinAmountText = '';
  let formattedAmount = 'calculating'; // Default value
  
  // If price not provided, try to extract from channel messages
  if (!eurPrice) {
    try {
      const messages = await ticketChannel.messages.fetch({ limit: 20 });
      const priceMessage = messages.find(msg => 
        msg.embeds.length > 0 && 
        (msg.embeds[0].title === 'Order Information' || 
         msg.embeds[0].description?.includes('Current Rank') ||
         msg.embeds[0].description?.includes('Current Trophies'))
      );
      
      if (priceMessage) {
        const priceField = priceMessage.embeds[0].fields?.find(f => f.name === 'Price' || f.name === '**Price:**');
        if (priceField) {
          const priceMatch = priceField.value.match(/€(\d+(?:\.\d+)?)/);
          if (priceMatch && priceMatch[1]) {
            eurPrice = parseFloat(priceMatch[1]);
          }
        }
      }
    } catch (error) {
      console.error('[LITECOIN] Error extracting price:', error);
    }
  }
  
  // Calculate Litecoin amount if we have a price
  if (eurPrice && eurPrice > 0) {
    try {
      const cryptoPrices = await fetchCryptoPricesFromBinance();
      const ltcAmount = convertEurToCrypto(eurPrice, 'LTC', cryptoPrices);
      formattedAmount = formatCryptoAmount(ltcAmount, 'LTC');
      litecoinAmountText = `\n**Litecoin Amount:**\n\`${formattedAmount} LTC\`\n`;
      console.log(`[LITECOIN] Calculated amount: ${formattedAmount} LTC for €${eurPrice}`);
    } catch (error) {
      console.error('[LITECOIN] Error calculating crypto amount:', error);
      litecoinAmountText = `\n**Litecoin Amount:**\n\`Calculating...\`\n`;
    }
  }

  const litecoinDescription = 
    `**Litecoin Address:**\n\`${litecoinAddress}\`\n${litecoinAmountText}\n` +
    'This process is fully automatic, you may send the payment already.\n\n' +
    '**We will not cover any transaction fees.**\n' +
    'Make sure to check on the fees yourself, we use Exodus wallet to receive your payment.';

    const litecoinEmbed = new EmbedBuilder()
      .setTitle('Litecoin Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(litecoinDescription);

  const copyAddressButton = new ButtonBuilder()
      .setCustomId('copy_ltc_address')
      .setLabel('Copy Address')
    .setEmoji(copyEmoji)
      .setStyle(ButtonStyle.Primary);

  const copyAmountButton = new ButtonBuilder()
      .setCustomId(`copy_ltc_amount_${formattedAmount || 'calculating'}`)
      .setLabel('Copy Amount')
    .setEmoji('<:copy:1372240644013035671>')
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_ltc')
      .setLabel('Payment Completed')
    .setEmoji(checkmarkEmoji)
      .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyAddressButton, copyAmountButton, paymentButton);

  // Find the order details message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].title === 'Order Information' || 
       msg.embeds[0].description?.includes('Current Rank') ||
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (orderDetailsMsg) {
      const sentMessage = await orderDetailsMsg.reply({ 
        content: `<@${userId}>`, 
        embeds: [litecoinEmbed], 
        components: [row] 
    });
      
      // Set up 30-minute timeout
      setupPaymentTimeout(sentMessage.id, ticketChannel.id, 'Litecoin', eurPrice || 0);
      
      return sentMessage;
    }
  } catch (error) {
    console.error(`[LITECOIN] Error finding order details message to reply to: ${error.message}`);
  }

  // Fallback: send as regular message
  const sentMessage = await ticketChannel.send({ 
    content: `<@${userId}>`, 
    embeds: [litecoinEmbed], 
    components: [row] 
  });
  
  // Set up 30-minute timeout
  setupPaymentTimeout(sentMessage.id, ticketChannel.id, 'Litecoin', eurPrice || 0);
  
  return sentMessage;
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

  // Get price and calculate Bitcoin amount
  let eurPrice = null;
  let bitcoinAmountText = '';
  let formattedAmount = 'calculating'; // Default value
  
  // Try to extract price from channel messages
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 20 });
    const priceMessage = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].title === 'Order Information' || 
       msg.embeds[0].description?.includes('Current Rank') ||
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (priceMessage) {
      const priceField = priceMessage.embeds[0].fields?.find(f => f.name === 'Price' || f.name === '**Price:**');
      if (priceField) {
        const priceMatch = priceField.value.match(/€(\d+(?:\.\d+)?)/);
        if (priceMatch && priceMatch[1]) {
          eurPrice = parseFloat(priceMatch[1]);
        }
      }
    }
  } catch (error) {
    console.error('[BITCOIN] Error extracting price:', error);
  }
  
  // Calculate Bitcoin amount if we have a price
  if (eurPrice && eurPrice > 0) {
    try {
      const cryptoPrices = await fetchCryptoPricesFromBinance();
      const btcAmount = convertEurToCrypto(eurPrice, 'BTC', cryptoPrices);
      formattedAmount = formatCryptoAmount(btcAmount, 'BTC');
      bitcoinAmountText = `\n**Bitcoin Amount:**\n\`${formattedAmount} BTC\`\n`;
      console.log(`[BITCOIN] Calculated amount: ${formattedAmount} BTC for €${eurPrice}`);
    } catch (error) {
      console.error('[BITCOIN] Error calculating crypto amount:', error);
      bitcoinAmountText = `\n**Bitcoin Amount:**\n\`Calculating...\`\n`;
    }
  }

  const bitcoinDescription = 
    `**Bitcoin Address:**\n\`${bitcoinAddress}\`\n${bitcoinAmountText}\n` +
    'This process is fully automatic, you may send the payment already.\n\n' +
    '**We will not cover any transaction fees.**\n' +
    'Make sure to check on the fees yourself, we use Exodus wallet to receive your payment.';

    const bitcoinEmbed = new EmbedBuilder()
      .setTitle('Bitcoin Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(bitcoinDescription);

  const copyAddressButton = new ButtonBuilder()
      .setCustomId('copy_btc_address')
      .setLabel('Copy Address')
    .setEmoji(copyEmoji)
      .setStyle(ButtonStyle.Primary);

  const copyAmountButton = new ButtonBuilder()
      .setCustomId(`copy_btc_amount_${formattedAmount || 'calculating'}`)
      .setLabel('Copy Amount')
    .setEmoji('<:copy:1372240644013035671>')
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_btc')
      .setLabel('Payment Completed')
    .setEmoji(checkmarkEmoji)
      .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyAddressButton, copyAmountButton, paymentButton);

  // Find the order details message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].description?.includes('Current Rank') || 
       msg.embeds[0].description?.includes('Current Trophies') ||
       msg.embeds[0].description?.includes('Final Price'))
    );
    
    if (orderDetailMsg) {
      const sentMessage = await orderDetailMsg.reply({ 
        content: `<@${userId}>`, 
        embeds: [bitcoinEmbed], 
        components: [row] 
    });
      
      // Set up 30-minute timeout
      setupPaymentTimeout(sentMessage.id, ticketChannel.id, 'Bitcoin', eurPrice || 0);
      
      return sentMessage;
    }
  } catch (error) {
    console.error(`[BITCOIN_INFO] Error finding order details message to reply to: ${error.message}`);
  }
  
  // Fallback: send as regular message
  const sentMessage = await ticketChannel.send({ 
    content: `<@${userId}>`,
    embeds: [bitcoinEmbed],
    components: [row]
  });
  
  // Set up 30-minute timeout
  setupPaymentTimeout(sentMessage.id, ticketChannel.id, 'Bitcoin', eurPrice || 0);
  
  return sentMessage;
}

// Create Bitcoin Transfer ID modal
async function createBitcoinTxModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('bitcoin_tx_modal')
    .setTitle('Bitcoin Payment Confirmation');

  const senderAddressInput = new TextInputBuilder()
    .setCustomId('bitcoin_sender_address')
    .setLabel('Your Wallet Address (Sender)')
    .setPlaceholder('Your Bitcoin wallet address that sent the payment')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const txIdInput = new TextInputBuilder()
    .setCustomId('bitcoin_tx_id')
    .setLabel('Transaction ID')
    .setPlaceholder('The TXid of the transaction')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const firstActionRow = new ActionRowBuilder().addComponents(senderAddressInput);
  const secondActionRow = new ActionRowBuilder().addComponents(txIdInput);
  modal.addComponents(firstActionRow, secondActionRow);

  await interaction.showModal(modal);
}

// Handle Bitcoin Transfer ID modal submission with automatic verification
async function handleBitcoinTxModalSubmission(interaction) {
  try {
    const senderAddress = interaction.fields.getTextInputValue('bitcoin_sender_address').trim();
    const txId = interaction.fields.getTextInputValue('bitcoin_tx_id').trim();
    
    console.log(`[BITCOIN_TX] User ${interaction.user.id} submitted Bitcoin payment with TX ID: ${txId} from address: ${senderAddress}`);
    
    // Validate Bitcoin address format (various formats possible)
    if (!senderAddress || senderAddress.length < 26 || senderAddress.length > 62) {
      return await interaction.reply({
        content: '❌ Invalid Bitcoin wallet address format. Please provide a valid Bitcoin address (26-62 characters).',
      ephemeral: true
    });
    }
    
    // Check for common Bitcoin address prefixes
    if (!senderAddress.match(/^(1|3|bc1|tb1)/)) {
      return await interaction.reply({
        content: '❌ Invalid Bitcoin address format. Address must start with 1, 3, bc1, or tb1.',
        ephemeral: true
      });
    }
    
    // Validate transaction ID format (64 character hex string)
    if (!txId || txId.length !== 64 || !/^[a-fA-F0-9]+$/.test(txId)) {
      return await interaction.reply({
        content: '❌ Invalid Bitcoin transaction ID format. Please provide a valid 64-character hexadecimal transaction ID.',
        ephemeral: true
      });
    }

    // SECURITY CHECK: Check if transaction ID has been used before
    const txIdUsed = await isTransactionIdUsed(txId);
    if (txIdUsed) {
      return await interaction.reply({
        content: '❌ This transaction ID has already been used. Please provide a different transaction or contact staff if you believe this is an error.',
        ephemeral: true
      });
    }
    
    // Cancel payment timeout since user submitted form
    cancelPaymentTimeout(interaction.channel.id);
    
    // Defer reply immediately
    await interaction.deferReply({ ephemeral: true });
    
    // Get expected price from channel messages
    let expectedPrice = 0;
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      const priceMessage = messages.find(msg => 
        msg.embeds.length > 0 && 
        (msg.embeds[0].title === 'Order Information' || 
         msg.embeds[0].description?.includes('Current Rank') ||
         msg.embeds[0].description?.includes('Current Trophies'))
      );
      
      if (priceMessage) {
        const priceField = priceMessage.embeds[0].fields?.find(f => f.name === 'Price' || f.name === '**Price:**');
        if (priceField) {
          const priceMatch = priceField.value.match(/€(\d+(?:\.\d+)?)/);
          if (priceMatch && priceMatch[1]) {
            expectedPrice = parseFloat(priceMatch[1]);
          }
        }
      }
    } catch (error) {
      console.error('[BITCOIN_TX] Error extracting expected price:', error);
    }
    
    console.log(`[BITCOIN_TX] Expected price: €${expectedPrice}`);
    
    // If expected price is 0, try to extract from embed description
    if (expectedPrice === 0) {
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 20 });
        const bitcoinMessage = messages.find(msg => 
          msg.embeds.length > 0 && 
          msg.embeds[0].title === 'Bitcoin Payment Information'
        );
        
        if (bitcoinMessage && bitcoinMessage.embeds[0].description) {
          const amountMatch = bitcoinMessage.embeds[0].description.match(/\*\*Bitcoin Amount:\*\*\s*`([\d.]+)\s*BTC`/);
          if (amountMatch) {
            // Get current BTC price to calculate EUR equivalent
            try {
              const { fetchCryptoPricesFromBinance } = require('./src/utils/cryptoPrices');
              const cryptoPrices = await fetchCryptoPricesFromBinance();
              expectedPrice = parseFloat(amountMatch[1]) * cryptoPrices.BTC;
              console.log(`[BITCOIN_TX] Extracted price from embed: €${expectedPrice}`);
            } catch (priceError) {
              console.error('[BITCOIN_TX] Error calculating price from amount:', priceError);
            }
          }
        }
      } catch (error) {
        console.error('[BITCOIN_TX] Error extracting price from embed:', error);
      }
    }
    
    // Automatically verify the Bitcoin transaction
    const { verifyBitcoinTransaction } = require('./src/utils/blockCypher');
    const verificationResult = await verifyBitcoinTransaction(txId, senderAddress, expectedPrice);
    
    if (verificationResult.success) {
      if (verificationResult.confirmed) {
        console.log(`[BITCOIN_TX] Verification successful and confirmed for user ${interaction.user.id}`);
        
        // Store transaction ID in database to prevent reuse
        const storeSuccess = await storeTransactionId(txId, interaction.channel.id, interaction.user.id, 'bitcoin', expectedPrice, senderAddress);
        if (!storeSuccess) {
          console.error(`[BITCOIN_TX] Failed to store transaction ID ${txId} in database`);
        }
        
        // Send success log
        await sendSuccessfulPaymentLog(interaction.client, txId, senderAddress, 'Bitcoin');
        
        // Send boost available embed
        await sendBoostAvailableEmbed(interaction.channel, {}, interaction.user.id);
        
        await interaction.editReply({
          content: '✅ Payment verified successfully! Your boost is now available.',
          ephemeral: true
        });
        
      } else {
        console.log(`[BITCOIN_TX] Verification successful but unconfirmed for user ${interaction.user.id}`);
        
        // Send confirmations waiting embed
        await sendConfirmationsWaitingEmbed(interaction.channel, interaction.user.id, 'Bitcoin');
        
        await interaction.editReply({
          content: '⏰ Payment verified but waiting for confirmations. Please wait...',
          ephemeral: true
        });
        
        // Set up confirmation checking
        await setupConfirmationChecking(txId, senderAddress, expectedPrice, interaction.channel, interaction.user.id, 'Bitcoin');
      }
    } else {
      console.log(`[BITCOIN_TX] Verification failed for user ${interaction.user.id}: ${verificationResult.reason}`);
      
      if (verificationResult.reason === 'INSUFFICIENT_AMOUNT') {
        // Send insufficient amount embed to staff
        await sendInsufficientAmountEmbed(interaction.channel, interaction.user.id, 'btc');
        
        await interaction.editReply({
          content: 'Insufficient amount detected. Staff have been notified to resolve this issue.',
          ephemeral: true
        });
      } else {
        // Send Request Support option (with shorter custom ID)
        const shortTxId = txId.length > 20 ? txId.substring(0, 20) + '...' : txId;
        await interaction.editReply({
          content: 'No transaction found. If you sent the money and something went wrong, click the `Request Support` button.\n\nDo not abuse the Request Support button, if you did not send the money you will be punished.',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`crypto_support_${interaction.channel.id.slice(-10)}_${shortTxId}`)
                .setLabel('Request Support')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Support:1382066889873686608>')
            )
          ],
          ephemeral: true
        });
      }
    }
    
  } catch (error) {
    console.error(`[BITCOIN_TX] Error handling Bitcoin TX modal submission: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    } else {
      await interaction.editReply({
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

  const senderAddressInput = new TextInputBuilder()
    .setCustomId('litecoin_sender_address')
    .setLabel('Your Wallet Address (Sender)')
    .setPlaceholder('Your Litecoin wallet address that sent the payment')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const txIdInput = new TextInputBuilder()
    .setCustomId('litecoin_tx_id')
    .setLabel('Transaction ID')
    .setPlaceholder('The TXid of the transaction')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const firstActionRow = new ActionRowBuilder().addComponents(senderAddressInput);
  const secondActionRow = new ActionRowBuilder().addComponents(txIdInput);
  modal.addComponents(firstActionRow, secondActionRow);

  await interaction.showModal(modal);
}

// Handle Litecoin Transfer ID modal submission with automatic verification
async function handleLitecoinTxModalSubmission(interaction) {
  try {
    const senderAddress = interaction.fields.getTextInputValue('litecoin_sender_address').trim();
    const txId = interaction.fields.getTextInputValue('litecoin_tx_id').trim();
    
    console.log(`[LITECOIN_TX] User ${interaction.user.id} submitted Litecoin payment with TX ID: ${txId} from address: ${senderAddress}`);
    
    // Validate Litecoin address format
    if (!senderAddress || senderAddress.length < 26 || senderAddress.length > 62) {
      return await interaction.reply({
        content: '❌ Invalid Litecoin wallet address format. Please provide a valid Litecoin address (26-62 characters).',
      ephemeral: true
    });
    }
    
    // Check for common Litecoin address prefixes
    if (!senderAddress.match(/^(L|M|ltc1)/)) {
      return await interaction.reply({
        content: '❌ Invalid Litecoin address format. Address must start with L, M, or ltc1.',
        ephemeral: true
      });
    }
    
    // Validate transaction ID format (64 character hex string)
    if (!txId || txId.length !== 64 || !/^[a-fA-F0-9]+$/.test(txId)) {
      return await interaction.reply({
        content: '❌ Invalid Litecoin transaction ID format. Please provide a valid 64-character hexadecimal transaction ID.',
        ephemeral: true
      });
    }

    // SECURITY CHECK: Check if transaction ID has been used before
    const txIdUsed = await isTransactionIdUsed(txId);
    if (txIdUsed) {
      return await interaction.reply({
        content: '❌ This transaction ID has already been used. Please provide a different transaction or contact staff if you believe this is an error.',
        ephemeral: true
      });
    }
    
    // Cancel payment timeout since user submitted form
    cancelPaymentTimeout(interaction.channel.id);
    
    // Defer reply immediately
    await interaction.deferReply({ ephemeral: true });
    
    // Get expected price from channel messages
    let expectedPrice = 0;
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      const priceMessage = messages.find(msg => 
        msg.embeds.length > 0 && 
        (msg.embeds[0].title === 'Order Information' || 
         msg.embeds[0].description?.includes('Current Rank') ||
         msg.embeds[0].description?.includes('Current Trophies'))
      );
      
      if (priceMessage) {
        const priceField = priceMessage.embeds[0].fields?.find(f => f.name === 'Price' || f.name === '**Price:**');
        if (priceField) {
          const priceMatch = priceField.value.match(/€(\d+(?:\.\d+)?)/);
          if (priceMatch && priceMatch[1]) {
            expectedPrice = parseFloat(priceMatch[1]);
          }
        }
      }
    } catch (error) {
      console.error('[LITECOIN_TX] Error extracting expected price:', error);
    }
    
    console.log(`[LITECOIN_TX] Expected price: €${expectedPrice}`);
    
    // If expected price is 0, try to extract from embed description
    if (expectedPrice === 0) {
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 20 });
        const litecoinMessage = messages.find(msg => 
          msg.embeds.length > 0 && 
          msg.embeds[0].title === 'Litecoin Payment Information'
        );
        
        if (litecoinMessage && litecoinMessage.embeds[0].description) {
          const amountMatch = litecoinMessage.embeds[0].description.match(/\*\*Litecoin Amount:\*\*\s*`([\d.]+)\s*LTC`/);
          if (amountMatch) {
            // Get current LTC price to calculate EUR equivalent
            try {
              const { fetchCryptoPricesFromBinance } = require('./src/utils/cryptoPrices');
              const cryptoPrices = await fetchCryptoPricesFromBinance();
              expectedPrice = parseFloat(amountMatch[1]) * cryptoPrices.LTC;
              console.log(`[LITECOIN_TX] Extracted price from embed: €${expectedPrice}`);
            } catch (priceError) {
              console.error('[LITECOIN_TX] Error calculating price from amount:', priceError);
            }
          }
        }
      } catch (error) {
        console.error('[LITECOIN_TX] Error extracting price from embed:', error);
      }
    }
    
    // Automatically verify the Litecoin transaction
    const { verifyLitecoinTransaction } = require('./src/utils/blockCypher');
    const verificationResult = await verifyLitecoinTransaction(txId, senderAddress, expectedPrice);
    
    if (verificationResult.success) {
      if (verificationResult.confirmed) {
        console.log(`[LITECOIN_TX] Verification successful and confirmed for user ${interaction.user.id}`);
        
        // Store transaction ID in database to prevent reuse
        const storeSuccess = await storeTransactionId(txId, interaction.channel.id, interaction.user.id, 'litecoin', expectedPrice, senderAddress);
        if (!storeSuccess) {
          console.error(`[LITECOIN_TX] Failed to store transaction ID ${txId} in database`);
        }
        
        // Send success log
        await sendSuccessfulPaymentLog(interaction.client, txId, senderAddress, 'Litecoin');
        
        // Send boost available embed
        await sendBoostAvailableEmbed(interaction.channel, {}, interaction.user.id);
        
        await interaction.editReply({
          content: '✅ Payment verified successfully! Your boost is now available.',
          ephemeral: true
        });
        
      } else {
        console.log(`[LITECOIN_TX] Verification successful but unconfirmed for user ${interaction.user.id}`);
        
        // Send confirmations waiting embed
        await sendConfirmationsWaitingEmbed(interaction.channel, interaction.user.id, 'Litecoin');
        
        await interaction.editReply({
          content: '⏰ Payment verified but waiting for confirmations. Please wait...',
          ephemeral: true
        });
        
        // Set up confirmation checking
        await setupConfirmationChecking(txId, senderAddress, expectedPrice, interaction.channel, interaction.user.id, 'Litecoin');
      }
    } else {
      console.log(`[LITECOIN_TX] Verification failed for user ${interaction.user.id}: ${verificationResult.reason}`);
      
      if (verificationResult.reason === 'INSUFFICIENT_AMOUNT') {
        // Send insufficient amount embed to staff
        await sendInsufficientAmountEmbed(interaction.channel, interaction.user.id, 'ltc');
        
        await interaction.editReply({
          content: 'Insufficient amount detected. Staff have been notified to resolve this issue.',
          ephemeral: true
        });
      } else {
        // Send Request Support option (with shorter custom ID)
        const shortTxId = txId.length > 20 ? txId.substring(0, 20) + '...' : txId;
        await interaction.editReply({
          content: 'No transaction found. If you sent the money and something went wrong, click the `Request Support` button.\n\nDo not abuse the Request Support button, if you did not send the money you will be punished.',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`crypto_support_${interaction.channel.id.slice(-10)}_${shortTxId}`)
                .setLabel('Request Support')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Support:1382066889873686608>')
            )
          ],
          ephemeral: true
        });
      }
    }
    
  } catch (error) {
    console.error(`[LITECOIN_TX] Error handling Litecoin TX modal submission: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    } else {
      await interaction.editReply({
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

  const senderAddressInput = new TextInputBuilder()
    .setCustomId('solana_sender_address')
    .setLabel('Your Wallet Address (Sender)')
    .setPlaceholder('Your Solana wallet address that sent the payment')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const txIdInput = new TextInputBuilder()
    .setCustomId('solana_tx_id')
    .setLabel('Transaction ID / Signature')
    .setPlaceholder('The signature of the transaction.')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const firstActionRow = new ActionRowBuilder().addComponents(senderAddressInput);
  const secondActionRow = new ActionRowBuilder().addComponents(txIdInput);
  modal.addComponents(firstActionRow, secondActionRow);

  await interaction.showModal(modal);
}

// Handle Solana Transfer ID modal submission with automatic verification
async function handleSolanaTxModalSubmission(interaction) {
  try {
    const senderAddress = interaction.fields.getTextInputValue('solana_sender_address').trim();
    const txId = interaction.fields.getTextInputValue('solana_tx_id').trim();
    
    console.log(`[SOLANA_TX] User ${interaction.user.id} submitted Solana payment with TX ID: ${txId} from address: ${senderAddress}`);
    
    // Validate Solana address format (base58, 32-44 characters)
    if (!senderAddress || senderAddress.length < 32 || senderAddress.length > 44 || !/^[A-Za-z0-9]+$/.test(senderAddress)) {
      return await interaction.reply({
        content: '❌ Invalid Solana wallet address format. Please provide a valid Solana address (32-44 characters, base58 encoded).',
      ephemeral: true
    });
    }
    
    // Validate transaction ID format (base58, typically around 88 characters)
    if (!txId || txId.length < 80 || txId.length > 100 || !/^[A-Za-z0-9]+$/.test(txId)) {
      return await interaction.reply({
        content: '❌ Invalid Solana transaction signature format. Please provide a valid signature (around 88 characters, base58 encoded).',
        ephemeral: true
      });
    }

    // SECURITY CHECK: Check if transaction ID has been used before
    const txIdUsed = await isTransactionIdUsed(txId);
    if (txIdUsed) {
      return await interaction.reply({
        content: '❌ This transaction ID has already been used. Please provide a different transaction or contact staff if you believe this is an error.',
        ephemeral: true
      });
    }
    
    // Cancel payment timeout since user submitted form
    cancelPaymentTimeout(interaction.channel.id);
    
    // Defer reply immediately
    await interaction.deferReply({ ephemeral: true });
    
    // Get expected price from channel messages
    let expectedPrice = 0;
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      const priceMessage = messages.find(msg => 
        msg.embeds.length > 0 && 
        (msg.embeds[0].title === 'Order Information' || 
         msg.embeds[0].description?.includes('Current Rank') ||
         msg.embeds[0].description?.includes('Current Trophies'))
      );
      
      if (priceMessage) {
        const priceField = priceMessage.embeds[0].fields?.find(f => f.name === 'Price' || f.name === '**Price:**');
        if (priceField) {
          const priceMatch = priceField.value.match(/€(\d+(?:\.\d+)?)/);
          if (priceMatch && priceMatch[1]) {
            expectedPrice = parseFloat(priceMatch[1]);
          }
        }
      }
    } catch (error) {
      console.error('[SOLANA_TX] Error extracting expected price:', error);
    }
    
    console.log(`[SOLANA_TX] Expected price: €${expectedPrice}`);
    
    // If expected price is 0, try to extract from embed description
    if (expectedPrice === 0) {
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 20 });
        const solanaMessage = messages.find(msg => 
          msg.embeds.length > 0 && 
          msg.embeds[0].title === 'Solana Payment Information'
        );
        
        if (solanaMessage && solanaMessage.embeds[0].description) {
          const amountMatch = solanaMessage.embeds[0].description.match(/\*\*Solana Amount:\*\*\s*`([\d.]+)\s*SOL`/);
          if (amountMatch) {
            // Get current SOL price to calculate EUR equivalent
            try {
              const { fetchCryptoPricesFromBinance } = require('./src/utils/cryptoPrices');
              const cryptoPrices = await fetchCryptoPricesFromBinance();
              expectedPrice = parseFloat(amountMatch[1]) * cryptoPrices.SOL;
              console.log(`[SOLANA_TX] Extracted price from embed: €${expectedPrice}`);
            } catch (priceError) {
              console.error('[SOLANA_TX] Error calculating price from amount:', priceError);
            }
          }
        }
      } catch (error) {
        console.error('[SOLANA_TX] Error extracting price from embed:', error);
      }
    }
    
    // Automatically verify the Solana transaction with enhanced security
    const verificationResult = await verifySolanaTransaction(txId, senderAddress, expectedPrice, interaction.channel);
    
    if (verificationResult.success) {
      console.log(`[SOLANA_TX] Verification successful for user ${interaction.user.id}`);
      
      // Store transaction ID in database to prevent reuse
      const storeSuccess = await storeTransactionId(txId, interaction.channel.id, interaction.user.id, 'solana', expectedPrice, senderAddress);
      if (!storeSuccess) {
        console.error(`[SOLANA_TX] Failed to store transaction ID ${txId} in database`);
      }
      
      // Send success log
      await sendSuccessfulPaymentLog(interaction.client, txId, senderAddress, 'Solana');
      
      // Send boost available embed
      await sendBoostAvailableEmbed(interaction.channel, {}, interaction.user.id);
      
      await interaction.editReply({
        content: '✅ Payment verified successfully! Your boost is now available.',
        ephemeral: true
      });
      
    } else {
      console.log(`[SOLANA_TX] Verification failed for user ${interaction.user.id}: ${verificationResult.reason}`);
      
      if (verificationResult.reason === 'INSUFFICIENT_AMOUNT') {
        // Send insufficient amount embed to staff
        await sendInsufficientAmountEmbed(interaction.channel, interaction.user.id, 'sol');
        
        await interaction.editReply({
          content: 'Insufficient amount detected. Staff have been notified to resolve this issue.',
          ephemeral: true
        });
      } else {
        // Send Request Support option for all other failures (with shorter custom ID)
        const shortTxId = txId.length > 20 ? txId.substring(0, 20) + '...' : txId;
        await interaction.editReply({
          content: 'No transaction found. If you sent the money and something went wrong, click the `Request Support` button.\n\nDo not abuse the Request Support button, if you did not send the money you will be punished.',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`crypto_support_${interaction.channel.id.slice(-10)}_${shortTxId}`)
                .setLabel('Request Support')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Support:1382066889873686608>')
            )
          ],
          ephemeral: true
        });
      }
    }
    
  } catch (error) {
    console.error(`[SOLANA_TX] Error handling Solana TX modal submission: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    } else {
      await interaction.editReply({
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

  // Get price and calculate Solana amount
  let eurPrice = price;
  let solanaAmountText = '';
  let formattedAmount = 'calculating'; // Default value
  
  // If price not provided, try to extract from channel messages
  if (!eurPrice) {
    try {
      const messages = await ticketChannel.messages.fetch({ limit: 20 });
      const priceMessage = messages.find(msg => 
        msg.embeds.length > 0 && 
        (msg.embeds[0].title === 'Order Information' || 
         msg.embeds[0].description?.includes('Current Rank') ||
         msg.embeds[0].description?.includes('Current Trophies'))
      );
      
      if (priceMessage) {
        const priceField = priceMessage.embeds[0].fields?.find(f => f.name === 'Price' || f.name === '**Price:**');
        if (priceField) {
          const priceMatch = priceField.value.match(/€(\d+(?:\.\d+)?)/);
          if (priceMatch && priceMatch[1]) {
            eurPrice = parseFloat(priceMatch[1]);
          }
        }
      }
    } catch (error) {
      console.error('[SOLANA] Error extracting price:', error);
    }
  }
  
  // Calculate Solana amount if we have a price
  if (eurPrice && eurPrice > 0) {
    try {
      const cryptoPrices = await fetchCryptoPricesFromBinance();
      const solAmount = convertEurToCrypto(eurPrice, 'SOL', cryptoPrices);
      formattedAmount = formatCryptoAmount(solAmount, 'SOL');
      solanaAmountText = `\n**Solana Amount:**\n\`${formattedAmount} SOL\`\n`;
      console.log(`[SOLANA] Calculated amount: ${formattedAmount} SOL for €${eurPrice}`);
    } catch (error) {
      console.error('[SOLANA] Error calculating crypto amount:', error);
      solanaAmountText = `\n**Solana Amount:**\n\`Calculating...\`\n`;
    }
  }

  const solanaDescription = 
    `**Solana Address:**\n\`${solanaAddress}\`\n${solanaAmountText}\n` +
    'This process is fully automatic, you may send the payment already.\n\n' +
    '**We will not cover any transaction fees.**\n' +
    'Make sure to check on the fees yourself, we use Exodus wallet to receive your payment.';

    const solanaEmbed = new EmbedBuilder()
      .setTitle('Solana Payment Information')
      .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(solanaDescription);

  const copyAddressButton = new ButtonBuilder()
      .setCustomId('copy_sol_address')
      .setLabel('Copy Address')
    .setEmoji(copyEmoji)
      .setStyle(ButtonStyle.Primary);

  const copyAmountButton = new ButtonBuilder()
      .setCustomId(`copy_sol_amount_${formattedAmount || 'calculating'}`)
      .setLabel('Copy Amount')
    .setEmoji('<:copy:1372240644013035671>')
      .setStyle(ButtonStyle.Primary);
      
    const paymentButton = new ButtonBuilder()
      .setCustomId('payment_completed_sol')
      .setLabel('Payment Completed')
    .setEmoji(checkmarkEmoji)
      .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(copyAddressButton, copyAmountButton, paymentButton);

  // Find the order details message to reply to
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].title === 'Order Information' || 
       msg.embeds[0].description?.includes('Current Rank') ||
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (orderDetailsMsg) {
      const sentMessage = await orderDetailsMsg.reply({ 
        content: `<@${userId}>`, 
        embeds: [solanaEmbed], 
        components: [row] 
    });
      
      // Set up 30-minute timeout
      setupPaymentTimeout(sentMessage.id, ticketChannel.id, 'Solana', eurPrice || 0);
      
      return sentMessage;
    }
  } catch (error) {
    console.error(`[SOLANA] Error finding order details message to reply to: ${error.message}`);
  }

  // Fallback: send as regular message
  const sentMessage = await ticketChannel.send({ 
    content: `<@${userId}>`, 
    embeds: [solanaEmbed], 
    components: [row] 
  });
  
  // Set up 30-minute timeout
  setupPaymentTimeout(sentMessage.id, ticketChannel.id, 'Solana', eurPrice || 0);
  
  return sentMessage;
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
  
  // Find the order details message to reply to (same as other payment methods)
  try {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    const orderDetailsMsg = messages.find(msg => 
      msg.embeds.length > 0 && 
      (msg.embeds[0].title === 'Order Information' || 
       msg.embeds[0].description?.includes('Current Rank') ||
       msg.embeds[0].description?.includes('Current Trophies'))
    );
    
    if (orderDetailsMsg) {
      return await orderDetailsMsg.reply({ 
        content: `<@${userId}>`, 
        embeds: [ibanEmbed], 
        components: [row] 
      });
    }
  } catch (error) {
    console.error(`[IBAN] Error finding order details message to reply to: ${error.message}`);
  }
  
  // Fallback if we couldn't find the message to reply to
  return await ticketChannel.send({ 
    content: `<@${userId}>`,
    embeds: [ibanEmbed],
    components: [row]
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

  console.log(`[BOOST_AVAILABLE] Starting with orderDetails:`, orderDetails);

  // Enhanced order details extraction
  let extractedDetails = {
    current: orderDetails?.current || 'N/A',
    desired: orderDetails?.desired || 'N/A', 
    price: orderDetails?.price || 'N/A',
    type: orderDetails?.type || 'N/A'
  };
  
  console.log(`[BOOST_AVAILABLE] Initial order details:`, extractedDetails);
  
  // First try to extract from channel topic if details are missing
  if ((extractedDetails.current === 'N/A' || extractedDetails.desired === 'N/A' || extractedDetails.price === 'N/A') && ticketChannel.topic) {
    console.log(`[BOOST_AVAILABLE] Extracting from channel topic: "${ticketChannel.topic}"`);
    
    // Extract price from topic
    const topicPriceMatch = ticketChannel.topic.match(/Price:\s*([€$]?[\d,.]+)/i);
    if (topicPriceMatch && topicPriceMatch[1]) {
      extractedDetails.price = topicPriceMatch[1].includes('€') ? topicPriceMatch[1] : '€' + topicPriceMatch[1];
      console.log(`[BOOST_AVAILABLE] ✅ Extracted price from topic: ${extractedDetails.price}`);
    }
    
    // Extract from/to ranks from topic
    const topicRanksMatch = ticketChannel.topic.match(/From:\s*([^|]+)\s*to\s*([^|]+)/i);
    if (topicRanksMatch) {
      extractedDetails.current = topicRanksMatch[1].trim();
      extractedDetails.desired = topicRanksMatch[2].trim();
      console.log(`[BOOST_AVAILABLE] ✅ Extracted ranks from topic: ${extractedDetails.current} → ${extractedDetails.desired}`);
    }
    
    // Extract type from topic
    const topicTypeMatch = ticketChannel.topic.match(/Type:\s*(\w+)/i);
    if (topicTypeMatch) {
      extractedDetails.type = topicTypeMatch[1];
      console.log(`[BOOST_AVAILABLE] ✅ Extracted type from topic: ${extractedDetails.type}`);
    }
  }
  
  // If still missing details, try to extract from message history  
  if (extractedDetails.current === 'N/A' || extractedDetails.desired === 'N/A' || extractedDetails.price === 'N/A') {
    try {
      console.log(`[BOOST_AVAILABLE] Searching message history for Order Recap embed...`);
      const messages = await ticketChannel.messages.fetch({ limit: 20 });
      
      // Look for Order Recap embed (exact format from handlerHelpers.js)
      const orderRecapMsg = messages.find(msg => 
        msg.embeds.length > 0 && msg.embeds[0].title === 'Order Recap'
      );
      
      if (orderRecapMsg && orderRecapMsg.embeds[0].fields) {
        console.log(`[BOOST_AVAILABLE] ✅ Found Order Recap embed, extracting fields...`);
        const embed = orderRecapMsg.embeds[0];
        
        for (const field of embed.fields) {
          const fieldName = field.name.toLowerCase();
          const fieldValue = field.value.replace(/[`*]/g, '').trim(); // Remove backticks and bold formatting
          
          console.log(`[BOOST_AVAILABLE] Processing field: "${field.name}" = "${fieldValue}"`);
          
          if (fieldName.includes('current rank')) {
            extractedDetails.current = fieldValue;
            console.log(`[BOOST_AVAILABLE] ✅ Set current rank: ${fieldValue}`);
          } else if (fieldName.includes('desired rank') || fieldName.includes('target rank')) {
            extractedDetails.desired = fieldValue;
            console.log(`[BOOST_AVAILABLE] ✅ Set desired rank: ${fieldValue}`);
          } else if (fieldName.includes('current trophies')) {
            extractedDetails.current = fieldValue + ' trophies';
            console.log(`[BOOST_AVAILABLE] ✅ Set current trophies: ${fieldValue}`);
          } else if (fieldName.includes('desired trophies') || fieldName.includes('target trophies')) {
            extractedDetails.desired = fieldValue + ' trophies';
            console.log(`[BOOST_AVAILABLE] ✅ Set desired trophies: ${fieldValue}`);
          } else if (fieldName.includes('price')) {
            // Handle price field format: `€XX.XX`
            const priceMatch = fieldValue.match(/([€$]?[\d,.]+)/);
            if (priceMatch) {
              extractedDetails.price = priceMatch[1].includes('€') || priceMatch[1].includes('$') ? 
                                     priceMatch[1] : '€' + priceMatch[1];
              console.log(`[BOOST_AVAILABLE] ✅ Set price: ${extractedDetails.price}`);
            }
          } else if (fieldName.includes('boost type')) {
            extractedDetails.type = fieldValue;
            console.log(`[BOOST_AVAILABLE] ✅ Set boost type: ${fieldValue}`);
          }
        }
      } else {
        console.log(`[BOOST_AVAILABLE] ❌ No Order Recap embed found in ${messages.size} messages`);
      }
    } catch (messageError) {
      console.error(`[BOOST_AVAILABLE] Error searching message history: ${messageError.message}`);
    }
  }
  
  console.log(`[BOOST_AVAILABLE] Final extracted details:`, extractedDetails);
  
  // Build the order information text
  let orderDescription = '';
  if (extractedDetails.current !== 'N/A' && extractedDetails.desired !== 'N/A') {
    orderDescription = `**From:** \`${extractedDetails.current}\`\n**To:** \`${extractedDetails.desired}\``;
  } else {
    orderDescription = 'Order details not available';
  }
  
  let priceText = '';
  if (extractedDetails.price !== 'N/A') {
    priceText = `\n**Price:** \`${extractedDetails.price}\``;
  }

  // CRITICAL: Add booster role permissions BEFORE sending the embed
  try {
    console.log(`[BOOST_AVAILABLE] Adding booster role ${roleId} permissions to channel ${ticketChannel.id}`);
    
    // Give the booster role view access to the channel
    await ticketChannel.permissionOverwrites.edit(roleId, {
      ViewChannel: true,
      SendMessages: false, // They can see but not send initially
      AddReactions: false,
      CreatePublicThreads: false
    });
    
    console.log(`[BOOST_AVAILABLE] ✅ Successfully added booster role permissions`);
  } catch (permError) {
    console.error(`[BOOST_AVAILABLE] ❌ Failed to add booster role permissions:`, permError);
    // Continue anyway - the embed can still be sent
  }

  const embed = new EmbedBuilder()
    .setTitle('Boost Available')
    .setDescription(`<@&${roleId}> This boost has been paid for and is available.\n\nClaim this boost by clicking the 'Claim Boost' button below.\n\n**Order Information:**\n${orderDescription}${priceText}`)
    .setColor('#e68df2');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
    .setCustomId('claim_boost')
    .setLabel('Claim Boost')
      .setStyle(ButtonStyle.Success)
      .setEmoji('<:checkmark:1357478063616688304>')
  );

  const sentMsg = await (replyToMessage && typeof replyToMessage.reply === 'function'
    ? replyToMessage.reply({ content: `<@&${roleId}>`, embeds: [embed], components: [row] })
    : ticketChannel.send({ content: `<@&${roleId}>`, embeds: [embed], components: [row] })
  );

  console.log(`[BOOST_AVAILABLE] ✅ Sent boost available embed with ID: ${sentMsg.id}`);
  return sentMsg;
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

/**
 * Verify Solana transaction automatically using Solana RPC with comprehensive security checks
 */
async function verifySolanaTransaction(txId, senderAddress, expectedPriceEUR, channel) {
  try {
    console.log(`[SOLANA_VERIFY] Verifying transaction ${txId} from ${senderAddress} for €${expectedPriceEUR}`);
    
    // Our Solana receiving address
    const OUR_SOLANA_ADDRESS = 'B9z5EhzPnPFf8t5CptAArYRFhzkrQkv1i7URz1pVSNdH';
    
    // Get current SOL price in EUR
    let solPriceEUR;
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur');
      solPriceEUR = response.data.solana.eur;
      console.log(`[SOLANA_VERIFY] Current SOL price: €${solPriceEUR}`);
    } catch (error) {
      console.error('[SOLANA_VERIFY] Error fetching SOL price:', error);
      return { success: false, reason: 'PRICE_FETCH_ERROR' };
    }
    
    // Calculate expected SOL amount
    const expectedSOLAmount = expectedPriceEUR / solPriceEUR;
    console.log(`[SOLANA_VERIFY] Expected SOL amount: ${expectedSOLAmount} SOL`);
    
    // Call Solana RPC to get transaction details
    const rpcEndpoint = 'https://api.mainnet-beta.solana.com';
    
    try {
      const rpcResponse = await axios.post(rpcEndpoint, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          txId,
          {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
            encoding: "jsonParsed"
          }
        ]
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      const transactionData = rpcResponse.data.result;
      
      if (!transactionData) {
        console.log(`[SOLANA_VERIFY] Transaction ${txId} not found`);
        return { success: false, reason: 'TRANSACTION_NOT_FOUND' };
      }
      
      // Check if transaction was successful
      if (transactionData.meta.err) {
        console.log(`[SOLANA_VERIFY] Transaction ${txId} failed:`, transactionData.meta.err);
        return { success: false, reason: 'TRANSACTION_FAILED' };
      }

      // SECURITY CHECK: Validate transaction age (must be within 30 minutes)
      const blockTime = transactionData.blockTime;
      if (blockTime) {
        const transactionTime = new Date(blockTime * 1000); // blockTime is in seconds
        if (!isTransactionRecent(transactionTime)) {
          console.log(`[SOLANA_VERIFY] Transaction too old: ${transactionTime.toISOString()}`);
          return { success: false, reason: 'TRANSACTION_TOO_OLD' };
        }
      } else {
        console.log(`[SOLANA_VERIFY] No blockTime available for transaction ${txId}`);
        return { success: false, reason: 'INVALID_TRANSACTION_DATA' };
      }
      
      // Get account keys and balances
      const accountKeys = transactionData.transaction.message.accountKeys;
      const preBalances = transactionData.meta.preBalances;
      const postBalances = transactionData.meta.postBalances;
      
      // Find our address in the transaction
      let ourAddressIndex = -1;
      let senderAddressIndex = -1;
      
      for (let i = 0; i < accountKeys.length; i++) {
        const account = accountKeys[i];
        const pubkey = account.pubkey || account;
        
        if (pubkey === OUR_SOLANA_ADDRESS) {
          ourAddressIndex = i;
        }
        if (pubkey === senderAddress) {
          senderAddressIndex = i;
        }
      }
      
      // Verify sender address is in transaction
      if (senderAddressIndex === -1) {
        console.log(`[SOLANA_VERIFY] Sender address ${senderAddress} not found in transaction`);
        return { success: false, reason: 'SENDER_MISMATCH' };
      }
      
      // Verify our address received the payment
      if (ourAddressIndex === -1) {
        console.log(`[SOLANA_VERIFY] Our address ${OUR_SOLANA_ADDRESS} not found in transaction`);
        return { success: false, reason: 'INVALID_RECIPIENT' };
      }
      
      // Calculate amount transferred to our address (in lamports, 1 SOL = 1,000,000,000 lamports)
      const ourBalanceChange = postBalances[ourAddressIndex] - preBalances[ourAddressIndex];
      const solReceived = ourBalanceChange / 1000000000; // Convert lamports to SOL
      
      console.log(`[SOLANA_VERIFY] SOL received: ${solReceived} SOL, expected: ${expectedSOLAmount} SOL`);
      
      // Check if we received any amount at all (negative means money was sent OUT of our address)
      if (solReceived <= 0) {
        console.log(`[SOLANA_VERIFY] No payment received to our address: ${solReceived} SOL (negative/zero means transaction was outgoing)`);
        return { success: false, reason: 'INVALID_RECIPIENT' };
      }
      
      // Allow 2% tolerance for price fluctuations and fees
      const tolerance = 0.02;
      const minAcceptableAmount = expectedSOLAmount * (1 - tolerance);
      
      if (solReceived < minAcceptableAmount) {
        console.log(`[SOLANA_VERIFY] Insufficient amount: received ${solReceived} SOL, expected at least ${minAcceptableAmount} SOL`);
        return { success: false, reason: 'INSUFFICIENT_AMOUNT' };
      }
      
      console.log(`[SOLANA_VERIFY] Transaction verification successful!`);
      return { success: true };
      
    } catch (rpcError) {
      console.error('[SOLANA_VERIFY] RPC Error:', rpcError);
      if (rpcError.response?.status === 429) {
        return { success: false, reason: 'RATE_LIMITED' };
      }
      return { success: false, reason: 'RPC_ERROR' };
    }
    
  } catch (error) {
    console.error('[SOLANA_VERIFY] Error verifying Solana transaction:', error);
    return { success: false, reason: 'VERIFICATION_ERROR' };
  }
}

/**
 * Send insufficient amount embed to staff
 */
async function sendInsufficientAmountEmbed(channel, userId, cryptoType) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('<:Support:1382066889873686608> Insufficient Amount')
      .setDescription('An insufficient amount has been sent.\n\nPlease resolve this.')
      .setColor('#e68df2');

    await channel.send({
      content: '<@987751357773672538>', // Current crypto verifier ping
      embeds: [embed]
    });

    console.log(`[INSUFFICIENT_AMOUNT] Sent insufficient amount embed for ${cryptoType} payment from user ${userId}`);
  } catch (error) {
    console.error('[INSUFFICIENT_AMOUNT] Error sending insufficient amount embed:', error);
  }
}

/**
 * Send successful payment log to logging channel
 */
async function sendSuccessfulPaymentLog(client, txId, senderAddress, cryptoType) {
  try {
    const logChannelId = '1354587880382795836';
    
    if (!client) {
      console.error('[SUCCESS_LOG] Discord client not provided');
      return;
    }
    
    const logChannel = await client.channels.fetch(logChannelId);
    
    if (!logChannel) {
      console.error('[SUCCESS_LOG] Log channel not found');
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('Successful Automatic Payment')
      .setDescription('An automatic payment has been successfully made.')
      .setColor('#00ff00')
      .addFields(
        { name: 'Transaction ID', value: `\`${txId}\``, inline: false },
        { name: "Sender's Address", value: `\`${senderAddress}\``, inline: false },
        { name: 'Crypto Type', value: cryptoType, inline: true }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
    console.log(`[SUCCESS_LOG] Sent success log for ${cryptoType} payment: ${txId}`);
    
  } catch (error) {
    console.error('[SUCCESS_LOG] Error sending success log:', error);
  }
}

/**
 * Send confirmations waiting embed
 */
async function sendConfirmationsWaitingEmbed(channel, userId, cryptoType) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('Confirmations')
      .setDescription('Waiting until the transaction has been confirmed.\n\nThis can take a few minutes.')
      .setColor('#e68df2');

    await channel.send({
      content: `<@${userId}>`,
      embeds: [embed]
    });

    console.log(`[CONFIRMATIONS] Sent confirmations waiting embed for ${cryptoType} payment from user ${userId}`);
  } catch (error) {
    console.error('[CONFIRMATIONS] Error sending confirmations waiting embed:', error);
  }
}

/**
 * Set up confirmation checking (checks every 5 minutes for up to 1 hour)
 */
async function setupConfirmationChecking(txId, senderAddress, expectedPrice, channel, userId, cryptoType) {
  let attempts = 0;
  const maxAttempts = 12; // 12 attempts * 5 minutes = 60 minutes (1 hour)
  
  const checkConfirmation = async () => {
    attempts++;
    console.log(`[CONFIRMATION_CHECK] Checking ${cryptoType} confirmation attempt ${attempts}/${maxAttempts} for TX: ${txId}`);
    
    try {
      let verificationResult;
      
      if (cryptoType === 'Bitcoin') {
        const { verifyBitcoinTransaction } = require('./src/utils/blockCypher');
        verificationResult = await verifyBitcoinTransaction(txId, senderAddress, expectedPrice);
      } else if (cryptoType === 'Litecoin') {
        const { verifyLitecoinTransaction } = require('./src/utils/blockCypher');
        verificationResult = await verifyLitecoinTransaction(txId, senderAddress, expectedPrice);
      } else if (cryptoType === 'Solana') {
        verificationResult = await verifySolanaTransaction(txId, senderAddress, expectedPrice, channel);
      }
      
      if (verificationResult.success && verificationResult.confirmed) {
        console.log(`[CONFIRMATION_CHECK] ${cryptoType} transaction confirmed! TX: ${txId}`);
        
        // Send success log
        await sendSuccessfulPaymentLog(channel.client, txId, senderAddress, cryptoType);
        
        // Send boost available embed
        await sendBoostAvailableEmbed(channel, {}, userId);
        
        // Send confirmation message to user
        await channel.send({
          content: `<@${userId}> ✅ Your ${cryptoType} payment has been confirmed! Your boost is now available.`
        });
        
        return; // Stop checking
      }
      
      if (attempts >= maxAttempts) {
        console.log(`[CONFIRMATION_CHECK] ${cryptoType} confirmation timeout after ${maxAttempts} attempts for TX: ${txId}`);
        
        // Send timeout message
        await channel.send({
          content: `<@${userId}> ⏰ Your ${cryptoType} transaction is taking longer than expected to confirm. Staff have been notified to check manually.`
        });
        
        // Notify staff
        await sendInsufficientAmountEmbed(channel, userId, cryptoType.toLowerCase());
        
        return; // Stop checking
      }
      
      // Schedule next check in 5 minutes
      setTimeout(checkConfirmation, 5 * 60 * 1000);
      
    } catch (error) {
      console.error(`[CONFIRMATION_CHECK] Error checking ${cryptoType} confirmation:`, error);
      
      if (attempts >= maxAttempts) {
        await channel.send({
          content: `<@${userId}> ❌ Error checking your ${cryptoType} transaction confirmation. Please contact staff.`
        });
        return; // Stop checking
      }
      
      // Continue checking despite error
      setTimeout(checkConfirmation, 5 * 60 * 1000);
    }
  };
  
  // Start the first check in 5 minutes
  setTimeout(checkConfirmation, 5 * 60 * 1000);
}

/**
 * Send successful PayPal payment log to logging channel
 */
async function sendSuccessfulPayPalPaymentLog(client, channelId, userId, paymentMethod = 'PayPal') {
  try {
    const logChannelId = '1354587880382795836';
    
    if (!client) {
      console.error('[PAYPAL_SUCCESS_LOG] Discord client not provided');
      return;
    }
    
    const logChannel = await client.channels.fetch(logChannelId);
    
    if (!logChannel) {
      console.error('[PAYPAL_SUCCESS_LOG] Log channel not found');
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('Successful Automatic Payment')
      .setDescription('An automatic PayPal payment has been successfully made.')
      .setColor('#00ff00')
      .addFields(
        { name: 'Payment Method', value: paymentMethod, inline: true },
        { name: 'User', value: `<@${userId}>`, inline: true },
        { name: 'Ticket Channel', value: `<#${channelId}>`, inline: true }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
    console.log(`[PAYPAL_SUCCESS_LOG] Sent success log for ${paymentMethod} payment from user ${userId}`);
    
  } catch (error) {
    console.error('[PAYPAL_SUCCESS_LOG] Error sending PayPal success log:', error);
  }
}

/**
 * Handle PayPal name modal submission with IPN verification
 */
async function handlePayPalNameModalSubmission(interaction) {
  try {
    console.log(`[PAYPAL_NAME] Processing PayPal name modal submission from user ${interaction.user.id}`);
    
    const firstName = interaction.fields.getTextInputValue('paypal_first_name').trim();
    const lastName = interaction.fields.getTextInputValue('paypal_last_name').trim();
    
    if (!firstName || !lastName) {
      return interaction.reply({
        content: 'Please provide both first and last name.',
        ephemeral: true
      });
    }
    
    console.log(`[PAYPAL_NAME] User ${interaction.user.id} provided name: ${firstName} ${lastName}`);
    
    // Get expected payment amount from channel
    let expectedAmount = 0;
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      
      // Look for Order Recap or price information
      for (const message of messages.values()) {
        if (message.embeds && message.embeds.length > 0) {
          const embed = message.embeds[0];
          
          // Check Order Recap embed
          if (embed.title === 'Order Recap') {
            const priceField = embed.fields?.find(f => f.name.toLowerCase().includes('price'));
            if (priceField) {
              const priceMatch = priceField.value.match(/€(\d+(?:\.\d+)?)/);
              if (priceMatch) {
                expectedAmount = parseFloat(priceMatch[1]);
                break;
              }
            }
          }
          
          // Check other price embeds
          if (embed.description) {
            const priceMatch = embed.description.match(/€(\d+(?:\.\d+)?)/);
            if (priceMatch) {
              expectedAmount = parseFloat(priceMatch[1]);
              break;
            }
          }
        }
      }
      
      // Fallback: try to extract from channel topic
      if (expectedAmount === 0) {
        const topic = interaction.channel.topic || '';
        const topicPriceMatch = topic.match(/Price:\s*€(\d+(?:\.\d+)?)/);
        if (topicPriceMatch) {
          expectedAmount = parseFloat(topicPriceMatch[1]);
        }
      }
      
    } catch (error) {
      console.error(`[PAYPAL_NAME] Error extracting expected amount: ${error.message}`);
    }
    
    if (expectedAmount === 0) {
      console.error(`[PAYPAL_NAME] Could not determine expected payment amount for user ${interaction.user.id}`);
      return interaction.reply({
        content: 'Error: Could not determine expected payment amount. Please contact support.',
        ephemeral: true
      });
    }
    
    console.log(`[PAYPAL_NAME] Expected payment amount: €${expectedAmount}`);
    
    // Verify PayPal IPN transaction
    const ipnResult = await verifyPayPalIPN(firstName, lastName, expectedAmount, interaction.channel.id);
    
    if (ipnResult.success) {
      console.log(`[PAYPAL_NAME] IPN verification successful for user ${interaction.user.id}, transaction ID: ${ipnResult.txnId}`);
      
      // IPN verification passed, now request screenshot
      await interaction.reply({
        content: 'PayPal transaction verified! Please now provide a screenshot for final verification.',
        ephemeral: true
      });
      
      // Grant file upload permissions
      try {
        await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
          AttachFiles: true,
          SendMessages: true
        });
      } catch (permError) {
        console.error(`[PAYPAL_NAME] Error granting file permissions: ${permError.message}`);
      }
      
      // Send screenshot request
      await sendPayPalScreenshotRequestWithIPN(interaction.channel, interaction.user.id, ipnResult);
      
    } else {
      console.log(`[PAYPAL_NAME] IPN verification failed for user ${interaction.user.id}: ${ipnResult.reason}`);
      
      // Handle different failure types
      if (ipnResult.reason === 'NO_TRANSACTION_FOUND') {
        // No transaction found - send ephemeral "still waiting" message like crypto
        return interaction.reply({
          content: `⏳ We haven't received a PayPal payment from ${firstName} ${lastName} yet. Please make sure you:\n\n` +
                   `• Send exactly €${expectedAmount} or more\n` +
                   `• Use Friends & Family (NOT Goods & Services)\n` +
                   `• Send in EUR currency\n` +
                   `• Don't add any note\n` +
                   `• Send from PayPal Balance (NOT card/bank)\n\n` +
                   `Try again in a few minutes after sending the payment.`,
          ephemeral: true
        });
      } else {
        // Transaction found but has issues - send "Issue Occurred" embed
        await interaction.reply({
          content: 'Transaction verification failed. Please see the details below.',
          ephemeral: true
        });
        
        await sendPayPalIssueOccurredEmbed(interaction.channel, interaction.user.id, ipnResult, expectedAmount);
      }
    }
    
  } catch (error) {
    console.error(`[PAYPAL_NAME] Error handling PayPal name modal submission: ${error.message}`);
    console.error(error.stack);
    
    // CRITICAL SYSTEM ERROR - trigger manual fallback
    console.error(`[PAYPAL_NAME] Critical system error for user ${interaction.user.id}, triggering manual fallback`);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'PayPal verification is temporarily experiencing issues. Staff have been notified and will verify your payment manually.',
        ephemeral: true
      });
    }
    
    // Try to extract expected amount for fallback (basic extraction)
    let fallbackAmount = 0;
    try {
      const topic = interaction.channel.topic || '';
      const topicPriceMatch = topic.match(/Price:\s*€(\d+(?:\.\d+)?)/);
      if (topicPriceMatch) {
        fallbackAmount = parseFloat(topicPriceMatch[1]);
      }
    } catch (amountError) {
      console.error(`[PAYPAL_NAME] Could not extract amount for fallback: ${amountError.message}`);
    }
    
    // Get the first and last name that were provided (if available)
    let firstName = 'Unknown';
    let lastName = 'Unknown';
    try {
      firstName = interaction.fields.getTextInputValue('paypal_first_name').trim() || 'Unknown';
      lastName = interaction.fields.getTextInputValue('paypal_last_name').trim() || 'Unknown';
    } catch (nameError) {
      console.error(`[PAYPAL_NAME] Could not extract names for fallback: ${nameError.message}`);
    }
    
    // Trigger manual fallback for critical errors
    try {
      await triggerPayPalManualFallback(
        interaction.channel, 
        interaction.user.id, 
        `${firstName} ${lastName}`, 
        fallbackAmount, 
        { reason: 'CRITICAL_SYSTEM_ERROR', error: error.message }
      );
    } catch (fallbackError) {
      console.error(`[PAYPAL_NAME] Failed to trigger manual fallback: ${fallbackError.message}`);
    }
  }
}

/**
 * Verify PayPal IPN transaction against provided name and amount
 */
async function verifyPayPalIPN(firstName, lastName, expectedAmount, channelId) {
  try {
    console.log(`[PAYPAL_IPN] Verifying PayPal transaction for ${firstName} ${lastName}, amount: €${expectedAmount}`);
    
    const db = require('./database');
    await db.waitUntilConnected();
    
    // Search for matching transaction in last 24 hours
    const query = `
      SELECT * FROM paypal_ipn_notifications 
      WHERE first_name = $1 
      AND last_name = $2 
      AND mc_currency = 'EUR'
      AND received_at > NOW() - INTERVAL '24 hours'
      AND processed = FALSE
      ORDER BY received_at DESC
      LIMIT 10
    `;
    
    const result = await db.query(query, [firstName, lastName]);
    
    if (result.rows.length === 0) {
      return { success: false, reason: 'NO_TRANSACTION_FOUND' };
    }
    
    // Check each transaction for compliance
    for (const transaction of result.rows) {
      console.log(`[PAYPAL_IPN] Checking transaction ID: ${transaction.txn_id}`);
      
      // Check transaction age (must be within 30 minutes for auto-approval)
      const transactionTime = new Date(transaction.received_at);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const isWithin30Minutes = transactionTime >= thirtyMinutesAgo;
      const isWithin24Hours = transactionTime >= oneDayAgo;
      
      // Check amount (must be exact or more)
      const amountReceived = parseFloat(transaction.mc_gross);
      const amountValid = amountReceived >= expectedAmount;
      
      // Check Friends & Family (txn_type should be "send_money")
      const isFriendsFamily = transaction.txn_type === 'send_money';
      
      // Check no note (memo should be empty)
      const hasNoNote = !transaction.memo || transaction.memo.trim() === '';
      
      // Check payment status is completed
      const isCompleted = transaction.payment_status === 'Completed';
      
      // Check currency is EUR
      const isEUR = transaction.mc_currency === 'EUR';
      
      console.log(`[PAYPAL_IPN] Transaction ${transaction.txn_id} validation:`);
      console.log(`  - Within 30min: ${isWithin30Minutes}`);
      console.log(`  - Amount valid: ${amountValid} (received: €${amountReceived}, expected: €${expectedAmount})`);
      console.log(`  - Friends & Family: ${isFriendsFamily}`);
      console.log(`  - No note: ${hasNoNote}`);
      console.log(`  - Completed: ${isCompleted}`);
      console.log(`  - EUR currency: ${isEUR}`);
      
      // If transaction is perfect and within 30 minutes, approve it
      const config = require('./config');
      const expectedReceiver = (config?.PAYPAL_EMAIL || 'mathiasbenedetto@gmail.com').toLowerCase();
      const correctReceiver = (transaction.receiver_email || '').toLowerCase() === expectedReceiver;
      const isIneligible = transaction.protection_eligibility === 'Ineligible';
      if (isWithin30Minutes && amountValid && isFriendsFamily && hasNoNote && isCompleted && isEUR && correctReceiver && isIneligible) {
        // Attempt atomic update to avoid race
        const updateRes = await db.query(
          'UPDATE paypal_ipn_notifications SET processed = TRUE, ticket_channel_id = $3 WHERE id = $1 AND processed = FALSE RETURNING id',
          [transaction.id, null, channelId]
        );
        if (updateRes.rowCount === 0) {
          // Another process already handled it
          continue;
        }
        return {
          success: true,
          txnId: transaction.txn_id,
          ipnTrackId: transaction.ipn_track_id,
          amount: amountReceived,
          paymentDate: transaction.payment_date,
          payerEmail: transaction.payer_email,
          transactionData: transaction
        };
      }
      
      // If transaction has issues but is within 24 hours, return specific error
      if (isWithin24Hours && isCompleted && isEUR) {
        let issues = [];
        
        if (!isWithin30Minutes) issues.push('TRANSACTION_TOO_OLD');
        if (!amountValid) issues.push('AMOUNT_TOO_LOW');
        if (!isFriendsFamily) issues.push('NOT_FRIENDS_FAMILY');
        if (!hasNoNote) issues.push('HAS_NOTE');
        if (!correctReceiver) issues.push('WRONG_RECEIVER');
        if (!isIneligible) issues.push('PROTECTION_ELIGIBLE');
        
        return {
          success: false,
          reason: 'TRANSACTION_ISSUES',
          issues: issues,
          transactionData: transaction,
          txnId: transaction.txn_id
        };
      }
    }
    
    // No valid transaction found
    return { success: false, reason: 'NO_VALID_TRANSACTION' };
    
  } catch (error) {
    console.error(`[PAYPAL_IPN] Error verifying PayPal IPN: ${error.message}`);
    console.error(error.stack);
    return { success: false, reason: 'DATABASE_ERROR', error: error.message };
  }
}

/**
 * Send PayPal screenshot request with IPN verification data
 */
async function sendPayPalScreenshotRequestWithIPN(channel, userId, ipnResult) {
  const embed = new EmbedBuilder()
    .setTitle('PayPal Screenshot Verification')
    .setColor('#e68df2')
    .setDescription(
      '**Your PayPal transaction has been found! Please provide a screenshot for final verification.**\n\n' +
      '**Your screenshot must clearly show:**\n' +
      `> • Receiver: **Mathias Benedetto**\n` +
      `> • Transaction ID: **${ipnResult.txnId}**\n` +
      `> • Amount: **€${ipnResult.amount}**\n` +
      `> • Date/Time: **${ipnResult.paymentDate}**\n` +
      `> • Payment method: **PayPal Balance** (NOT card/bank)\n` +
      `> • Type: **Friends & Family** (NOT Goods & Services)\n\n` +
      '**How to provide the screenshot:**\n' +
      '> • Upload an image file directly to this chat\n' +
      '> • Or paste an image URL (imgur, Discord attachment links, etc.)\n\n' +
      '**The screenshot will be verified by AI to ensure all details match exactly.**'
    );

  // Find the PayPal Payment Information message to reply to
  try {
    const messages = await channel.messages.fetch({ limit: 20 });
    let paymentInfoMessage = null;
    
    for (const [_, message] of messages) {
      if (message.embeds?.length > 0) {
        if (message.embeds[0].title === 'PayPal Payment Information' || 
            message.embeds[0].title === 'PayPal Payment Information:') {
          paymentInfoMessage = message;
          break;
        }
      }
    }
    
    if (paymentInfoMessage) {
      await paymentInfoMessage.reply({
        content: `<@${userId}>`,
        embeds: [embed]
      });
    } else {
      await channel.send({
        content: `<@${userId}>`,
        embeds: [embed]
      });
    }
    
    // Start collecting screenshots
    await collectPayPalScreenshotForAI(channel, userId, ipnResult);
    
  } catch (error) {
    console.error(`[PAYPAL_SCREENSHOT] Error sending screenshot request: ${error.message}`);
    await channel.send({
      content: `<@${userId}>`,
      embeds: [embed]
    });
  }
}

/**
 * Send PayPal Issue Occurred embed (similar to crypto error handling)
 */
async function sendPayPalIssueOccurredEmbed(channel, userId, ipnResult, expectedAmount) {
  const issueDescriptions = {
    'TRANSACTION_TOO_OLD': 'Your payment was sent more than 30 minutes ago',
    'AMOUNT_TOO_LOW': `You sent less than the required €${expectedAmount}`,
    'NOT_FRIENDS_FAMILY': 'You used Goods & Services instead of Friends & Family',
    'HAS_NOTE': 'You added a note to the payment (notes are not allowed)'
  };

  let description = '**❌ Payment Verification Failed**\n\n';
  
  if (ipnResult.issues && ipnResult.issues.length > 0) {
    description += '**Issues found with your payment:**\n';
    ipnResult.issues.forEach(issue => {
      if (issueDescriptions[issue]) {
        description += `> • ${issueDescriptions[issue]}\n`;
      }
    });
    
    description += '\n**Transaction Details:**\n';
    if (ipnResult.transactionData) {
      description += `> • Transaction ID: ${ipnResult.transactionData.txn_id}\n`;
      description += `> • Amount: €${ipnResult.transactionData.mc_gross}\n`;
      description += `> • Time: ${ipnResult.transactionData.payment_date}\n`;
      description += `> • Type: ${ipnResult.transactionData.txn_type === 'send_money' ? 'Friends & Family' : 'Goods & Services'}\n`;
      if (ipnResult.transactionData.memo) {
        description += `> • Note: "${ipnResult.transactionData.memo}"\n`;
      }
    }
  } else {
    description += 'Your PayPal payment could not be verified automatically.';
  }
  
  description += '\n**What you need to do:**\n';
  description += '> • Send the correct payment following all PayPal Terms\n';
  description += '> • **OR** click "Request Support" if you believe this is an error';

  const embed = new EmbedBuilder()
    .setTitle('❌ PayPal Payment Issue')
    .setColor('#FF6B6B')
    .setDescription(description);

  const supportButton = new ButtonBuilder()
    .setCustomId(`paypal_request_support_${userId}`)
    .setLabel('Request Support')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('<:Support:1382066889873686608>');

  const row = new ActionRowBuilder().addComponents(supportButton);

  // Find PayPal Payment Information message to reply to
  try {
    const messages = await channel.messages.fetch({ limit: 20 });
    let paymentInfoMessage = null;
    
    for (const [_, message] of messages) {
      if (message.embeds?.length > 0) {
        if (message.embeds[0].title === 'PayPal Payment Information' || 
            message.embeds[0].title === 'PayPal Payment Information:') {
          paymentInfoMessage = message;
          break;
        }
      }
    }
    
    if (paymentInfoMessage) {
      return await paymentInfoMessage.reply({
        content: `<@${userId}>`,
        embeds: [embed],
        components: [row]
      });
    } else {
      return await channel.send({
        content: `<@${userId}>`,
        embeds: [embed],
        components: [row]
      });
    }
    
  } catch (error) {
    console.error(`[PAYPAL_ISSUE] Error sending issue embed: ${error.message}`);
    return await channel.send({
      content: `<@${userId}>`,
      embeds: [embed],
      components: [row]
    });
  }
}

/**
 * Collect PayPal screenshot for AI verification
 */
async function collectPayPalScreenshotForAI(channel, userId, ipnResult) {
  try {
    console.log(`[PAYPAL_AI] Starting screenshot collection for user ${userId}`);
    
    // Create a message collector for screenshots
    const filter = m => m.author.id === userId;
    const collector = channel.createMessageCollector({ 
      filter, 
      time: 300000 // 5 minutes
    });

    let hasProcessedScreenshot = false;

    collector.on('collect', async (message) => {
      if (hasProcessedScreenshot) return;
      
      console.log(`[PAYPAL_AI] Collected message from ${userId}: ${message.content || 'No content'}, attachments: ${message.attachments.size}`);
      
      let screenshotUrl = null;
      
      // Check for image attachment
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
          screenshotUrl = attachment.url;
          console.log(`[PAYPAL_AI] Found image attachment: ${screenshotUrl}`);
        }
      }
      
      // Check for image URL in message content
      if (!screenshotUrl && message.content) {
        const imageUrlPatterns = [
          /https?:\/\/i\.imgur\.com\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/imgur\.com\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/media\.discordapp\.net\/attachments\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/cdn\.discordapp\.com\/attachments\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp)/i
        ];
        
        for (const pattern of imageUrlPatterns) {
          const match = message.content.match(pattern);
          if (match) {
            screenshotUrl = match[0];
            console.log(`[PAYPAL_AI] Found image URL: ${screenshotUrl}`);
            break;
          }
        }
      }
      
      if (screenshotUrl) {
        hasProcessedScreenshot = true;
        collector.stop('screenshot_received');
        
        // Process screenshot with OpenAI
        await processPayPalScreenshotWithAI(channel, userId, ipnResult, screenshotUrl);
        
      } else {
        // User sent something that's not an image
        await message.reply('Please upload a screenshot (image file) or provide an image URL showing your PayPal payment.');
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason !== 'screenshot_received' && !hasProcessedScreenshot) {
        await channel.send(`<@${userId}> You didn't provide a screenshot in time. Please click "Payment Completed" again to restart the verification process.`);
      }
    });
    
  } catch (error) {
    console.error(`[PAYPAL_AI] Error collecting screenshot: ${error.message}`);
  }
}

/**
 * Process PayPal screenshot with OpenAI verification
 */
async function processPayPalScreenshotWithAI(channel, userId, ipnResult, screenshotUrl) {
  try {
    console.log(`[PAYPAL_AI] Processing screenshot with AI for user ${userId}`);
    
    // Store verification data in database
    const db = require('./database');
    await db.waitUntilConnected();
    
    // Insert verification record
    const insertQuery = `
      INSERT INTO paypal_ai_verifications 
      (user_id, channel_id, txn_id, screenshot_url, ipn_data, status) 
      VALUES ($1, $2, $3, $4, $5, 'processing')
      RETURNING id
    `;
    
    const insertResult = await db.query(insertQuery, [
      userId,
      channel.id,
      ipnResult.txnId,
      screenshotUrl,
      JSON.stringify(ipnResult)
    ]);
    
    const verificationId = insertResult.rows[0].id;
    
    // Call OpenAI GPT-4.1 for verification
    const aiResult = await verifyPayPalScreenshotWithOpenAI(ipnResult, screenshotUrl);
    
    // Update database with AI result
    await db.query(
      'UPDATE paypal_ai_verifications SET ai_result = $2, status = $3, completed_at = NOW() WHERE id = $1',
      [verificationId, JSON.stringify(aiResult), aiResult.success ? 'approved' : 'rejected']
    );
    
    if (aiResult.success) {
      console.log(`[PAYPAL_AI] AI verification successful for user ${userId}`);
      
      // Payment fully verified - proceed to boost available
      await handleSuccessfulPayPalVerification(channel, userId, ipnResult, screenshotUrl, verificationId);
      
    } else {
      console.log(`[PAYPAL_AI] AI verification failed for user ${userId}: ${aiResult.reason}`);
      
      // AI verification failed - send issue embed with manual override
      await handleFailedPayPalAIVerification(channel, userId, ipnResult, screenshotUrl, aiResult, verificationId);
    }
    
  } catch (error) {
    console.error(`[PAYPAL_AI] Error processing screenshot with AI: ${error.message}`);
    console.error(error.stack);
    
    // SYSTEM FAILURE - Enhanced fallback with detailed information
    const verifierId = '986164993080836096';
    await channel.send({
      content: `<@${verifierId}> 🔧 **AI verification system failure** - Manual verification required for <@${userId}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle('🔧 AI Verification System Error')
          .setDescription(
            `**Automated AI verification failed - Manual verification required**\n\n` +
            `**User:** <@${userId}>\n` +
            `**Transaction ID:** ${ipnResult.txnId}\n` +
            `**Expected Amount:** €${ipnResult.amount}\n` +
            `**Payment Date:** ${ipnResult.paymentDate}\n` +
            `**PayPal Email:** ${ipnResult.payerEmail}\n` +
            `**Error:** ${error.message}\n\n` +
            `**Please verify this payment manually using the screenshot below.**`
          )
          .setColor('#FF6B6B')
          .setImage(screenshotUrl)
          .setTimestamp()
          .setFooter({ text: 'Automated PayPal AI Verification System' })
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`paypal_manual_approve_${userId}`)
            .setLabel('Manually Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`paypal_manual_reject_${userId}`)
            .setLabel('Manually Reject')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });
  }
}

/**
 * Verify PayPal screenshot with OpenAI GPT-4.1
 */
async function verifyPayPalScreenshotWithOpenAI(ipnResult, screenshotUrl) {
  try {
    console.log(`[PAYPAL_AI] Calling OpenAI GPT-4.1 for screenshot verification`);
    
    const prompt = `Please verify all information that you receive in TEXT matches the information you receive on the screenshot. So stuff such as the transaction ID provided must match what is shown on the screenshot.

Does the attached image show THIS EXACT information?:
Receiver's name = Mathias Benedetto
Date and time it was sent at = ${ipnResult.paymentDate}
Transaction ID = ${ipnResult.txnId}
From PayPal Balance, so NOT a card/bank
For Friends and Family, NOT goods and services
Amount in euros = €${ipnResult.amount}

Please make sure all of these requirements match EXACTLY, with ZERO DIFFERENCE. The only difference can be the time since timezones may be different, but for the time make sure the minutes are the same.

Make sure it is a REAL PayPal screenshot, NOT A FAKE one, if it is a fake one reject it IMMEDIATELY.

PLEASE RESPOND WITH ONLY THIS:
If everything matches EXACTLY, respond with ONLY 'OKAY'
If there is an error/mistake and something does not match EXACTLY, respond with only 'DENY'`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o', // GPT-4.1 with vision capabilities
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: screenshotUrl } }
            ]
          }
        ],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PAYPAL_AI] OpenAI API error: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        reason: 'OPENAI_API_ERROR', 
        error: `HTTP ${response.status}: ${errorText}` 
      };
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content.trim().toUpperCase();
    
    console.log(`[PAYPAL_AI] OpenAI response: "${aiResponse}"`);

    if (aiResponse === 'OKAY') {
      return { 
        success: true, 
        aiResponse: aiResponse,
        reasoning: 'All screenshot details match IPN data exactly'
      };
    } else if (aiResponse === 'DENY') {
      return { 
        success: false, 
        reason: 'AI_VERIFICATION_FAILED', 
        aiResponse: aiResponse,
        reasoning: 'Screenshot details do not match or screenshot appears fake'
      };
    } else {
      // Unexpected response from AI
      console.warn(`[PAYPAL_AI] Unexpected AI response: "${aiResponse}"`);
      return { 
        success: false, 
        reason: 'UNEXPECTED_AI_RESPONSE', 
        aiResponse: aiResponse,
        reasoning: 'AI returned unexpected response format'
      };
    }

  } catch (error) {
    console.error(`[PAYPAL_AI] Error calling OpenAI: ${error.message}`);
    return { 
      success: false, 
      reason: 'OPENAI_REQUEST_ERROR', 
      error: error.message 
    };
  }
}

/**
 * Handle successful PayPal verification (IPN + AI both passed)
 */
async function handleSuccessfulPayPalVerification(channel, userId, ipnResult, screenshotUrl, verificationId) {
  try {
    console.log(`[PAYPAL_SUCCESS] Processing successful PayPal verification for user ${userId}`);
    
    // Store successful verification in database
    const db = require('./database');
    await db.waitUntilConnected();
    
    await db.query(
      'UPDATE paypal_ai_verifications SET final_status = $2 WHERE id = $1',
      [verificationId, 'approved']
    );
    
    // Clean up payment messages
    const { cleanupMessages } = require('./src/utils/messageCleanup.js');
    await cleanupMessages(channel, null, 'payment_confirmed');
    
    // Extract order details for boost available embed
    let orderDetails = {};
    try {
      const topic = channel.topic || '';
      const topicMatch = topic.match(/Type:\s*(\w+).*?Price:\s*([€$]?[\d,.]+).*?From:\s*([^|]+)\s*to\s*([^|]+)/i);
      if (topicMatch) {
        orderDetails = {
          type: topicMatch[1],
          price: topicMatch[2],
          current: topicMatch[3].trim(),
          desired: topicMatch[4].trim()
        };
      }
    } catch (error) {
      console.error(`[PAYPAL_SUCCESS] Error extracting order details: ${error.message}`);
    }
    
    // Log successful PayPal payment
    await sendSuccessfulPayPalPaymentLog(channel.client, channel.id, userId, 'PayPal (Automated)');
    
    // Send boost available embed
    const config = require('./config');
    await sendBoostAvailableEmbed(channel, orderDetails, userId, config.ROLES.BOOSTER_ROLE, null);
    
    console.log(`[PAYPAL_SUCCESS] PayPal verification completed successfully for user ${userId}`);
    
  } catch (error) {
    console.error(`[PAYPAL_SUCCESS] Error handling successful verification: ${error.message}`);
    console.error(error.stack);
    
    // SYSTEM FAILURE - Enhanced fallback with detailed information
    const verifierId = '986164993080836096';
    await channel.send({
      content: `<@${verifierId}> 🔧 **Automated PayPal verification succeeded but processing failed** - Manual approval required for <@${userId}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ AI Verification Passed - Processing Error')
          .setDescription(
            `**AI verified the PayPal payment successfully but there was an error in processing**\n\n` +
            `**User:** <@${userId}>\n` +
            `**Transaction ID:** ${ipnResult.txnId}\n` +
            `**Amount:** €${ipnResult.amount}\n` +
            `**Payment Date:** ${ipnResult.paymentDate}\n` +
            `**PayPal Email:** ${ipnResult.payerEmail}\n` +
            `**Processing Error:** ${error.message}\n\n` +
            `**Action Required:** Please manually approve to proceed to boost available.`
          )
          .setColor('#FFA500')
          .setImage(screenshotUrl)
          .setTimestamp()
          .setFooter({ text: 'Automated PayPal Verification System' })
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`paypal_manual_approve_${userId}`)
            .setLabel('Manually Approve')
            .setStyle(ButtonStyle.Success)
        )
      ]
    });
  }
}

/**
 * Handle failed PayPal AI verification (AI said DENY)
 */
async function handleFailedPayPalAIVerification(channel, userId, ipnResult, screenshotUrl, aiResult, verificationId) {
  try {
    console.log(`[PAYPAL_FAIL] Processing failed PayPal AI verification for user ${userId}`);
    
    // Store failed verification in database
    const db = require('./database');
    await db.waitUntilConnected();
    
    await db.query(
      'UPDATE paypal_ai_verifications SET final_status = $2 WHERE id = $1',
      [verificationId, 'rejected']
    );
    
    // Send "Issue Occurred" embed with manual override option
    const embed = new EmbedBuilder()
      .setTitle('❌ PayPal Screenshot Verification Failed')
      .setColor('#FF6B6B')
      .setDescription(
        '**AI Verification Failed**\n\n' +
        `Our AI system could not verify your PayPal screenshot. This could be because:\n\n` +
        `> • Screenshot details don't match the transaction\n` +
        `> • Screenshot appears to be edited or fake\n` +
        `> • Image quality is too poor to read\n` +
        `> • Required information is not visible\n\n` +
        `**Transaction Details:**\n` +
        `> • Transaction ID: ${ipnResult.txnId}\n` +
        `> • Expected Amount: €${ipnResult.amount}\n` +
        `> • Expected Date: ${ipnResult.paymentDate}\n\n` +
        `**What you can do:**\n` +
        `> • Make sure your screenshot shows ALL required information clearly\n` +
        `> • Upload a new, unedited screenshot from PayPal\n` +
        `> • Click "Request Support" if you believe this is an error`
      )
      .setImage(screenshotUrl);

    const supportButton = new ButtonBuilder()
      .setCustomId(`paypal_ai_support_${userId}_${verificationId}`)
      .setLabel('Request Support')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('<:Support:1382066889873686608>');

    const retryButton = new ButtonBuilder()
      .setCustomId(`paypal_retry_screenshot_${userId}`)
      .setLabel('Upload New Screenshot')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('<:PayPal:1382066854671700009>');

    const row = new ActionRowBuilder().addComponents(retryButton, supportButton);

    // Find PayPal Payment Information message to reply to
    const messages = await channel.messages.fetch({ limit: 20 });
    let paymentInfoMessage = null;
    
    for (const [_, message] of messages) {
      if (message.embeds?.length > 0) {
        if (message.embeds[0].title === 'PayPal Payment Information' || 
            message.embeds[0].title === 'PayPal Payment Information:') {
          paymentInfoMessage = message;
          break;
        }
      }
    }
    
    if (paymentInfoMessage) {
      await paymentInfoMessage.reply({
        content: `<@${userId}>`,
        embeds: [embed],
        components: [row]
      });
    } else {
      await channel.send({
        content: `<@${userId}>`,
        embeds: [embed],
        components: [row]
      });
    }
    
  } catch (error) {
    console.error(`[PAYPAL_FAIL] Error handling failed AI verification: ${error.message}`);
  }
}

/**
 * Handle PayPal email modal submission (updated flow)
 */
async function handlePayPalEmailModalSubmission(interaction) {
  try {
    console.log(`[PAYPAL_EMAIL] Processing PayPal email modal submission from user ${interaction.user.id}`);
    
    const paypalEmail = interaction.fields.getTextInputValue('paypal_email').trim().toLowerCase();
    
    if (!paypalEmail || !paypalEmail.includes('@')) {
      return interaction.reply({
        content: 'Please provide a valid PayPal email address.',
        ephemeral: true
      });
    }
    
    console.log(`[PAYPAL_EMAIL] User ${interaction.user.id} provided email: ${paypalEmail}`);
    
    // Get expected payment amount from channel
    let expectedAmount = 0;
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      
      // Look for Order Recap or price information
      for (const message of messages.values()) {
        if (message.embeds && message.embeds.length > 0) {
          const embed = message.embeds[0];
          
          // Check Order Recap embed
          if (embed.title === 'Order Recap') {
            const priceField = embed.fields?.find(f => f.name.toLowerCase().includes('price'));
            if (priceField) {
              const priceMatch = priceField.value.match(/€(\d+(?:\.\d+)?)/);
              if (priceMatch) {
                expectedAmount = parseFloat(priceMatch[1]);
                break;
              }
            }
          }
          
          // Check other price embeds
          if (embed.description) {
            const priceMatch = embed.description.match(/€(\d+(?:\.\d+)?)/);
            if (priceMatch) {
              expectedAmount = parseFloat(priceMatch[1]);
              break;
            }
          }
        }
      }
      
      // Fallback: try to extract from channel topic
      if (expectedAmount === 0) {
        const topic = interaction.channel.topic || '';
        const topicPriceMatch = topic.match(/Price:\s*€(\d+(?:\.\d+)?)/);
        if (topicPriceMatch) {
          expectedAmount = parseFloat(topicPriceMatch[1]);
        }
      }
      
    } catch (error) {
      console.error(`[PAYPAL_EMAIL] Error extracting expected amount: ${error.message}`);
    }
    
    if (expectedAmount === 0) {
      console.error(`[PAYPAL_EMAIL] Could not determine expected payment amount for user ${interaction.user.id}`);
      return interaction.reply({
        content: 'Error: Could not determine expected payment amount. Please contact support.',
        ephemeral: true
      });
    }
    
    console.log(`[PAYPAL_EMAIL] Expected payment amount: €${expectedAmount}`);
    
    // Verify PayPal IPN transaction using email
    const ipnResult = await verifyPayPalIPNByEmail(paypalEmail, expectedAmount, interaction.channel.id);
    
    if (ipnResult.success) {
      console.log(`[PAYPAL_EMAIL] IPN verification successful for user ${interaction.user.id}, transaction ID: ${ipnResult.txnId}`);
      
      // IPN verification passed, now request screenshot
      await interaction.reply({
        content: 'PayPal transaction verified! Please now provide a screenshot for final verification.',
        ephemeral: true
      });
      
      // Grant file upload permissions
      try {
        await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
          AttachFiles: true,
          SendMessages: true
        });
      } catch (permError) {
        console.error(`[PAYPAL_EMAIL] Error granting file permissions: ${permError.message}`);
      }
      
      // Send screenshot request
      await sendPayPalScreenshotRequestWithIPN(interaction.channel, interaction.user.id, ipnResult);
      
    } else {
      console.log(`[PAYPAL_EMAIL] IPN verification failed for user ${interaction.user.id}: ${ipnResult.reason}`);
      
      // Handle different failure types
      if (ipnResult.reason === 'NO_TRANSACTION_FOUND') {
        // No transaction found - send ephemeral "still waiting" message like crypto
        return interaction.reply({
          content: `⏳ We haven't received a PayPal payment from ${paypalEmail} yet. Please make sure you:\n\n` +
                   `• Send exactly €${expectedAmount} or more\n` +
                   `• Use Friends & Family (NOT Goods & Services)\n` +
                   `• Send in EUR currency\n` +
                   `• Don't add any note\n` +
                   `• Send from PayPal Balance (NOT card/bank)\n\n` +
                   `Try again in a few minutes after sending the payment.`,
          ephemeral: true
        });
      } else if (ipnResult.reason === 'DATABASE_ERROR' || ipnResult.reason === 'SYSTEM_ERROR') {
        // ACTUAL SYSTEM FAILURE - trigger manual fallback
        console.error(`[PAYPAL_EMAIL] System failure detected for user ${interaction.user.id}: ${ipnResult.reason}`);
        
        await interaction.reply({
          content: 'PayPal verification is temporarily experiencing issues. Staff have been notified and will verify your payment manually.',
          ephemeral: true
        });
        
        // Trigger manual fallback verification
        await triggerPayPalManualFallback(interaction.channel, interaction.user.id, paypalEmail, expectedAmount, ipnResult);
        
      } else {
        // Transaction found but has issues - send "Issue Occurred" embed
        await interaction.reply({
          content: 'Transaction verification failed. Please see the details below.',
          ephemeral: true
        });
        
        await sendPayPalIssueOccurredEmbed(interaction.channel, interaction.user.id, ipnResult, expectedAmount);
      }
    }
    
  } catch (error) {
    console.error(`[PAYPAL_EMAIL] Error handling PayPal email modal submission: ${error.message}`);
    console.error(error.stack);
    
    // CRITICAL SYSTEM ERROR - trigger manual fallback
    console.error(`[PAYPAL_EMAIL] Critical system error for user ${interaction.user.id}, triggering manual fallback`);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'PayPal verification is temporarily experiencing issues. Staff have been notified and will verify your payment manually.',
        ephemeral: true
      });
    }
    
    // Try to extract expected amount for fallback (basic extraction)
    let fallbackAmount = 0;
    try {
      const topic = interaction.channel.topic || '';
      const topicPriceMatch = topic.match(/Price:\s*€(\d+(?:\.\d+)?)/);
      if (topicPriceMatch) {
        fallbackAmount = parseFloat(topicPriceMatch[1]);
      }
    } catch (amountError) {
      console.error(`[PAYPAL_EMAIL] Could not extract amount for fallback: ${amountError.message}`);
    }
    
    // Trigger manual fallback for critical errors
    try {
      await triggerPayPalManualFallback(
        interaction.channel, 
        interaction.user.id, 
        'Unknown (system error)', 
        fallbackAmount, 
        { reason: 'CRITICAL_SYSTEM_ERROR', error: error.message }
      );
    } catch (fallbackError) {
      console.error(`[PAYPAL_EMAIL] Failed to trigger manual fallback: ${fallbackError.message}`);
    }
  }
}

/**
 * Verify PayPal IPN transaction using payer email
 */
async function verifyPayPalIPNByEmail(payerEmail, expectedAmount, channelId) {
  try {
    console.log(`[PAYPAL_IPN_EMAIL] Verifying PayPal transaction for ${payerEmail}, amount: €${expectedAmount}`);
    
    const db = require('./database');
    await db.waitUntilConnected();
    
    // Search for matching transaction in last 24 hours using payer_email
    const query = `
      SELECT * FROM paypal_ipn_notifications 
      WHERE LOWER(payer_email) = LOWER($1)
      AND mc_currency = 'EUR'
      AND received_at > NOW() - INTERVAL '24 hours'
      AND processed = FALSE
      ORDER BY received_at DESC
      LIMIT 10
    `;
    
    const result = await db.query(query, [payerEmail]);
    
    if (result.rows.length === 0) {
      return { success: false, reason: 'NO_TRANSACTION_FOUND' };
    }
    
    // Check each transaction for compliance
    for (const transaction of result.rows) {
      console.log(`[PAYPAL_IPN_EMAIL] Checking transaction ID: ${transaction.txn_id}`);
      
      // Check transaction age (must be within 30 minutes for auto-approval)
      const transactionTime = new Date(transaction.received_at);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const isWithin30Minutes = transactionTime >= thirtyMinutesAgo;
      const isWithin24Hours = transactionTime >= oneDayAgo;
      
      // Check amount (must be exact or more)
      const amountReceived = parseFloat(transaction.mc_gross);
      const amountValid = amountReceived >= expectedAmount;
      
      // Check Friends & Family (txn_type should be "send_money")
      const isFriendsFamily = transaction.txn_type === 'send_money';
      
      // Check no note (memo should be empty)
      const hasNoNote = !transaction.memo || transaction.memo.trim() === '';
      
      // Check payment status is completed
      const isCompleted = transaction.payment_status === 'Completed';
      
      // Check currency is EUR
      const isEUR = transaction.mc_currency === 'EUR';
      
      console.log(`[PAYPAL_IPN_EMAIL] Transaction ${transaction.txn_id} validation:`);
      console.log(`  - Within 30min: ${isWithin30Minutes}`);
      console.log(`  - Amount valid: ${amountValid} (received: €${amountReceived}, expected: €${expectedAmount})`);
      console.log(`  - Friends & Family: ${isFriendsFamily}`);
      console.log(`  - No note: ${hasNoNote}`);
      console.log(`  - Completed: ${isCompleted}`);
      console.log(`  - EUR currency: ${isEUR}`);
      
      // Security checks
      const config = require('./config');
      const expectedReceiver = (config?.PAYPAL_EMAIL || 'mathiasbenedetto@gmail.com').toLowerCase();
      const correctReceiver = (transaction.receiver_email || '').toLowerCase() === expectedReceiver;
      const isIneligible = transaction.protection_eligibility === 'Ineligible';
      
      if (isWithin30Minutes && amountValid && isFriendsFamily && hasNoNote && isCompleted && isEUR && correctReceiver && isIneligible) {
        // Attempt atomic update to avoid race
        const updateRes = await db.query(
          'UPDATE paypal_ipn_notifications SET processed = TRUE, ticket_channel_id = $3 WHERE id = $1 AND processed = FALSE RETURNING id',
          [transaction.id, null, channelId]
        );
        if (updateRes.rowCount === 0) {
          // Another process already handled it
          continue;
        }
        return {
          success: true,
          txnId: transaction.txn_id,
          ipnTrackId: transaction.ipn_track_id,
          amount: amountReceived,
          paymentDate: transaction.payment_date,
          payerEmail: transaction.payer_email,
          transactionData: transaction
        };
      }
      
      // If transaction has issues but is within 24 hours, return specific error
      if (isWithin24Hours && isCompleted && isEUR) {
        let issues = [];
        
        if (!isWithin30Minutes) issues.push('TRANSACTION_TOO_OLD');
        if (!amountValid) issues.push('AMOUNT_TOO_LOW');
        if (!isFriendsFamily) issues.push('NOT_FRIENDS_FAMILY');
        if (!hasNoNote) issues.push('HAS_NOTE');
        if (!correctReceiver) issues.push('WRONG_RECEIVER');
        if (!isIneligible) issues.push('PROTECTION_ELIGIBLE');
        
        return {
          success: false,
          reason: 'TRANSACTION_ISSUES',
          issues: issues,
          transactionData: transaction,
          txnId: transaction.txn_id
        };
      }
    }
    
    // No valid transaction found
    return { success: false, reason: 'NO_VALID_TRANSACTION' };
    
  } catch (error) {
    console.error(`[PAYPAL_IPN_EMAIL] Error verifying PayPal IPN: ${error.message}`);
    console.error(error.stack);
    return { success: false, reason: 'DATABASE_ERROR', error: error.message };
  }
}

/**
 * Trigger manual PayPal verification fallback for system failures
 */
async function triggerPayPalManualFallback(channel, userId, paypalEmail, expectedAmount, errorDetails) {
  try {
    console.log(`[PAYPAL_FALLBACK] Triggering manual fallback for user ${userId} due to: ${errorDetails.reason}`);
    
    // Create detailed verification embed for staff
    const embed = new EmbedBuilder()
      .setTitle('🔧 PayPal Automation Fallback - Manual Verification Required')
      .setColor('#FFA500')
      .setDescription(
        '**Automated PayPal verification failed - Manual verification requested**\n\n' +
        `**User:** <@${userId}>\n` +
        `**PayPal Email:** ${paypalEmail}\n` +
        `**Expected Amount:** €${expectedAmount}\n` +
        `**Failure Reason:** ${errorDetails.reason}\n` +
        `${errorDetails.error ? `**Error Details:** ${errorDetails.error}\n` : ''}` +
        `**Channel:** ${channel.name}\n\n` +
        '**Please verify this payment manually using the old verification process.**'
      )
      .setTimestamp()
      .setFooter({ text: 'Automated PayPal Verification System' });

    // Create manual verification buttons
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

    // Send to PayPal verifier
    const paypalVerifier = '986164993080836096';
    await channel.send({
      content: `<@${paypalVerifier}> 🔧 **Automated PayPal verification failed** - Manual verification required for <@${userId}>`,
      embeds: [embed],
      components: [row]
    });

    // Log fallback trigger
    console.log(`[PAYPAL_FALLBACK] Manual fallback triggered successfully for user ${userId}`);
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_FALLBACK] Error triggering manual fallback: ${error.message}`);
    console.error(error.stack);
    return false;
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
  sendPayPalGiftcardOtherPaymentEmbed,
  setupPaymentTimeout,
  cancelPaymentTimeout,
  sendSuccessfulPayPalPaymentLog,
  handlePayPalNameModalSubmission,
  verifyPayPalIPN,
  sendPayPalScreenshotRequestWithIPN,
  sendPayPalIssueOccurredEmbed,
  collectPayPalScreenshotForAI,
  processPayPalScreenshotWithAI,
  verifyPayPalScreenshotWithOpenAI,
  handleSuccessfulPayPalVerification,
  handleFailedPayPalAIVerification,
  handlePayPalEmailModalSubmission,
  verifyPayPalIPNByEmail,
  triggerPayPalManualFallback
}; 