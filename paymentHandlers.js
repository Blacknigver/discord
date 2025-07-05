const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { EMBED_COLOR, EMOJIS, PAYMENT_METHODS, PAYMENT_STAFF } = require('./src/constants');
const { 
  showCryptoSelection, 
  showDutchPaymentMethodSelection, 
  sendPaymentConfirmationEmbed, 
  createCryptoTxForm,
  sendStaffPaymentVerificationEmbed,
  sendPaymentConfirmedNotification
} = require('./ticketPayments');
const config = require('./config');

// Set of used crypto transaction IDs to prevent reuse
const usedTxIds = new Set();
// Map to track crypto payment timeouts
const cryptoTimeouts = new Map();

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
 * Handle crypto selection buttons
 */
const cryptoButtonHandlers = {
  'crypto_ltc': async (interaction) => {
    // Extract price from ticket
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
    
    await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'ltc', price);
    await interaction.deferUpdate();
    
    // Set timeout for 30 minutes
    setupCryptoTimeout(interaction.channel, 'ltc', price);
  },
  
  'crypto_sol': async (interaction) => {
    // Extract price from ticket
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
    
    await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'sol', price);
    await interaction.deferUpdate();
    
    // Set timeout for 30 minutes
    setupCryptoTimeout(interaction.channel, 'sol', price);
  },
  
  'crypto_btc': async (interaction) => {
    await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'btc', 0);
    await interaction.deferUpdate();
  },
  
  'crypto_other': async (interaction) => {
    await showCryptoOtherForm(interaction);
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

// Copy crypto address buttons are handled dynamically in interactions.js

/**
 * Handle PayPal TOS acceptance button
 */
const paypalTosAcceptHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    const channelTopicId = interaction.channel.topic;
    
    // Check if the user who clicked is the ticket creator
    if (userId !== channelTopicId) {
      return interaction.reply({
        content: 'Only the ticket creator can accept the Terms of Service.',
        ephemeral: true
      });
    }
    
    // Update the button to show it was clicked
    const newButton = new ButtonBuilder()
      .setCustomId('paypal_tos_accepted')
      .setLabel(`${interaction.user.username} Agreed to the Terms of Services.`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
      
    await interaction.update({
      components: [new ActionRowBuilder().addComponents(newButton)]
    });
    
    // Send acceptance message
    await sendPayPalTosAcceptedEmbed(interaction.channel, userId);
    
    // Send the PayPal payment information
    await sendPayPalInfoEmbed(interaction.channel, userId);
  } catch (error) {
    console.error('Error handling PayPal TOS acceptance:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle PayPal TOS denial button
 */
const paypalTosDenyHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    const channelTopicId = interaction.channel.topic;
    
    // Check if the user who clicked is the ticket creator
    if (userId !== channelTopicId) {
      return interaction.reply({
        content: 'Only the ticket creator can deny the Terms of Service.',
        ephemeral: true
      });
    }
    
    // Show the confirmation prompt
    await sendPayPalTosDeniedEmbed(interaction);
  } catch (error) {
    console.error('Error handling PayPal TOS denial:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle confirmation of PayPal TOS denial
 */
const paypalDenyConfirmedHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    // Delete the confirmation message
    await interaction.message.delete().catch(() => {});
    
    // Make the original Accept/Deny buttons unclickable
    const originalMessage = interaction.message.reference ? 
      await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null) : null;
    
    if (originalMessage) {
      const disabledAcceptBtn = new ButtonBuilder()
        .setCustomId('paypal_tos_accept_disabled')
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);
        
      const disabledDenyBtn = new ButtonBuilder()
        .setCustomId('paypal_tos_deny_disabled')
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);
        
      await originalMessage.edit({
        components: [new ActionRowBuilder().addComponents(disabledAcceptBtn, disabledDenyBtn)]
      });
    }
    
    // Send the denial confirmed embed
    await sendPayPalTosDenialConfirmedEmbed(interaction.channel, userId);
  } catch (error) {
    console.error('Error handling PayPal TOS denial confirmation:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle cancelation of PayPal TOS denial
 */
const paypalDenyCancelledHandler = async (interaction) => {
  try {
    // Simply delete the confirmation message
    await interaction.message.delete();
  } catch (error) {
    console.error('Error handling PayPal TOS denial cancellation:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle PayPal payment completed button click
 */
const paypalPaymentCompletedHandler = async (interaction) => {
  try {
    // Get ticket creator ID from channel topic
    const userId = interaction.user.id;
    const channelName = interaction.channel.name;
    
    // Check if user is the ticket creator
    if (!channelName.includes(interaction.user.username.toLowerCase())) {
      return interaction.reply({
        content: 'Only the ticket creator can mark the payment as completed.',
        ephemeral: true
      });
    }
    
    console.log(`[PAYPAL_BUTTON] User ${userId} clicked Payment Completed`);
    
    // Update the buttons to disabled
    try {
      const message = interaction.message;
      const disabledRow = new ActionRowBuilder();
      
      // Get the original components and disable them
      message.components[0].components.forEach(component => {
        disabledRow.addComponents(
          ButtonBuilder.from(component).setDisabled(true)
        );
      });
      
      await interaction.update({ components: [disabledRow] });
    } catch (updateError) {
      console.warn(`[PAYMENT_COMPLETED] Could not update message buttons: ${updateError.message}`);
      // Continue with the function even if the update fails
    }
    
    // Instead of sending the verification embed, call the button handler in src/handlers/paypalButtonHandler.js
    // which will handle the screenshot request and verification flow
    const { handlePayPalPaymentCompleted } = require('./src/handlers/paypalButtonHandler');
    return await handlePayPalPaymentCompleted(interaction);
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in paypalPaymentCompletedHandler: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your payment completion.',
        ephemeral: true
      });
    }
    return false;
  }
};

/**
 * Handle staff payment received confirmation for PayPal
 */
const paypalPaymentReceivedHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    // Check if the user who clicked is authorized staff
    const verifierId = config.PAYMENT_STAFF?.PAYPAL_VERIFIER;
    const verifierIds = Array.isArray(verifierId) ? verifierId : [verifierId];
    
    console.log(`[PAYPAL_BUTTON] Staff ${userId} clicked Payment Received button`);
    console.log(`[PAYPAL_BUTTON] Verifier IDs: ${JSON.stringify(verifierIds)}, User ID: ${userId}`);
    
    if (!verifierIds.includes(userId)) {
      console.log(`[PAYPAL_BUTTON] User ${userId} is not authorized to verify payments`);
      await interaction.reply({
        content: 'Only authorized staff can verify payment receipt.',
        ephemeral: true
      });
      return;
    }
    
    console.log(`[PAYPAL_BUTTON] User ${userId} is authorized to verify payments`);
    
    // Disable the buttons on the payment verification message
    try {
      const message = interaction.message;
      const disabledRow = new ActionRowBuilder();
      
      // Check if message has components to avoid errors
      if (message.components && message.components.length > 0 && message.components[0].components) {
        message.components[0].components.forEach(component => {
          disabledRow.addComponents(
            ButtonBuilder.from(component).setDisabled(true)
          );
        });
        
        // Update the message with disabled buttons
        await interaction.update({ components: [disabledRow] });
        console.log(`[PAYPAL_BUTTON] Disabled buttons on message ${message.id}`);
      }
    } catch (buttonError) {
      console.error(`[PAYPAL_BUTTON] Error disabling buttons: ${buttonError.message}`);
    }
    
    // Find the booster role in the guild
    const roleId = '1303702944696504441'; // Hardcoded booster role ID
    let boosterRole;
    
    try {
      boosterRole = await interaction.guild.roles.fetch(roleId);
      console.log(`[PAYPAL_BUTTON] Found booster role: ${boosterRole.name} (${boosterRole.id})`);
    } catch (roleError) {
      console.error(`[PAYPAL_BUTTON] Error fetching booster role: ${roleError.message}`);
    }
    
    // Update channel permissions to allow the booster role to view the channel (but not send messages)
    try {
      if (boosterRole) {
        await interaction.channel.permissionOverwrites.edit(boosterRole.id, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: false
        });
        console.log(`[PAYPAL_BUTTON] Set view-only permissions for booster role ${boosterRole.id} using role object`);
      } else {
        // Alternative method if the role fetch failed
        await interaction.channel.permissionOverwrites.edit(roleId, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: false
        });
        console.log(`[PAYMENT_HANDLER] Added booster role ${roleId} to permitted roles for channel ${interaction.channel.id} (view only)`);
      }
    } catch (error) {
      console.error(`[PAYMENT_HANDLER] Error updating channel permissions: ${error.message}`);
    
      // Try alternative method for setting permissions
      try {
        const channel = interaction.channel;
    
        // Create a new permission overwrite
        await channel.permissionOverwrites.create(roleId, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: false
        });
        console.log(`[PAYMENT_HANDLER] Successfully added booster role ${roleId} using alternative method (view only)`);
      } catch (altError) {
        console.error(`[PAYMENT_HANDLER] Alternative method also failed: ${altError.message}`);
      }
    }
    
    // Extract the user ID from the embed
    const userIdMatch = interaction.message.embeds[0].description.match(/<@(\d+)>/);
    const creatorId = userIdMatch ? userIdMatch[1] : null;
    
    // Send boost available embed AFTER adding the role permissions
    const { sendBoostAvailableEmbed } = require('./ticketPayments');
    await sendBoostAvailableEmbed(interaction.channel, {}, creatorId, roleId, interaction.message);
    
    return true;
  } catch (error) {
    console.error('Error handling payment received for PayPal:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact an admin.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle staff payment not received for PayPal
 */
const paypalPaymentNotReceivedHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    // Check if the user who clicked is authorized staff
    const verifierIds = ['986164993080836096', '987751357773672538'];
    
    if (!verifierIds.includes(userId)) {
      return interaction.reply({
        content: 'Only authorized staff can reject payment receipt.',
        ephemeral: true
      });
    }
    
    // Update the verification buttons to be unclickable with rejected status
    const rejectedBtn = new ButtonBuilder()
      .setCustomId('paypal_payment_not_received_confirmed')
      .setLabel('Payment has not been received.')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
    
    await interaction.update({
      components: [new ActionRowBuilder().addComponents(rejectedBtn)]
    });
  } catch (error) {
    console.error('Error handling payment not received for PayPal:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle boost claim button
 */
const claimBoostHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    const member = interaction.member;
    const channel = interaction.channel;
    
    // Hardcode the correct booster role ID
    const boosterRoleId = '1303702944696504441';
    
    // Debug log all roles the user has
    const memberRoles = [];
    try {
      interaction.member.roles.cache.forEach(role => {
        memberRoles.push(role.id);
        console.log(`[BOOST] User has role: ${role.name} (${role.id})`);
      });
    } catch (err) {
      console.error(`[BOOST] Error logging roles: ${err.message}`);
    }
    
    console.log(`[BOOST] Checking for booster role: ${boosterRoleId} in user roles: ${memberRoles.join(', ')}`);
    
    // Check if the user has the booster role - try multiple methods
    let hasBoosterRole = false;
    
    // Method 1: Direct array check
    if (memberRoles.includes(boosterRoleId)) {
      console.log(`[BOOST] User has booster role (direct check)`);
      hasBoosterRole = true;
    }
    
    // Method 2: Cache check if method 1 failed
    if (!hasBoosterRole && interaction.member.roles && interaction.member.roles.cache) {
      if (interaction.member.roles.cache.has(boosterRoleId)) {
        console.log(`[BOOST] User has booster role (cache check)`);
        hasBoosterRole = true;
      }
    }
    
    // Method 3: Manual role check for each role
    if (!hasBoosterRole) {
      interaction.member.roles.cache.forEach(role => {
        if (role.id === boosterRoleId) {
          console.log(`[BOOST] User has booster role (forEach check)`);
          hasBoosterRole = true;
        }
      });
    }
    
    // For testing, allow admins or verifiers to claim as well
    if (!hasBoosterRole) {
      // Admin check
      const adminRoleId = '1381713892501356585';
      if (memberRoles.includes(adminRoleId)) {
        console.log(`[BOOST] User is an admin, allowing claim`);
        hasBoosterRole = true;
      }
      
      // Verifier check
      const verifierId = config.PAYMENT_STAFF?.PAYPAL_VERIFIER;
      const verifierIds = Array.isArray(verifierId) ? verifierId : [verifierId];
      if (verifierIds && verifierIds.includes(userId)) {
        console.log(`[BOOST] User is a verifier, allowing claim`);
        hasBoosterRole = true;
      }
      
      // Test user check
      if (userId === '1346034712627646524') {
        console.log(`[BOOST] User is test user, allowing claim`);
        hasBoosterRole = true;
      }
    }
    
    // If all checks fail, user doesn't have the role
    if (!hasBoosterRole) {
      console.log(`[BOOST] User does not have booster role. User roles: ${memberRoles.join(', ')}`);
      return interaction.reply({
        content: `Only boosters can claim this boost.`,
        ephemeral: true
      });
    }
    
    // User has the role, proceed with claiming
    console.log(`[BOOST] User ${userId} has booster role, allowing claim`);
    
    // Get the original message (Boost Available embed)
    const message = interaction.message;
    
    // Disable the Claim Boost button
    const disabledRow = new ActionRowBuilder();
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    // Update the message with disabled buttons
    await interaction.update({ components: [disabledRow] });
    
    // Move the channel to the appropriate category based on who claimed it
    try {
      const { moveToCategory } = require('./utils.js');
      await moveToCategory(interaction.channel, 'claim_boost', userId);
      console.log(`[BOOST] Moved channel to category for booster ${userId}`);
    } catch (error) {
      console.error(`[BOOST] Error moving channel to category: ${error.message}`);
      // Continue with the rest of the function even if moving fails
    }
    
    // Try to find the ticket creator
    let ticketCreatorId = '';
    try {
      // First method: Try to get the creator ID from the original message
      const userIdMatch = message.embeds[0].description.match(/<@(\d+)>/);
      if (userIdMatch && userIdMatch[1]) {
        ticketCreatorId = userIdMatch[1];
        console.log(`[BOOST] Found ticket creator from embed description: ${ticketCreatorId}`);
      }
      
      // Second method: Look for the ticket creator in the channel name or topic
      if (!ticketCreatorId) {
        const channelName = channel.name;
        const guildMembers = await interaction.guild.members.fetch();
        
        // Find member whose username is in the channel name
        for (const [memberId, guildMember] of guildMembers) {
          if (channelName.includes(guildMember.user.username.toLowerCase())) {
            ticketCreatorId = memberId;
            console.log(`[BOOST] Found ticket creator from channel name: ${ticketCreatorId}`);
            break;
          }
        }
      }
      
      // Third method: Try to get from channel topic
      if (!ticketCreatorId && channel.topic) {
        const topicMatch = channel.topic.match(/\d{17,19}/);
        if (topicMatch) {
          ticketCreatorId = topicMatch[0];
          console.log(`[BOOST] Found ticket creator from channel topic: ${ticketCreatorId}`);
        }
      }
      
      if (!ticketCreatorId) {
        console.log(`[BOOST] Could not determine ticket creator from any source`);
        // Default to a fallback ID if necessary
        // ticketCreatorId = '1346034712627646524'; // Use a default ID as fallback
      }
    } catch (error) {
      console.error(`[BOOST] Error finding ticket creator: ${error.message}`);
    }
    
    // Create the Boost Claimed embed
    const claimedEmbed = new EmbedBuilder()
      .setTitle('Boost Claimed')
      .setDescription(`<@${ticketCreatorId}> Your boost has been claimed by our booster <@${userId}>!\n\nPlease give them your E-Mail and after that the verification code from your E-Mail so they can log in.`)
      .setColor('#e68df2');
    
    // Create the buttons
    const completedButton = new ButtonBuilder()
      .setCustomId('boost_completed')
      .setLabel('Boost Completed')
      .setEmoji('1357478063616688304')
      .setStyle(ButtonStyle.Success);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('boost_cancel')
      .setLabel('Cancel Boost')
      .setEmoji('1351689463453061130')
      .setStyle(ButtonStyle.Danger);
    
    const row = new ActionRowBuilder()
      .addComponents(completedButton, cancelButton);
    
    // Send the Boost Claimed message as a reply to the Boost Available message
    const claimedMessage = await message.reply({
      content: `<@${userId}> <@${ticketCreatorId}>`,
      embeds: [claimedEmbed],
      components: [row]
    });
    
    console.log(`[BOOST] Sent Boost Claimed message with ID: ${claimedMessage.id}`);
    console.log(`[BOOST] Message mentions booster: ${userId} and ticket creator: ${ticketCreatorId}`);
    
    // Remove access for other boosters by updating the channel permissions
    try {
      // Get all booster role members
      const boosterRole = interaction.guild.roles.cache.get(boosterRoleId);
      if (boosterRole) {
        // Set the booster role to not see the channel
        await channel.permissionOverwrites.edit(boosterRoleId, {
          ViewChannel: false
        });
        
        console.log(`[BOOST] Removed channel access for booster role`);
      }
      
      // Grant permissions to the claimer
      await channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AddReactions: true,
        EmbedLinks: true,
        AttachFiles: true
      });
      
      console.log(`[BOOST] Updated permissions for claimer ${userId}`);
    } catch (error) {
      console.error(`[BOOST] Error updating permissions: ${error.message}`);
    }
  } catch (error) {
    console.error('Error handling boost claim:', error);
    console.error(error.stack);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Boost Completed button
 */
const boostCompletedHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    // Get mentioned users from the message
    const mentionedUsers = Array.from(interaction.message.mentions.users.values());
    console.log(`[BOOST] Boost Completed button clicked by user ${userId}`);
    console.log(`[BOOST] All mentioned users: ${mentionedUsers.map(u => u.id).join(', ')}`);
    console.log(`[BOOST] Message content: ${interaction.message.content}`);
    
    // The message content format is "<@boosterId> <@ticketCreatorId>"
    // Extract the first mention directly from the content
    const messageContentMatches = interaction.message.content.match(/<@(\d+)>/g);
    const boosterMentionedId = messageContentMatches && messageContentMatches[0] ? 
      messageContentMatches[0].replace(/<@|>/g, '') : mentionedUsers[0]?.id;
      
    console.log(`[BOOST] First mentioned user (booster) in message content: ${boosterMentionedId}`);
    
    // Check if user is authorized to click this button
    if (userId !== boosterMentionedId) {
      console.log(`[BOOST] User ${userId} is not authorized to complete this boost. Expected booster: ${boosterMentionedId}`);
      return interaction.reply({
        content: 'You are not authorized to complete this boost. Only the booster who claimed it can mark it as completed.',
        ephemeral: true
      });
    }
    
    console.log(`[BOOST] User ${userId} is authorized to complete this boost. Processing...`);
    
    // Get the ticket creator's ID (second mentioned user in the content)
    console.log(`[BOOST] All mentioned users: ${mentionedUsers.map(u => u.id).join(', ')}`);
    
    // Extract the second mention directly from the content
    const contentMatches = interaction.message.content.match(/<@(\d+)>/g);
    const ticketCreatorId = contentMatches && contentMatches[1] ? 
      contentMatches[1].replace(/<@|>/g, '') : '';
    console.log(`[BOOST] Ticket creator from content mentions: ${ticketCreatorId}`);
    
    // If we couldn't find the ticket creator from content, try from collection or channel topic
    let finalTicketCreatorId = ticketCreatorId;
    if (!finalTicketCreatorId && mentionedUsers.length > 1) {
      finalTicketCreatorId = mentionedUsers[1].id;
      console.log(`[BOOST] Found ticket creator from mentions collection: ${finalTicketCreatorId}`);
    }
    
    if (!finalTicketCreatorId) {
      const channelTopic = interaction.channel.topic;
      if (channelTopic && channelTopic.match(/\d{17,19}/)) {
        finalTicketCreatorId = channelTopic.match(/\d{17,19}/)[0];
        console.log(`[BOOST] Found ticket creator from channel topic: ${finalTicketCreatorId}`);
      }
    }
    
    // If still not found, try to extract from channel name (format: rank-rank-username)
    if (!finalTicketCreatorId) {
      const channelName = interaction.channel.name;
      // Try to find the user ID in previous messages
      interaction.channel.messages.fetch({ limit: 100 })
        .then(messages => {
          for (const message of messages.values()) {
            if (message.author.bot && message.embeds.length > 0) {
              const description = message.embeds[0].description;
              if (description && description.includes("boost has been paid for")) {
                const userMatch = description.match(/<@(\d+)>/);
                if (userMatch && userMatch[1]) {
                  finalTicketCreatorId = userMatch[1];
                  console.log(`[BOOST] Found ticket creator from previous messages: ${finalTicketCreatorId}`);
                  break;
                }
              }
            }
          }
        })
        .catch(error => {
          console.error(`[BOOST] Error fetching messages: ${error.message}`);
        });
    }
    
    // Create the Boost Completed embed
    const completedEmbed = new EmbedBuilder()
      .setTitle('Boost Completed')
      .setDescription(`<@${finalTicketCreatorId}> Your booster has marked this boost as completed, please confirm your boost has been completed.\n\n**This action is irreversible, if you confirm your boost has been completed the money you have paid will be released!**`)
      .setColor('#e68df2');
    
    // Create the buttons
    const isCompletedButton = new ButtonBuilder()
      .setCustomId('boost_is_completed')
      .setLabel('Boost is Completed')
      .setEmoji('1357478063616688304')
      .setStyle(ButtonStyle.Success);
    
    const notCompletedButton = new ButtonBuilder()
      .setCustomId('boost_not_completed')
      .setLabel('Boost is not Completed')
      .setEmoji('1351689463453061130')
      .setStyle(ButtonStyle.Danger);
    
    const row = new ActionRowBuilder()
      .addComponents(isCompletedButton, notCompletedButton);
    
    // Disable buttons on the original message
    const message = interaction.message;
    const disabledRow = new ActionRowBuilder();
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    // Update the original message with disabled buttons
    await interaction.update({ components: [disabledRow] });
    console.log(`[BOOST] Original message buttons disabled`);
    
    // Send the Boost Completed message
    const completedMessage = await interaction.channel.send({
      content: `<@${finalTicketCreatorId}>`,
      embeds: [completedEmbed],
      components: [row]
    });
    
    console.log(`[BOOST] Sent Boost Completed message with ID: ${completedMessage.id}`);
    console.log(`[BOOST] Completed message mentioned user: ${finalTicketCreatorId}`);
    
    return true;
  } catch (error) {
    console.error(`[BOOST] Error in boostCompletedHandler: ${error.message}`);
    console.error(error.stack);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing the boost completion.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Boost Cancel button
 */
const boostCancelHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    // Check if user is authorized to click this button
    if (
      userId !== interaction.message.mentions.users.first().id && // The booster who claimed
      userId !== '1346034712627646524' && // Specified authorized user
      userId !== '987751357773672538' && // Specified authorized user
      userId !== '986164993080836096'    // Specified authorized user
    ) {
      return interaction.reply({
        content: 'You are not authorized to cancel this boost.',
        ephemeral: true
      });
    }
    
    // Get the booster who claimed it (first mentioned user)
    const boosterId = interaction.message.mentions.users.first().id;
    
    // Remove permissions from the booster
    try {
      await interaction.channel.permissionOverwrites.edit(boosterId, {
        SendMessages: false,
        AddReactions: false
      });
      
      console.log(`[BOOST] Removed permissions from booster ${boosterId}`);
    } catch (error) {
      console.error(`[BOOST] Error removing booster permissions: ${error.message}`);
    }
    
    // Restore access to all boosters
    try {
      // Hardcode the correct booster role ID
      const boosterRoleId = '1303702944696504441';
      
      await interaction.channel.permissionOverwrites.edit(boosterRoleId, {
        ViewChannel: true
      });
      
      console.log(`[BOOST] Restored view access for booster role`);
    } catch (error) {
      console.error(`[BOOST] Error restoring booster role permissions: ${error.message}`);
    }
    
    // Disable buttons on the current message
    const message = interaction.message;
    const disabledRow = new ActionRowBuilder();
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    // Update the message with disabled buttons
    await interaction.update({ components: [disabledRow] });
    
    // Send a new Boost Available embed
    const roleId = '1303702944696504441'; // Booster role ID
    
    const boostAvailableEmbed = new EmbedBuilder()
      .setTitle('Boost Available')
      .setDescription(`<@&${roleId}> This boost has been paid for and is available.\n\nClaim this boost by clicking the 'Claim Boost' button below.`)
      .setColor('#e68df2');
    
    const claimButton = new ButtonBuilder()
      .setCustomId('claim_boost')
      .setLabel('Claim Boost')
      .setEmoji('1357478063616688304')
      .setStyle(ButtonStyle.Success);
    
    const row = new ActionRowBuilder().addComponents(claimButton);
    
    await interaction.channel.send({
      content: `<@&${roleId}>`,
      embeds: [boostAvailableEmbed],
      components: [row]
    });
  } catch (error) {
    console.error(`[BOOST] Error in boostCancelHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while cancelling the boost.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Boost Is Completed button
 */
const boostIsCompletedHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    // Get the ticket creator's ID from the mention
    const ticketCreatorId = interaction.message.mentions.users.first().id;
    
    console.log(`[BOOST] Boost Is Completed button clicked by user ${userId}`);
    console.log(`[BOOST] Message mentioned user (ticket creator): ${ticketCreatorId}`);
    console.log(`[BOOST] Message content: ${interaction.message.content}`);
    
    // Check if user is authorized to click this button
    if (userId !== ticketCreatorId && 
        userId !== '1346034712627646524' && // Specified authorized user
        userId !== '987751357773672538' && // Specified authorized user
        userId !== '986164993080836096'    // Specified authorized user
    ) {
      console.log(`[BOOST] User ${userId} is not authorized to confirm boost completion. Expected ticket creator: ${ticketCreatorId}`);
      return interaction.reply({
        content: 'You are not authorized to confirm this boost completion. Only the ticket creator can confirm completion.',
        ephemeral: true
      });
    }
    
    console.log(`[BOOST] User ${userId} is authorized to confirm boost completion. Processing...`);
    
    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('Are you sure?')
      .setDescription('Are you sure your boost has been completed?\n\nIf you click \'**Confirm**\' the money will be released to the booster.')
      .setColor('#e68df2');
    
    // Create buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('boost_confirm_completed')
      .setLabel('Confirm')
      .setEmoji('1357478063616688304')
      .setStyle(ButtonStyle.Success);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('boost_cancel_confirmation')
      .setLabel('Cancel')
      .setEmoji('1351689463453061130')
      .setStyle(ButtonStyle.Danger);
    
    const row = new ActionRowBuilder()
      .addComponents(confirmButton, cancelButton);
    
    // Don't disable the original buttons until confirmation
    // We'll just reply with the confirmation dialog
    console.log(`[BOOST] Keeping original buttons active until confirmation`);
    
    // Send the confirmation message as a reply without updating the original message
    const confirmationMessage = await interaction.reply({
      embeds: [confirmEmbed],
      components: [row],
      ephemeral: true
    });
    
    console.log(`[BOOST] Sent confirmation message with ID: ${confirmationMessage.id}`);
    return true;
  } catch (error) {
    console.error(`[BOOST] Error in boostIsCompletedHandler: ${error.message}`);
    console.error(error.stack);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your confirmation.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Boost Confirm Completed button
 */
const boostConfirmCompletedHandler = async (interaction) => {
  try {
    console.log(`[BOOST] Boost Confirm Completed button clicked by user ${interaction.user.id}`);
    
    // Get the original message with the "Boost is Completed" button
    // The original message would be 2 messages back from the interaction
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 5 });
      const originalMessage = messages.find(msg => 
        msg.components.length > 0 && 
        msg.components[0].components.some(comp => 
          comp.customId === 'boost_is_completed' || 
          comp.customId === 'boost_not_completed'
        )
      );
      
      if (originalMessage) {
        // Create a "completed" button for the original message
        const completedButton = new ButtonBuilder()
          .setCustomId('boost_completed_status')
          .setLabel('Boost has been completed')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true);
        
        const completedRow = new ActionRowBuilder()
          .addComponents(completedButton);
        
        // Update the original message with the disabled button
        await originalMessage.edit({ components: [completedRow] });
        console.log(`[BOOST] Updated original message with completed status after confirmation`);
      }
    } catch (error) {
      console.error(`[BOOST] Error updating original message: ${error.message}`);
    }
    
    // Move the channel to the completed category
    try {
      const { moveToCategory } = require('./utils.js');
      await moveToCategory(interaction.channel, 'boost_completed');
      console.log(`[BOOST] Moved channel to completed category`);
    } catch (error) {
      console.error(`[BOOST] Error moving channel to category: ${error.message}`);
      // Continue with the rest of the function even if moving fails
    }
    
    // Get the channel for completion logging
    const logChannel = interaction.guild.channels.cache.get('1382022752474501352');
    
    // Try to extract information from the ticket
    let ticketCreatorId = '';
    let boosterId = '';
    let paymentMethod = 'PayPal'; // Default to PayPal
    let price = '';
    
    // Look for payment information in the channel
    try {
      // First check if there's a ticket creator from the channel name
      const channelName = interaction.channel.name;
      const guildMembers = await interaction.guild.members.fetch();
      
      // Find member whose username is in the channel name
      for (const [memberId, guildMember] of guildMembers) {
        if (channelName.includes(guildMember.user.username.toLowerCase())) {
          ticketCreatorId = memberId;
          console.log(`[BOOST] Found ticket creator from channel name: ${ticketCreatorId}`);
          break;
        }
      }
      
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      console.log(`[BOOST] Fetched ${messages.size} messages to look for boost information`);
      
      // Look for the Boost Claimed message to get the booster ID
      for (const [_, message] of messages) {
        if (message.embeds.length > 0 && message.embeds[0].title === 'Boost Claimed') {
          // Extract the mentioned users from the content, not from the mentions collection
          const contentMentions = message.content.match(/<@(\d+)>/g) || [];
          const mentionIds = contentMentions.map(mention => mention.match(/<@(\d+)>/)[1]);
          
          if (mentionIds.length >= 2) {
            boosterId = mentionIds[0]; // First mention is the booster
            
            // If we didn't find the ticket creator earlier, use the second mention
            if (!ticketCreatorId) {
              ticketCreatorId = mentionIds[1]; // Second mention is the ticket creator
            }
            
            console.log(`[BOOST] Found booster ID: ${boosterId} and ticket creator ID: ${ticketCreatorId} from Boost Claimed message`);
            break;
          }
        }
      }
      
      // Look for price information (could be in an order details embed)
      for (const [_, message] of messages) {
        if (message.embeds.length > 0) {
          const description = message.embeds[0].description;
          if (description && description.includes('Final Price:')) {
            const priceMatch = description.match(/\*\*Final Price:\*\*\n\`([^`]+)\`/);
            if (priceMatch && priceMatch[1]) {
              price = priceMatch[1].trim();
              console.log(`[BOOST] Found price information: ${price}`);
            }
          }
        }
      }
      
      // Look for payment method information
      for (const [_, message] of messages) {
        if (message.embeds.length > 0) {
          const title = message.embeds[0].title;
          if (title) {
            if (title.includes('PayPal')) paymentMethod = 'PayPal';
            else if (title.includes('IBAN')) paymentMethod = 'IBAN Bank Transfer';
            else if (title.includes('Crypto')) paymentMethod = 'Crypto';
            else if (title.includes('Tikkie')) paymentMethod = 'Dutch Payment Methods';
            else if (title.includes('Apple')) paymentMethod = 'PayPal Giftcard';
            else if (title.includes('Giftcard')) paymentMethod = 'PayPal Giftcard';
          }
        }
      }
      console.log(`[BOOST] Found payment method: ${paymentMethod}`);
      
      // If we still don't have a ticket creator ID, use the topic or a default
      if (!ticketCreatorId) {
        if (interaction.channel.topic) {
          const topicMatch = interaction.channel.topic.match(/<@(\d+)>/);
          if (topicMatch) {
            ticketCreatorId = topicMatch[1];
            console.log(`[BOOST] Found ticket creator from topic: ${ticketCreatorId}`);
          }
        }
        
        // Last resort: Use the interaction user if nothing else works
        if (!ticketCreatorId) {
          console.log(`[BOOST] Could not determine ticket creator, defaulting to interaction user`);
          ticketCreatorId = interaction.user.id;
        }
      }
      
    } catch (error) {
      console.error(`[BOOST] Error gathering ticket information: ${error.message}`);
    }
    
    // Add the completed boost role to the ticket creator
    try {
      if (ticketCreatorId) {
        const member = await interaction.guild.members.fetch(ticketCreatorId);
        if (member) {
          await member.roles.add('1370848171231543356');
          console.log(`[BOOST] Added completed boost role to ${ticketCreatorId}`);
        }
      }
    } catch (error) {
      console.error(`[BOOST] Error adding role: ${error.message}`);
    }
    
    // Disable buttons on the original message
    await interaction.update({
      components: [],
      content: 'Confirmation received.',
      embeds: []
    });
    
    // Send completion message in the channel with embed
    const completionEmbed = new EmbedBuilder()
      .setTitle('Order Completed')
      .setDescription(
        'Your order has been completed! Thanks for choosing us!\n\n' +
        '> Use the **Feedback** button to leave feedback on the way the bot works and your order is handled. This is optional\n' +
        '# Please Review!\n' +
        '> Please use the **Review** button to leave a review for our services. **We would appreciate this very much**\n' +
        '> This **can be done anonymously!** But is is preferred if you do not stay anonymous\n\n' +
        'Have a nice rest of your day! **Please don\'t forget to review!**'
      )
      .setColor('#e68df2');
      
    // Create buttons for review and feedback - use the proper ticket creator ID
    const reviewButton = new ButtonBuilder()
      .setCustomId(`review_button_${ticketCreatorId}`)
      .setLabel('Review')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary);
      
    const feedbackButton = new ButtonBuilder()
      .setCustomId(`feedback_button_${ticketCreatorId}`)
      .setLabel('Leave Feedback')
      .setEmoji('<:Feedback:1382060106111389777>')
      .setStyle(ButtonStyle.Success);
      
    const reviewFeedbackRow = new ActionRowBuilder()
      .addComponents(reviewButton, feedbackButton);
      
    const completionMessage = await interaction.channel.send({
      content: `<@${ticketCreatorId}>`,
      embeds: [completionEmbed],
      components: [reviewFeedbackRow]
    });
    
    console.log(`[BOOST] Sent completion message with ID: ${completionMessage.id}`);
    
    // Schedule ticket auto-close after 30 minutes
    const closeTimeMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    const closeTimestamp = Math.floor((Date.now() + closeTimeMs) / 1000);
    
    // Send message about auto-close - use the proper ticket creator ID
    await interaction.channel.send({
      content: `<@${ticketCreatorId}> This ticket will automatically be closed in <t:${closeTimestamp}:R>`,
    });
    
    // Set up delayed close
    setTimeout(async () => {
      try {
        // Make sure the channel still exists
        const channel = interaction.client.channels.cache.get(interaction.channel.id);
        if (!channel) {
          console.log(`[AUTO_CLOSE] Channel ${interaction.channel.id} no longer exists, skipping auto-close`);
          return;
        }
        
        // Set permissions so nobody can send messages
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
          SendMessages: false
        });
        
        // Keep read access for the ticket creator
        if (ticketCreatorId) {
          await channel.permissionOverwrites.edit(ticketCreatorId, {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true
          });
        }
        
        // Send close notification
        await channel.send({
          content: `This ticket has been automatically closed after completion.`,
          embeds: [
            new EmbedBuilder()
              .setTitle('Ticket Closed')
              .setDescription('This ticket has been automatically closed since the order was completed.')
              .setColor('#e68df2')
              .setTimestamp()
          ]
        });
        
        console.log(`[AUTO_CLOSE] Auto-closed ticket channel ${interaction.channel.id}`);
      } catch (error) {
        console.error(`[AUTO_CLOSE] Error auto-closing channel: ${error.message}`);
      }
    }, closeTimeMs);
    
    console.log(`[AUTO_CLOSE] Scheduled auto-close for channel ${interaction.channel.id} in 30 minutes`);
    
    // Determine payout staff based on payment method
    let payoutStaffId = '';
    if (paymentMethod === 'PayPal') {
      payoutStaffId = '986164993080836096';
    } else if (['IBAN Bank Transfer', 'Crypto', 'Dutch Payment Methods'].includes(paymentMethod)) {
      payoutStaffId = '987751357773672538';
    } else {
      // For PayPal Giftcard, mention the owner role
      payoutStaffId = '1292933200389083196';
    }
    
    // Create the completion log embed - use the proper ticket creator ID in the log embed
    const logEmbed = new EmbedBuilder()
      .setTitle('New Boost Completed!')
      .setDescription(
        `**Customer:** <@${ticketCreatorId}>\n` +
        `**Booster:** <@${boosterId}>\n\n` +
        `**Payout Info:**\n` +
        `> **Amount:** ${price}\n` +
        `> **Payment Method:** ${paymentMethod}\n` +
        `> **Payout Done By:** <@${payoutStaffId}>`
      )
      .setColor('#e68df2');
    
    // Create the payout button
    const payoutButton = new ButtonBuilder()
      .setCustomId('payout_completed')
      .setLabel('Payout Completed')
      .setEmoji('1357478063616688304')
      .setStyle(ButtonStyle.Success);
    
    const row = new ActionRowBuilder()
      .addComponents(payoutButton);
    
    // Send the log message if log channel exists
    if (logChannel) {
      const logMessage = await logChannel.send({
        embeds: [logEmbed],
        components: [row]
      });
      console.log(`[BOOST] Sent log message with ID: ${logMessage.id}`);
    } else {
      console.error(`[BOOST] Log channel not found: 1382022752474501352`);
    }
  } catch (error) {
    console.error(`[BOOST] Error in boostConfirmCompletedHandler: ${error.message}`);
    console.error(error.stack);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while completing the boost.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Boost Not Completed button
 */
const boostNotCompletedHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    // Get the ticket creator's ID from the mention
    const ticketCreatorId = interaction.message.mentions.users.first().id;
    
    // Check if user is authorized to click this button
    if (
      userId !== ticketCreatorId && // The ticket creator
      userId !== '1346034712627646524' && // Specified authorized user
      userId !== '987751357773672538' && // Specified authorized user
      userId !== '986164993080836096'    // Specified authorized user
    ) {
      return interaction.reply({
        content: 'You are not authorized to mark this boost as not completed.',
        ephemeral: true
      });
    }
    
    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('Are you sure?')
      .setDescription('Are you sure your boost has not been completed?\n\nIf you click \'**Confirm**\' support will be called. If you waste our time you will be in trouble.')
      .setColor('#e68df2');
    
    // Create buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('boost_confirm_not_completed')
      .setLabel('Confirm')
      .setEmoji('1351689463453061130')
      .setStyle(ButtonStyle.Danger);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('boost_cancel_confirmation')
      .setLabel('Cancel')
      .setEmoji('1357478063616688304')
      .setStyle(ButtonStyle.Success);
    
    const row = new ActionRowBuilder()
      .addComponents(confirmButton, cancelButton);
      
    // Create a "not completed" button for the original message
    const notCompletedButton = new ButtonBuilder()
      .setCustomId('boost_not_completed_status')
      .setLabel('Customer has marked the boost as not completed')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
    
    const notCompletedRow = new ActionRowBuilder()
      .addComponents(notCompletedButton);
    
    // Update the original message with the not completed button
    await interaction.update({ components: [notCompletedRow] });
    
    // Send the confirmation message
    await interaction.followUp({
      embeds: [confirmEmbed],
      components: [row],
      ephemeral: true
    });
  } catch (error) {
    console.error(`[BOOST] Error in boostNotCompletedHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Boost Confirm Not Completed button
 */
const boostConfirmNotCompletedHandler = async (interaction) => {
  try {
    // Disable buttons on the original message
    await interaction.update({
      components: [],
      content: 'Support has been called.'
    });
    
    // Create the support embed
    const supportEmbed = new EmbedBuilder()
      .setTitle('Support Required')
      .setDescription('Booster has marked this order as completed.\nCustomer has marked this order as not completed.\n\n**Support will assist you soon, please be patient!**')
      .setColor('#e68df2');
    
    // Send the support message
    await interaction.channel.send({
      content: `<@&1292933200389083196>`,
      embeds: [supportEmbed]
    });
  } catch (error) {
    console.error(`[BOOST] Error in boostConfirmNotCompletedHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while calling support.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the cancel confirmation button
 */
const boostCancelConfirmationHandler = async (interaction) => {
  await interaction.update({
    components: [],
    content: 'Action cancelled.',
    embeds: []
  });
};

/**
 * Handles the payout completed button
 */
const payoutCompletedHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    // Get the payout staff ID from the embed
    let payoutStaffId = '';
    if (interaction.message.embeds.length > 0) {
      const description = interaction.message.embeds[0].description;
      if (description) {
        const match = description.match(/\*\*Payout Done By:\*\* <@(\d+)>/);
        if (match && match[1]) {
          payoutStaffId = match[1];
        }
      }
    }
    
    // Check if user is authorized (must be the payout staff or have the owner role)
    const isOwner = interaction.member.roles.cache.has('1292933200389083196');
    
    if (userId !== payoutStaffId && !isOwner) {
      return interaction.reply({
        content: 'You are not authorized to confirm this payout.',
        ephemeral: true
      });
    }
    
    // Update the button to be disabled and show completion
    const disabledButton = new ButtonBuilder()
      .setCustomId('payout_completed_done')
      .setLabel('Payout has been completed.')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
    
    const row = new ActionRowBuilder()
      .addComponents(disabledButton);
    
    // Update the message
    await interaction.update({ components: [row] });
  } catch (error) {
    console.error(`[BOOST] Error in payoutCompletedHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while confirming the payout.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle payment completed buttons
 */
const paymentCompletedHandlers = {
  'payment_completed_paypal': async (interaction) => {
    await handlePaymentCompleted(interaction, 'paypal');
  },
  
  'payment_completed_iban': async (interaction) => {
    await handlePaymentCompleted(interaction, 'iban');
  },
  
  'payment_completed_tikkie': async (interaction) => {
    await handlePaymentCompleted(interaction, 'tikkie');
  }
};

/**
 * Handle crypto payment completed buttons
 */
const cryptoPaymentCompletedHandlers = {
  'payment_completed_crypto_ltc': async (interaction) => {
    await createCryptoTxForm(interaction, 'ltc');
  },
  
  'payment_completed_crypto_sol': async (interaction) => {
    await createCryptoTxForm(interaction, 'sol');
  },
  
  'payment_completed_crypto_btc': async (interaction) => {
    await createCryptoTxForm(interaction, 'btc');
  }
};

/**
 * Handle all payment confirmation buttons generically
 */
async function handlePaymentCompleted(interaction, paymentMethod) {
  try {
    // Create confirmation buttons with countdown
    const countdownEmbed = new EmbedBuilder()
      .setTitle('Payment Completed')
      .setDescription('Are you sure you have successfully sent the money?')
      .setColor(EMBED_COLOR);
      
    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_confirm_${paymentMethod}`)
      .setLabel('Cancel')
      .setEmoji(EMOJIS.CROSS)
      .setStyle(ButtonStyle.Danger);
      
    let countdownSeconds = 5;
    const disabledConfirmButton = new ButtonBuilder()
      .setCustomId(`confirm_payment_${paymentMethod}_disabled`)
      .setLabel(`(${countdownSeconds}s) Confirm`)
      .setEmoji(EMOJIS.CHECKMARK)
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
      
    // Send initial message with disabled button
    const reply = await interaction.reply({
      embeds: [countdownEmbed],
      components: [new ActionRowBuilder().addComponents(disabledConfirmButton, cancelButton)],
      ephemeral: true,
      fetchReply: true
    });
    
    // Start countdown
    const countdownInterval = setInterval(async () => {
      countdownSeconds--;
      
      if (countdownSeconds <= 0) {
        clearInterval(countdownInterval);
        
        // Enable the button after countdown
        const enabledConfirmButton = new ButtonBuilder()
          .setCustomId(`confirm_payment_${paymentMethod}`)
          .setLabel('Confirm')
          .setEmoji(EMOJIS.CHECKMARK)
          .setStyle(ButtonStyle.Success);
          
        await interaction.editReply({
          components: [new ActionRowBuilder().addComponents(enabledConfirmButton, cancelButton)]
        }).catch(err => console.error('Error updating countdown buttons:', err));
      } else {
        // Update countdown
        const updatedButton = new ButtonBuilder()
          .setCustomId(`confirm_payment_${paymentMethod}_disabled`)
          .setLabel(`(${countdownSeconds}s) Confirm`)
          .setEmoji(EMOJIS.CHECKMARK)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true);
          
        await interaction.editReply({
          components: [new ActionRowBuilder().addComponents(updatedButton, cancelButton)]
        }).catch(err => console.error('Error updating countdown buttons:', err));
      }
    }, 1000);
  } catch (error) {
    console.error('Error starting payment confirmation countdown:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle expired Tikkie link button
 */
const tikkieLinkExpiredHandler = async (interaction) => {
  try {
    const embed = new EmbedBuilder()
      .setTitle('Link Expired')
      .setDescription('The Payment Link has expired.\n\nPlease send a new, non-expired one.')
      .setColor(EMBED_COLOR);
      
    await interaction.channel.send({
      content: `<@${PAYMENT_STAFF.IBAN_VERIFIER}>`,
      embeds: [embed]
    });
    
    await interaction.reply({
      content: 'Staff has been notified about the expired link.',
      ephemeral: true
    });
  } catch (error) {
    console.error('Error handling expired Tikkie link:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle payment confirmation (after countdown)
 */
const paymentConfirmHandlers = {
  'confirm_payment_paypal': async (interaction) => {
    await sendStaffPaymentVerificationEmbed(interaction.channel, 'paypal');
    await interaction.update({
      content: 'Payment confirmation sent to staff for verification.',
      embeds: [],
      components: []
    });
  },
  
  'confirm_payment_iban': async (interaction) => {
    await sendStaffPaymentVerificationEmbed(interaction.channel, 'iban');
    await interaction.update({
      content: 'Payment confirmation sent to staff for verification.',
      embeds: [],
      components: []
    });
  },
  
  'confirm_payment_tikkie': async (interaction) => {
    await sendStaffPaymentVerificationEmbed(interaction.channel, 'tikkie');
    await interaction.update({
      content: 'Payment confirmation sent to staff for verification.',
      embeds: [],
      components: []
    });
  }
};

/**
 * Handle staff confirming payments
 */
const staffConfirmHandlers = {
  'confirm_payment_paypal': async (interaction) => {
    await handleStaffConfirmPayment(interaction, 'paypal');
  },
  
  'confirm_payment_iban': async (interaction) => {
    await handleStaffConfirmPayment(interaction, 'iban');
  },
  
  'confirm_payment_tikkie': async (interaction) => {
    await handleStaffConfirmPayment(interaction, 'tikkie');
  },
  
  'confirm_payment_crypto_btc': async (interaction) => {
    await handleStaffConfirmPayment(interaction, 'crypto_btc');
  }
};

/**
 * Handle staff cancelling payments
 */
const staffCancelHandlers = {
  'cancel_payment_paypal': async (interaction) => {
    await handleStaffCancelPayment(interaction, 'paypal');
  },
  
  'cancel_payment_iban': async (interaction) => {
    await handleStaffCancelPayment(interaction, 'iban');
  },
  
  'cancel_payment_tikkie': async (interaction) => {
    await handleStaffCancelPayment(interaction, 'tikkie');
  },
  
  'cancel_payment_crypto_btc': async (interaction) => {
    await handleStaffCancelPayment(interaction, 'crypto_btc');
  }
};

/**
 * Helper function for staff confirming payments
 */
async function handleStaffConfirmPayment(interaction, paymentMethod) {
  try {
    // Verify the user is authorized to confirm payments
    const authorizedStaffIds = [
      PAYMENT_STAFF.PAYPAL_VERIFIER,
      PAYMENT_STAFF.IBAN_VERIFIER,
      PAYMENT_STAFF.APPLE_GIFTCARD_VERIFIER
    ];
    
    if (!authorizedStaffIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'You are not authorized to confirm payments.',
        ephemeral: true
      });
    }
    
    // Get order information for the notification
    const orderInfoFields = interaction.message.embeds[0]?.fields || [];
    const currentRank = orderInfoFields.find(f => 
      f.name === 'Current Rank' || 
      f.name === 'Current Trophies' || 
      f.name === 'Current Mastery Rank'
    )?.value || 'N/A';
    
    const targetRank = orderInfoFields.find(f => 
      f.name === 'Target Rank' || 
      f.name === 'Target Trophies' || 
      f.name === 'Target Mastery Rank'
    )?.value || 'N/A';
    
    const amount = orderInfoFields.find(f => 
      f.name === 'Price' || 
      f.name === 'Estimated Price'
    )?.value || 'N/A';
    
    const orderInfo = {
      current: currentRank,
      target: targetRank,
      amount: amount
    };
    
    // Send the boost available notification
    await sendPaymentConfirmedNotification(interaction.channel, orderInfo);
    
    // Update the verification message
    const disabledConfirmButton = new ButtonBuilder()
      .setCustomId('payment_confirmed_done')
      .setLabel('Payment confirmed')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
      
    await interaction.update({
      components: [new ActionRowBuilder().addComponents(disabledConfirmButton)]
    });
  } catch (error) {
    console.error('Error handling staff payment confirmation:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again.',
        ephemeral: true
      });
    }
  }
}

/**
 * Helper function for staff cancelling payments
 */
async function handleStaffCancelPayment(interaction, paymentMethod) {
  try {
    // Verify the user is authorized to cancel payments
    const authorizedStaffIds = [
      PAYMENT_STAFF.PAYPAL_VERIFIER,
      PAYMENT_STAFF.IBAN_VERIFIER,
      PAYMENT_STAFF.APPLE_GIFTCARD_VERIFIER
    ];
    
    if (!authorizedStaffIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'You are not authorized to cancel payments.',
        ephemeral: true
      });
    }
    
    // Update the verification message
    const disabledCancelButton = new ButtonBuilder()
      .setCustomId('payment_cancelled_done')
      .setLabel('Payment has not been received.')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
      
    await interaction.update({
      components: [new ActionRowBuilder().addComponents(disabledCancelButton)]
    });
  } catch (error) {
    console.error('Error handling staff payment cancellation:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again.',
        ephemeral: true
      });
    }
  }
}

/**
 * Setup a timeout for crypto payment
 */
function setupCryptoTimeout(channel, coinType, price) {
  try {
    // Clear any existing timeout for this channel
    if (cryptoTimeouts.has(channel.id)) {
      clearTimeout(cryptoTimeouts.get(channel.id));
    }
    
    // Set a new 30-minute timeout
    const timeoutId = setTimeout(async () => {
      try {
        // Find the crypto payment message
        const messages = await channel.messages.fetch({ limit: 50 });
        const paymentMsg = messages.find(msg => {
          if (!msg.embeds || msg.embeds.length === 0) return false;
          
          const embed = msg.embeds[0];
          return (
            (embed.title === 'Litecoin Information' && coinType === 'ltc') ||
            (embed.title === 'Solana Information' && coinType === 'sol')
          );
        });
        
        if (paymentMsg) {
          // Delete the old message
          await paymentMsg.delete();
          
          // Create the failure message
          const failedEmbed = new EmbedBuilder()
            .setTitle('Payment Failed')
            .setDescription('Client failed to send the money in a 30 minute time frame.')
            .setColor(EMBED_COLOR);
            
          const resendButton = new ButtonBuilder()
            .setCustomId(`resend_crypto_${coinType}`)
            .setLabel('Send Again')
            .setEmoji(coinType === 'ltc' ? EMOJIS.LITECOIN : EMOJIS.SOLANA)
            .setStyle(ButtonStyle.Success);
            
          await channel.send({
            embeds: [failedEmbed],
            components: [new ActionRowBuilder().addComponents(resendButton)]
          });
        }
      } catch (error) {
        console.error('Error handling crypto timeout:', error);
      } finally {
        // Remove from the timeouts map
        cryptoTimeouts.delete(channel.id);
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    // Store the timeout
    cryptoTimeouts.set(channel.id, timeoutId);
  } catch (error) {
    console.error('Error setting up crypto timeout:', error);
  }
}

/**
 * Handle resend crypto button
 */
const resendCryptoHandlers = {
  'resend_crypto_ltc': async (interaction) => {
    try {
      // Extract price from ticket again
      let price = 0;
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const orderMsg = messages.find(msg => {
          if (!msg.embeds || msg.embeds.length === 0) return false;
          const embed = msg.embeds[0];
          return embed.title?.includes('Order');
        });
        
        if (orderMsg) {
          const priceField = orderMsg.embeds[0]?.fields?.find(f => 
            f.name === 'Price' || f.name === 'Estimated Price'
          );
          
          if (priceField) {
            const priceText = priceField.value;
            const priceMatch = priceText.match(/€(\d+(\.\d+)?)/);
            if (priceMatch && priceMatch[1]) {
              price = parseFloat(priceMatch[1]);
            }
          }
        }
      } catch (error) {
        console.error('Error extracting price for resend:', error);
      }
      
      // Send updated payment information
      await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'ltc', price);
      await interaction.update({
        content: 'Payment information has been resent.',
        embeds: [],
        components: []
      });
      
      // Set new timeout
      setupCryptoTimeout(interaction.channel, 'ltc', price);
    } catch (error) {
      console.error('Error resending LTC payment info:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred. Please try again or contact staff.',
          ephemeral: true
        });
      }
    }
  },
  
  'resend_crypto_sol': async (interaction) => {
    try {
      // Extract price from ticket again
      let price = 0;
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const orderMsg = messages.find(msg => {
          if (!msg.embeds || msg.embeds.length === 0) return false;
          const embed = msg.embeds[0];
          return embed.title?.includes('Order');
        });
        
        if (orderMsg) {
          const priceField = orderMsg.embeds[0]?.fields?.find(f => 
            f.name === 'Price' || f.name === 'Estimated Price'
          );
          
          if (priceField) {
            const priceText = priceField.value;
            const priceMatch = priceText.match(/€(\d+(\.\d+)?)/);
            if (priceMatch && priceMatch[1]) {
              price = parseFloat(priceMatch[1]);
            }
          }
        }
      } catch (error) {
        console.error('Error extracting price for resend:', error);
      }
      
      // Send updated payment information
      await sendPaymentConfirmationEmbed(interaction.channel, 'crypto', 'sol', price);
      await interaction.update({
        content: 'Payment information has been resent.',
        embeds: [],
        components: []
      });
      
      // Set new timeout
      setupCryptoTimeout(interaction.channel, 'sol', price);
    } catch (error) {
      console.error('Error resending SOL payment info:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred. Please try again or contact staff.',
          ephemeral: true
        });
      }
    }
  }
};

// Handle modal submissions for crypto transaction verification
async function handleCryptoTxForm(interaction, cryptoType) {
  try {
    const txId = interaction.fields.getTextInputValue('tx_id');
    
    // Check if this transaction ID has been used before
    if (usedTxIds.has(txId)) {
      return interaction.reply({
        content: 'This transaction ID has already been used. Please provide a valid transaction ID.',
        ephemeral: true
      });
    }
    
    // Check if transaction is recent (within 30 minutes)
    // In a real implementation, you would validate this with a blockchain API
    const isRecent = true; // Placeholder
    
    if (!isRecent) {
      return interaction.reply({
        content: 'This transaction is not recent. Please provide a transaction from the last 30 minutes.',
        ephemeral: true
      });
    }
    
    // For Litecoin and Solana, send "please wait" messages
    if (cryptoType === 'ltc' || cryptoType === 'sol') {
      // Add transaction ID to used set
      usedTxIds.add(txId);
      
      // Show waiting embed
      const waitingEmbed = new EmbedBuilder()
        .setTitle('Please wait 20 minutes ⏰')
        .setDescription('This is so the transaction can be confirmed.')
        .setColor(EMBED_COLOR);
        
      await interaction.reply({
        embeds: [waitingEmbed],
        ephemeral: false
      });
      
      // Set a timeout to check confirmation after 20 minutes
      setTimeout(async () => {
        try {
          // In a real implementation, check if transaction is confirmed via blockchain API
          const isConfirmed = true; // Placeholder
          
          if (isConfirmed) {
            // Get order information
            let orderInfo = {
              current: 'Current Value',
              target: 'Target Value',
              amount: 'Amount'
            };
            
            try {
              const messages = await interaction.channel.messages.fetch({ limit: 100 });
              const orderMsg = messages.find(msg => {
                if (!msg.embeds || msg.embeds.length === 0) return false;
                const embed = msg.embeds[0];
                return embed.title?.includes('Order');
              });
              
              if (orderMsg) {
                const embed = orderMsg.embeds[0];
                const currentField = embed.fields.find(f => 
                  f.name === 'Current Rank' || 
                  f.name === 'Current Trophies' || 
                  f.name === 'Current Mastery Rank'
                );
                
                const targetField = embed.fields.find(f => 
                  f.name === 'Target Rank' || 
                  f.name === 'Target Trophies' || 
                  f.name === 'Target Mastery Rank'
                );
                
                const priceField = embed.fields.find(f => 
                  f.name === 'Price' || 
                  f.name === 'Estimated Price'
                );
                
                if (currentField && targetField && priceField) {
                  orderInfo = {
                    current: currentField.value,
                    target: targetField.value,
                    amount: priceField.value
                  };
                }
              }
            } catch (error) {
              console.error('Error getting order info for confirmed crypto payment:', error);
            }
            
            // Send boost available notification
            await sendPaymentConfirmedNotification(interaction.channel, orderInfo);
          } else {
            // Still not confirmed, wait another 20 minutes
            const stillWaitingEmbed = new EmbedBuilder()
              .setTitle('Please wait another 20 minutes ⏰')
              .setDescription('This is so the transaction can be confirmed.')
              .setColor(EMBED_COLOR);
              
            await interaction.channel.send({
              content: 'After 20 minutes the transaction is still not fully confirmed.',
              embeds: [stillWaitingEmbed]
            });
            
            // Set another timeout
            setTimeout(async () => {
              try {
                // Check again
                const isConfirmedFinal = true; // Placeholder
                
                if (isConfirmedFinal) {
                  // Get order information
                  let orderInfo = {
                    current: 'Current Value',
                    target: 'Target Value',
                    amount: 'Amount'
                  };
                  
                  try {
                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    const orderMsg = messages.find(msg => {
                      if (!msg.embeds || msg.embeds.length === 0) return false;
                      const embed = msg.embeds[0];
                      return embed.title?.includes('Order');
                    });
                    
                    if (orderMsg) {
                      const embed = orderMsg.embeds[0];
                      const currentField = embed.fields.find(f => 
                        f.name === 'Current Rank' || 
                        f.name === 'Current Trophies' || 
                        f.name === 'Current Mastery Rank'
                      );
                      
                      const targetField = embed.fields.find(f => 
                        f.name === 'Target Rank' || 
                        f.name === 'Target Trophies' || 
                        f.name === 'Target Mastery Rank'
                      );
                      
                      const priceField = embed.fields.find(f => 
                        f.name === 'Price' || 
                        f.name === 'Estimated Price'
                      );
                      
                      if (currentField && targetField && priceField) {
                        orderInfo = {
                          current: currentField.value,
                          target: targetField.value,
                          amount: priceField.value
                        };
                      }
                    }
                  } catch (error) {
                    console.error('Error getting order info for confirmed crypto payment:', error);
                  }
                  
                  // Send boost available notification
                  await sendPaymentConfirmedNotification(interaction.channel, orderInfo);
                } else {
                  // Still not confirmed after 40 minutes total, notify staff
                  await interaction.channel.send({
                    content: `<@${PAYMENT_STAFF.IBAN_VERIFIER}>`,
                    embeds: [
                      new EmbedBuilder()
                        .setTitle('Transaction Still Not Confirmed')
                        .setDescription('The crypto transaction is still not confirmed after 40 minutes. Please check manually.')
                        .setColor(EMBED_COLOR)
                    ]
                  });
                }
              } catch (error) {
                console.error('Error checking crypto confirmation (second check):', error);
              }
            }, 20 * 60 * 1000); // After another 20 minutes
          }
        } catch (error) {
          console.error('Error checking crypto confirmation:', error);
        }
      }, 20 * 60 * 1000); // After 20 minutes
    } else if (cryptoType === 'btc') {
      // For Bitcoin, ask staff to confirm manually
      // Add transaction ID to used set
      usedTxIds.add(txId);
      
      // Send staff verification embed
      await sendStaffPaymentVerificationEmbed(interaction.channel, 'crypto_btc', { txId });
      await interaction.reply({
        content: 'Your transaction has been submitted for verification by staff.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(`Error handling ${cryptoType} transaction form:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred processing your transaction. Please try again or contact staff.',
        ephemeral: true
      });
    }
  }
}

// Additional button handlers for PayPal workflow
const additionalButtonHandlers = {
  // PayPal TOS acceptance
  'paypal_accept_tos': paypalTosAcceptHandler,
  
  // PayPal TOS denial
  'paypal_deny_tos': paypalTosDenyHandler,
  
  // PayPal denial confirmed
  'paypal_deny_confirmed': paypalDenyConfirmedHandler,
  
  // PayPal denial cancelled
  'paypal_deny_cancelled': paypalDenyCancelledHandler,
  
  // PayPal payment completed
  'payment_completed_paypal': paypalPaymentCompletedHandler,
  
  // PayPal payment received
  'paypal_payment_received': paypalPaymentReceivedHandler,
  
  // PayPal payment not received
  'paypal_payment_not_received': paypalPaymentNotReceivedHandler,
  
  // Claim boost
  'claim_boost': claimBoostHandler,
};

// Additional button handlers for boost workflow
const boostButtonHandlers = {
  'boost_completed': boostCompletedHandler,
  'boost_cancel': boostCancelHandler,
  'boost_is_completed': boostIsCompletedHandler,
  'boost_not_completed': boostNotCompletedHandler,
  'boost_confirm_completed': boostConfirmCompletedHandler,
  'boost_confirm_not_completed': boostConfirmNotCompletedHandler,
  'boost_cancel_confirmation': boostCancelConfirmationHandler,
  'payout_completed': payoutCompletedHandler
};

// Combine all button handlers
const allButtonHandlers = {
  ...paymentMethodButtonHandlers,
  ...cryptoButtonHandlers,
  ...dutchButtonHandlers,
  ...copyButtonHandlers,
  ...additionalButtonHandlers,
  ...boostButtonHandlers
};

// Modal handler mapping
const paymentModalHandlers = {
  'crypto_tx_form_ltc': (interaction) => handleCryptoTxForm(interaction, 'ltc'),
  'crypto_tx_form_sol': (interaction) => handleCryptoTxForm(interaction, 'sol'),
  'crypto_tx_form_btc': (interaction) => handleCryptoTxForm(interaction, 'btc')
};

/**
 * Handles the Review button
 */
const reviewButtonHandler = async (interaction) => {
  try {
    // Extract the user ID from the custom ID
    const customId = interaction.customId;
    const allowedUserId = customId.split('_').pop();
    
    console.log(`[REVIEW] Button clicked by ${interaction.user.id}, allowed user is ${allowedUserId}`);
    
    // Check if the user is allowed to use this button
    if (interaction.user.id !== allowedUserId) {
      console.log(`[REVIEW] User ${interaction.user.id} is not allowed to use this button (expecting ${allowedUserId})`);
      return interaction.reply({
        content: 'Only the person who opened this ticket can use this button.',
        ephemeral: true
      });
    }
    
    // Store default information for the review
    if (!interaction.client.reviewData) {
      interaction.client.reviewData = {};
    }
    
    // Initialize data for this user
    interaction.client.reviewData[allowedUserId] = {
      stars: '',
      anonymous: false
    };
    
    // Get service name from the ticket
    let reviewingFor = 'Boost Service';
    try {
      const ticketName = interaction.channel.name;
      
      // Extract service type from ticket name
      if (ticketName.includes('rank') || ticketName.includes('ranked')) {
        reviewingFor = 'Ranked Boost';
      } else if (ticketName.includes('trophy') || ticketName.includes('trophies')) {
        reviewingFor = 'Trophy Boost';
      } else if (ticketName.includes('master') || ticketName.includes('mastery')) {
        reviewingFor = 'Mastery Boost';
      }
    } catch (error) {
      console.error(`[REVIEW] Error determining service type: ${error.message}`);
    }
    
    // Store the service name
    interaction.client.reviewData[allowedUserId].reviewingFor = reviewingFor;
    
    // Create the rating embed
    const ratingEmbed = new EmbedBuilder()
      .setTitle('Review Rating')
      .setDescription(`Please rate your experience with our ${reviewingFor}:`)
      .setColor('#e68df2');
    
    // Create star rating buttons
    const star1 = new ButtonBuilder()
      .setCustomId(`review_star_1_${allowedUserId}`)
      .setLabel('1⭐')
      .setStyle(ButtonStyle.Primary);
    
    const star2 = new ButtonBuilder()
      .setCustomId(`review_star_2_${allowedUserId}`)
      .setLabel('2⭐')
      .setStyle(ButtonStyle.Primary);
    
    const star3 = new ButtonBuilder()
      .setCustomId(`review_star_3_${allowedUserId}`)
      .setLabel('3⭐')
      .setStyle(ButtonStyle.Primary);
    
    const star4 = new ButtonBuilder()
      .setCustomId(`review_star_4_${allowedUserId}`)
      .setLabel('4⭐')
      .setStyle(ButtonStyle.Success);
    
    const star5 = new ButtonBuilder()
      .setCustomId(`review_star_5_${allowedUserId}`)
      .setLabel('5⭐')
      .setStyle(ButtonStyle.Success);
    
    // Create button row
    const row = new ActionRowBuilder()
      .addComponents(star1, star2, star3, star4, star5);
    
    // Send the rating message
    await interaction.reply({
      embeds: [ratingEmbed],
      components: [row],
      ephemeral: true
    });
    
    console.log(`[REVIEW] Showed rating stars to user ${interaction.user.id}`);
  } catch (error) {
    console.error(`[REVIEW] Error in reviewButtonHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your review request.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the star rating selection
 */
const reviewStarHandler = async (interaction) => {
  try {
    // Extract the star rating and user ID from the custom ID
    const customIdParts = interaction.customId.split('_');
    const rating = customIdParts[2];
    const allowedUserId = customIdParts[3];
    
    // Check if the user is allowed to use this button
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'Only the person who opened this ticket can use this button.',
        ephemeral: true
      });
    }
    
    // Store the rating in a temporary variable for later use
    interaction.client.reviewData = interaction.client.reviewData || {};
    interaction.client.reviewData[allowedUserId] = {
      rating: rating
    };
    
    // Create the anonymous choice embed
    const anonymousEmbed = new EmbedBuilder()
      .setTitle('Anonymous')
      .setDescription('Would you like to stay anonymous?\n\n**We highly prefer it if you include your username!**')
      .setColor('#e68df2');
    
    // Create buttons for anonymous choice
    const includeUsernameButton = new ButtonBuilder()
      .setCustomId(`review_username_${allowedUserId}`)
      .setLabel('Include Username')
      .setStyle(ButtonStyle.Success);
    
    const stayAnonymousButton = new ButtonBuilder()
      .setCustomId(`review_anonymous_${allowedUserId}`)
      .setLabel('Stay Anonymous')
      .setStyle(ButtonStyle.Danger);
    
    const anonymousRow = new ActionRowBuilder()
      .addComponents(includeUsernameButton, stayAnonymousButton);
    
    // Update the message with the anonymous choice embed
    await interaction.update({
      embeds: [anonymousEmbed],
      components: [anonymousRow]
    });
  } catch (error) {
    console.error(`[REVIEW] Error in reviewStarHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your rating.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the anonymous choice selection
 */
const reviewAnonymousHandler = async (interaction) => {
  try {
    // Extract the choice and user ID from the custom ID
    const customIdParts = interaction.customId.split('_');
    const choice = customIdParts[1]; // "username" or "anonymous"
    const allowedUserId = customIdParts[2];
    
    // Check if the user is allowed to use this button
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'Only the person who opened this ticket can use this button.',
        ephemeral: true
      });
    }
    
    // Update the stored data with the anonymity choice
    if (!interaction.client.reviewData || !interaction.client.reviewData[allowedUserId]) {
      return interaction.reply({
        content: 'An error occurred. Please start the review process again.',
        ephemeral: true
      });
    }
    
    interaction.client.reviewData[allowedUserId].anonymous = (choice === 'anonymous');
    
    // Get the channel topic to extract boost information
    const channelTopic = interaction.channel.topic || '';
    let reviewingFor = '';
    
    // Try to extract boost information from the channel topic
    if (channelTopic.includes('Trophies')) {
      const trophiesMatch = channelTopic.match(/(\d+)\s*Trophies\s*to\s*(\d+)/i);
      if (trophiesMatch) {
        reviewingFor = `${trophiesMatch[1]} Trophies to ${trophiesMatch[2]} Trophies Boost!`;
      }
    } else if (channelTopic.includes('Rank')) {
      const rankMatch = channelTopic.match(/([A-Za-z]+\s*\d*)\s*to\s*([A-Za-z]+\s*\d*)/i);
      if (rankMatch) {
        reviewingFor = `${rankMatch[1]} to ${rankMatch[2]} Boost!`;
      }
    }
    
    if (!reviewingFor) {
      reviewingFor = 'Boost Service';
    }
    
    // Create a modal for the review
    const modal = new ModalBuilder()
      .setCustomId(`review_modal_${allowedUserId}_${choice}`)
      .setTitle('Review Form');
    
    // Add review fields
    const reviewingForInput = new TextInputBuilder()
      .setCustomId('reviewing_for')
      .setLabel('Reviewing For')
      .setValue(reviewingFor)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const experienceInput = new TextInputBuilder()
      .setCustomId('experience')
      .setLabel('Experience')
      .setPlaceholder('Let us know how your boost went!')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    
    // Add inputs to modal
    modal.addComponents(
      new ActionRowBuilder().addComponents(reviewingForInput),
      new ActionRowBuilder().addComponents(experienceInput)
    );
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    console.error(`[REVIEW] Error in reviewAnonymousHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your choice.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the review modal submission
 */
const reviewModalHandler = async (interaction) => {
  try {
    // Extract the user ID and choice from the custom ID
    const customIdParts = interaction.customId.split('_');
    const allowedUserId = customIdParts[2];
    const choice = customIdParts[3]; // "username" or "anonymous"
    
    // Check if the user is allowed
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'Only the person who opened this ticket can submit this form.',
        ephemeral: true
      });
    }
    
    // Get the form values
    const reviewingFor = interaction.fields.getTextInputValue('reviewing_for');
    const experience = interaction.fields.getTextInputValue('experience');
    
    // Get the stored rating
    if (!interaction.client.reviewData || !interaction.client.reviewData[allowedUserId]) {
      return interaction.reply({
        content: 'An error occurred. Please start the review process again.',
        ephemeral: true
      });
    }
    
    const rating = interaction.client.reviewData[allowedUserId].rating;
    const anonymous = (choice === 'anonymous');
    
    // Generate star display
    const stars = '⭐'.repeat(parseInt(rating));
    
    // Create the review embed
    const reviewEmbed = new EmbedBuilder()
      .setColor('#E68DF2')
      .setTimestamp()
      .setFooter({
        text: 'Brawl Shop',
        iconURL: 'https://cdn.discordapp.com/attachments/987753155360079903/1370862482717147247/Untitled70_20250208222905.jpg?ex=68210aad&is=681fb92d&hm=c9f876a09be906de33276bf0155f65c369d6b557e4c2deeb33cfaa2355a3b24b&format=webp'
      });
    
    if (anonymous) {
      reviewEmbed.setTitle('New Anonymous Review');
    } else {
      reviewEmbed.setTitle('New Review');
      reviewEmbed.setAuthor({
        name: `Review by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL()
      });
      
      reviewEmbed.setThumbnail(interaction.user.displayAvatarURL());
    }
    
    reviewEmbed.addFields(
      { name: '**Reviewing For:**', value: `> ${reviewingFor}` },
      { name: '**Experience:**', value: `> ${experience}` },
      { name: '**Rating:**', value: `> ${stars}` }
    );
    
    // Create the moderation buttons
    const moderationRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`review_accept_${interaction.user.id}_${anonymous}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`review_deny_${interaction.user.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );
    
    // Send to moderation channel
    const modChannel = interaction.client.channels.cache.get('1368186200741118042');
    if (!modChannel) {
      console.error('Moderation channel not found');
      return interaction.reply({ 
        content: 'There was an error submitting your review. Please try again later.', 
        ephemeral: true 
      });
    }
    
    await modChannel.send({ 
      content: `New review submitted by <@${interaction.user.id}>. Please moderate.`,
      embeds: [reviewEmbed], 
      components: [moderationRow] 
    });
    
    // Clean up stored data
    if (interaction.client.reviewData && interaction.client.reviewData[allowedUserId]) {
      delete interaction.client.reviewData[allowedUserId];
    }
    
    // Confirm to the user
    return interaction.reply({ 
      content: 'Your review has been submitted for moderation. Thank you for your feedback!', 
      ephemeral: true 
    });
  } catch (error) {
    console.error(`[REVIEW] Error in reviewModalHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while submitting your review. Please try again later.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Feedback button
 */
const feedbackButtonHandler = async (interaction) => {
  try {
    // Extract the user ID from the custom ID
    const customId = interaction.customId;
    const allowedUserId = customId.split('_').pop();
    
    console.log(`[FEEDBACK] Button clicked by ${interaction.user.id}, allowed user is ${allowedUserId}`);
    
    // Check if the user is allowed to use this button
    if (interaction.user.id !== allowedUserId) {
      console.log(`[FEEDBACK] User ${interaction.user.id} is not allowed to use this button (expecting ${allowedUserId})`);
      return interaction.reply({
        content: 'Only the person who opened this ticket can use this button.',
        ephemeral: true
      });
    }
    
    // Create a modal for the feedback
    const modal = new ModalBuilder()
      .setCustomId(`feedback_modal_${allowedUserId}`)
      .setTitle('Feedback Form');
    
    // Add feedback field
    const feedbackInput = new TextInputBuilder()
      .setCustomId('feedback')
      .setLabel('What do you think we could improve on?')
      .setPlaceholder('Let us know! Any feedback is appreciated')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    
    // Add input to modal
    modal.addComponents(
      new ActionRowBuilder().addComponents(feedbackInput)
    );
    
    // Show the modal
    await interaction.showModal(modal);
    console.log(`[FEEDBACK] Showed feedback modal to user ${interaction.user.id}`);
  } catch (error) {
    console.error(`[FEEDBACK] Error in feedbackButtonHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your feedback request.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the feedback modal submission
 */
const feedbackModalHandler = async (interaction) => {
  try {
    // Extract the user ID from the custom ID
    const customIdParts = interaction.customId.split('_');
    const allowedUserId = customIdParts[2];
    
    // Check if the user is allowed
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'Only the person who opened this ticket can submit this form.',
        ephemeral: true
      });
    }
    
    // Get the feedback text
    const feedbackText = interaction.fields.getTextInputValue('feedback');
    
    // Create the feedback embed
    const feedbackEmbed = new EmbedBuilder()
      .setTitle('New Feedback')
      .setDescription(
        `**From User:** <@${interaction.user.id}>\n\n` +
        `**Feedback:**\n` +
        `> ${feedbackText}`
      )
      .setColor('#e68df2')
      .setTimestamp();
    
    // Send to the feedback channel
    const feedbackChannel = interaction.client.channels.cache.get('1382062544117825697');
    if (!feedbackChannel) {
      console.error('Feedback channel not found');
      return interaction.reply({ 
        content: 'There was an error submitting your feedback. Please try again later.', 
        ephemeral: true 
      });
    }
    
    await feedbackChannel.send({ embeds: [feedbackEmbed] });
    
    // Confirm to the user
    return interaction.reply({ 
      content: 'Your feedback has been submitted. Thank you for your input!', 
      ephemeral: true 
    });
  } catch (error) {
    console.error(`[FEEDBACK] Error in feedbackModalHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while submitting your feedback. Please try again later.',
        ephemeral: true
      });
    }
  }
};

// Create new button handlers for review and feedback
const reviewFeedbackButtonHandlers = {
  'review_button': reviewButtonHandler,
  'feedback_button': feedbackButtonHandler,
  'review_star_1': reviewStarHandler,
  'review_star_2': reviewStarHandler,
  'review_star_3': reviewStarHandler,
  'review_star_4': reviewStarHandler,
  'review_star_5': reviewStarHandler,
  'review_username': reviewAnonymousHandler,
  'review_anonymous': reviewAnonymousHandler
};

// Add to existing modal handlers
const reviewFeedbackModalHandlers = {
  'review_modal': reviewModalHandler,
  'feedback_modal': feedbackModalHandler
};

module.exports = {
  allButtonHandlers,
  paymentModalHandlers,
  reviewFeedbackButtonHandlers,
  reviewFeedbackModalHandlers
}; 