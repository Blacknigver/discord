const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');

// Import existing handlers
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

const { 
  handleTicketConfirm,
  handleTicketCancel
} = require('../../src/modules/ticketFlow.js');

/**
 * Support request handler
 */
const requestSupportHandler = async (interaction) => {
  try {
    console.log(`[SUPPORT] User ${interaction.user.id} requested support`);
    
    const supportEmbed = new EmbedBuilder()
      .setTitle('Support Requested')
      .setDescription([
        'A staff member will assist you shortly.',
        '',
        'Please describe your issue or question below.',
        '',
        'Common topics:',
        '• Payment concerns',
        '• Technical issues', 
        '• Order questions',
        '• General support'
      ].join('\n'))
      .setColor('#3498db')
      .setTimestamp();

    // Ping support staff
    const supportRoleId = '986164993080836096';
    const pingMsg = await interaction.channel.send(`<@&${supportRoleId}> Support requested by ${interaction.user}`);
    
    await interaction.reply({
      embeds: [supportEmbed],
      ephemeral: true
    });
    
    // Clean up ping after 2 seconds
    setTimeout(() => {
      pingMsg.delete().catch(() => {});
    }, 2000);
    
    return true;
  } catch (error) {
    console.error('[SUPPORT] Error handling support request:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please contact staff directly.',
        ephemeral: true
      });
    }
  }
};

/**
 * Generic button handler for disabled/processed buttons
 */
const processedButtonHandler = async (interaction) => {
  await interaction.reply({
    content: 'This action has already been processed.',
    ephemeral: true
  });
};

/**
 * Comprehensive collection of ALL missing handlers
 */
const allMissingHandlers = {
  // =========================
  // CRITICAL PAYPAL HANDLERS (matching actual button IDs)
  // =========================
  'paypal_accept': handlePayPalAcceptToS,
  'paypal_deny': handlePayPalDenyToS,
  'request_support': requestSupportHandler,
  
  // =========================
  // TICKET CONFIRMATION HANDLERS
  // =========================
  'confirm_ticket': handleTicketConfirm,
  'cancel_ticket': handleTicketCancel,
  'ticket_confirm': handleTicketConfirm,
  'ticket_cancel': handleTicketCancel,
  'confirm_order': handleTicketConfirm,
  'cancel_order': handleTicketCancel,
  
  // =========================
  // PAYPAL WORKFLOW HANDLERS
  // =========================
  'paypal_deny_confirm': handlePayPalDenyConfirm,
  'paypal_deny_cancel': handlePayPalDenyCancel,
  'paypal_accept_tos': handlePayPalAcceptToS,
  'paypal_deny_tos': handlePayPalDenyToS,
  'paypal_tos_accepted': processedButtonHandler,
  'paypal_terms_confirmed': processedButtonHandler,
  'paypal_payment_not_received_confirmed': processedButtonHandler,
  'copy_email': handlePayPalCopyEmail,
  'payment_completed_paypal': handlePayPalPaymentCompleted,
  'payment_received': handlePayPalPaymentReceived,
  'payment_not_received': handlePayPalPaymentNotReceived,
  'claim_boost': handleClaimBoost,
  
  // =========================
  // SUPPORT HANDLERS
  // =========================
  'support_general': requestSupportHandler,
  'paypal_support': requestSupportHandler,
  'crypto_support': requestSupportHandler,
  'iban_support': requestSupportHandler,
  'help_request': requestSupportHandler,
  
  // =========================
  // PAYMENT STATUS HANDLERS
  // =========================
  'payment_confirmed_done': processedButtonHandler,
  'payment_cancelled_done': processedButtonHandler,
  'payment_processing': processedButtonHandler,
  'payment_verified': processedButtonHandler,
  
  // =========================
  // CRYPTO HANDLERS (commonly missing)
  // =========================
  'crypto_confirmed': processedButtonHandler,
  'crypto_cancelled': processedButtonHandler,
  'btc_confirmed': processedButtonHandler,
  'ltc_confirmed': processedButtonHandler,
  'sol_confirmed': processedButtonHandler,
  'usdt_confirmed': processedButtonHandler,
  
  // =========================
  // BOOST STATUS HANDLERS
  // =========================
  'boost_accepted': processedButtonHandler,
  'boost_declined': processedButtonHandler,
  'boost_in_progress': processedButtonHandler,
  'booster_assigned': processedButtonHandler,
  
  // =========================
  // TICKET STATUS HANDLERS
  // =========================
  'ticket_created': processedButtonHandler,
  'ticket_closed': processedButtonHandler,
  'ticket_archived': processedButtonHandler,
  'order_processing': processedButtonHandler,
  'order_confirmed': processedButtonHandler,
  
  // =========================
  // GIFTCARD HANDLERS
  // =========================
  'giftcard_confirmed': processedButtonHandler,
  'apple_giftcard_confirmed': processedButtonHandler,
  'paypal_giftcard_confirmed': processedButtonHandler,
  'bol_giftcard_confirmed': processedButtonHandler,
  
  // =========================
  // STAFF ACTION HANDLERS
  // =========================
  'staff_approved': processedButtonHandler,
  'staff_rejected': processedButtonHandler,
  'admin_override': processedButtonHandler,
  'moderator_action': processedButtonHandler,
  
  // =========================
  // LINK/EXPIRY HANDLERS
  // =========================
  'link_expired': async (interaction) => {
    await interaction.reply({
      content: 'This link has expired. Please request a new one.',
      ephemeral: true
    });
  },
  'session_expired': async (interaction) => {
    await interaction.reply({
      content: 'Your session has expired. Please start over.',
      ephemeral: true
    });
  },
  
  // =========================
  // AFFILIATE HANDLERS (additional ones that might be missing)
  // =========================
  'affiliate_request_approved': processedButtonHandler,
  'affiliate_request_denied': processedButtonHandler,
  'withdrawal_approved': processedButtonHandler,
  'withdrawal_denied': processedButtonHandler,
  
  // =========================
  // DYNAMIC HANDLERS
  // =========================
  // These handle buttons with dynamic IDs
  'dynamic_handler': async (interaction) => {
    const customId = interaction.customId;
    
    // Handle ticket confirmations with IDs
    if (customId.startsWith('confirm_ticket_')) {
      return handleTicketConfirm(interaction);
    }
    
    // Handle ticket cancellations with IDs  
    if (customId.startsWith('cancel_ticket_')) {
      return handleTicketCancel(interaction);
    }
    
    // Handle PayPal verifications with IDs
    if (customId.startsWith('paypal_verify_')) {
      const paypalVerifier = interaction.client.handlers.get('paypalVerifier');
      if (paypalVerifier) {
        return paypalVerifier.handleVerificationResponse(interaction);
      }
    }

    // Handle staff payment confirmation buttons
    if (customId.startsWith('staff_confirm_payment_') || customId.startsWith('staff_cancel_payment_')) {
      const { handleStaffConfirmPayment, handleStaffCancelPayment } = require('../../src/handlers/staffOperationsHandlers.js');
      try {
        if (customId.startsWith('staff_confirm_payment_')) {
          // Extract payment method from ID, e.g., staff_confirm_payment_iban_user_verifier
          const parts = customId.split('_');
          const paymentMethod = parts[3]; // The payment method string after confirm_payment
          return await handleStaffConfirmPayment(interaction, paymentMethod);
        } else {
          const parts = customId.split('_');
          const paymentMethod = parts[3];
          return await handleStaffCancelPayment(interaction, paymentMethod);
        }
      } catch (error) {
        console.error('[STAFF_PAYMENT] Error handling staff payment button:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'An error occurred while processing staff payment action.',
            ephemeral: true
          });
        }
        return false;
      }
    }
    
    // Default response for unhandled dynamic buttons
    await interaction.reply({
      content: 'This action is not currently available.',
      ephemeral: true
    });
  },

  // =========================
  // ADDITIONAL MISSING HANDLERS (commonly used patterns)
  // =========================
  
  // Generic status handlers
  'cancelled': processedButtonHandler,
  'accepted': processedButtonHandler,
  'declined': processedButtonHandler,
  'pending': processedButtonHandler,
  'processing': processedButtonHandler,
  'completed': processedButtonHandler,
  'delivered': processedButtonHandler,
  'verified': processedButtonHandler,
  'unverified': processedButtonHandler,
  
  // Staff action handlers
  'approve': processedButtonHandler,
  'reject': processedButtonHandler,
  'review': processedButtonHandler,
  'escalate': processedButtonHandler,
  'override': processedButtonHandler,
  
  // Ticket system handlers
  'ticket_created': processedButtonHandler,
  'ticket_accepted': processedButtonHandler,
  'ticket_rejected': processedButtonHandler,
  'ticket_pending': processedButtonHandler,
  'ticket_processing': processedButtonHandler,
  'ticket_review': processedButtonHandler,
  
  // Payment system handlers
  'payment_pending': processedButtonHandler,
  'payment_processing': processedButtonHandler,
  'payment_failed': processedButtonHandler,
  'payment_success': processedButtonHandler,
  'payment_refunded': processedButtonHandler,
  'payment_disputed': processedButtonHandler,
  
  // Boost system handlers
  'boost_requested': processedButtonHandler,
  'boost_assigned': processedButtonHandler,
  'boost_started': processedButtonHandler,
  'boost_paused': processedButtonHandler,
  'boost_resumed': processedButtonHandler,
  'boost_finished': processedButtonHandler,
  'boost_cancelled': processedButtonHandler,
  
  // Order system handlers
  'order_placed': processedButtonHandler,
  'order_accepted': processedButtonHandler,
  'order_rejected': processedButtonHandler,
  'order_cancelled': processedButtonHandler,
  'order_refunded': processedButtonHandler,
  'order_disputed': processedButtonHandler,
  
  // Profile system handlers
  'profile_uploaded': processedButtonHandler,
  'profile_verified': processedButtonHandler,
  'profile_rejected': processedButtonHandler,
  'profile_completed': processedButtonHandler,
  'profile_cancelled': processedButtonHandler,
  
  // Link system handlers
  'link_generated': processedButtonHandler,
  'link_accessed': processedButtonHandler,
  'link_used': processedButtonHandler,
  'link_disabled': processedButtonHandler,
  
  // Notification handlers
  'notification_read': processedButtonHandler,
  'notification_dismissed': processedButtonHandler,
  'notification_action': processedButtonHandler,
  
  // Generic interaction handlers
  'continue': processedButtonHandler,
  'next': processedButtonHandler,
  'previous': processedButtonHandler,
  'back': processedButtonHandler,
  'retry': processedButtonHandler,
  'refresh': processedButtonHandler,
  'reload': processedButtonHandler,
  'update': processedButtonHandler,
  'save': processedButtonHandler,
  'submit': processedButtonHandler,
  'send': processedButtonHandler,
  'done': processedButtonHandler,
  'finish': processedButtonHandler,
  'close': processedButtonHandler,
  'dismiss': processedButtonHandler,
  'ignore': processedButtonHandler,
  'skip': processedButtonHandler,
  
  // Error state handlers
  'error_retry': processedButtonHandler,
  'error_report': processedButtonHandler,
  'error_dismiss': processedButtonHandler,
  'timeout_retry': processedButtonHandler,
  'failed_retry': processedButtonHandler,
  
  // Legacy/Deprecated handlers (in case old buttons still exist)
  'legacy_button': processedButtonHandler,
  'deprecated_action': processedButtonHandler,
  'old_handler': processedButtonHandler,
  'unused_button': processedButtonHandler,
  
  // Generic fallback handlers with common patterns
  'btn_': processedButtonHandler,
  'action_': processedButtonHandler,
  'status_': processedButtonHandler,
  'update_': processedButtonHandler,
  'confirm_': processedButtonHandler,
  'cancel_': processedButtonHandler,
  'paypal_email': processedButtonHandler,
  'iban_number': processedButtonHandler,
  'bank_name': processedButtonHandler,
  'account_holder': processedButtonHandler,
  'terms_accepted': processedButtonHandler,
  'confirmed': processedButtonHandler,
  'boost_completed': processedButtonHandler,
  'boost_cancel': processedButtonHandler,
  'boost_is_completed': processedButtonHandler,
  'boost_not_completed': processedButtonHandler,
  'boost_confirm_completed': processedButtonHandler,
  'boost_confirm_not_completed': processedButtonHandler,
  'boost_not_completed_status': processedButtonHandler,
  'payout_completed': processedButtonHandler,
  'payout_completed_done': processedButtonHandler,
  'profile_payout_completed': processedButtonHandler,
  'paypal_payment_received': handlePayPalPaymentReceived,
  'paypal_payment_not_received': handlePayPalPaymentNotReceived,
  'confirm_deny': processedButtonHandler,
  'cancel_deny': processedButtonHandler,
  'paypal_terms_confirmed': processedButtonHandler
};

module.exports = {
  allMissingHandlers,
  requestSupportHandler,
  processedButtonHandler
}; 