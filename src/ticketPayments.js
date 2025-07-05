const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits 
} = require('discord.js');
const config = require('../config');

/**
 * Sends the PayPal Terms of Service denial confirmation embed
 * @param {Interaction} interaction - The interaction that triggered this
 */
async function sendPayPalTosDeniedEmbed(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Are you sure?')
    .setDescription('Please confirm if you are sure you would like to deny the Terms of Services.\n\nThis means we **can not continue** with your order.')
    .setColor('#e68df2');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('paypal_deny_confirm')
      .setLabel('Continue')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('1351689463453061130'),
    new ButtonBuilder()
      .setCustomId('paypal_deny_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Success)
      .setEmoji('1357478063616688304')
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

/**
 * Sends the PayPal Terms of Service denial confirmed embed
 * @param {TextChannel} channel - The channel to send the embed to
 * @param {String} userId - The ID of the user who denied the terms
 */
async function sendPayPalTosDenialConfirmedEmbed(channel, userId) {
  return channel.send({
    content: `<@${userId}> has denied the Terms of Services.\n\nPlease explain why you denied the Terms of Services.\n\nIf no other solution can be found, this order will have to be cancelled.`
  });
}

/**
 * Sends the PayPal Terms of Service accepted embed
 * @param {TextChannel} channel - The channel to send the embed to
 * @param {String} userId - The ID of the user who accepted the terms
 */
async function sendPayPalTosAcceptedEmbed(channel, userId) {
  return channel.send({
    content: `<@${userId}> has accepted the Terms of Services.`
  });
}

/**
 * Sends the PayPal email information embed
 * @param {TextChannel} channel - The channel to send the embed to
 * @param {String} userId - The ID of the user who needs the payment info
 */
async function sendPayPalInfoEmbed(channel, userId) {
  const paypalEmail = config.PAYPAL_EMAIL || 'mathiasbenedetto@gmail.com';
  
  const embed = new EmbedBuilder()
    .setTitle('PayPal Payment Information:')
    .setDescription(`**PayPal E-Mail:**\n\`${paypalEmail}\`\n\nOnce you have sent the payment, click on the 'Payment Completed' button.`)
    .setColor('#e68df2');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('copy_email')
      .setLabel('Copy E-Mail')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('1372240644013035671'),
    new ButtonBuilder()
      .setCustomId('payment_completed')
      .setLabel('Payment Completed')
      .setStyle(ButtonStyle.Success)
      .setEmoji('1357478063616688304')
  );

  return channel.send({
    embeds: [embed],
    components: [row]
  });
}

/**
 * Sends the PayPal payment verification embed
 * @param {TextChannel} channel - The channel to send the embed to
 * @param {String} userId - The ID of the user who completed payment
 * @param {String} verifierId - The ID of the payment verifier
 */
async function sendPayPalPaymentVerificationEmbed(channel, userId, verifierId) {
  const embed = new EmbedBuilder()
    .setTitle('Payment Completed')
    .setDescription(`<@${userId}> has marked the Payment as completed.\n\nPlease confirm the payment has been received.`)
    .setColor('#e68df2');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('payment_received')
      .setLabel('Payment Received')
      .setStyle(ButtonStyle.Success)
      .setEmoji('1357478063616688304'),
    new ButtonBuilder()
      .setCustomId('payment_not_received')
      .setLabel('Not Received')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('1351689463453061130')
  );

  return channel.send({
    content: `<@1346034712627646524>`,
    embeds: [embed],
    components: [row]
  });
}

/**
 * Sends the boost available embed
 * @param {TextChannel} channel - The channel to send the embed to
 * @param {Object} orderDetails - Details about the order
 * @param {String} creatorId - The ID of the ticket creator
 * @param {String} boosterRoleId - The ID of the booster role
 */
async function sendBoostAvailableEmbed(channel, orderDetails, creatorId, boosterRoleId, replyToMessage) {
  const roleId = boosterRoleId || '1303702944696504441';
  
  const embed = new EmbedBuilder()
    .setTitle('Boost Available')
    .setDescription(`<@&${roleId}> This boost has been paid for and is available.\n\nClaim this boost by clicking the 'Claim Boost' button below.`)
    .setColor('#e68df2');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_boost')
      .setLabel('Claim Boost')
      .setStyle(ButtonStyle.Success)
      .setEmoji('1357478063616688304')
  );

  const sentMsg = await (replyToMessage && typeof replyToMessage.reply === 'function'
    ? replyToMessage.reply({ content: `<@&${roleId}>`, embeds: [embed], components: [row] })
    : channel.send({ content: `<@&${roleId}>`, embeds: [embed], components: [row] })
  );

  try {
    let foundRole = null;
    if (typeof channel.guild.roles.fetch === 'function') {
      foundRole = await channel.guild.roles.fetch(roleId).catch(() => null);
      if (!foundRole) {
        const allRoles = await channel.guild.roles.fetch();
        console.log('[BOOSTER_ROLE_DEBUG] All guild roles:', allRoles.map(r => `${r.id}:${r.name}`).join(', '));
        foundRole = allRoles.find(r => r.id === roleId);
        if (!foundRole) {
          console.error(`[BOOSTER_ROLE_DEBUG] Booster role with ID ${roleId} not found!`);
        }
      }
    }
    await channel.permissionOverwrites.edit(roleId, {
      ViewChannel: true,
      SendMessages: false,
      AddReactions: false,
      StartPublicThreads: false
    });
    console.log(`[BOOST_AVAILABLE] Booster role ${roleId} can now view (but not send) in channel ${channel.id}`);
  } catch (err) {
    console.error(`[BOOST_AVAILABLE] Failed to set booster role permissions:`, err);
  }

  return sentMsg;
}

/**
 * Sends the confirmation embed when a user selects payment method
 * @param {Interaction} interaction - The interaction that triggered this
 * @param {Object} userData - The user data with order details
 */
async function sendConfirmationEmbed(interaction, userData) {
  const { startRank, desiredRank, price, type } = userData;
  
  let startingLabel = "Current";
  let desiredLabel = "Desired";
  
  if (type === 'ranked') {
    startingLabel = "Current Rank";
    desiredLabel = "Desired Rank";
  } else if (type === 'mastery') {
    startingLabel = "Current Mastery";
    desiredLabel = "Desired Mastery";
  } else if (type === 'trophies' || type === 'bulk-trophies') {
    startingLabel = "Current Trophies";
    desiredLabel = "Desired Trophies";
  }
  
  const embed = new EmbedBuilder()
    .setTitle('Confirmation')
    .setDescription(
      `Please confirm all information below is correct\n\n` +
      `${startRank} > ${desiredRank}\n\n` +
      `**Final Price:**\n` +
      `${price}`
    )
    .setColor('#e68df2');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_order')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success)
      .setEmoji('1357478063616688304'),
    new ButtonBuilder()
      .setCustomId('cancel_order')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('1351689463453061130')
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

/**
 * Sends the welcome embed in a new ticket
 * @param {TextChannel} channel - The ticket channel
 * @param {String} userId - The ID of the user who opened the ticket
 */
async function sendWelcomeEmbed(channel, userId) {
  const embed = new EmbedBuilder()
    .setDescription('Welcome, thanks for opening a ticket!\n\n**Support will be with you shortly.**\n\nIf there is any more details or information you would like to share, feel free to do so!')
    .setColor('#e68df2');

  return channel.send({
    content: `<@${userId}> <@&${config.ROLES.OWNER_ROLE || '1292933200389083196'}> <@&${config.ROLES.ADMIN_ROLE || '1292933924116500532'}>`,
    embeds: [embed]
  });
}

/**
 * Sends the order details embed in a ticket
 * @param {TextChannel} channel - The ticket channel
 * @param {Object} userData - The user data with order details
 */
async function sendOrderDetailsEmbed(channel, userData) {
  const { startRank, desiredRank, price, type } = userData;
  
  let categoryLabel = "Rank";
  if (type === 'mastery') {
    categoryLabel = "Mastery";
  } else if (type === 'trophies' || type === 'bulk-trophies') {
    categoryLabel = "Trophies";
  }
  
  const embed = new EmbedBuilder()
    .setDescription(
      `**Current ${categoryLabel}:**\n` +
      `${startRank}\n\n` +
      `**Desired ${categoryLabel}:**\n` +
      `${desiredRank}\n\n` +
      `**Final Price:**\n` +
      `${price}`
    )
    .setColor('#e68df2');

  return channel.send({
    embeds: [embed]
  });
}

/**
 * Sends the PayPal Terms of Service embed in a ticket
 * @param {TextChannel} channel - The ticket channel
 * @param {String} userId - The ID of the user who opened the ticket
 */
async function sendPayPalTermsEmbed(channel, userId) {
  const embed = new EmbedBuilder()
    .setColor('#e68df2')
    .setTitle('PayPal Terms of Services')
    .setDescription([
      '> <:shield:1371879600560541756>[+] If our PayPal Account gets locked, you will have to wait for us to unlock it, if we fail to unlock it no product or refund will be given.',
      '> <:shield:1371879600560541756>[+] We will not be covering any transaction fees.',
      '> <:shield:1371879600560541756>[+] Send **Friends and Family** ONLY - Goods and Services is __Strictly Forbidden__',
      '> <:shield:1371879600560541756>[+] Send from **PayPal Balance** ONLY - Card/Bank Payments are __Strictly Forbidden__',
      '> <:shield:1371879600560541756>[+] Send **Euro Currency** Only.',
      '> <:shield:1371879600560541756>[+] Do **NOT add a note** to the payment.',
      '> <:shield:1371879600560541756>[+] Must send a Summary Screenshot after sending.'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('paypal_accept')
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setEmoji('1357478063616688304'),
    new ButtonBuilder()
      .setCustomId('paypal_deny')
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('1351689463453061130'),
    new ButtonBuilder()
      .setCustomId('request_support')
      .setLabel('Request Support')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('<:Support:1382066889873686608>')
  );

  return channel.send({ 
    embeds: [embed], 
    components: [row] 
  });
}

/**
 * Sends the PayPal screenshot request embed in a ticket
 * @param {TextChannel} channel - The ticket channel
 * @param {String} userId - The ID of the user who needs to upload a screenshot
 * @returns {Promise<Message>} The sent message
 */
async function sendPayPalScreenshotRequestEmbed(channel, userId) {
  const embed = new EmbedBuilder()
    .setTitle('Payment Verification')
    .setColor('#e68df2')
    .setDescription(
      '**Please send an uncropped screenshot of the summary in the chat.**\n\n' +
      '**What should we be able to see:**\n' +
      '> A screenshot on the PayPal App/Website or from the E-Mail you received.\n' +
      '> Make sure it includes way you paid: **PayPal Balance**\n\n' +
      'Please paste your screenshot in the chat.'
    );

  // Find the payment info message to reply to
  try {
    // Get many more messages to ensure we find the payment info message
    const messages = await channel.messages.fetch({ limit: 100 });
    let paymentInfoMessage = null;
    
    console.log(`[PAYPAL_SCREENSHOT] Searching through ${messages.size} messages for PayPal info message`);
    
    for (const [_, message] of messages) {
      if (message.embeds?.length > 0) {
        // Check for exact PayPal Payment Information title or variations
        if (message.embeds[0].title === 'PayPal Payment Information:' || 
            message.embeds[0].title === 'PayPal Payment Information') {
          paymentInfoMessage = message;
          console.log(`[PAYPAL_SCREENSHOT] Found PayPal info message with ID: ${message.id}`);
          break;
        }
        
        // Log all embed titles to help debug
        console.log(`[PAYPAL_SCREENSHOT] Message ${message.id} has embed with title: "${message.embeds[0].title}"`);
      }
    }
    
    // If we found the payment info message, reply to it
    if (paymentInfoMessage) {
      console.log(`[PAYPAL_SCREENSHOT] Replying to payment info message`);
      return paymentInfoMessage.reply({
        content: `<@${userId}>`,
        embeds: [embed]
      });
    } else {
      console.log(`[PAYPAL_SCREENSHOT] Payment info message not found in the last 20 messages`);
    }
  } catch (error) {
    console.error(`[PAYPAL_SCREENSHOT] Error finding payment info message: ${error.message}`);
  }
  
  // Fallback: Send as a regular message if we couldn't find the payment info message
  console.log(`[PAYPAL_SCREENSHOT] Sending as regular message (fallback)`);
  return channel.send({
    content: `<@${userId}>`,
    embeds: [embed]
  });
}

module.exports = {
  sendPayPalTosDeniedEmbed,
  sendPayPalTosDenialConfirmedEmbed,
  sendPayPalTosAcceptedEmbed,
  sendPayPalInfoEmbed,
  sendPayPalPaymentVerificationEmbed,
  sendBoostAvailableEmbed,
  sendConfirmationEmbed,
  sendWelcomeEmbed,
  sendOrderDetailsEmbed,
  sendPayPalTermsEmbed,
  sendPayPalScreenshotRequestEmbed
}; 