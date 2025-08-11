const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const axios = require('axios'); // For convertEuroToCrypto
const { EMBED_COLOR, STAFF_ROLES } = require('./config.js'); // Add relevant config imports
const { flowState } = require('./src/modules/ticketFlow.js'); // If flowState is used by helpers directly
const { getRankValue } = require('./src/modules/ticketFlow.js'); // Used by createRankedSelectionRows, etc.
const { sendPayPalTermsEmbed, sendPayPalInfoEmbed, sendPayPalGiftcardOtherPaymentEmbed, sendLitecoinEmbed, sendSolanaEmbed, sendBitcoinEmbed, sendIbanEmbed, sendAppleGiftcardEmbed, sendBolGiftcardEmbed, sendTikkieEmbed, activeCryptoPayments, sendPaymentConfirmationEmbed, sendStaffPaymentVerificationEmbed, sendBoostAvailableEmbed, createCryptoTxForm, verifyCryptoTransaction, sendCryptoWaitingEmbed, sendCryptoStillWaitingEmbed, sendInsufficientAmountEmbed, resendLitecoinEmbed, resendSolanaEmbed } = require('./ticketPayments.js'); // For sendPaymentInfoEmbed and setupCryptoTimeout indirectly


// Helper function to send payment info embed for purchase accounts
// Note: This function uses several more specific send functions from ticketPayments.js
async function sendPaymentInfoEmbed(channel, paymentMethod, subType = null) {
  try {
    console.log(`[PAYMENT_INFO] Sending payment info for ${paymentMethod}${subType ? ` (${subType})` : ''}`);
    
    const channelTopic = channel.topic || '';
    let userId = null;
    let price = 0;
    
    if (channelTopic.includes('User ID:')) {
      userId = channelTopic.split('User ID:')[1].split('|')[0].trim();
    }
    
    if (channelTopic.includes('Price:')) {
      const priceMatch = channelTopic.match(/Price: €(\\d+\\.?\\d*)/);
      if (priceMatch && priceMatch[1]) {
        price = parseFloat(priceMatch[1]);
      }
    }
    
    const userData = userId ? flowState.get(userId) : null;
    if (userData && userData.price && (!price || price <= 0)) {
      price = parseFloat(userData.price);
    }
    
    console.log(`[PAYMENT_INFO] Using price: €${price} for ${paymentMethod}`);

    switch (paymentMethod) {
      case 'PayPal':
        return sendPayPalTermsEmbed(channel, userId);
      case 'PayPal Giftcard':
        return sendPayPalGiftcardOtherPaymentEmbed(channel, userId, 'PayPal Giftcard');
      case 'IBAN Bank Transfer':
        return sendIbanEmbed(channel, userId);

      case 'Dutch Payment Methods':
        if (subType === 'Tikkie') {
          return sendTikkieEmbed(channel, userId);
        } else if (subType === 'Bol.com Giftcard') {
          return sendBolGiftcardEmbed(channel, userId);
        }
        break;
      case 'Crypto':
        switch (subType) {
          case 'Litecoin':
            return sendLitecoinEmbed(channel, userId, price);
          case 'Solana':
            return sendSolanaEmbed(channel, userId, price);
          case 'Bitcoin':
            return sendBitcoinEmbed(channel, userId);
          default:
            console.log(`[PAYMENT_INFO] Unknown crypto type: ${subType}`);
        }
        break;
      default:
        console.log(`[PAYMENT_INFO] Unknown payment method: ${paymentMethod}`);
    }
  } catch (error) {
    console.error('[PAYMENT_INFO] Error sending payment info:', error);
  }
}

// Function to setup crypto payment timeout
function setupCryptoTimeout(context, coinType) {
  const { client, channelId } = context;
  
  console.log(`[CRYPTO_TIMEOUT] Setting up 30 minute timeout for ${coinType} in channel ${channelId}`);
  
  if (activeCryptoPayments.has(channelId)) {
    const existingTimeout = activeCryptoPayments.get(channelId);
    clearTimeout(existingTimeout.timeoutId);
    console.log(`[CRYPTO_TIMEOUT] Cleared existing timeout for channel ${channelId}`);
  }
  
  const timeoutId = setTimeout(async () => {
    try {
      console.log(`[CRYPTO_TIMEOUT] Executing timeout for ${coinType} in channel ${channelId}`);
      
      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        console.log(`[CRYPTO_TIMEOUT] Channel ${channelId} no longer exists, cancelling timeout`);
        activeCryptoPayments.delete(channelId);
        return;
      }
      
      const messages = await channel.messages.fetch({ limit: 50 });
      
      const coinMessages = messages.filter(msg => {
        return msg.embeds?.length > 0 && 
          ((coinType === 'litecoin' && msg.embeds[0].title === 'Litecoin Information') ||
           (coinType === 'solana' && msg.embeds[0].title === 'Solana Information'));
      });
      
      if (coinMessages.size === 0) {
        console.log(`[CRYPTO_TIMEOUT] No ${coinType} message found in channel ${channelId}`);
        activeCryptoPayments.delete(channelId);
        return;
      }
      
      const latestCoinMsg = coinMessages.first();
      console.log(`[CRYPTO_TIMEOUT] Found ${coinType} message from ${latestCoinMsg.createdAt}`);
      
      const emoji = coinType === 'litecoin' ? 
        { name: 'Litecoin', id: '1371864997012963520' } : 
        { name: 'Solana', id: '1371865225824960633' };
      
      const sendAgainButton = new ButtonBuilder()
        .setCustomId(`resend_${coinType}_payment`)
        .setLabel('Send Again')
        .setEmoji(emoji)
        .setStyle(ButtonStyle.Success);
      
      const row = new ActionRowBuilder().addComponents(sendAgainButton);
      
      const timeoutEmbed = new EmbedBuilder()
        .setTitle('Payment Failed')
        .setColor('#FF0000')
        .setDescription('Client failed to send the money in a 30 minute time frame.');
      
      await channel.send({
        embeds: [timeoutEmbed],
        components: [row]
      });
      
      activeCryptoPayments.delete(channelId);
      console.log(`[CRYPTO_TIMEOUT] Completed timeout handling for ${coinType} in channel ${channelId}`);
      
    } catch (error) {
      console.error(`[CRYPTO_TIMEOUT] Error handling crypto timeout for ${coinType} in channel ${channelId}:`, error);
      console.error(error.stack);
      activeCryptoPayments.delete(channelId);
    }
  }, 1800000); // 30 minutes
  
  activeCryptoPayments.set(channelId, { 
    timeoutId,
    channelId,
    coinType,
    startTime: Date.now()
  });
  
  console.log(`[CRYPTO_TIMEOUT] Successfully set up timeout for ${coinType} in channel ${channelId}`);
} 

// Helper function to create ranked selection rows based on current rank
function createRankedSelectionRows(currentRank, currentSpecific) {
  const rankValue = getRankValue(currentRank, currentSpecific);
  const rows = [];
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();
  
  const currentRankNum = parseInt(currentSpecific);
  if (currentRankNum < 3) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`ranked_${currentRank}`)
        .setLabel(currentRank)
        .setEmoji(getRankEmoji(currentRank))
        .setStyle(ButtonStyle.Primary)
    );
  }
  
  if (rankValue < getRankValue('Pro', '1')) {
    row1.addComponents(
      new ButtonBuilder().setCustomId('ranked_Pro').setLabel('Pro').setEmoji('<:pro:1351687685328208003>').setStyle(ButtonStyle.Primary)
    );
  }
  if (rankValue < getRankValue('Masters', '1')) {
    row1.addComponents(
      new ButtonBuilder().setCustomId('ranked_Masters').setLabel('Masters').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary)
    );
  }
  if (rankValue < getRankValue('Legendary', '1')) {
    row1.addComponents(
      new ButtonBuilder().setCustomId('ranked_Legendary').setLabel('Legendary').setEmoji('<:Legendary:1264709440561483818>').setStyle(ButtonStyle.Primary)
    );
  }
  
  const ranksToAdd = [
    { name: 'Mythic', emoji: '<:mythic:1357482343555666181>', valueRank: getRankValue('Mythic', '1') },
    { name: 'Diamond', emoji: '<:diamond:1357482488506613920>', valueRank: getRankValue('Diamond', '1') },
    { name: 'Gold', emoji: '<:gold:1357482374048256131>', valueRank: getRankValue('Gold', '1') },
    { name: 'Silver', emoji: '<:silver:1357482400333955132>', valueRank: getRankValue('Silver', '1') },
    { name: 'Bronze', emoji: '<:bronze:1357482418654937332>', valueRank: getRankValue('Bronze', '1') },
  ];

  for (const rank of ranksToAdd) {
    if (rankValue < rank.valueRank) {
      const button = new ButtonBuilder()
        .setCustomId(`ranked_${rank.name}`)
        .setLabel(rank.name)
        .setEmoji(rank.emoji)
        .setStyle(ButtonStyle.Primary);
      if (row1.components.length < 5) {
        row1.addComponents(button);
      } else {
        row2.addComponents(button);
      }
    }
  }
  
  if (row1.components.length > 0) rows.push(row1);
  if (row2.components.length > 0) rows.push(row2);
  return rows;
}

// Helper function to get the emoji for a rank
function getRankEmoji(rank) {
  if (rank && rank.includes('_')) {
    const baseName = rank.split('_')[0];
    return getRankEmoji(baseName);
  }
  const emojiMap = {
    'Pro': '<:pro:1351687685328208003>', 'Masters': '<:Masters:1293283897618075728>',
    'Legendary': '<:Legendary:1264709440561483818>', 'Mythic': '<:mythic:1357482343555666181>',
    'Diamond': '<:diamond:1357482488506613920>', 'Gold': '<:gold:1357482374048256131>',
    'Silver': '<:silver:1357482400333955132>', 'Bronze': '<:bronze:1357482418654937332>',
    '1': '🏆', '2': '🏆', '3': '🏆'
  };
  return emojiMap[rank] || '🏆';
} 

// Helper function to get rank button properties (emoji and style)
function getRankButtonProperties(rank) {
  const properties = {
    'Pro': { emoji: '<:pro:1351687685328208003>', style: ButtonStyle.Success },
    'Masters': { emoji: '<:Masters:1293283897618075728>', style: ButtonStyle.Success },
    'Legendary': { emoji: '<:Legendary:1264709440561483818>', style: ButtonStyle.Danger },
    'Mythic': { emoji: '<:mythic:1357482343555666181>', style: ButtonStyle.Danger },
    'Diamond': { emoji: '<:diamond:1357482488506613920>', style: ButtonStyle.Primary },
    'Gold': { emoji: '<:gold:1357482374048256131>', style: ButtonStyle.Success },
    'Silver': { emoji: '<:silver:1357482400333955132>', style: ButtonStyle.Primary },
    'Bronze': { emoji: '<:bronze:1357482418654937332>', style: ButtonStyle.Secondary }
  };
  return properties[rank] || { emoji: '🏆', style: ButtonStyle.Primary };
}

// Function to create rank-specific buttons with consistent styling
function createRankButtons(rank, tiers) {
  const buttons = [];
  const props = getRankButtonProperties(rank);
  for (const tier of tiers) {
    buttons.push(
      new ButtonBuilder().setCustomId(`ranked_${rank}_${tier}`).setLabel(`${rank} ${tier}`).setEmoji(props.emoji).setStyle(props.style)
    );
  }
  return buttons;
}

// Helper function to convert euro to crypto currencies
async function convertEuroToCrypto(cryptoSymbol, euroAmount) {
  try {
    console.log(`[CRYPTO_CONVERT] Converting €${euroAmount} to ${cryptoSymbol}`);
    if (!euroAmount || isNaN(parseFloat(euroAmount)) || parseFloat(euroAmount) <= 0) {
      console.error(`[CRYPTO_CONVERT] Invalid euro amount: ${euroAmount}`);
      return 0.00001;
    }
    const amount = parseFloat(euroAmount);
    try {
      const coinIds = { 'BTC': 'bitcoin', 'LTC': 'litecoin', 'SOL': 'solana' };
      const coinId = coinIds[cryptoSymbol.toUpperCase()];
      if (!coinId) throw new Error(`Unknown crypto symbol: ${cryptoSymbol}`);
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`);
      if (!response.data || !response.data[coinId] || !response.data[coinId].eur) {
        throw new Error(`Invalid API response for ${coinId}`);
      }
      const rate = response.data[coinId].eur;
      const cryptoAmount = amount / rate;
      console.log(`[CRYPTO_CONVERT] €${amount} = ${cryptoAmount} ${cryptoSymbol} (Rate: 1 ${cryptoSymbol} = €${rate})`);
      return cryptoAmount;
    } catch (apiError) {
      console.error(`[CRYPTO_CONVERT] API Error: ${apiError.message}, falling back to estimates`);
      const fallbackRates = { 'BTC': 55000, 'LTC': 70, 'SOL': 130 };
      const fallbackRate = fallbackRates[cryptoSymbol.toUpperCase()] || 1;
      const cryptoAmount = amount / fallbackRate;
      console.log(`[CRYPTO_CONVERT] Using fallback: €${amount} = ${cryptoAmount} ${cryptoSymbol} (Rate: 1 ${cryptoSymbol} = €${fallbackRate})`);
      return cryptoAmount;
    }
  } catch (error) {
    console.error(`[CRYPTO_CONVERT] Error converting EUR to ${cryptoSymbol}: ${error.message}`);
    return 0.00001;
  }
}

async function sendOrderRecapEmbed(channel, userData) {
  try {
    console.log('[ORDER_RECAP] Generating order recap for user data:', userData);
    const recapEmbed = new EmbedBuilder().setTitle('Order Recap').setColor(EMBED_COLOR);
    const fields = [];
    if (userData.type === 'ranked') {
      fields.push(
        { name: '**Boost Type:**', value: '\`Ranked Boost\`' },
        { name: '**Current Rank:**', value: `\`${(userData.formattedCurrentRank || userData.currentRank + ' ' + userData.currentRankSpecific).trim()}\`` },
        { name: '**Desired Rank:**', value: `\`${(userData.formattedDesiredRank || userData.desiredRank + ' ' + userData.desiredRankSpecific).trim()}\`` }
      );
    } else if (userData.type === 'trophies') {
      fields.push(
        { name: '**Boost Type:**', value: '\`Trophy Boost\`' },
        { name: '**Brawler:**', value: `\`${(userData.brawler || 'Not specified').trim()}\`` },
        { name: '**Current Trophies:**', value: `\`${userData.currentTrophies || 0}\`` },
        { name: '**Desired Trophies:**', value: `\`${userData.desiredTrophies || 0}\`` }
      );

    } else if (userData.type === 'bulk') {
      fields.push(
        { name: '**Boost Type:**', value: '\`Bulk Trophy Boost\`' },
        { name: '**Current Trophies:**', value: `\`${userData.currentBulkTrophies || 0}\`` },
        { name: '**Desired Trophies:**', value: `\`${userData.desiredBulkTrophies || 0}\`` }
      );
    } else if (userData.type === 'other') {
      fields.push(
        { name: '**Request Type:**', value: '\`Other Request\`' },
        { name: '**Details:**', value: `\`${userData.otherRequest || 'No details provided'}\`` }
      );
  } else if (userData.type === 'prestige') {
      fields.push(
        { name: '**Boost Type:**', value: '\`Prestige\`' },
        { name: '**Prestige Brawler:**', value: `\`${userData.prestigeBrawler || 'Unknown'}\`` },
        { name: '**Type of Prestige:**', value: `\`${userData.prestigeType || 'Unknown'}\`` }
      );
    }
    if (userData.price) {
      fields.push({ name: '**Price:**', value: `\`€${parseFloat(userData.price).toFixed(2)}\`` });
    } else {
      fields.push({ name: '**Price:**', value: '\`Price not set\`' });
    }
    if (userData.paymentMethod) {
      fields.push({ name: '**Payment Method:**', value: `\`${userData.paymentMethod}\`` });
      if (userData.paymentMethod === 'Crypto' && userData.cryptoType) {
        fields.push({ name: '**Crypto Coin:**', value: `\`${userData.cryptoType}\`` });
      }
      if (userData.paymentMethod === 'Dutch Payment Methods' && userData.dutchPaymentType) {
        fields.push({ name: '**Type of Payment:**', value: `\`${userData.dutchPaymentType}\`` });
      }
    }
    recapEmbed.addFields(fields);
    return await channel.send({ embeds: [recapEmbed] });
  } catch (error) {
    console.error('[ORDER_RECAP] Error sending order recap:', error.message);
    console.error(error.stack);
  }
}

module.exports = {
  sendPaymentInfoEmbed,
  setupCryptoTimeout,
  createRankedSelectionRows,
  getRankEmoji,
  getRankButtonProperties,
  createRankButtons,
  convertEuroToCrypto,
  sendOrderRecapEmbed
}; 