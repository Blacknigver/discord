const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const axios = require('axios'); // Ensure axios is installed in your project
const { 
    EMBED_COLOR, 
    STAFF_ROLES 
} = require('../config.js'); // Adjusted path
const { 
    getRankValue, 
    showPaymentMethodSelection,
} = require('../src/modules/ticketFlow.js'); // Adjusted path
const { 
    sendPayPalTermsEmbed,
    sendPayPalGiftcardOtherPaymentEmbed,
    sendIbanEmbed,
    sendAppleGiftcardEmbed,
    sendTikkieEmbed,
    sendBolGiftcardEmbed,
    sendLitecoinEmbed,
    sendSolanaEmbed,
    sendBitcoinEmbed,
    activeCryptoPayments // Import activeCryptoPayments
} = require('../ticketPayments.js'); // Adjusted path

// Helper function to send payment info embed for purchase accounts
async function sendPaymentInfoEmbed(channel, paymentMethod, subType = null, currentUserData = null, interaction = null) {
  try {
    console.log(`[PAYMENT_INFO] Sending payment info for ${paymentMethod}${subType ? ` (${subType})` : ''}`);

    // Get user data and price from the ticket topic
    const channelTopic = channel.topic || '';
    let userId = null;
    let price = 0;

    // Extract user ID from channel topic or currentUserData
    if (currentUserData && currentUserData.userId) {
        userId = currentUserData.userId;
    } else if (channelTopic.includes('User ID:')) {
      userId = channelTopic.split('User ID:')[1].split('|')[0].trim();
    }
    // If interaction is available and has a user, prefer that for userId
    if (interaction && interaction.user && interaction.user.id) {
        userId = interaction.user.id;
    }

    // Extract price from channel topic
    if (channelTopic.includes('Price:')) {
      const priceMatch = channelTopic.match(/Price: €(\\d+\\.?\\d*)/);
      if (priceMatch && priceMatch[1]) {
        price = parseFloat(priceMatch[1]);
      }
    }

    // Use passed userData if available, otherwise try to use ID from topic (though flowState is removed here)
    const userDataToUse = currentUserData;
    // if (userDataToUse && userDataToUse.price && (!price || price <= 0)) { // This check might still be useful if currentUserData has price
    //   price = parseFloat(userDataToUse.price);
    // }
    // If currentUserData is the source of truth for price, prioritize it.
    if (currentUserData && currentUserData.price !== undefined && (!price || price <=0)) {
        price = parseFloat(currentUserData.price);
    }

    // Log price being used
    console.log(`[PAYMENT_INFO] Using price: €${price} for ${paymentMethod}`);

    // Send payment info based on type
    switch (paymentMethod) {
      case 'PayPal':
        return sendPayPalTermsEmbed(channel, userId, interaction);
      case 'PayPal Giftcard':
        return sendPayPalGiftcardOtherPaymentEmbed(channel, userId, 'PayPal Giftcard');
      case 'IBAN Bank Transfer':
        return sendIbanEmbed(channel, userId, interaction);

      case 'Dutch Payment Methods':
        if (subType === 'Tikkie') {
          return sendTikkieEmbed(channel, userId, interaction);
        } else if (subType === 'Bol.com Giftcard') {
          return sendBolGiftcardEmbed(channel, userId, interaction);
        }
        break;
      case 'Crypto':
        switch (subType) {
          case 'Litecoin':
            return sendLitecoinEmbed(channel, userId, price, interaction);
          case 'Solana':
            return sendSolanaEmbed(channel, userId, price, interaction);
          case 'Bitcoin':
            return sendBitcoinEmbed(channel, userId, interaction);
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

  // First, clear any existing timeout for this channel
  if (activeCryptoPayments.has(channelId)) {
    const existingTimeout = activeCryptoPayments.get(channelId);
    clearTimeout(existingTimeout.timeoutId);
    console.log(`[CRYPTO_TIMEOUT] Cleared existing timeout for channel ${channelId}`);
  }

  // Create a timeout for 30 minutes (1800000 ms)
  const timeoutId = setTimeout(async () => {
    try {
      console.log(`[CRYPTO_TIMEOUT] Executing timeout for ${coinType} in channel ${channelId}`);

      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        console.log(`[CRYPTO_TIMEOUT] Channel ${channelId} no longer exists, cancelling timeout`);
        activeCryptoPayments.delete(channelId);
        return;
      }

      // Find the last crypto payment message based on coin type
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

      // Get the most recent coin message
      const latestCoinMsg = coinMessages.first();
      console.log(`[CRYPTO_TIMEOUT] Found ${coinType} message from ${latestCoinMsg.createdAt}`);

      // Create "Send Again" button with appropriate emoji
      const emoji = coinType === 'litecoin' ? 
        { name: 'Litecoin', id: '1371864997012963520' } : 
        { name: 'Solana', id: '1371865225824960633' };

      const sendAgainButton = new ButtonBuilder()
        .setCustomId(`resend_${coinType}_payment`)
        .setLabel('Send Again')
        .setEmoji(emoji)
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(sendAgainButton);

      // Create timeout message embed
      const timeoutEmbed = new EmbedBuilder()
        .setTitle('Payment Failed')
        .setColor('#FF0000') // Red color for failed payment
        .setDescription('Client failed to send the money in a 30 minute time frame.');

      // Send timeout message with embed
      await channel.send({
        embeds: [timeoutEmbed],
        components: [row]
      });

      // Remove from active payments map
      activeCryptoPayments.delete(channelId);
      console.log(`[CRYPTO_TIMEOUT] Completed timeout handling for ${coinType} in channel ${channelId}`);

    } catch (error) {
      console.error(`[CRYPTO_TIMEOUT] Error handling crypto timeout for ${coinType} in channel ${channelId}:`, error);
      console.error(error.stack);

      // Clean up the map entry even on error
      activeCryptoPayments.delete(channelId);
    }
  }, 1800000); // 30 minutes

  // Store the timeout info with the channel ID for later cancellation if needed
  activeCryptoPayments.set(channelId, { 
    timeoutId,
    channelId,
    coinType,
    startTime: Date.now()
  });

  console.log(`[CRYPTO_TIMEOUT] Successfully set up timeout for ${coinType} in channel ${channelId}`);
} 

// Helper function to get the emoji for a rank
function getRankEmoji(rank) {
  // Handle case where rank includes a number (like 'Pro_1')
  if (rank && rank.includes('_')) {
    // Extract the base rank from the format 'Rank_Number'
    const baseName = rank.split('_')[0];
    return getRankEmoji(baseName); // Recursively call with just the base rank
  }

  const emojiMap = {
    'Pro': '<:pro:1351687685328208003>',
    'Masters': '<:Masters:1293283897618075728>',
    'Legendary': '<:Legendary:1264709440561483818>',
    'Mythic': '<:mythic:1357482343555666181>',
    'Diamond': '<:diamond:1357482488506613920>',
    'Gold': '<:gold:1357482374048256131>',
    'Silver': '<:silver:1357482400333955132>',
    'Bronze': '<:bronze:1357482418654937332>',
    // Add numeric ranks explicitly as well
    '1': '🏆',
    '2': '🏆',
    '3': '🏆'
  };

  return emojiMap[rank] || '🏆';
} 

// Helper function to create ranked selection rows based on current rank
function createRankedSelectionRows(currentRank, currentSpecific) {
  const rankValue = getRankValue(currentRank, currentSpecific);
  const rows = [];

  // Create rows for rank buttons
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  // Add the current rank if there are higher tiers available
  const currentRankNum = parseInt(currentSpecific);
  if (currentRankNum < 3) {
    // There are higher tiers available in the same rank
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`ranked_${currentRank}`)
        .setLabel(currentRank)
        .setEmoji(getRankEmoji(currentRank))
        .setStyle(ButtonStyle.Primary)
    );
  }

  // Add ranks that are higher than current rank
  if (rankValue < getRankValue('Pro', '1')) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId('ranked_Pro')
        .setLabel('Pro')
        .setEmoji('<:pro:1351687685328208003>')
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (rankValue < getRankValue('Masters', '1')) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId('ranked_Masters')
        .setLabel('Masters')
        .setEmoji('<:Masters:1293283897618075728>')
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (rankValue < getRankValue('Legendary', '1')) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId('ranked_Legendary')
        .setLabel('Legendary')
        .setEmoji('<:Legendary:1264709440561483818>')
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (rankValue < getRankValue('Mythic', '1')) {
    if (row1.components.length < 5) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Mythic')
          .setLabel('Mythic')
          .setEmoji('<:mythic:1357482343555666181>')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Mythic')
          .setLabel('Mythic')
          .setEmoji('<:mythic:1357482343555666181>')
          .setStyle(ButtonStyle.Primary)
      );
    }
  }

  if (rankValue < getRankValue('Diamond', '1')) {
    if (row1.components.length < 5) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Diamond')
          .setLabel('Diamond')
          .setEmoji('<:diamond:1357482488506613920>')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Diamond')
          .setLabel('Diamond')
          .setEmoji('<:diamond:1357482488506613920>')
          .setStyle(ButtonStyle.Primary)
      );
    }
  }

  if (rankValue < getRankValue('Gold', '1')) {
    if (row1.components.length < 5) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Gold')
          .setLabel('Gold')
          .setEmoji('<:gold:1357482374048256131>')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Gold')
          .setLabel('Gold')
          .setEmoji('<:gold:1357482374048256131>')
          .setStyle(ButtonStyle.Primary)
      );
    }
  }

  if (rankValue < getRankValue('Silver', '1')) {
    if (row1.components.length < 5) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Silver')
          .setLabel('Silver')
          .setEmoji('<:silver:1357482400333955132>')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Silver')
          .setLabel('Silver')
          .setEmoji('<:silver:1357482400333955132>')
          .setStyle(ButtonStyle.Primary)
      );
    }
  }

  if (rankValue < getRankValue('Bronze', '1')) {
    if (row1.components.length < 5) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Bronze')
          .setLabel('Bronze')
          .setEmoji('<:bronze:1357482418654937332>')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId('ranked_Bronze')
          .setLabel('Bronze')
          .setEmoji('<:bronze:1357482418654937332>')
          .setStyle(ButtonStyle.Primary)
      );
    }
  }

  // Only add rows with components
  if (row1.components.length > 0) {
    rows.push(row1);
  }

  if (row2.components.length > 0) {
    rows.push(row2);
  }

  return rows;
}

// Helper function to get rank button properties (emoji and style)
function getRankButtonProperties(rank) {
  const properties = {
    'Pro': {
      emoji: '<:pro:1351687685328208003>',
      style: ButtonStyle.Success
    },
    'Masters': {
      emoji: '<:Masters:1293283897618075728>',
      style: ButtonStyle.Success
    },
    'Legendary': {
      emoji: '<:Legendary:1264709440561483818>',
      style: ButtonStyle.Danger
    },
    'Mythic': {
      emoji: '<:mythic:1357482343555666181>',
      style: ButtonStyle.Danger
    },
    'Diamond': {
      emoji: '<:diamond:1357482488506613920>',
      style: ButtonStyle.Primary
    },
    'Gold': {
      emoji: '<:gold:1357482374048256131>',
      style: ButtonStyle.Success
    },
    'Silver': {
      emoji: '<:silver:1357482400333955132>',
      style: ButtonStyle.Primary
    },
    'Bronze': {
      emoji: '<:bronze:1357482418654937332>',
      style: ButtonStyle.Secondary
    }
  };

  return properties[rank] || { emoji: '🏆', style: ButtonStyle.Primary };
}

// Function to create rank-specific buttons with consistent styling
function createRankButtons(rank, tiers) {
  const buttons = [];
  const props = getRankButtonProperties(rank);

  for (const tier of tiers) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`ranked_${rank}_${tier}`)
        .setLabel(`${rank} ${tier}`)
        .setEmoji(props.emoji)
        .setStyle(props.style)
    );
  }

  return buttons;
}

// Helper function to convert euro to crypto currencies
async function convertEuroToCrypto(cryptoSymbol, euroAmount) {
  try {
    console.log(`[CRYPTO_CONVERT] Converting €${euroAmount} to ${cryptoSymbol}`);

    // Validate euro amount
    if (!euroAmount || isNaN(parseFloat(euroAmount)) || parseFloat(euroAmount) <= 0) {
      console.error(`[CRYPTO_CONVERT] Invalid euro amount: ${euroAmount}`);
      // Return a small non-zero value to prevent division by zero errors
      return 0.00001;
    }

    // Parse euro amount to float to ensure it's a number
    const amount = parseFloat(euroAmount);

    // Try to get current rates from CoinGecko API
    try {
      const coinIds = {
        'BTC': 'bitcoin',
        'LTC': 'litecoin',
        'SOL': 'solana'
    };

      const coinId = coinIds[cryptoSymbol.toUpperCase()];
    if (!coinId) {
        throw new Error(`Unknown crypto symbol: ${cryptoSymbol}`);
    }

      // Use axios to make API call (make sure axios is imported)
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`);

      if (!response.data || !response.data[coinId] || !response.data[coinId].eur) {
        throw new Error(`Invalid API response for ${coinId}`);
      }

      const rate = response.data[coinId].eur;

      // Calculate crypto amount
      const cryptoAmount = amount / rate;
      console.log(`[CRYPTO_CONVERT] €${amount} = ${cryptoAmount} ${cryptoSymbol} (Rate: 1 ${cryptoSymbol} = €${rate})`);

      return cryptoAmount;
    } catch (apiError) {
      // API error handling
      console.error(`[CRYPTO_CONVERT] API Error: ${apiError.message}, falling back to estimates`);

      // Fallback rates
    const fallbackRates = {
        'BTC': 55000,
        'LTC': 70,
        'SOL': 130
      };

      const fallbackRate = fallbackRates[cryptoSymbol.toUpperCase()] || 1;
      const cryptoAmount = amount / fallbackRate;

      console.log(`[CRYPTO_CONVERT] Using fallback: €${amount} = ${cryptoAmount} ${cryptoSymbol} (Rate: 1 ${cryptoSymbol} = €${fallbackRate})`);

      return cryptoAmount;
    }
  } catch (error) {
    console.error(`[CRYPTO_CONVERT] Error converting EUR to ${cryptoSymbol}: ${error.message}`);
    return 0.00001; // Return a small non-zero value to prevent division by zero errors
  }
}

async function sendOrderRecapEmbed(channel, userData) {
  try {
    console.log('[ORDER_RECAP] Generating order recap for user data:', userData);

    // Create order recap embed
    const recapEmbed = new EmbedBuilder()
      .setTitle('Order Recap')
      .setColor(EMBED_COLOR);

    // Add fields based on boost type
    const fields = [];

    if (userData.type === 'ranked') {
      fields.push(
        { name: '**Boost Type:**', value: '`Ranked Boost`' },
        { name: '**Current Rank:**', value: `\`${(userData.formattedCurrentRank || userData.currentRank + ' ' + userData.currentRankSpecific).trim()}\`` },
        { name: '**Desired Rank:**', value: `\`${(userData.formattedDesiredRank || userData.desiredRank + ' ' + userData.desiredRankSpecific).trim()}\`` }
      );
    } else if (userData.type === 'trophies') {
      fields.push(
        { name: '**Boost Type:**', value: '`Trophy Boost`' },
        { name: '**Brawler:**', value: `\`${(userData.brawler || 'Not specified').trim()}\`` },
        { name: '**Current Trophies:**', value: `\`${userData.currentTrophies || 0}\`` },
        { name: '**Desired Trophies:**', value: `\`${userData.desiredTrophies || 0}\`` }
      );
    } else if (userData.type === 'bulk') {
      fields.push(
        { name: '**Boost Type:**', value: '`Bulk Trophy Boost`' },
        { name: '**Current Trophies:**', value: `\`${userData.currentBulkTrophies || 0}\`` },
        { name: '**Desired Trophies:**', value: `\`${userData.desiredBulkTrophies || 0}\`` }
      );
    } else if (userData.type === 'other') {
      fields.push(
        { name: '**Request Type:**', value: '`Other Request`' },
        { name: '**Details:**', value: `\`${userData.otherRequest || 'No details provided'}\`` }
      );
    }

    // Add price information
    if (userData.price) {
      fields.push({ name: '**Price:**', value: `\`€${parseFloat(userData.price).toFixed(2)}\`` });
    } else {
      fields.push({ name: '**Price:**', value: '`Price not set`' });
    }

    // Add payment method information
    if (userData.paymentMethod) {
      fields.push(
        { name: '**Payment Method:**', value: `\`${userData.paymentMethod}\`` }
      );

      // Add crypto type if applicable
      if (userData.paymentMethod === 'Crypto' && userData.cryptoType) {
        fields.push({ name: '**Crypto Coin:**', value: `\`${userData.cryptoType}\`` });
      }

      // Add Dutch payment type if applicable
      if (userData.paymentMethod === 'Dutch Payment Methods' && userData.dutchPaymentType) {
        fields.push({ name: '**Type of Payment:**', value: `\`${userData.dutchPaymentType}\`` });
      }
    }

    recapEmbed.addFields(fields);

    // Send the recap embed
    return await channel.send({ embeds: [recapEmbed] });
  } catch (error) {
    console.error('[ORDER_RECAP] Error sending order recap:', error.message);
    console.error(error.stack);
  }
}

// Function to send a welcome embed to a ticket channel
async function sendWelcomeEmbed(channel, userId) {
  try {
    const user = await channel.client.users.fetch(userId);
    // Send non-embed text first, mentioning the user
    await channel.send(`${user}`);

    const welcomeEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR) // Use the global embed color
      .setDescription('Welcome, thanks for opening a ticket!\n\n**Support will be with you shortly.**\n\nIf there is any more details or information you would like to share, feel free to do so!')
      // No title as per new requirements
      .setTimestamp();

    await channel.send({ embeds: [welcomeEmbed] });
    console.log(`[WELCOME_EMBED] Sent welcome message and embed to channel ${channel.id} for user ${userId}`);
  } catch (error) {
    console.error(`[WELCOME_EMBED] Error sending welcome embed to ${channel.id}:`, error);
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
  sendOrderRecapEmbed,
  sendWelcomeEmbed
}; 