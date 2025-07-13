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
    
    // Only booster role can claim boosts - no bypasses
    
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
      // Primary method: Get from channel topic (most reliable)
      if (channel.topic) {
        const topicMatch = channel.topic.match(/<@(\d+)>/);
        if (topicMatch && topicMatch[1]) {
          ticketCreatorId = topicMatch[1];
          console.log(`[BOOST] Found ticket creator from channel topic: ${ticketCreatorId}`);
        }
      }
      
      // Fallback method: Try to get the creator ID from the original message embed
      if (!ticketCreatorId && message.embeds && message.embeds[0] && message.embeds[0].description) {
        const userIdMatch = message.embeds[0].description.match(/<@(\d+)>/);
        if (userIdMatch && userIdMatch[1]) {
          ticketCreatorId = userIdMatch[1];
          console.log(`[BOOST] Found ticket creator from embed description: ${ticketCreatorId}`);
        }
      }
      
      // Alternative method: Look for the ticket creator in the channel name
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
      
      if (!ticketCreatorId) {
        console.log(`[BOOST] Could not determine ticket creator from any source`);
        // Use a default fallback only if absolutely necessary
        ticketCreatorId = '1346034712627646524'; // Fallback ID
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
    
    // Check if user is a trusted owner (bypass image upload requirement)
    const trustedOwners = ['987751357773672538', '986164993080836096'];
    const isTrustedOwner = trustedOwners.includes(userId);
    
    if (isTrustedOwner) {
      console.log(`[BOOST] User ${userId} is a trusted owner, bypassing image upload requirement`);
      // Proceed directly to the verification step (skip image upload)
      return await proceedToBoostVerification(interaction, finalTicketCreatorId);
    }
    
    // For regular boosters, require image upload
    console.log(`[BOOST] User ${userId} is a regular booster, requiring image upload`);
    return await requestBoosterImageUpload(interaction, userId, finalTicketCreatorId);
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
 * Proceeds directly to boost verification step (for trusted owners)
 */
const proceedToBoostVerification = async (interaction, finalTicketCreatorId) => {
  try {
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
    console.log(`[BOOST] Original message buttons disabled for trusted owner`);
    
    // Send the Boost Completed message
    const completedMessage = await interaction.channel.send({
      content: `<@${finalTicketCreatorId}>`,
      embeds: [completedEmbed],
      components: [row]
    });
    
    console.log(`[BOOST] Sent Boost Completed message with ID: ${completedMessage.id} (trusted owner bypass)`);
    return true;
  } catch (error) {
    console.error(`[BOOST] Error in proceedToBoostVerification: ${error.message}`);
    throw error;
  }
};

/**
 * Requests image upload from booster before proceeding to verification
 */
const requestBoosterImageUpload = async (interaction, boosterId, finalTicketCreatorId) => {
  try {
    // Send image upload prompt embed
    const imageUploadEmbed = new EmbedBuilder()
      .setTitle('Upload Image')
      .setDescription(
        'Upload an image of the completed boost.\n\n' +
        '**The image must be one of these:**\n' +
        '> 1. The progress screen, the screen where you have the Play Again and exit button.\n' +
        '> 2. An image in the lobby that clearly shows the finished boost.\n' +
        '> 3. An image of their: Rank, Brawler Trophies, Total Trophies, depending on the type of boost.\n' +
        '-# *The first one is preferred.*\n\n' +
        '**__NEVER show the account\'s name__, cross it out, if you show it you will be punished!**\n\n' +
        'Please send the image in the chat, you have 5 minutes, if it takes you longer than 5 minutes please press the \'Boost Completed\' button again.'
      )
      .setColor('#e68df2');

    // Disable buttons on the original message and update
    const message = interaction.message;
    const disabledRow = new ActionRowBuilder();
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    await interaction.update({ components: [disabledRow] });
    console.log(`[BOOST] Original message buttons disabled for image upload`);

    // Send the image upload request
    await interaction.channel.send({
      content: `<@${boosterId}>`,
      embeds: [imageUploadEmbed]
    });

    // Create message collector to wait for image upload
    const filter = (msg) => {
      if (msg.author.id !== boosterId) return false;

      // Check for image attachment
      if (msg.attachments.size > 0) {
        const attachment = msg.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
          return true;
        }
      }

      // Check for image URLs (imgur, Discord CDN, etc.)
      if (msg.content) {
        const imageUrlPatterns = [
          /https?:\/\/i\.imgur\.com\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/imgur\.com\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/media\.discordapp\.net\/attachments\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/cdn\.discordapp\.com\/attachments\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp)/i
        ];
        
        for (const pattern of imageUrlPatterns) {
          if (pattern.test(msg.content)) {
            return true;
          }
        }
      }

      return false;
    };

    const collector = interaction.channel.createMessageCollector({ 
      filter, 
      max: 1, 
      time: 300000 // 5 minutes
    });

    collector.on('collect', async (message) => {
      console.log(`[BOOST] Collected image from booster ${boosterId}`);
      
      let imageUrl = null;
      
      // Get image URL from attachment or message content
      if (message.attachments.size > 0) {
        imageUrl = message.attachments.first().url;
        console.log(`[BOOST] Image from attachment: ${imageUrl}`);
      } else if (message.content) {
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
            imageUrl = match[0];
            console.log(`[BOOST] Image from URL: ${imageUrl}`);
            break;
          }
        }
      }

      if (imageUrl) {
        // Store image in database
        try {
          const db = require('../../database');
          await db.query(
            'UPDATE tickets SET booster_image_url = $1 WHERE channel_id = $2',
            [imageUrl, interaction.channel.id]
          );
          console.log(`[BOOST] Stored booster image URL in database for channel ${interaction.channel.id}`);
        } catch (dbError) {
          console.error(`[BOOST] Error storing image URL in database: ${dbError.message}`);
        }

        // Proceed to verification step
        await proceedToBoostVerificationAfterImage(interaction, finalTicketCreatorId, imageUrl);
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        interaction.channel.send({
          content: `<@${boosterId}> Time's up! You took longer than 5 minutes to upload the image. Please press the 'Boost Completed' button again to retry.`
        });
        console.log(`[BOOST] Image upload timed out for booster ${boosterId}`);
      }
    });
    
    return true;
  } catch (error) {
    console.error(`[BOOST] Error in requestBoosterImageUpload: ${error.message}`);
    throw error;
  }
};

/**
 * Proceeds to boost verification after image has been uploaded and stored
 */
const proceedToBoostVerificationAfterImage = async (interaction, finalTicketCreatorId, imageUrl) => {
  try {
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
    
    // Send the Boost Completed message
    const completedMessage = await interaction.channel.send({
      content: `<@${finalTicketCreatorId}>`,
      embeds: [completedEmbed],
      components: [row]
    });
    
    console.log(`[BOOST] Sent Boost Completed message with ID: ${completedMessage.id} (after image upload)`);
    return true;
  } catch (error) {
    console.error(`[BOOST] Error in proceedToBoostVerificationAfterImage: ${error.message}`);
    throw error;
  }
};

/**
 * Extracts boost information from ticket channel
 * @param {TextChannel} channel - The ticket channel
 * @returns {Object} - Object containing boost type, desired rank/trophies, etc.
 */
const extractBoostInformation = async (channel) => {
  try {
    const boostInfo = {
      type: null,
      desiredRank: null,
      desiredTrophies: null,
      currentRank: null,
      currentTrophies: null,
      brawler: null
    };

    console.log(`[BOOST_INFO] === EXTRACTING BOOST INFORMATION FROM CHANNEL ${channel.id} ===`);

    // First try to get from database with enhanced logging
    try {
      const db = require('../../database');
      const result = await db.query(
        'SELECT boost_type, desired_rank, desired_trophies, created_at FROM tickets WHERE channel_id = $1',
        [channel.id]
      );
      
      console.log(`[BOOST_INFO] Database query returned ${result.rows.length} rows`);
      
      if (result.rows.length > 0) {
        const dbRow = result.rows[0];
        console.log(`[BOOST_INFO] Raw database row:`, {
          boost_type: dbRow.boost_type,
          desired_rank: dbRow.desired_rank,
          desired_trophies: dbRow.desired_trophies,
          created_at: dbRow.created_at
        });
        
        if (dbRow.boost_type) {
          boostInfo.type = dbRow.boost_type;
          console.log(`[BOOST_INFO] ✅ Database boost_type: ${dbRow.boost_type}`);
        } else {
          console.log(`[BOOST_INFO] ❌ Database boost_type is null/empty`);
        }
        
        if (dbRow.desired_rank) {
          boostInfo.desiredRank = dbRow.desired_rank;
          console.log(`[BOOST_INFO] ✅ Database desired_rank: ${dbRow.desired_rank}`);
        } else {
          console.log(`[BOOST_INFO] ❌ Database desired_rank is null/empty`);
        }
        
        if (dbRow.desired_trophies) {
          boostInfo.desiredTrophies = dbRow.desired_trophies;
          console.log(`[BOOST_INFO] ✅ Database desired_trophies: ${dbRow.desired_trophies}`);
        } else {
          console.log(`[BOOST_INFO] ❌ Database desired_trophies is null/empty`);
        }
      } else {
        console.log(`[BOOST_INFO] ❌ No ticket found in database for channel ${channel.id}`);
      }
    } catch (dbError) {
      console.error(`[BOOST_INFO] ❌ Database query failed: ${dbError.message}`);
      console.error(`[BOOST_INFO] Database error stack:`, dbError.stack);
    }

    // Then check the channel topic with enhanced logging
    if (channel.topic) {
      console.log(`[BOOST_INFO] Channel topic: "${channel.topic}"`);
      
      // Extract boost type from topic (format: "Type: ranked")
      if (channel.topic.includes('Type: ranked')) {
        boostInfo.type = 'ranked';
        console.log(`[BOOST_INFO] ✅ Found boost type 'ranked' in channel topic`);
      } else if (channel.topic.includes('Type: bulk')) {
        boostInfo.type = 'bulk';
        console.log(`[BOOST_INFO] ✅ Found boost type 'bulk' in channel topic`);
      } else if (channel.topic.includes('Type: trophies')) {
        boostInfo.type = 'trophies';
        console.log(`[BOOST_INFO] ✅ Found boost type 'trophies' in channel topic`);
      } else {
        console.log(`[BOOST_INFO] ❌ No recognizable boost type found in channel topic`);
      }

      // Extract rank information from topic (format: "From: Bronze 3 to Masters 2")
      const rankMatch = channel.topic.match(/From:\s*([^-]+)\s*to\s*([^|]+)/);
      if (rankMatch) {
        boostInfo.currentRank = rankMatch[1].trim();
        boostInfo.desiredRank = rankMatch[2].trim();
        console.log(`[BOOST_INFO] ✅ Found rank info in topic: ${boostInfo.currentRank} → ${boostInfo.desiredRank}`);
      } else {
        console.log(`[BOOST_INFO] ❌ No rank pattern 'From: X to Y' found in channel topic`);
      }
    } else {
      console.log(`[BOOST_INFO] ❌ Channel has no topic`);
    }

    // Search through recent messages for order details with enhanced logging
    try {
      console.log(`[BOOST_INFO] Searching through channel messages for order details...`);
      const messages = await channel.messages.fetch({ limit: 50 });
      console.log(`[BOOST_INFO] Fetched ${messages.size} messages to scan`);
      
      let orderDetailsFound = false;
      let orderRecapFound = false;
      
      for (const [_, message] of messages) {
        if (message.embeds.length > 0) {
          const embed = message.embeds[0];
          
          // Check for Order Details embed
          if (embed.title === 'Order Details' || embed.title === 'Order Information') {
            console.log(`[BOOST_INFO] ✅ Found Order Details embed in message ${message.id}`);
            orderDetailsFound = true;
            
            for (const field of embed.fields) {
              const name = field.name.toLowerCase();
              const value = field.value;
              console.log(`[BOOST_INFO] Processing field: "${name}" = "${value}"`);
              
              if (name.includes('boost type')) {
                if (value.toLowerCase().includes('ranked')) boostInfo.type = 'ranked';
                else if (value.toLowerCase().includes('bulk')) boostInfo.type = 'bulk';
                else if (value.toLowerCase().includes('trophies')) boostInfo.type = 'trophies';
                console.log(`[BOOST_INFO] ✅ Updated boost type from field: ${boostInfo.type}`);
              }
              
              if (name.includes('desired rank')) {
                boostInfo.desiredRank = value.replace(/`/g, '').trim();
                console.log(`[BOOST_INFO] ✅ Updated desired rank from field: ${boostInfo.desiredRank}`);
              }
              
              if (name.includes('current rank')) {
                boostInfo.currentRank = value.replace(/`/g, '').trim();
                console.log(`[BOOST_INFO] ✅ Updated current rank from field: ${boostInfo.currentRank}`);
              }
              
              if (name.includes('desired trophies')) {
                boostInfo.desiredTrophies = value.replace(/`/g, '').trim();
                console.log(`[BOOST_INFO] ✅ Updated desired trophies from field: ${boostInfo.desiredTrophies}`);
              }
              
              if (name.includes('current trophies')) {
                boostInfo.currentTrophies = value.replace(/`/g, '').trim();
                console.log(`[BOOST_INFO] ✅ Updated current trophies from field: ${boostInfo.currentTrophies}`);
              }
              
              if (name.includes('brawler')) {
                boostInfo.brawler = value.replace(/`/g, '').trim();
                console.log(`[BOOST_INFO] ✅ Updated brawler from field: ${boostInfo.brawler}`);
              }
            }
          }
          
          // Check embed description for order recap
          if (embed.description && embed.description.includes('**Order Recap:**')) {
            console.log(`[BOOST_INFO] ✅ Found Order Recap in embed description`);
            orderRecapFound = true;
            const description = embed.description;
            
            // Extract boost type
            if (description.includes('**Service:** `Ranked Boost`')) {
              boostInfo.type = 'ranked';
              console.log(`[BOOST_INFO] ✅ Found service type: ranked`);
            } else if (description.includes('**Service:** `Bulk Trophies Boost`')) {
              boostInfo.type = 'bulk';
              console.log(`[BOOST_INFO] ✅ Found service type: bulk`);
            } else if (description.includes('**Service:** `Trophies Boost`')) {
              boostInfo.type = 'trophies';
              console.log(`[BOOST_INFO] ✅ Found service type: trophies`);
            }
            
            // Extract rank information
            const currentRankMatch = description.match(/\*\*Current Rank:\*\*\s*`([^`]+)`/);
            if (currentRankMatch) {
              boostInfo.currentRank = currentRankMatch[1].trim();
              console.log(`[BOOST_INFO] ✅ Found current rank in recap: ${boostInfo.currentRank}`);
            }
            
            const desiredRankMatch = description.match(/\*\*Desired Rank:\*\*\s*`([^`]+)`/);
            if (desiredRankMatch) {
              boostInfo.desiredRank = desiredRankMatch[1].trim();
              console.log(`[BOOST_INFO] ✅ Found desired rank in recap: ${boostInfo.desiredRank}`);
            }
            
            // Extract trophy information
            const currentTrophiesMatch = description.match(/\*\*Current Trophies:\*\*\s*`([^`]+)`/);
            if (currentTrophiesMatch) {
              boostInfo.currentTrophies = currentTrophiesMatch[1].trim();
              console.log(`[BOOST_INFO] ✅ Found current trophies in recap: ${boostInfo.currentTrophies}`);
            }
            
            const desiredTrophiesMatch = description.match(/\*\*Desired Trophies:\*\*\s*`([^`]+)`/);
            if (desiredTrophiesMatch) {
              boostInfo.desiredTrophies = desiredTrophiesMatch[1].trim();
              console.log(`[BOOST_INFO] ✅ Found desired trophies in recap: ${boostInfo.desiredTrophies}`);
            }
            
            // Extract brawler information
            const brawlerMatch = description.match(/\*\*Brawler:\*\*\s*`([^`]+)`/);
            if (brawlerMatch) {
              boostInfo.brawler = brawlerMatch[1].trim();
              console.log(`[BOOST_INFO] ✅ Found brawler in recap: ${boostInfo.brawler}`);
            }
          }
        }
      }
      
      if (!orderDetailsFound && !orderRecapFound) {
        console.log(`[BOOST_INFO] ❌ No Order Details or Order Recap embeds found in ${messages.size} messages`);
      }
    } catch (messageError) {
      console.error(`[BOOST_INFO] ❌ Error fetching messages: ${messageError.message}`);
      console.error(`[BOOST_INFO] Message error stack:`, messageError.stack);
    }

    // Try to determine type from channel name if not found
    if (!boostInfo.type) {
      const channelName = channel.name.toLowerCase();
      console.log(`[BOOST_INFO] Attempting to parse boost type from channel name: "${channelName}"`);
      
      if (channelName.includes('rank')) {
        boostInfo.type = 'ranked';
        console.log(`[BOOST_INFO] ✅ Inferred boost type 'ranked' from channel name`);
      } else if (channelName.includes('bulk')) {
        boostInfo.type = 'bulk';
        console.log(`[BOOST_INFO] ✅ Inferred boost type 'bulk' from channel name`);
      } else if (channelName.includes('trophy') || channelName.includes('trophies')) {
        boostInfo.type = 'trophies';
        console.log(`[BOOST_INFO] ✅ Inferred boost type 'trophies' from channel name`);
      } else {
        console.log(`[BOOST_INFO] ❌ Could not infer boost type from channel name`);
      }
    }

    console.log(`[BOOST_INFO] === FINAL EXTRACTED INFORMATION ===`);
    console.log(`[BOOST_INFO] Type: ${boostInfo.type || 'NULL'}`);
    console.log(`[BOOST_INFO] Desired Rank: ${boostInfo.desiredRank || 'NULL'}`);
    console.log(`[BOOST_INFO] Desired Trophies: ${boostInfo.desiredTrophies || 'NULL'}`);
    console.log(`[BOOST_INFO] Current Rank: ${boostInfo.currentRank || 'NULL'}`);
    console.log(`[BOOST_INFO] Current Trophies: ${boostInfo.currentTrophies || 'NULL'}`);
    console.log(`[BOOST_INFO] Brawler: ${boostInfo.brawler || 'NULL'}`);
    console.log(`[BOOST_INFO] === END EXTRACTION ===`);
    
    return boostInfo;
  } catch (error) {
    console.error(`[BOOST_INFO] ❌ CRITICAL ERROR in extractBoostInformation: ${error.message}`);
    console.error(`[BOOST_INFO] Error stack:`, error.stack);
    return {
      type: null,
      desiredRank: null,
      desiredTrophies: null,
      currentRank: null,
      currentTrophies: null,
      brawler: null
    };
  }
};

/**
 * Sends boost completion announcement to the announcement channel
 * @param {Guild} guild - The Discord guild
 * @param {Object} boostInfo - Information about the boost
 * @param {string} imageUrl - URL of the booster's uploaded image
 * @returns {Promise<boolean>} - Success status
 */
const sendBoostAnnouncement = async (guild, boostInfo, imageUrl) => {
  try {
    const announcementChannelId = '1293288739669413928';
    const announcementChannel = guild.channels.cache.get(announcementChannelId);
    
    if (!announcementChannel) {
      console.error(`[BOOST_ANNOUNCEMENT] Announcement channel ${announcementChannelId} not found`);
      return false;
    }

    console.log(`[BOOST_ANNOUNCEMENT] Creating announcement for boost type: ${boostInfo.type}`);

    // Don't announce for Diamond or below ranked boosts
    if (boostInfo.type === 'ranked' && boostInfo.desiredRank) {
      const rank = boostInfo.desiredRank.toLowerCase();
      if (rank.includes('diamond') || rank.includes('bronze') || rank.includes('silver') || rank.includes('gold')) {
        console.log(`[BOOST_ANNOUNCEMENT] Skipping announcement for ${boostInfo.desiredRank} (Diamond or below)`);
        return false;
      }
    }

    // Create announcement text based on boost type
    let announcementText = '';
    let emoji = '';

    if (boostInfo.type === 'ranked' && boostInfo.desiredRank) {
      let rankForAnnouncement = boostInfo.desiredRank;
      
      // Remove "1" from rank names ending with "1" (Masters 1 → Masters)
      if (rankForAnnouncement.match(/\s1$/)) {
        rankForAnnouncement = rankForAnnouncement.replace(/\s1$/, '');
      }

      // Get emoji based on rank
      const rankLower = rankForAnnouncement.toLowerCase();
      if (rankLower.includes('mythic')) {
        emoji = '<:mythic:1357482343555666181>';
      } else if (rankLower.includes('legendary')) {
        emoji = '<:legendary:1357482316745937021>';
      } else if (rankLower.includes('masters')) {
        emoji = '<:Masters:1293283897618075728>';
      } else if (rankLower.includes('pro')) {
        emoji = '<:pro:1351687685328208003>';
      }

      announcementText = `**# ${rankForAnnouncement} Ranked Boost ${emoji}**\n> **Want 0-1000 / 1000+**\n> **Or <:Masters:1293283897618075728> ?**\n> <#1292896201859141722>`;
    
    } else if (boostInfo.type === 'trophies' && boostInfo.desiredTrophies) {
      emoji = '<:trophy:1301901071471345664>';
      announcementText = `**# ${boostInfo.desiredTrophies} Brawler Trophies Boost ${emoji}**\n> **Want 0-1000 / 1000+**\n> **Or <:Masters:1293283897618075728> ?**\n> <#1292896201859141722>`;
    
    } else if (boostInfo.type === 'bulk' && boostInfo.desiredTrophies) {
      emoji = '<:trophy:1301901071471345664>';
      announcementText = `**# ${boostInfo.desiredTrophies} Trophies Boost ${emoji}**\n> **Want 0-1000 / 1000+**\n> **Or <:Masters:1293283897618075728> ?**\n> <#1292896201859141722>`;
    
    } else {
      console.log(`[BOOST_ANNOUNCEMENT] Unable to create announcement - missing required information for ${boostInfo.type}`);
      return false;
    }

    // Determine if image is a link or attachment
    const isImageLink = imageUrl && (
      imageUrl.includes('media.discordapp.net') || 
      imageUrl.includes('i.imgur.com') ||
      imageUrl.includes('imgur.com') ||
      imageUrl.includes('cdn.discordapp.com')
    );

    console.log(`[BOOST_ANNOUNCEMENT] Image URL: ${imageUrl}, Is link: ${isImageLink}`);

    if (isImageLink) {
      // Send as embed with image
      const { EmbedBuilder } = require('discord.js');
      const announcementEmbed = new EmbedBuilder()
        .setDescription(announcementText)
        .setImage(imageUrl)
        .setColor('#e68df2');

      await announcementChannel.send({
        embeds: [announcementEmbed]
      });
      
      console.log(`[BOOST_ANNOUNCEMENT] Sent embed announcement with image link`);
    } else {
      // Send as regular message with image attachment
      const messageOptions = {
        content: announcementText
      };

      // If we have an image URL, try to download and attach it
      if (imageUrl) {
        try {
          const axios = require('axios');
          const { AttachmentBuilder } = require('discord.js');
          
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          if (response.status === 200) {
            const buffer = Buffer.from(response.data);
            const attachment = new AttachmentBuilder(buffer, { name: 'boost_completed.png' });
            messageOptions.files = [attachment];
            console.log(`[BOOST_ANNOUNCEMENT] Attached image file to regular message`);
          }
        } catch (downloadError) {
          console.error(`[BOOST_ANNOUNCEMENT] Error downloading image: ${downloadError.message}`);
          // Continue without attachment
        }
      }

      await announcementChannel.send(messageOptions);
      console.log(`[BOOST_ANNOUNCEMENT] Sent regular message announcement`);
    }

    return true;
  } catch (error) {
    console.error(`[BOOST_ANNOUNCEMENT] Error sending announcement: ${error.message}`);
    return false;
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
    
    // Check if user is authorized to click this button (ONLY ticket creator and trusted owners)
    const trustedOwners = ['987751357773672538', '986164993080836096'];
    if (userId !== ticketCreatorId && !trustedOwners.includes(userId)) {
      console.log(`[BOOST] User ${userId} is not authorized to confirm boost completion. Expected ticket creator: ${ticketCreatorId} or trusted owners: ${trustedOwners.join(', ')}`);
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
    
    // Check if user is authorized to click this button (ONLY ticket creator and trusted owners)
    const trustedOwners = ['987751357773672538', '986164993080836096'];
    if (userId !== ticketCreatorId && !trustedOwners.includes(userId)) {
      return interaction.reply({
        content: 'You are not authorized to mark this boost as not completed. Only the ticket creator can do this.',
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
    const userId = interaction.user.id;
    console.log(`[BOOST] Boost Confirm Completed button clicked by user ${userId}`);
    
    // CRITICAL: Authorization check - find ticket creator from channel messages
    let ticketCreatorForAuth = '';
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      for (const [_, message] of messages) {
        if (message.embeds.length > 0 && message.embeds[0].title === 'Boost Claimed') {
          const mentions = message.content.match(/<@(\d+)>/g);
          if (mentions && mentions.length >= 2) {
            ticketCreatorForAuth = mentions[1].replace(/<@|>/g, ''); // Second mention is ticket creator
            break;
          }
        }
      }
      
      // Fallback: try to get from channel topic
      if (!ticketCreatorForAuth && interaction.channel.topic) {
        const topicMatch = interaction.channel.topic.match(/<@(\d+)>/);
        if (topicMatch) {
          ticketCreatorForAuth = topicMatch[1];
        }
      }
    } catch (error) {
      console.error(`[BOOST] Error finding ticket creator for authorization: ${error.message}`);
    }
    
    // Authorization check - ONLY ticket creator and trusted owners can confirm
    const trustedOwners = ['987751357773672538', '986164993080836096'];
    if (ticketCreatorForAuth && userId !== ticketCreatorForAuth && !trustedOwners.includes(userId)) {
      console.log(`[BOOST] User ${userId} is not authorized to confirm completion. Expected: ${ticketCreatorForAuth} or trusted owners`);
      return interaction.reply({
        content: 'You are not authorized to confirm this boost completion. Only the ticket creator can confirm completion.',
        ephemeral: true
      });
    }
    
    // Defer immediately so we don't hit the 3-second interaction timeout
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    
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
      
      // ENHANCED PRICE EXTRACTION - Check multiple sources systematically
      // Extract price from channel topic (most reliable)
      if (interaction.channel.topic) {
        const topicPriceMatch = interaction.channel.topic.match(/Price:\s*([€$]?[\d,.]+)/i);
        if (topicPriceMatch && topicPriceMatch[1]) {
          price = topicPriceMatch[1].includes('€') ? topicPriceMatch[1].trim() : '€' + topicPriceMatch[1].trim();
        }
      }

      // Fallback: Look for price in embeds
      if (!price) {
        for (const [_, message] of messages) {
          if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            
            // Check Order Recap fields
            if (embed.title === 'Order Recap' && embed.fields) {
              for (const field of embed.fields) {
                if (field.name.toLowerCase().includes('price')) {
                  const fieldPriceMatch = field.value.match(/([€$]?[\d,.]+)/);
                  if (fieldPriceMatch) {
                    price = fieldPriceMatch[1].includes('€') || fieldPriceMatch[1].includes('$') ? 
                           fieldPriceMatch[1].trim() : '€' + fieldPriceMatch[1].trim();
                    break;
                  }
                }
              }
              if (price) break;
            }
          }
        }
      }
      
      if (!price) {
        console.error(`[BOOST_ERROR] Could not extract price from channel ${interaction.channel.id}`);
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
      if (ticketCreatorId && config.ROLES.CUSTOMER_ROLE) {
        const member = await interaction.guild.members.fetch(ticketCreatorId);
        const customerRole = await interaction.guild.roles.fetch(config.ROLES.CUSTOMER_ROLE);
        
        if (member && customerRole) {
          await member.roles.add(customerRole);
          console.log(`[BOOST] Added customer role to ${ticketCreatorId}`);
        } else {
          console.log(`[BOOST] Customer role or member not found - Member: ${!!member}, Role: ${!!customerRole}`);
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
      
      // === DISCOUNT SYSTEM TRIGGER ===
      // Send discount DM only for orders €30 or more
      try {
        console.log(`[DISCOUNT_TRIGGER] Checking if discount DM should be sent for order completion`);
        
        // Extract numeric price value for threshold check
        let numericPrice = 0;
        if (price) {
          const priceMatch = price.replace(/[, ]/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
          if (priceMatch) {
            numericPrice = parseFloat(priceMatch[1]);
          }
        }
        
        console.log(`[DISCOUNT_TRIGGER] Order price: ${price} (numeric: €${numericPrice})`);
        
        // Only send discount DM if order is €30 or more
        if (numericPrice >= 30) {
          const { sendDiscountDM } = require('../utils/discountSystem.js');
          
          try {
            console.log(`[DISCOUNT_TRIGGER] Sending discount DM for order: ${price} (qualifies - €${numericPrice} >= €30)`);
            
            // Send discount DM
            const discountSent = await sendDiscountDM(interaction.client, ticketCreatorId, interaction.channel.id);
            
            if (!discountSent) {
              console.error(`[DISCOUNT_ERROR] Failed to send discount DM to user ${ticketCreatorId} for order ${price}`);
            } else {
              console.log(`[DISCOUNT_SUCCESS] Successfully sent discount DM to user ${ticketCreatorId} for order ${price}`);
            }
          } catch (discountError) {
            console.error(`[DISCOUNT_ERROR] Error sending discount DM: ${discountError.message}`);
          }
        } else {
          console.log(`[DISCOUNT_TRIGGER] Skipping discount DM for order ${price} (€${numericPrice} < €30 threshold)`);
        }
        
      } catch (discountError) {
        console.error(`[DISCOUNT_TRIGGER] Error in discount system: ${discountError.message}`);
        // Don't let discount errors affect the main completion flow
      }
      
      // Send boost completion announcement
      console.log(`[BOOST] Preparing to send boost completion announcement`);
      try {
        // Extract boost information from the channel
        const boostInfo = await extractBoostInformation(interaction.channel);
        
        // Get booster image URL from database with enhanced logging
        let boosterImageUrl = null;
        try {
          console.log(`[BOOST_IMAGE] === RETRIEVING BOOSTER IMAGE FROM DATABASE ===`);
          console.log(`[BOOST_IMAGE] Searching for channel_id: ${interaction.channel.id}`);
          
          const db = require('../../database');
          const imageResult = await db.query(
            'SELECT booster_image_url, boost_type, desired_rank, created_at FROM tickets WHERE channel_id = $1',
            [interaction.channel.id]
          );
          
          console.log(`[BOOST_IMAGE] Database query returned ${imageResult.rows.length} rows`);
          
          if (imageResult.rows.length > 0) {
            const row = imageResult.rows[0];
            console.log(`[BOOST_IMAGE] Database row details:`, {
              booster_image_url: row.booster_image_url ? 'PRESENT' : 'NULL',
              boost_type: row.boost_type,
              desired_rank: row.desired_rank,
              created_at: row.created_at
            });
            
            if (row.booster_image_url) {
              boosterImageUrl = row.booster_image_url;
              console.log(`[BOOST_IMAGE] ✅ Retrieved booster image URL: ${boosterImageUrl.substring(0, 50)}...`);
            } else {
              console.log(`[BOOST_IMAGE] ❌ booster_image_url field is NULL in database`);
            }
          } else {
            console.log(`[BOOST_IMAGE] ❌ No ticket found in database for channel ${interaction.channel.id}`);
          }
        } catch (dbError) {
          console.error(`[BOOST_IMAGE] ❌ Error retrieving booster image from database: ${dbError.message}`);
          console.error(`[BOOST_IMAGE] Database error stack:`, dbError.stack);
        }
        
        // Send announcement if we have the necessary information
        const hasValidType = boostInfo.type;
        const hasRankOrTrophies = boostInfo.desiredRank || boostInfo.desiredTrophies;
        
        if (hasValidType && hasRankOrTrophies) {
          try {
            await sendBoostAnnouncement(interaction.guild, boostInfo, boosterImageUrl);
          } catch (announcementError) {
            console.error(`[BOOST_ERROR] Failed to send announcement: ${announcementError.message}`);
          }
        }
      } catch (announcementError) {
        console.error(`[BOOST] Error creating boost announcement: ${announcementError.message}`);
        // Don't let announcement errors stop the completion flow
      }
      
    } catch (error) {
      console.error(`[BOOST] Error sending Order Completed embed: ${error.message}`);
      console.error(error.stack);
    }
    
    // Schedule ticket auto-close after 30 minutes - DATABASE PERSISTENT VERSION
    console.log(`[BOOST] Setting up database-persistent auto-close timer`);
    const closeTimeMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    try {
      const { scheduleAutoCloseDatabase } = require('../utils/completionUtils.js');
      await scheduleAutoCloseDatabase(interaction.channel, ticketCreatorId, closeTimeMs, interaction.client, 'boost');
      console.log(`[BOOST] Successfully set up database-persistent auto-close for channel ${interaction.channel.id}`);
    } catch (error) {
      console.error(`[BOOST] Error setting up database-persistent auto-close: ${error.message}`);
      console.log(`[BOOST] Falling back to legacy setTimeout method`);
      
      // Fallback to old setTimeout method if database method fails
      const closeTimestamp = Math.floor((Date.now() + closeTimeMs) / 1000);
      
      try {
        await interaction.channel.send({
          content: `<@${ticketCreatorId}> This ticket will automatically be closed in <t:${closeTimestamp}:R>`,
        });
        
        setTimeout(async () => {
          try {
            const channel = interaction.client.channels.cache.get(interaction.channel.id);
            if (!channel) return;
            
            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
            if (ticketCreatorId) {
              await channel.permissionOverwrites.edit(ticketCreatorId, {
                ViewChannel: true,
                SendMessages: false,
                ReadMessageHistory: true
              });
            }
            
            await channel.send({
              content: `This ticket has been automatically closed after completion.`,
              embeds: [
                new EmbedBuilder()
                  .setTitle('Ticket Closed')
                  .setDescription('This ticket has been automatically closed since the boost was completed.')
                  .setColor('#e68df2')
                  .setTimestamp()
              ]
            });
            
            console.log(`[AUTO_CLOSE] Auto-closed ticket channel ${interaction.channel.id} (fallback method)`);
          } catch (error) {
            console.error(`[AUTO_CLOSE] Error auto-closing channel (fallback): ${error.message}`);
          }
        }, closeTimeMs);
      } catch (fallbackError) {
        console.error(`[BOOST] Error with fallback auto-close method: ${fallbackError.message}`);
      }
    }
    
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
  boostManagementHandlers,
  claimBoostHandler,
  boostCompletedHandler,
  boostCancelHandler
}; 