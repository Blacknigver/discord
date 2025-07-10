const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const { EMBED_COLOR, EMOJIS, PAYMENT_STAFF } = require('../constants');
const { 
  sendStaffPaymentVerificationEmbed,
  sendPaymentConfirmedNotification
} = require('../../ticketPayments');

/**
 * Handle payment completed buttons
 */
const paymentCompletedHandlers = {
  'payment_completed_paypal': async (interaction) => {
    await handlePaymentCompleted(interaction, 'paypal');
  },
  
  'payment_completed_iban': async (interaction) => {
    // For IBAN, skip confirmation and go directly to staff verification
    try {
      await sendStaffPaymentVerificationEmbed(interaction.channel, interaction.user.id, 'iban');
      await interaction.reply({
        content: 'Payment confirmation sent to staff for verification.',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error handling IBAN payment completion:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred. Please try again or contact staff.',
          ephemeral: true
        });
      }
    }
  },
  
  'payment_completed_tikkie': async (interaction) => {
    await handlePaymentCompleted(interaction, 'tikkie');
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
    // Pass user ID and payment type correctly to staff verification embed
    await sendStaffPaymentVerificationEmbed(
      interaction.channel,
      interaction.user.id,
      'paypal'
    );
    await interaction.update({
      content: 'Payment confirmation sent to staff for verification.',
      embeds: [],
      components: []
    });
  },
  
  // IBAN payments skip confirmation and go directly to staff verification
  
  'confirm_payment_tikkie': async (interaction) => {
    await sendStaffPaymentVerificationEmbed(
      interaction.channel,
      interaction.user.id,
      'tikkie'
    );
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
  
  // IBAN payments skip confirmation and go directly to staff verification
  
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
 * Additional staff operation handlers
 */
const additionalStaffHandlers = {
  // Staff payment confirmation/rejection handlers
  'staff_confirm_payment': async (interaction) => {
    try {
      // Extract user ID from customId
      const customIdParts = interaction.customId.split('_');
      const userId = customIdParts[3];
      
      // Check if the user is authorized to confirm
      const authorizedStaff = ['987751357773672538', '986164993080836096'];
      if (!authorizedStaff.includes(interaction.user.id)) {
        return await interaction.reply({
          content: 'You are not authorized to confirm payments.',
          ephemeral: true
        });
      }
      
      // Update button to confirmed state
      const confirmButton = new ButtonBuilder()
        .setCustomId('payment_confirmed')
        .setLabel('Payment Confirmed')
        .setEmoji('<:checkmark:1357478063616688304>')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);
      
      await interaction.update({ components: [new ActionRowBuilder().addComponents(confirmButton)] });
      
      // Send boost available notification
      const { sendBoostAvailableEmbed } = require('../../ticketPayments');
      const orderDetails = {
        current: 'Current Rank/Trophies',
        desired: 'Desired Rank/Trophies',
        price: '€0'
      };
      
      await sendBoostAvailableEmbed(interaction.message, orderDetails);
      
      // Clean up payment method messages AFTER boost available is sent
      const { cleanupMessages } = require('../utils/messageCleanup.js');
      await cleanupMessages(interaction.channel, null, 'payment_confirmed');
    } catch (error) {
      console.error('[PAYMENT] Error handling staff payment confirmation:', error);
      await interaction.reply({
        content: 'An error occurred while confirming the payment.',
        ephemeral: true
      });
    }
  },

  'staff_cancel_payment': async (interaction) => {
    try {
      // Extract user ID from customId
      const customIdParts = interaction.customId.split('_');
      const userId = customIdParts[3];
      
      // Check if the user is authorized to cancel
      const authorizedStaff = ['987751357773672538', '986164993080836096'];
      if (!authorizedStaff.includes(interaction.user.id)) {
        return await interaction.reply({
          content: 'You are not authorized to cancel payments.',
          ephemeral: true
        });
      }
      
      // Update button to cancelled state
      const cancelledButton = new ButtonBuilder()
        .setCustomId('payment_cancelled')
        .setLabel('Payment has not been received.')
        .setEmoji('<:cross:1351689463453061130>')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);
      
      await interaction.update({ components: [new ActionRowBuilder().addComponents(cancelledButton)] });
    } catch (error) {
      console.error('[PAYMENT] Error handling staff payment cancellation:', error);
      await interaction.reply({
        content: 'An error occurred while cancelling the payment.',
        ephemeral: true
      });
    }
  },

  // Payment confirmation after countdown
  'confirm_payment': async (interaction) => {
    try {
      // Delete the confirmation message
      await interaction.update({ content: 'Payment confirmation received.', components: [], embeds: [] });
      
      // Determine the payment type from the previous messages
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      let paymentType = 'unknown';
      
      for (const [_, msg] of messages) {
        if (msg.embeds?.length > 0) {
          const embedTitle = msg.embeds[0].title;
          if (embedTitle?.includes('PayPal')) {
            paymentType = 'paypal';
            break;
          } else if (embedTitle?.includes('IBAN')) {
            paymentType = 'iban';
            break;
          } else if (embedTitle?.includes('Tikkie')) {
            paymentType = 'tikkie';
            break;
          }
        }
      }
      // Send staff verification embed
      await sendStaffPaymentVerificationEmbed(
        interaction.channel,
        interaction.user.id,
        paymentType
      );
    } catch (error) {
      console.error('[PAYMENT] Error handling payment confirmation:', error);
      await interaction.followUp({
        content: 'An error occurred while confirming your payment. Please try again.',
        ephemeral: true
      });
    }
  },

  'cancel_payment_confirm': async (interaction) => {
    try {
      await interaction.update({ content: 'Payment confirmation cancelled.', components: [], embeds: [] });
    } catch (error) {
      console.error('[PAYMENT] Error handling cancel payment confirmation:', error);
    }
  },

  'tikkie_link_expired': tikkieLinkExpiredHandler
};

// Combine all staff operation handlers
const staffOperationsHandlers = {
  ...paymentCompletedHandlers,
  ...paymentConfirmHandlers,
  ...staffConfirmHandlers,
  ...staffCancelHandlers,
  ...additionalStaffHandlers
};

module.exports = {
  staffOperationsHandlers,
  handlePaymentCompleted,
  handleStaffConfirmPayment,
  handleStaffCancelPayment
}; 