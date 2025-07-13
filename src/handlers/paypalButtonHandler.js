// PayPal Button Handler
const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionsBitField,
  PermissionFlagsBits 
} = require('discord.js');
const config = require('../../config');
const { 
  sendPayPalTosDeniedEmbed, 
  sendPayPalTosDenialConfirmedEmbed, 
  sendPayPalTosAcceptedEmbed,
  sendPayPalInfoEmbed,
  sendPayPalPaymentVerificationEmbed,
  sendBoostAvailableEmbed,
  sendPayPalScreenshotRequestEmbed
} = require('../../ticketPayments');

/**
 * Handles the PayPal accept terms button
 */
async function handlePayPalAcceptToS(interaction) {
  try {
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} accepted PayPal ToS`);

    // Check if the interaction is still valid and hasn't been handled
    if (!interaction.isRepliable()) {
      console.log(`[PAYPAL_BUTTON] Interaction ${interaction.id} is no longer repliable, skipping handler`);
      return false;
    }
    
    // First update the message to disable buttons
    try {
      const message = interaction.message;
      const disabledRow = new ActionRowBuilder();
      
      // Get the original components and disable them
      message.components[0].components.forEach(component => {
        disabledRow.addComponents(
          ButtonBuilder.from(component).setDisabled(true)
        );
      });
      
      // Update the message with disabled buttons
      await interaction.update({ components: [disabledRow] });
    } catch (updateError) {
      console.warn(`[PAYPAL_BUTTON] Could not update message buttons: ${updateError.message}`);
      // Continue execution even if the update fails
    }
    
    // Send PayPal info embed with payment details and terms acceptance message
    await sendPayPalInfoEmbed(interaction.channel, interaction.user.id, interaction, true);
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handlePayPalAcceptToS: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[PAYPAL_BUTTON] Could not send error reply: ${replyError.message}`);
    }
    
    return false;
  }
}

/**
 * Handles the PayPal deny terms button
 */
async function handlePayPalDenyToS(interaction) {
  try {
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} denied PayPal ToS`);
    
    // Check if the interaction is still valid and hasn't been handled
    if (!interaction.isRepliable()) {
      console.log(`[PAYPAL_BUTTON] Interaction ${interaction.id} is no longer repliable, skipping handler`);
      return false;
    }
    
    // First check if the user is the ticket creator
    const channelName = interaction.channel.name;
    if (!channelName.includes(interaction.user.username.toLowerCase())) {
      return interaction.reply({
        content: 'Only the ticket creator can deny the terms.',
        ephemeral: true
      });
    }
    
    // Show confirmation dialog
    await sendPayPalTosDeniedEmbed(interaction);
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handlePayPalDenyToS: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[PAYPAL_BUTTON] Could not send error reply: ${replyError.message}`);
    }
    
    return false;
  }
}

/**
 * Handles the confirmation of PayPal denial
 */
async function handlePayPalDenyConfirm(interaction) {
  try {
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} confirmed PayPal ToS denial`);
    
    // First update the confirmation message to disable buttons
    const message = interaction.message;
    const disabledRow = new ActionRowBuilder();
    
    // Get the original components and disable them
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    // Update the confirmation message with disabled buttons
    await interaction.update({ components: [disabledRow] });
    
    // Send the denial confirmation to the channel
    await sendPayPalTosDenialConfirmedEmbed(interaction.channel, interaction.user.id);
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handlePayPalDenyConfirm: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
    return false;
  }
}

/**
 * Handles the cancellation of PayPal denial
 */
async function handlePayPalDenyCancel(interaction) {
  try {
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} canceled PayPal ToS denial`);
    
    // Delete the confirmation message
    await interaction.message.delete();
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handlePayPalDenyCancel: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
    return false;
  }
}

/**
 * Handles the PayPal email copy button
 */
async function handlePayPalCopyEmail(interaction) {
  try {
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} copying PayPal email`);
    
    const paypalEmail = config.PAYPAL_EMAIL || 'mathiasbenedetto@gmail.com';
    
    // Send the email as plain text for easy copying - without any labels
    await interaction.reply({
      content: paypalEmail,
      ephemeral: true
    });
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handlePayPalCopyEmail: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while copying the email.',
        ephemeral: true
      });
    }
    return false;
  }
}

/**
 * Handles the payment completed button
 */
async function handlePayPalPaymentCompleted(interaction, client) {
  try {
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} clicked Payment Completed`);
    
    const channelName = interaction.channel.name;
    
    // Sanitize the username exactly the same way we do when constructing the ticket channel name
    const sanitizeUsername = (name) => name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    const sanitizedUsername = sanitizeUsername(interaction.user.username);

    let isCreator = channelName.includes(sanitizedUsername);

    // If the sanitized username check fails, fall back to comparing against the user ID stored in the channel topic (if any)
    if (!isCreator) {
      const topic = interaction.channel.topic || '';
      // Match either a mention (User: <@123456789012345678>) or a plain "User ID: 123456789012345678"
      const idMatch = topic.match(/<@!?(\d+)>|User ID:\s*(\d+)/);
      if (idMatch) {
        const topicUserId = idMatch[1] || idMatch[2];
        isCreator = topicUserId === interaction.user.id;
      }
    }

    if (!isCreator) {
      return interaction.reply({
        content: 'Only the ticket creator can mark the payment as completed.',
        ephemeral: true
      });
    }
    
    // Disable the buttons on the original message
    const message = interaction.message;
    const disabledRow = new ActionRowBuilder();
    
    // Get the original components and disable them
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    // Update the message with disabled buttons
    await interaction.update({ components: [disabledRow] });
    
    // Grant file upload permissions to the user
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
        AttachFiles: true,
        SendMessages: true
      });
      console.log(`[PAYPAL_BUTTON] Granted file upload permissions to user ${interaction.user.id}`);
    } catch (permError) {
      console.error(`[PAYPAL_BUTTON] Error granting file permissions: ${permError.message}`);
    }
    
    // Send screenshot request embed
    const screenshotEmbed = await sendPayPalScreenshotRequestEmbed(interaction.channel, interaction.user.id);
    
    // Create a message collector that will listen for ANY message from the user
    const filter = m => m.author.id === interaction.user.id;
    
    // Create collector with a 5 minute timeout
    const collector = interaction.channel.createMessageCollector({ 
      filter, 
      time: 300000 // 5 minutes
    });
    
    // Inform the user we're waiting for a screenshot
    await interaction.followUp({
      content: `Please upload a screenshot of your payment. I'll wait for 5 minutes.`,
      ephemeral: true
    });
    
    let hasProcessedScreenshot = false;
    
    collector.on('collect', async (message) => {
      console.log(`[PAYPAL_BUTTON] Collected message from ${interaction.user.id}: ${message.content || 'No content'}, attachments: ${message.attachments.size}`);
      
      let screenshotUrl = null;
      
      // Check if the message has an image attachment
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        
        // Check if it's an image
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
          console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} sent an image attachment: ${attachment.url}`);
          screenshotUrl = attachment.url;
        }
      }
      
      // Check if the message contains an image URL (imgur, Discord CDN, etc.)
      if (!screenshotUrl && message.content) {
        // Regex patterns for common image hosting sites and Discord CDN
        const imageUrlPatterns = [
          /https?:\/\/i\.imgur\.com\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/imgur\.com\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/media\.discordapp\.net\/attachments\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/cdn\.discordapp\.com\/attachments\/[^\s]+\.(?:png|jpe?g|gif|webp)/i,
          /https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp)/i // Generic image URL pattern
        ];
        
        for (const pattern of imageUrlPatterns) {
          const match = message.content.match(pattern);
          if (match) {
            screenshotUrl = match[0];
            console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} sent an image URL: ${screenshotUrl}`);
            break;
          }
        }
      }
      
      // Process the screenshot if we found one
      if (screenshotUrl && !hasProcessedScreenshot) {
        hasProcessedScreenshot = true;
        
        // Find the PayPal payment information message to reply to
        try {
          // Fetch many more messages to ensure we find the payment info message
          const messages = await interaction.channel.messages.fetch({ limit: 100 });
          let paymentInfoMessage = null;
          
          console.log(`[PAYPAL_BUTTON] Searching through ${messages.size} messages for PayPal info message`);
          
          for (const [_, msg] of messages) {
            if (msg.embeds?.length > 0) {
              // Check for exact PayPal Payment Information title
              if (msg.embeds[0].title === 'PayPal Payment Information:' || 
                  msg.embeds[0].title === 'PayPal Payment Information') {
                paymentInfoMessage = msg;
                console.log(`[PAYPAL_BUTTON] Found PayPal info message with ID: ${msg.id}`);
                break;
              }
              
              // Log all embed titles to help debug
              console.log(`[PAYPAL_BUTTON] Message ${msg.id} has embed with title: "${msg.embeds[0].title}"`);
            }
          }
        
          // Get verifier ID (only one verifier, not double pinging)
          const verifierId = '986164993080836096';
          
          // If we found the payment info message, reply to it
          if (paymentInfoMessage) {
            console.log(`[PAYPAL_BUTTON] Replying to PayPal info message with verification`);
            await paymentInfoMessage.reply({
              content: `<@${verifierId}>`,
              embeds: [
                new EmbedBuilder()
                  .setTitle('Payment Completed')
                  .setDescription(`<@${interaction.user.id}> has marked the Payment as completed.\n\nPlease confirm the payment has been received.`)
                  .setColor('#e68df2')
                  .setImage(screenshotUrl)
              ],
              components: [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId('payment_received')
                    .setLabel('Payment Received')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('<:checkmark:1357478063616688304>'),
                  new ButtonBuilder()
                    .setCustomId('payment_not_received')
                    .setLabel('Not Received')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('<:cross:1351689463453061130>')
                )
              ]
            });
            console.log(`[PAYPAL_BUTTON] Sent payment verification as reply to PayPal info`);
          } else {
            // Fallback: Send as a new message
            await interaction.channel.send({
              content: `<@${verifierId}>`,
              embeds: [
                new EmbedBuilder()
                  .setTitle('Payment Completed')
                  .setDescription(`<@${interaction.user.id}> has marked the Payment as completed.\n\nPlease confirm the payment has been received.`)
                  .setColor('#e68df2')
                  .setImage(screenshotUrl)
              ],
              components: [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId('payment_received')
                    .setLabel('Payment Received')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('<:checkmark:1357478063616688304>'),
                  new ButtonBuilder()
                    .setCustomId('payment_not_received')
                    .setLabel('Not Received')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('<:cross:1351689463453061130>')
                )
              ]
            });
            console.log(`[PAYPAL_BUTTON] Sent payment verification as new message (fallback)`);
          }
        } catch (error) {
          console.error(`[PAYPAL_BUTTON] Error sending verification: ${error.message}`);
          
          // Final fallback if all else fails
          await interaction.channel.send({
            content: `<@${verifierId}>`,
            embeds: [
              new EmbedBuilder()
                .setTitle('Payment Completed')
                .setDescription(`<@${interaction.user.id}> has marked the Payment as completed.\n\nPlease confirm the payment has been received.`)
                .setColor('#e68df2')
                .setImage(screenshotUrl)
            ],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('payment_received')
                  .setLabel('Payment Received')
                  .setStyle(ButtonStyle.Success)
                  .setEmoji('<:checkmark:1357478063616688304>'),
                new ButtonBuilder()
                  .setCustomId('payment_not_received')
                  .setLabel('Not Received')
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji('<:cross:1351689463453061130>')
              )
            ]
          });
        }
        
        // Stop the collector since we got what we needed
        collector.stop('screenshot_received');
      } else if (!screenshotUrl && !hasProcessedScreenshot) {
        // User sent something that's not a valid image
        await message.reply(`Please upload a screenshot (image file) or provide an image URL (like imgur or Discord attachment link) showing your payment.`);
      }
    });
    
    collector.on('end', async (collected, reason) => {
      console.log(`[PAYPAL_BUTTON] Collector ended with reason: ${reason}, messages collected: ${collected.size}`);
      
      if (reason !== 'screenshot_received' && !hasProcessedScreenshot) {
        // If no valid screenshot was received, re-enable the Payment Completed button
        try {
          // Find the PayPal Payment Information message to re-enable its buttons
          const messages = await interaction.channel.messages.fetch({ limit: 100 });
          let paymentInfoMessage = null;
          
          console.log(`[PAYPAL_BUTTON] Searching for PayPal info message to re-enable buttons`);
          
          for (const [_, msg] of messages) {
            if (msg.embeds?.length > 0) {
              // Check for exact PayPal Payment Information title
              if (msg.embeds[0].title === 'PayPal Payment Information:' || 
                  msg.embeds[0].title === 'PayPal Payment Information') {
                paymentInfoMessage = msg;
                console.log(`[PAYPAL_BUTTON] Found PayPal info message with ID: ${msg.id} to re-enable`);
                break;
              }
            }
          }
          
          // Re-enable the buttons on the PayPal info message
          if (paymentInfoMessage && paymentInfoMessage.components && paymentInfoMessage.components.length > 0) {
            const enabledRow = new ActionRowBuilder();
            
            // Get the original components and enable them
            paymentInfoMessage.components[0].components.forEach(component => {
              enabledRow.addComponents(
                ButtonBuilder.from(component).setDisabled(false)
              );
            });
            
            await paymentInfoMessage.edit({ components: [enabledRow] });
            console.log(`[PAYPAL_BUTTON] Re-enabled buttons on PayPal info message after timeout`);
          }
        } catch (enableError) {
          console.error(`[PAYPAL_BUTTON] Error re-enabling Payment Completed button: ${enableError.message}`);
        }
        
        // Send timeout message
        await interaction.channel.send({
          content: `<@${interaction.user.id}> You didn't send a valid payment screenshot. Please click the 'Payment Completed' button again to try again.`
        });
      }
    });
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handlePayPalPaymentCompleted: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
    return false;
  }
}

/**
 * Handles the payment received button (staff only)
 */
async function handlePayPalPaymentReceived(interaction) {
  try {
    console.log(`[PAYPAL_BUTTON] Staff ${interaction.user.id} clicked Payment Received button`);
    
    // Use hard-coded verifier ID for reliability
    const verifiersArray = ['986164993080836096', '987751357773672538'];
    console.log(`[PAYPAL_BUTTON] Verifier IDs: ${JSON.stringify(verifiersArray)}, User ID: ${interaction.user.id}`);
    
    if (!verifiersArray.includes(interaction.user.id)) {
      console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} is not authorized to verify payments`);
      return interaction.reply({
        content: 'Only authorized staff can mark payment as received.',
        ephemeral: true
      });
    }
    
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} is authorized to verify payments`);
    
    // Disable the buttons on the original message
    const message = interaction.message;
    const disabledRow = new ActionRowBuilder();
    
    // Get the original components and disable them
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    // Update the message with disabled buttons
    try {
    await interaction.update({ components: [disabledRow] });
      console.log(`[PAYPAL_BUTTON] Disabled buttons on message ${message.id}`);
    } catch (updateError) {
      console.error(`[PAYPAL_BUTTON] Error updating message: ${updateError.message}`);
      // Continue even if update fails, we can still proceed with permissions and showing the next embed
    }
    
    // Get ticket creator from message content or channel topic
    let creatorId = null;
    
    // First try to get from message content (for PayPal giftcard)
    const contentMention = message.content.match(/<@(\d+)>/);
    if (contentMention) {
      creatorId = contentMention[1];
      console.log(`[PAYPAL_BUTTON] Found ticket creator from message content: ${creatorId}`);
    }
    
    // If not found, try from embed description (for regular PayPal)
    if (!creatorId && message.embeds[0] && message.embeds[0].description) {
      const embedMention = message.embeds[0].description.match(/<@(\d+)>/);
      if (embedMention) {
        creatorId = embedMention[1];
        console.log(`[PAYPAL_BUTTON] Found ticket creator from embed description: ${creatorId}`);
      }
    }
    
    // If still not found, try from channel topic
    if (!creatorId && interaction.channel.topic) {
      const topicMention = interaction.channel.topic.match(/<@(\d+)>/);
      if (topicMention) {
        creatorId = topicMention[1];
        console.log(`[PAYPAL_BUTTON] Found ticket creator from channel topic: ${creatorId}`);
      }
    }
    
    if (!creatorId) {
      console.error('[PAYPAL_BUTTON] Could not determine ticket creator from message, embed, or channel topic');
      return interaction.followUp({
        content: 'Error: Could not determine ticket creator. Please contact an admin.',
        ephemeral: true
      });
    }
    
    // Move the channel to the paid category
    try {
      const { moveToCategory } = require('../../utils.js');
      await moveToCategory(interaction.channel, 'payment_received');
      console.log(`[PAYPAL_BUTTON] Moved channel to paid category`);
    } catch (error) {
      console.error(`[PAYPAL_BUTTON] Error moving channel to category: ${error.message}`);
      // Continue with normal flow even if category movement fails
    }
    
    // Add permissions for the booster role - VIEW ONLY, no send permissions
    try {
      const boosterRoleId = config.ROLES?.BOOSTER_ROLE;
      
      // First try to fetch the role from the guild
      try {
        const guild = interaction.guild;
        const boosterRole = await guild.roles.fetch(boosterRoleId);
        
        if (boosterRole) {
          console.log(`[PAYPAL_BUTTON] Found booster role: ${boosterRole.name} (${boosterRole.id})`);
          await interaction.channel.permissionOverwrites.edit(boosterRole, {
            ViewChannel: true,
            SendMessages: false,
            AddReactions: false
          });
          console.log(`[PAYPAL_BUTTON] Set view-only permissions for booster role ${boosterRoleId} using role object`);
        } else {
          console.error(`[PAYPAL_BUTTON] Could not find booster role with ID ${boosterRoleId}`);
          // Continue with alternative method
          await interaction.channel.permissionOverwrites.create(boosterRoleId, {
            ViewChannel: true,
            SendMessages: false,
            AddReactions: false
          });
          console.log(`[PAYPAL_BUTTON] Set view-only permissions for booster role ${boosterRoleId} using create method`);
        }
      } catch (roleError) {
        console.error(`[PAYPAL_BUTTON] Error fetching booster role: ${roleError.message}`);
        // Try alternative method for setting permissions
        await interaction.channel.permissionOverwrites.create(boosterRoleId, {
      ViewChannel: true,
          SendMessages: false,
          AddReactions: false
        });
        console.log(`[PAYPAL_BUTTON] Set view-only permissions for booster role ${boosterRoleId} using create method (fallback)`);
      }
    } catch (permError) {
      console.error(`[PAYPAL_BUTTON] Error setting permissions: ${permError.message}`);
      // Continue anyway to try sending the boost available embed
    }
    
    // Send boost available embed
    try {
      // Extract order details BEFORE any cleanup
      let orderDetails = {};
      
      try {
        // Extract from channel topic (most reliable source)
        if (interaction.channel.topic) {
          const topicMatch = interaction.channel.topic.match(/Type:\s*(\w+).*?Price:\s*([€$]?[\d,.]+).*?From:\s*([^|]+)\s*to\s*([^|]+)/i);
          if (topicMatch) {
            orderDetails = {
              type: topicMatch[1],
              price: topicMatch[2],
              current: topicMatch[3].trim(),
              desired: topicMatch[4].trim()
            };
          }
        }
      } catch (extractError) {
        console.error(`[PAYPAL_ERROR] Failed to extract order details: ${extractError.message}`);
      }
      
      // Clean up payment messages FIRST
      const { cleanupMessages } = require('../utils/messageCleanup.js');
      await cleanupMessages(interaction.channel, null, 'payment_confirmed');
      
      // Send boost available embed with extracted details (DO NOT pass deleted message)
      const { sendBoostAvailableEmbed } = require('../../ticketPayments');
      await sendBoostAvailableEmbed(interaction.channel, orderDetails, creatorId, config.ROLES.BOOSTER_ROLE, null);
    } catch (embedError) {
      console.error(`[PAYPAL_BUTTON] Error sending boost available embed: ${embedError.message}`);
      
      // Fallback to sending a basic message if the embed fails
      await interaction.channel.send({
        content: `<@&${config.ROLES.BOOSTER_ROLE}> This boost has been paid for and is available. Claim this boost by clicking the 'Claim Boost' button below.`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('claim_boost')
              .setLabel('Claim Boost')
              .setEmoji('<:checkmark:1357478063616688304>')
              .setStyle(ButtonStyle.Success)
          )
        ]
      });
      console.log(`[PAYPAL_BUTTON] Sent fallback boost available message`);
    }
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handlePayPalPaymentReceived: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
    return false;
  }
}

/**
 * Handles the payment not received button (staff only)
 */
async function handlePayPalPaymentNotReceived(interaction) {
  try {
    console.log(`[PAYPAL_BUTTON] Staff ${interaction.user.id} marked payment as not received`);
    
    // Use hard-coded verifier ID for reliability
    const verifiersArray = ['986164993080836096', '987751357773672538'];
    
    if (!verifiersArray.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'Only authorized staff can mark payment as not received.',
        ephemeral: true
      });
    }
    
    // Disable the buttons on the original message
    const message = interaction.message;
    const disabledRow = new ActionRowBuilder();
    
    // Get the original components and disable them
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    // Update the message with disabled buttons
    try {
    await interaction.update({ components: [disabledRow] });
    } catch (updateError) {
      console.error(`[PAYPAL_BUTTON] Error updating message: ${updateError.message}`);
      // Continue even if update fails
    }
    
    // Send message indicating payment was not received
    await interaction.followUp({
      content: 'Payment has been marked as not received. Please ask the customer to check their payment details and try again.',
      ephemeral: false
    });
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handlePayPalPaymentNotReceived: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
    return false;
  }
}

/**
 * Handles the claim boost button (booster role only)
 */
async function handleClaimBoost(interaction) {
  try {
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} claiming boost`);
    
    // Hardcode the correct booster role ID
    const boosterRoleId = config.ROLES.BOOSTER_ROLE;
    
    // Debug log all roles the user has
    const memberRoles = [];
    try {
      interaction.member.roles.cache.forEach(role => {
        memberRoles.push(role.id);
        console.log(`[PAYPAL_BUTTON] User has role: ${role.name} (${role.id})`);
      });
    } catch (err) {
      console.error(`[PAYPAL_BUTTON] Error logging roles: ${err.message}`);
    }
    
    console.log(`[PAYPAL_BUTTON] Checking for booster role: ${boosterRoleId} in user roles: ${memberRoles.join(', ')}`);
    
    // Check if the user has the booster role - try multiple methods
    let hasBoosterRole = false;
    
    // Method 1: Direct array check
    if (memberRoles.includes(boosterRoleId)) {
      console.log(`[PAYPAL_BUTTON] User has booster role (direct check)`);
      hasBoosterRole = true;
    }
    
    // Method 2: Cache check if method 1 failed
    if (!hasBoosterRole && interaction.member.roles && interaction.member.roles.cache) {
      if (interaction.member.roles.cache.has(boosterRoleId)) {
        console.log(`[PAYPAL_BUTTON] User has booster role (cache check)`);
        hasBoosterRole = true;
      }
    }
    
    // Method 3: Manual role check for each role
    if (!hasBoosterRole) {
      interaction.member.roles.cache.forEach(role => {
        if (role.id === boosterRoleId) {
          console.log(`[PAYPAL_BUTTON] User has booster role (forEach check)`);
          hasBoosterRole = true;
        }
      });
    }
    
    // For testing, allow admins or verifiers to claim as well
    if (!hasBoosterRole) {
      // Admin check
      const adminRoleId = '1292933924116500532';
      if (memberRoles.includes(adminRoleId)) {
        console.log(`[PAYPAL_BUTTON] User is an admin, allowing claim`);
        hasBoosterRole = true;
      }
      
      // Head Admin check
      const headAdminRoleId = '1358101527658627270';
      if (memberRoles.includes(headAdminRoleId)) {
        console.log(`[PAYPAL_BUTTON] User is a head admin, allowing claim`);
        hasBoosterRole = true;
      }
      
      // Verifier check
      const verifierIds = ['986164993080836096', '987751357773672538'];
      if (verifierIds.includes(interaction.user.id)) {
        console.log(`[PAYPAL_BUTTON] User is a verifier, allowing claim`);
        hasBoosterRole = true;
      }
      
      // Owner check
      const ownerRoleId = '1292933200389083196';
      if (memberRoles.includes(ownerRoleId)) {
        console.log(`[PAYPAL_BUTTON] User is an owner, allowing claim`);
        hasBoosterRole = true;
      }
    }
    
    // If all checks fail, user doesn't have the role
    if (!hasBoosterRole) {
      console.log(`[PAYPAL_BUTTON] User does not have booster role. User roles: ${memberRoles.join(', ')}`);
      return interaction.reply({
        content: `Only boosters can claim this boost.`,
        ephemeral: true
      });
    }
    
    // User has the role, proceed with claiming
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} has booster role, allowing claim`);
    
    // Disable the buttons on the original message
    const message = interaction.message;
    const disabledRow = new ActionRowBuilder();
    
    // Get the original components and disable them
    message.components[0].components.forEach(component => {
      disabledRow.addComponents(
        ButtonBuilder.from(component).setDisabled(true)
      );
    });
    
    // Update the message with disabled buttons and add the claimer
    await interaction.update({ 
      components: [disabledRow],
      content: `${interaction.message.content}\n\nClaimed by: <@${interaction.user.id}>`
    });
    
    try {
      // First try to modify the booster role permissions - remove view access for other boosters
      try {
        const guild = interaction.guild;
        const boosterRole = await guild.roles.fetch(boosterRoleId);
        
        if (boosterRole) {
          console.log(`[PAYPAL_BUTTON] Found booster role for permission removal: ${boosterRole.name} (${boosterRole.id})`);
          await interaction.channel.permissionOverwrites.edit(boosterRole, {
            ViewChannel: false
          });
          console.log(`[PAYPAL_BUTTON] Removed channel access for booster role`);
        } else {
          console.error(`[PAYPAL_BUTTON] Could not find booster role with ID ${boosterRoleId}`);
          // Try the create method
          await interaction.channel.permissionOverwrites.create(boosterRoleId, {
            ViewChannel: false
          });
          console.log(`[PAYPAL_BUTTON] Removed channel access for booster role using create method`);
        }
      } catch (roleError) {
        console.error(`[PAYPAL_BUTTON] Error modifying booster role permissions: ${roleError.message}`);
        // Continue anyway to try modifying the user's permissions
      }
    
      // Now give the specific user who claimed the boost full permissions
      await interaction.channel.permissionOverwrites.create(interaction.user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AddReactions: true,
      EmbedLinks: true,
      AttachFiles: true
      });
      console.log(`[PAYPAL_BUTTON] Granted full access to user ${interaction.user.id}`);
    } catch (permError) {
      console.error(`[PAYPAL_BUTTON] Error setting permissions: ${permError.message}`);
      // Continue anyway to inform that the boost was claimed
    }
    
    // Get the ticket creator's ID (look for mentions in the channel name or previous messages)
    let ticketCreatorId = '';
    try {
      // Look for the ticket creator in the channel name or topic
      const channelName = interaction.channel.name;
      const guildMembers = await interaction.guild.members.fetch();
      
      // Find member whose username is in the channel name
      for (const [memberId, guildMember] of guildMembers) {
        if (channelName.includes(guildMember.user.username.toLowerCase())) {
          ticketCreatorId = memberId;
          console.log(`[BOOST] Found ticket creator: ${ticketCreatorId}`);
          break;
        }
      }
      
      if (!ticketCreatorId) {
        console.log(`[BOOST] Could not determine ticket creator from channel name`);
      }
    } catch (error) {
      console.error(`[BOOST] Error finding ticket creator: ${error.message}`);
    }
    
    // Create the Boost Claimed embed
    const claimedEmbed = new EmbedBuilder()
      .setTitle('Boost Claimed')
      .setDescription(`<@${ticketCreatorId}> Your boost has been claimed by our booster <@${interaction.user.id}>!\n\nPlease give them your E-Mail and after that the verification code from your E-Mail so they can log in.`)
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
    await message.reply({
      content: `<@${interaction.user.id}> <@${ticketCreatorId}>`,
      embeds: [claimedEmbed],
      components: [row]
    });
    
    // Clean up - delete the Boost Available message
    const { cleanupMessages } = require('../utils/messageCleanup.js');
    await cleanupMessages(interaction.channel, null, 'boost_claimed');
    
    // Send confirmation message
    await interaction.followUp({
      content: `Boost has been claimed by <@${interaction.user.id}>. They now have access to send messages in this channel.`,
      ephemeral: false
    });
    
    return true;
  } catch (error) {
    console.error(`[PAYPAL_BUTTON] Error in handleClaimBoost: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
    return false;
  }
}

module.exports = {
  handlePayPalAcceptToS,
  handlePayPalDenyToS,
  handlePayPalDenyConfirm,
  handlePayPalDenyCancel,
  handlePayPalCopyEmail,
  handlePayPalPaymentCompleted,
  handlePayPalPaymentReceived,
  handlePayPalPaymentNotReceived,
  handleClaimBoost
}; 