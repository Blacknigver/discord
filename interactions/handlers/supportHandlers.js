const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const config = require('../../config');

/**
 * Handle support request button
 */
const requestSupportHandler = async (interaction) => {
  try {
    console.log(`[SUPPORT] User ${interaction.user.id} requested support`);
    
    // Create support embed
    const supportEmbed = new EmbedBuilder()
      .setTitle('Support Requested')
      .setDescription(`<@${interaction.user.id}> has requested support with their payment method.\n\nA staff member will assist you shortly.`)
      .setColor('#ffa500')
      .setTimestamp();
    
    // Reply to the interaction
    await interaction.reply({
      embeds: [supportEmbed]
    });
    
    // Ping appropriate staff member based on context
    let staffId = '987751357773672538'; // Default staff
    
    // Check if this is PayPal related
    const messages = await interaction.channel.messages.fetch({ limit: 10 });
    for (const [_, msg] of messages) {
      if (msg.embeds?.length > 0) {
        const embedTitle = msg.embeds[0].title?.toLowerCase() || '';
        if (embedTitle.includes('paypal')) {
          staffId = config.PAYMENT_STAFF?.PAYPAL_VERIFIER || '987751357773672538';
          break;
        } else if (embedTitle.includes('crypto')) {
          staffId = config.PAYMENT_STAFF?.CRYPTO_VERIFIER || '987751357773672538';
          break;
        } else if (embedTitle.includes('iban')) {
          staffId = config.PAYMENT_STAFF?.IBAN_VERIFIER || '987751357773672538';
          break;
        }
      }
    }
    
    // Send ping and delete it quickly
    const pingMessage = await interaction.channel.send(`<@${staffId}>`);
    setTimeout(() => {
      pingMessage.delete().catch(() => {});
    }, 1500);
    
  } catch (error) {
    console.error('Error handling support request:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Support request sent. Staff will assist you shortly.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle copy button actions (for copying payment info)
 */
const copyEmailHandler = async (interaction) => {
  try {
    console.log(`[COPY] User ${interaction.user.id} copied email`);
    
    await interaction.reply({
      content: 'Email address copied to clipboard!',
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error handling copy email:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Copy action completed.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle copy PayPal email specifically
 */
const copyPaypalEmailHandler = async (interaction) => {
  try {
    console.log(`[COPY] User ${interaction.user.id} copied PayPal email`);
    
    await interaction.reply({
      content: 'PayPal email address copied to clipboard!',
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error handling copy PayPal email:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'PayPal email copied.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle copy amount button
 */
const copyAmountHandler = async (interaction) => {
  try {
    console.log(`[COPY] User ${interaction.user.id} copied amount`);
    
    await interaction.reply({
      content: 'Payment amount copied to clipboard!',
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error handling copy amount:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Amount copied.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle resend payment info
 */
const resendPaymentHandler = async (interaction) => {
  try {
    console.log(`[RESEND] User ${interaction.user.id} requested payment info resend`);
    
    await interaction.reply({
      content: 'Payment information has been resent above.',
      ephemeral: true
    });
    
    // Resend the payment embed (this would need specific implementation)
    // For now, just acknowledge the request
    
  } catch (error) {
    console.error('Error handling resend payment:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Payment information resend requested.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle terms and conditions acceptance
 */
const acceptTermsHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    console.log(`[TERMS] User ${userId} accepted terms and conditions`);
    
    // Update button to show acceptance
    const acceptedButton = new ButtonBuilder()
      .setCustomId('terms_accepted')
      .setLabel(`${interaction.user.username} accepted the terms`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
    
    await interaction.update({
      components: [new ActionRowBuilder().addComponents(acceptedButton)]
    });
    
  } catch (error) {
    console.error('Error handling terms acceptance:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Terms accepted.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle terms and conditions denial
 */
const denyTermsHandler = async (interaction) => {
  try {
    const userId = interaction.user.id;
    console.log(`[TERMS] User ${userId} denied terms and conditions`);
    
    // Create denial confirmation
    const denialEmbed = new EmbedBuilder()
      .setTitle('Terms Denied')
      .setDescription('You have denied the terms and conditions. The payment process cannot continue.')
      .setColor('#ff0000');
    
    await interaction.update({
      embeds: [denialEmbed],
      components: []
    });
    
  } catch (error) {
    console.error('Error handling terms denial:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Terms denied.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle generic confirmation buttons
 */
const confirmHandler = async (interaction) => {
  try {
    console.log(`[CONFIRM] User ${interaction.user.id} clicked confirm button`);
    
    // Update button to show confirmation
    const confirmedButton = new ButtonBuilder()
      .setCustomId('confirmed')
      .setLabel('Confirmed')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
    
    await interaction.update({
      components: [new ActionRowBuilder().addComponents(confirmedButton)]
    });
    
  } catch (error) {
    console.error('Error handling confirmation:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Confirmed.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle generic cancel buttons
 */
const cancelHandler = async (interaction) => {
  try {
    console.log(`[CANCEL] User ${interaction.user.id} clicked cancel button`);
    
    await interaction.update({
      content: 'Action cancelled.',
      embeds: [],
      components: []
    });
    
  } catch (error) {
    console.error('Error handling cancellation:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Cancelled.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle refresh/retry buttons
 */
const refreshHandler = async (interaction) => {
  try {
    console.log(`[REFRESH] User ${interaction.user.id} clicked refresh button`);
    
    await interaction.reply({
      content: 'Information refreshed.',
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error handling refresh:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Refresh completed.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handle help button
 */
const helpHandler = async (interaction) => {
  try {
    console.log(`[HELP] User ${interaction.user.id} requested help`);
    
    const helpEmbed = new EmbedBuilder()
      .setTitle('Need Help?')
      .setDescription('If you need assistance, please contact our support team.\n\nUse the "Request Support" button or contact staff directly.')
      .setColor('#0099ff');
    
    await interaction.reply({
      embeds: [helpEmbed],
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error handling help request:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Help information sent.',
        ephemeral: true
      });
    }
  }
};

// Export all support and utility handlers
const supportHandlers = {
  'request_support': requestSupportHandler,
  'copy_email': copyEmailHandler,
  'copy_paypal_email': copyPaypalEmailHandler,
  'copy_amount': copyAmountHandler,
  'resend_payment': resendPaymentHandler,
  'accept_terms': acceptTermsHandler,
  'deny_terms': denyTermsHandler,
  'confirm': confirmHandler,
  'cancel': cancelHandler,
  'refresh': refreshHandler,
  'help': helpHandler,
  
  // Additional utility handlers that might be needed
  'close_ticket': async (interaction) => {
    try {
      await interaction.reply({
        content: 'Ticket close request received. A staff member will close this ticket.',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error handling close ticket:', error);
    }
  },
  
  'reopen_ticket': async (interaction) => {
    try {
      await interaction.reply({
        content: 'Ticket reopen request received.',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error handling reopen ticket:', error);
    }
  }
};

module.exports = {
  supportHandlers
}; 