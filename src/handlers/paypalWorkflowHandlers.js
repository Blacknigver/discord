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
    const { handlePayPalPaymentCompleted } = require('./paypalButtonHandler');
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
    const { sendBoostAvailableEmbed } = require('../../ticketPayments');
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
 * Handle PayPal Terms of Service confirmation
 */
const paypalTermsConfirmHandler = async (interaction) => {
  try {
    // Extract user ID from the button custom ID
    const customIdParts = interaction.customId.split('_');
    const targetUserId = customIdParts[3];
    
    // Verify the user is authorized to confirm
    if (interaction.user.id !== targetUserId) {
      return await interaction.reply({
        content: 'Only the ticket creator can confirm the terms.',
        ephemeral: true
      });
    }
    
    // Update the button to be disabled and change text
    const confirmButton = new ButtonBuilder()
      .setCustomId('paypal_terms_confirmed')
      .setLabel(`${interaction.user.username} Agreed to the Terms of Services.`)
      .setEmoji('<:checkmark:1357478063616688304>')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
    
    const row = new ActionRowBuilder().addComponents(confirmButton);
    
    await interaction.update({ components: [row] });
    
    // Send PayPal info after confirmation
    const { sendPayPalInfoEmbed } = require('../../ticketPayments');
    await sendPayPalInfoEmbed(interaction.message);
  } catch (error) {
    console.error('[PAYMENT] Error handling PayPal terms confirmation:', error);
    await interaction.reply({
      content: 'An error occurred while confirming the terms. Please try again.',
      ephemeral: true
    });
  }
};

// Helper functions to create embeds (these would need to be imported from ticketPayments.js)
async function sendPayPalTosAcceptedEmbed(channel, userId) {
  // This function would be implemented in ticketPayments.js
  // For now, just log the action
  console.log(`PayPal TOS accepted by user ${userId} in channel ${channel.id}`);
}

async function sendPayPalInfoEmbed(channel, userId) {
  // This function would be implemented in ticketPayments.js
  // For now, just log the action
  console.log(`Sending PayPal info to user ${userId} in channel ${channel.id}`);
}

async function sendPayPalTosDeniedEmbed(interaction) {
  // This function would be implemented in ticketPayments.js
  // For now, just log the action
  console.log(`PayPal TOS denied by user ${interaction.user.id}`);
}

async function sendPayPalTosDenialConfirmedEmbed(channel, userId) {
  // This function would be implemented in ticketPayments.js
  // For now, just log the action
  console.log(`PayPal TOS denial confirmed by user ${userId} in channel ${channel.id}`);
}

// Combine all PayPal workflow handlers
const paypalWorkflowHandlers = {
  'paypal_accept_tos': paypalTosAcceptHandler,
  'paypal_deny_tos': paypalTosDenyHandler,
  'paypal_deny_confirmed': paypalDenyConfirmedHandler,
  'paypal_deny_cancelled': paypalDenyCancelledHandler,
  'payment_completed_paypal': paypalPaymentCompletedHandler,
  'paypal_payment_received': paypalPaymentReceivedHandler,
  'paypal_payment_not_received': paypalPaymentNotReceivedHandler,
  'confirm_paypal_terms': paypalTermsConfirmHandler
};

module.exports = {
  paypalWorkflowHandlers
}; 