const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const { EMBED_COLOR, EMOJIS, PAYMENT_STAFF } = require('../constants');
const config = require('../../config');

/**
 * Handle boost claim button
 */
const claimBoostHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    const member = interaction.member;
    const channel = interaction.channel;
    
    // Booster role from config
    const boosterRoleId = config.ROLES.BOOSTER_ROLE;
    
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
      const adminRoleId = config.ROLES.ADMIN_ROLE || config.ROLES.ADMIN;
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
      const { moveToCategory } = require('../../utils.js');
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
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('boost_cancel')
      .setLabel('Cancel Boost')
      .setEmoji('<:cross:1351689463453061130>')
      .setStyle(ButtonStyle.Danger);
    
    const row = new ActionRowBuilder()
      .addComponents(completedButton, cancelButton);
    
    // Send the Boost Claimed message as a reply to the Boost Available message
    const claimedMessage = await message.reply({
      content: `<@${userId}> <@${ticketCreatorId}>`,
      embeds: [claimedEmbed],
      components: [row]
    });
    
    // Clean up - delete the Boost Available message
    const { cleanupMessages } = require('../utils/messageCleanup.js');
    await cleanupMessages(channel, null, 'boost_claimed');
    
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
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success);
    
    const notCompletedButton = new ButtonBuilder()
      .setCustomId('boost_not_completed')
      .setLabel('Boost is not Completed')
      .setEmoji('<:cross:1351689463453061130>')
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
      // Booster role from config
      const boosterRoleId = config.ROLES.BOOSTER_ROLE;
      
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
    const roleId = config.ROLES.BOOSTER_ROLE; // Booster role ID
    
    const boostAvailableEmbed = new EmbedBuilder()
      .setTitle('Boost Available')
      .setDescription(`<@&${roleId}> This boost has been paid for and is available.\n\nClaim this boost by clicking the 'Claim Boost' button below.`)
      .setColor('#e68df2');
    
    const claimButton = new ButtonBuilder()
      .setCustomId('claim_boost')
      .setLabel('Claim Boost')
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success);
    
    const row = new ActionRowBuilder().addComponents(claimButton);
    
    await interaction.channel.send({
      content: `<@&${roleId}>`,
      embeds: [boostAvailableEmbed],
      components: [row]
    });
    
    // Clean up payment method messages AFTER boost available is sent
    const { cleanupMessages } = require('../utils/messageCleanup.js');
    await cleanupMessages(interaction.channel, null, 'payment_confirmed');
    
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
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('boost_cancel_confirmation')
      .setLabel('Cancel')
      .setEmoji('<:cross:1351689463453061130>')
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
      .setEmoji('<:cross:1351689463453061130>')
      .setStyle(ButtonStyle.Danger);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('boost_cancel_confirmation')
      .setLabel('Cancel')
      .setEmoji('<:checkmark:1357478063616688304>')
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
 * Handles the Boost Confirm Completed button
 */
const boostConfirmCompletedHandler = async (interaction) => {
  try {
    // Defer immediately so we don't hit the 3-second interaction timeout
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    console.log(`[BOOST] Boost Confirm Completed button clicked by user ${interaction.user.id}`);
    
    // Check if this interaction has already been processed
    if (interaction.deferred && interaction.replied) {
      console.log(`[BOOST] Interaction already processed, skipping`);
      return;
    }
    
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
      const { moveToCategory } = require('../../utils.js');
      await moveToCategory(interaction.channel, 'boost_completed');
      console.log(`[BOOST] Moved channel to completed category`);
    } catch (error) {
      console.error(`[BOOST] Error moving channel to category: ${error.message}`);
      // Continue with the rest of the function even if moving fails
    }
    
    // Get the channel for completion logging (Booster payout log)
    const logChannel = interaction.guild.channels.cache.get('1382022752474501352');
    
    // Try to extract information from the ticket
    let ticketCreatorId = '';
    let boosterId = '';
    let paymentMethod = 'PayPal'; // Default to PayPal
    let price = '';
    
    console.log(`[BOOST] Starting information extraction from ticket`);
    
    // Look for payment information in the channel
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      console.log(`[BOOST] Fetched ${messages.size} messages to look for boost information`);
      
      // Look for "Boost Claimed" message to find the booster and ticket creator
      for (const [_, message] of messages) {
        if (message.embeds.length > 0 && message.embeds[0].title === 'Boost Claimed') {
          const mentions = message.content.match(/<@(\d+)>/g);
          if (mentions && mentions.length >= 2) {
            boosterId = mentions[0].replace(/<@|>/g, '');
            ticketCreatorId = mentions[1].replace(/<@|>/g, '');
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
              break;
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

      // ----- Affiliate earnings -----
      try {
        const db = require('../../database');
        await db.waitUntilConnected().catch(()=>{});
        // Ensure we have numeric amount
        let numericPrice = 0;
        if(price){
          const match = price.replace(/[, ]/g,'').match(/([0-9]+(?:\.[0-9]+)?)/);
          if(match) numericPrice = parseFloat(match[1]);
        }
        console.log(`[AFFILIATE_EARNINGS] Price parsed for commission: €${numericPrice.toFixed(2)}`);

        if (numericPrice <= 0) {
          console.warn(`[AFFILIATE_EARNINGS] Commission skipped – unable to determine numeric price for channel ${interaction.channel.id}`);
        } else if (!ticketCreatorId) {
          console.warn('[AFFILIATE_EARNINGS] Commission skipped – ticketCreatorId could not be determined.');
        } else {
          // Look up possible referrer
          const res = await db.query('SELECT referrer_id FROM affiliate_referrals WHERE referred_id=$1', [ticketCreatorId]);

          if (res.rowCount === 0) {
            console.log(`[AFFILIATE_EARNINGS] User ${ticketCreatorId} has no referrer – no commission generated.`);
          } else {
            const referrer = res.rows[0].referrer_id;
            const commission = parseFloat((numericPrice * 0.05).toFixed(2));

            try {
              await db.query('UPDATE affiliate_links SET balance = balance + $1 WHERE user_id=$2', [commission, referrer]);
              await db.query('INSERT INTO affiliate_earnings(referrer_id, referred_id, earning_type, amount, order_id) VALUES($1,$2,$3,$4,$5)', [referrer, ticketCreatorId, 'Boost', commission, interaction.channel.id]);
              console.log(`[AFFILIATE_EARNINGS] Success – €${commission} added to ${referrer} (referrer) for boost by ${ticketCreatorId}`);
            } catch (dbWriteErr) {
              console.error('[AFFILIATE_EARNINGS] DB write error:', dbWriteErr.message);
            }
          }
        }
      } catch(err){
        console.error('[AFFILIATE_EARNINGS] Unexpected error while processing earnings:', err);
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
    
    console.log(`[BOOST] Final values - ticketCreatorId: ${ticketCreatorId}, boosterId: ${boosterId}, price: ${price}, paymentMethod: ${paymentMethod}`);
    
    // Add the customer role to the ticket creator
    try {
      if (ticketCreatorId) {
        const member = await interaction.guild.members.fetch(ticketCreatorId);
        if (member) {
          await member.roles.add(config.ROLES.CUSTOMER_ROLE); // Customer role
          console.log(`[BOOST] Added customer role to ${ticketCreatorId}`);
        }
      }
    } catch (error) {
      console.error(`[BOOST] Error adding customer role: ${error.message}`);
    }
    
    // Disable buttons on the original message (edit the deferred reply)
    try {
      await interaction.editReply({
        components: [],
        content: 'Confirmation received.',
        embeds: []
      });
      console.log(`[BOOST] Successfully disabled confirmation buttons`);
    } catch (error) {
      console.error(`[BOOST] Error disabling confirmation buttons: ${error.message}`);
    }
    
    // Send completion message in the channel with embed
    console.log(`[BOOST] Creating Order Completed embed`);
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
    
    // Clean up all messages before Order Completed (except first 2)
    console.log(`[BOOST] Starting message cleanup before sending Order Completed embed`);
    try {
      const { cleanupMessages } = require('../utils/messageCleanup.js');
      await cleanupMessages(interaction.channel, null, 'order_completed');
      console.log(`[BOOST] Successfully completed message cleanup`);
    } catch (error) {
      console.error(`[BOOST] Error during message cleanup: ${error.message}`);
    }
      
    try {
      console.log(`[BOOST] Sending Order Completed embed to channel ${interaction.channel.id}`);
      const completionMessage = await interaction.channel.send({
        content: `<@${ticketCreatorId}>`,
        embeds: [completionEmbed],
        components: [reviewFeedbackRow]
      });
      
      console.log(`[BOOST] Successfully sent Order Completed embed with ID: ${completionMessage.id}`);
    } catch (error) {
      console.error(`[BOOST] Error sending Order Completed embed: ${error.message}`);
      console.error(error.stack);
    }
    
    // Schedule ticket auto-close after 30 minutes
    console.log(`[BOOST] Setting up auto-close timer`);
    const closeTimeMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    const closeTimestamp = Math.floor((Date.now() + closeTimeMs) / 1000);
    
    // Send message about auto-close - use the proper ticket creator ID
    try {
      await interaction.channel.send({
        content: `<@${ticketCreatorId}> This ticket will automatically be closed in <t:${closeTimestamp}:R>`,
      });
      console.log(`[BOOST] Successfully sent auto-close notification`);
    } catch (error) {
      console.error(`[BOOST] Error sending auto-close notification: ${error.message}`);
    }
    
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
    console.log(`[BOOST] Creating completion log embed for channel ${logChannel ? logChannel.id : 'NOT_FOUND'}`);
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
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success);
    
    const row = new ActionRowBuilder()
      .addComponents(payoutButton);
    
    // Send the log message if log channel exists
    if (logChannel) {
      try {
        const logMessage = await logChannel.send({
          embeds: [logEmbed],
          components: [row]
        });
        console.log(`[BOOST] Successfully sent log message with ID: ${logMessage.id} to channel ${logChannel.id}`);
      } catch (error) {
        console.error(`[BOOST] Error sending log message to channel ${logChannel.id}: ${error.message}`);
      }
    } else {
      console.error(`[BOOST] Log channel not found: 1382022752474501352`);
    }
    
    console.log(`[BOOST] boostConfirmCompletedHandler completed successfully`);
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

// Combine all boost management handlers
const boostManagementHandlers = {
  'claim_boost': claimBoostHandler,
  'boost_completed': boostCompletedHandler,
  'boost_cancel': boostCancelHandler,
  'boost_is_completed': boostIsCompletedHandler,
  'boost_not_completed': boostNotCompletedHandler,
  'boost_confirm_completed': boostConfirmCompletedHandler,
  'boost_confirm_not_completed': boostConfirmNotCompletedHandler,
  'boost_cancel_confirmation': boostCancelConfirmationHandler,
  'payout_completed': payoutCompletedHandler
};

module.exports = {
  boostManagementHandlers
}; 