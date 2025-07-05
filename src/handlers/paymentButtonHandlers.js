// Payment button handlers for ticket system
const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { ROLE_IDS } = require('../constants');

// Helper function to safely update an interaction
async function safeInteractionUpdate(interaction, options) {
  try {
    await interaction.update(options);
    return true;
  } catch (error) {
    console.error('[PAYMENT_HANDLERS] Error updating interaction:', error);
    return false;
  }
}

// Helper function to safely reply to an interaction
async function safeInteractionReply(interaction, options) {
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(options);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[PAYMENT_HANDLERS] Error replying to interaction:', error);
    return false;
  }
}

// Helper function to safely send a message to a channel
async function safeChannelSend(channel, options) {
  try {
    await channel.send(options);
    return true;
  } catch (error) {
    console.error('[PAYMENT_HANDLERS] Error sending message to channel:', error);
    return false;
  }
}

// PayPal ToS button handlers
async function handlePayPalAcceptToS(interaction) {
  try {
    // Try to update the message components to disable the buttons
    const row = ActionRowBuilder.from(interaction.message.components[0]);
    row.components.forEach(button => button.setDisabled(true));
    
    // Try to update the interaction
    const updateSuccess = await safeInteractionUpdate(interaction, { components: [row] });
    
    // Send a confirmation message regardless of update success
    await safeChannelSend(interaction.channel, {
      content: `<@${interaction.user.id}> has accepted the Terms of Service.`
    });
    
    // Continue with payment information
    try {
      const { sendPayPalInfoEmbed } = require('../../ticketPayments');
      if (sendPayPalInfoEmbed) {
        await sendPayPalInfoEmbed(interaction.channel, interaction.user.id);
      } else {
        console.error('[PAYMENT_HANDLERS] sendPayPalInfoEmbed function not found');
        await safeChannelSend(interaction.channel, {
          content: 'Error sending payment information. Please contact staff.'
        });
      }
    } catch (paymentError) {
      console.error('[PAYMENT_HANDLERS] Error sending payment info:', paymentError);
      await safeChannelSend(interaction.channel, {
        content: 'Error sending payment information. Please contact staff.'
      });
    }
  } catch (error) {
    console.error('[PAYMENT_HANDLERS] Error in handlePayPalAcceptToS:', error);
    // Try to respond if we haven't already
    if (!safeInteractionReply(interaction, { 
      content: 'An error occurred while processing your response. Please contact staff.',
      ephemeral: true
    })) {
      // If we can't reply, try to send a message to the channel
      await safeChannelSend(interaction.channel, {
        content: 'An error occurred while processing the Terms of Service acceptance. Please contact staff.'
      });
    }
  }
}

async function handlePayPalDenyToS(interaction) {
  try {
    // Create a confirmation embed
    const embed = {
      title: 'Are you sure?',
      description: 'Please confirm if you are sure you would like to deny the Terms of Services.\n\nThis means we can **not continue** with your order.',
      color: 0x2b2d31
    };
    
    // Create confirmation buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('paypal_deny_confirm')
        .setLabel('Continue')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('paypal_deny_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Success)
    );
    
    // Try to reply with the confirmation
    if (!await safeInteractionReply(interaction, { 
      embeds: [embed], 
      components: [row],
      ephemeral: true
    })) {
      // If reply fails, try to update
      await safeInteractionUpdate(interaction, {
        embeds: [embed],
        components: [row]
      });
    }
  } catch (error) {
    console.error('[PAYMENT_HANDLERS] Error in handlePayPalDenyToS:', error);
    // Try to respond if possible
    await safeInteractionReply(interaction, { 
      content: 'An error occurred while processing your response. Please contact staff.',
      ephemeral: true
    });
  }
}

async function handlePayPalDenyConfirm(interaction) {
  try {
    // Update the confirmation message
    await safeInteractionUpdate(interaction, {
      content: 'Denial confirmed',
      embeds: [],
      components: []
    });
    
    // Try to disable the original buttons
    try {
      const originalMessage = interaction.message.reference?.messageId 
        ? await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null)
        : null;
      
      if (originalMessage && originalMessage.components && originalMessage.components.length > 0) {
        const row = ActionRowBuilder.from(originalMessage.components[0]);
        row.components.forEach(button => button.setDisabled(true));
        await originalMessage.edit({ components: [row] });
      }
    } catch (editError) {
      console.error('[PAYMENT_HANDLERS] Error editing original message:', editError);
    }
    
    // Send a message to the channel
    await safeChannelSend(interaction.channel, {
      content: `<@${interaction.user.id}> has denied the Terms of Services.\n\nPlease explain why you denied the Terms of Services.\n\nIf no other solution can be found, this order will have to be cancelled.`
    });
  } catch (error) {
    console.error('[PAYMENT_HANDLERS] Error in handlePayPalDenyConfirm:', error);
    // If we can't update, try to reply
    if (!safeInteractionReply(interaction, { 
      content: 'An error occurred while processing your response. Please contact staff.',
      ephemeral: true
    })) {
      // If we can't reply, try to send a message to the channel
      await safeChannelSend(interaction.channel, {
        content: 'An error occurred while processing the Terms of Service denial. Please contact staff.'
      });
    }
  }
}

async function handlePayPalDenyCancel(interaction) {
  try {
    // Just update the confirmation message
    await safeInteractionUpdate(interaction, {
      content: 'Denial cancelled',
      embeds: [],
      components: []
    });
  } catch (error) {
    console.error('[PAYMENT_HANDLERS] Error in handlePayPalDenyCancel:', error);
    // If we can't update, try to reply
    await safeInteractionReply(interaction, { 
      content: 'An error occurred while cancelling. Please try again.',
      ephemeral: true
    });
  }
}

module.exports = {
  handlePayPalAcceptToS,
  handlePayPalDenyToS,
  handlePayPalDenyConfirm,
  handlePayPalDenyCancel
}; 