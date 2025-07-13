const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const { EMBED_COLOR, EMOJIS, PAYMENT_METHODS, PAYMENT_STAFF } = require('../constants');
const config = require('../../config');

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
    console.log(`PayPal TOS denial confirmed by user ${userId} in channel ${interaction.channel.id}`);
    
    // Update the interaction to show it's been processed
    await interaction.update({
      content: 'Your denial has been confirmed.',
      embeds: [],
      components: []
    });
    
    // Send the denial confirmed embed to the channel
    const { sendPayPalTosDenialConfirmedEmbed } = require('../../ticketPayments');
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
    console.log(`PayPal TOS denial cancelled by user ${interaction.user.id} in channel ${interaction.channel.id}`);
    
    // Update the interaction to dismiss the confirmation dialog
    await interaction.update({
      content: 'Denial cancelled. You can use the Accept/Deny buttons again.',
      embeds: [],
      components: []
    });
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
    console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} clicked Payment Completed`);
    
    // Disable the buttons on the current message
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
    const { sendPayPalScreenshotRequestEmbed } = require('../../ticketPayments');
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
    const roleId = config.ROLES.BOOSTER_ROLE; // Booster role from config
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
        console.log(`[PAYPAL_BUTTON] Set view-only permissions for booster role ${roleId} using role ID`);
      }
    } catch (error) {
      console.error(`[PAYPAL_BUTTON] Error updating channel permissions: ${error.message}`);

      // Try alternative method for setting permissions
      try {
        const channel = interaction.channel;

        // Create a new permission overwrite
        await channel.permissionOverwrites.create(roleId, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: false
        });
        console.log(`[PAYPAL_BUTTON] Successfully added booster role ${roleId} using alternative method (view only)`);
      } catch (altError) {
        console.error(`[PAYPAL_BUTTON] Alternative method also failed: ${altError.message}`);
      }
    }
    
    // Extract the user ID from the embed
    const userIdMatch = interaction.message.embeds[0].description.match(/<@(\d+)>/);
    const creatorId = userIdMatch ? userIdMatch[1] : null;
    
    // Extract order details BEFORE cleanup to ensure data is available
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
      
      // Fallback: try to extract from Order Recap embed if topic parsing failed
      if (!orderDetails.price) {
        const messages = await interaction.channel.messages.fetch({ limit: 10 });
        const orderRecapMsg = messages.find(msg => 
          msg.embeds.length > 0 && msg.embeds[0].title === 'Order Recap'
        );
        
        if (orderRecapMsg && orderRecapMsg.embeds[0].fields) {
          for (const field of orderRecapMsg.embeds[0].fields) {
            const fieldName = field.name.toLowerCase();
            const fieldValue = field.value.replace(/`/g, '').trim();
            
            if (fieldName.includes('price')) orderDetails.price = fieldValue;
            else if (fieldName.includes('current')) orderDetails.current = fieldValue;
            else if (fieldName.includes('desired') || fieldName.includes('target')) orderDetails.desired = fieldValue;
          }
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
    await sendBoostAvailableEmbed(interaction.channel, orderDetails, creatorId, roleId, null);
    
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

// Combine all PayPal workflow handlers
const paypalWorkflowHandlers = {
  'paypal_accept_tos': paypalTosAcceptHandler,
  'paypal_deny_tos': paypalTosDenyHandler,
  'paypal_deny_confirmed': paypalDenyConfirmedHandler,
  'paypal_deny_cancelled': paypalDenyCancelledHandler,
  'payment_completed_paypal': paypalPaymentCompletedHandler,
  'paypal_payment_received': paypalPaymentReceivedHandler,
  'paypal_payment_not_received': paypalPaymentNotReceivedHandler
};

module.exports = {
  paypalWorkflowHandlers,
  paypalPaymentCompletedHandler
};