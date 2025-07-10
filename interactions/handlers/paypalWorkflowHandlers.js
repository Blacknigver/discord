const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');

// Import existing PayPal handlers
const {
  handlePayPalAcceptToS,
  handlePayPalDenyToS,
  handlePayPalDenyConfirm,
  handlePayPalDenyCancel,
  handlePayPalCopyEmail,
  handlePayPalPaymentCompleted,
  handlePayPalPaymentReceived,
  handlePayPalPaymentNotReceived,
  handleClaimBoost
} = require('../../src/handlers/paypalButtonHandler.js');

/**
 * Handler for request_support button
 */
const requestSupportHandler = async (interaction) => {
  try {
    console.log(`[PAYPAL_SUPPORT] User ${interaction.user.id} requested support`);
    
    // Send support embed with instructions
    const supportEmbed = new EmbedBuilder()
      .setTitle('Support Requested')
      .setDescription([
        'A staff member will assist you shortly.',
        '',
        'In the meantime, please describe your issue or question.',
        '',
        'Common questions:',
        '• Payment method concerns',
        '• Technical difficulties',
        '• Order modifications',
        '• General support'
      ].join('\n'))
      .setColor('#3498db')
      .setTimestamp();

    // Ping support staff
    const pingMsg = await interaction.channel.send(`<@&986164993080836096> Support requested by ${interaction.user}`);
    
    // Reply to user
    await interaction.reply({
      embeds: [supportEmbed],
      ephemeral: true
    });
    
    // Delete ping after 2 seconds
    setTimeout(() => {
      pingMsg.delete().catch(() => {});
    }, 2000);
    
    return true;
  } catch (error) {
    console.error('Error handling support request:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while requesting support. Please try again or contact staff directly.',
        ephemeral: true
      });
    }
  }
};

// PayPal workflow handlers using the ACTUAL button IDs from the code
const paypalWorkflowHandlers = {
  // CRITICAL: These match the actual button IDs used in ticketPayments.js
  'paypal_accept': handlePayPalAcceptToS,         // Maps to actual button ID
  'paypal_deny': handlePayPalDenyToS,             // Maps to actual button ID  
  'request_support': requestSupportHandler,        // Maps to actual button ID
  
  // Additional PayPal handlers with correct IDs
  'paypal_deny_confirm': handlePayPalDenyConfirm,
  'paypal_deny_cancel': handlePayPalDenyCancel,
  'copy_email': handlePayPalCopyEmail,
  'payment_completed_paypal': handlePayPalPaymentCompleted,
  'payment_received': handlePayPalPaymentReceived,
  'payment_not_received': handlePayPalPaymentNotReceived,
  'claim_boost': handleClaimBoost,
  
  // Alternative naming patterns that might be used
  'paypal_accept_tos': handlePayPalAcceptToS,
  'paypal_deny_tos': handlePayPalDenyToS,
  'paypal_tos_accepted': handlePayPalAcceptToS,
  'paypal_terms_confirmed': handlePayPalAcceptToS,
  'paypal_payment_not_received_confirmed': async (interaction) => {
    // Handler for disabled button - just acknowledge
    await interaction.reply({
      content: 'Payment status has already been processed.',
      ephemeral: true
    });
  }
};

module.exports = {
  paypalWorkflowHandlers,
  requestSupportHandler
}; 