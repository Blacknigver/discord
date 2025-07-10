// Interaction handler for button clicks, select menus, modals, etc.
const { 
  handleRankedRankSelection, 
  handleMasterySelection, 
  handlePaymentMethodSelect,
  handleDutchMethodSelect,
  handleTicketConfirm,
  handleTicketCancel
} = require('../modules/ticketFlow.js');

// Import modal handlers from modalHandlers.js
const {
  handleMasteryBrawlerModal, 
  handleBulkTrophiesModal
} = require('../modules/modalHandlers.js');
const { handleCryptoButtons, handleCryptoTxFormSubmit } = require('./cryptoPaymentHandler.js');
const { 
  handlePayPalPaymentCompleted, 
  handlePayPalPaymentReceived, 
  handlePayPalPaymentNotReceived,
  handlePayPalAcceptToS,
  handlePayPalDenyToS,
  handlePayPalDenyConfirm,
  handlePayPalDenyCancel,
  handlePayPalCopyEmail,
  handleClaimBoost
} = require('./paypalButtonHandler.js');

// Extract withdrawal modal handling into a separate function
async function handleWithdrawalModal(interaction) {
  const customId = interaction.customId;
  
  if(customId==='withdraw_paypal_modal' || customId==='withdraw_iban_modal' || customId.startsWith('withdraw_crypto_modal_') ){
    const db=require('../../database');
    await db.waitUntilConnected().catch(()=>{});
    const method = customId==='withdraw_paypal_modal'? 'PayPal': (customId==='withdraw_iban_modal'?'IBAN':'Crypto-'+customId.split('_').pop().toUpperCase());
    let destField='';
    if(method==='PayPal') destField='paypal_email';
    else if(method==='IBAN') destField='iban';
    else destField='wallet';
    const emailOrIban = interaction.fields.getTextInputValue(destField) || '';
    let amountStr = interaction.fields.getTextInputValue('withdraw_amount') || '';
    const userId = interaction.user.id;
    const client = await db.pool.connect();
    let amount = 0; // declare here so available after transaction
    try{
      await client.query('BEGIN');
      const balRes = await client.query('SELECT balance FROM affiliate_links WHERE user_id=$1 FOR UPDATE', [userId]);
      let balance = balRes.rowCount? parseFloat(balRes.rows[0].balance):0;
      amount = amountStr.trim()===''? balance: parseFloat(amountStr.replace(',','.'));
      if(isNaN(amount) || amount<=0){
        await interaction.reply({content:'Invalid amount.',ephemeral:true}); await client.query('ROLLBACK'); client.release(); return;
      }
      if(amount>balance){await interaction.reply({content:'Amount exceeds balance.',ephemeral:true}); await client.query('ROLLBACK'); client.release(); return;}
      amount = parseFloat(amount.toFixed(2));
      // deduct
      await client.query('UPDATE affiliate_links SET balance = balance - $2 WHERE user_id=$1', [userId, amount]);
      const ins= await client.query('INSERT INTO affiliate_withdrawals(user_id, amount, method, details) VALUES($1,$2,$3,$4) RETURNING withdrawal_id', [userId, amount, method, JSON.stringify({dest:emailOrIban})]);
      var withdrawalId = ins.rows[0].withdrawal_id;
      await client.query('COMMIT');
    }catch(err){await client.query('ROLLBACK'); client.release(); console.error('[WITHDRAW_TX] ',err); await interaction.reply({content:'Error processing withdrawal.',ephemeral:true}); return;}
    client.release();
    // fetch top earners
    let topLines='';
    try{
      const top= await db.query('SELECT referred_id, SUM(amount) AS total, MAX(earning_type) AS et FROM affiliate_earnings WHERE referrer_id=$1 GROUP BY referred_id ORDER BY total DESC LIMIT 5',[userId]);
      let idx=1; for(const row of top.rows){ topLines += `${idx}. <@${row.referred_id}> - \`€${parseFloat(row.total).toFixed(2)}\`\n- Earning Type: ${row.et}\n`; idx++; }
    }catch{}
    const { EmbedBuilder } = require('discord.js');
    const staffChannelId='1391928194008879216';
    const staffPing= method.startsWith('PayPal')?'<@986164993080836096>':'<@987751357773672538>';
    const embed=new EmbedBuilder().setTitle('New Withdrawal').setColor(0xe68df2).setDescription(`**User:** <@${userId}>\n**Payout Method:** \`${method}\`\n**Amount:** \`€${amount.toFixed(2)}\`\n${method==='PayPal'?`**PayPal E-Mail:** ${emailOrIban}`: (method.startsWith('Crypto')?`**Wallet Address:** ${emailOrIban}`:`**IBAN:** ${emailOrIban}`)}\n\nUsers they referred:\n${topLines||'None'}`);
    // Buttons for staff actions
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`withdraw_complete_${withdrawalId}`).setLabel('Completed').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`withdraw_cancel_nrf_${withdrawalId}`).setLabel('Cancel - No Refund').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`withdraw_cancel_refund_${withdrawalId}`).setLabel('Cancel - Refund').setEmoji('<:moneyy:1391899345208606772>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`withdraw_copy_${withdrawalId}`).setLabel('Copy').setEmoji('<:copy:1372240644013035671>').setStyle(ButtonStyle.Primary)
    );
    try{ const ch=interaction.client.channels.cache.get(staffChannelId); if(ch) await ch.send({content:staffPing,embeds:[embed],components:[actionRow]}); }catch(err){console.error('[WITHDRAW_LOG] ',err);} 
    await interaction.reply({content:`Withdrawal request for €${amount.toFixed(2)} submitted!`,ephemeral:true});
    return;
  }
  
  return false;
}

// Handle button interactions
async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;
  
  try {
    console.log(`[INTERACTION] Button clicked: ${customId} by user ${interaction.user.id}`);
    
    // Handle ranked flow buttons
    if (customId.startsWith('ranked_')) {
      const rankInput = customId.replace('ranked_', '');
      return handleRankedRankSelection(interaction, rankInput);
    }
    
    // Handle mastery flow buttons
    if (customId.startsWith('mastery_')) {
      const masteryInput = customId.replace('mastery_', '');
      return handleMasterySelection(interaction, masteryInput);
    }
    
    // Handle ticket confirmation buttons
    if (customId === 'confirm_ticket') {
      return handleTicketConfirm(interaction);
    }
    
    // Handle ticket cancellation buttons
    if (customId === 'cancel_ticket') {
      return handleTicketCancel(interaction);
    }
    
    // Handle crypto payment buttons
    if (customId.startsWith('payment_completed_') || customId.startsWith('copy_')) {
      // These are handled in interactions/buttonHandlers.js to prevent duplicates
      // Only handle if not already handled by the main button handlers
      if (customId.startsWith('payment_completed_crypto_') || customId.startsWith('copy_') && !customId.includes('address')) {
      return handleCryptoButtons(interaction);
      }
      // Let other handlers handle the main crypto buttons
      return false;
    }
    
    // Remove handler for payment_completed_paypal to prevent duplicates
    
    if (customId === 'payment_received') {
      console.log(`[PAYMENT_HANDLER] PayPal payment confirmed by staff ${interaction.user.id}`);
      return handlePayPalPaymentReceived(interaction);
    }
    
    if (customId === 'payment_not_received') {
      console.log(`[PAYMENT_HANDLER] PayPal payment rejected by staff ${interaction.user.id}`);
      return handlePayPalPaymentNotReceived(interaction);
    }
    
    // Handle PayPal ToS buttons
    if (customId === 'paypal_accept') {
      return handlePayPalAcceptToS(interaction);
    }
    
    if (customId === 'paypal_deny') {
      return handlePayPalDenyToS(interaction);
    }
    
    if (customId === 'paypal_deny_confirm') {
      return handlePayPalDenyConfirm(interaction);
    }
    
    if (customId === 'paypal_deny_cancel') {
      return handlePayPalDenyCancel(interaction);
    }
    
    if (customId === 'copy_email') {
      return handlePayPalCopyEmail(interaction);
    }
    
    if (customId === 'claim_boost') {
      return handleClaimBoost(interaction);
    }
    
    // Handle PayPal verification buttons
    if (customId.startsWith('paypal_verify_approve_') || customId.startsWith('paypal_verify_reject_')) {
      const paypalVerifier = interaction.client.handlers.get('paypalVerifier');
      if (paypalVerifier) {
        return paypalVerifier.handleVerificationResponse(interaction);
      }
    }
    
    // Handle other button types here...
    
    console.warn(`[INTERACTION] Unhandled button interaction: ${customId}`);
    return false;
  } catch (error) {
    console.error(`[INTERACTION] Error handling button ${customId}: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred processing your request. Please try again.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'An error occurred processing your request. Please try again.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[INTERACTION] Error replying to interaction: ${replyError.message}`);
    }
    
    return false;
  }
}

// Handle select menu interactions
async function handleSelectMenuInteraction(interaction) {
  const customId = interaction.customId;
  
  try {
    console.log(`[INTERACTION] Select menu used: ${customId} by user ${interaction.user.id}, values: ${interaction.values}`);
    
    // Import handlers from paymentHandlers.js
    const { allButtonHandlers } = require('../../paymentHandlers.js');
    
    // Handle payment method selection using the comprehensive handler
    if (customId === 'payment_method_select') {
      if (allButtonHandlers.payment_method_select) {
        return allButtonHandlers.payment_method_select(interaction);
      }
      return handlePaymentMethodSelect(interaction);
    }
    
    // Handle Dutch payment method selection using the comprehensive handler
    if (customId === 'dutch_method_select') {
      if (allButtonHandlers.dutch_method_select) {
        return allButtonHandlers.dutch_method_select(interaction);
      }
      return handleDutchMethodSelect(interaction);
    }
    
    // Handle crypto type selection using the comprehensive handler
    if (customId === 'crypto_type_select' || customId === 'crypto_select') {
      if (allButtonHandlers.crypto_select) {
        return allButtonHandlers.crypto_select(interaction);
      }
      return handleCryptoTypeSelect(interaction);
    }
    
    // Handle other select menu types here...
    
    console.warn(`[INTERACTION] Unhandled select menu interaction: ${customId}`);
    return false;
  } catch (error) {
    console.error(`[INTERACTION] Error handling select menu ${customId}: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred processing your selection. Please try again.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'An error occurred processing your selection. Please try again.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[INTERACTION] Error replying to interaction: ${replyError.message}`);
    }
    
    return false;
  }
}

// Handle modal submissions
async function handleModalSubmit(interaction) {
  const customId = interaction.customId;
  
  try {
    console.log(`[INTERACTION] Modal submitted: ${customId} by user ${interaction.user.id}`);
    
    // Handle bulk trophies modal
    if (customId === 'modal_bulk_trophies') {
      return handleBulkTrophiesModal(interaction);
    }
    
    // Handle mastery brawler modal
    if (customId === 'modal_mastery_brawler') {
      return handleMasteryBrawlerModal(interaction);
    }
    
    // Handle review modal submissions
    if (customId.startsWith('review_modal_')) {
      const { reviewFeedbackModalHandlers } = require('../../paymentHandlers.js');
      if (reviewFeedbackModalHandlers && reviewFeedbackModalHandlers['review_modal']) {
        return reviewFeedbackModalHandlers['review_modal'](interaction);
      }
    }
    
    // Handle feedback modal submissions
    if (customId.startsWith('feedback_modal_')) {
      const { reviewFeedbackModalHandlers } = require('../../paymentHandlers.js');
      if (reviewFeedbackModalHandlers && reviewFeedbackModalHandlers['feedback_modal']) {
        return reviewFeedbackModalHandlers['feedback_modal'](interaction);
      }
    }
    
    // Handle crypto transaction form
    if (customId.startsWith('crypto_tx_form_')) {
      return handleCryptoTxFormSubmit(interaction);
    }
    
    // Handle Bitcoin transaction modal
    if (customId === 'bitcoin_tx_modal') {
      const { handleBitcoinTxModalSubmission } = require('../../ticketPayments.js');
      return handleBitcoinTxModalSubmission(interaction);
    }
    
    // Handle Litecoin transaction modal
    if (customId === 'litecoin_tx_modal') {
      const { handleLitecoinTxModalSubmission } = require('../../ticketPayments.js');
      return handleLitecoinTxModalSubmission(interaction);
    }
    
    // Handle Solana transaction modal
    if (customId === 'solana_tx_modal') {
      const { handleSolanaTxModalSubmission } = require('../../ticketPayments.js');
      return handleSolanaTxModalSubmission(interaction);
    }
    
    // Handle crypto other modal (for custom crypto coins)
    if (customId === 'modal_crypto_other' || customId === 'modal_other_crypto') {
      const { handleOtherCryptoModal } = require('../modules/paymentMethodHandlers.js');
      return handleOtherCryptoModal(interaction);
    }
    
    // Handle PayPal Giftcard modal
    if (customId === 'modal_paypal_giftcard') {
      const { handlePayPalGiftcardModal } = require('../modules/paymentMethodHandlers.js');
      return handlePayPalGiftcardModal(interaction);
    }
    
    // Handle withdrawal modals
    if(customId==='withdraw_paypal_modal' || customId==='withdraw_iban_modal' || customId.startsWith('withdraw_crypto_modal_') ){
      return handleWithdrawalModal(interaction);
    }

    // Handle withdrawal cancel/refund modals
    if (customId.startsWith('withdraw_cancel_modal_')) {
      const db = require('../../database');
      await db.waitUntilConnected().catch(() => {});
      const parts = customId.split('_');
      // Format: withdraw_cancel_modal_<type>_<id>_<messageId>
      const type = parts[3]; // 'nrf' or 'refund'
      const withdrawalId = parseInt(parts[4]);
      const sourceMessageId = parts[5];

      // Fetch reason (optional)
      let reason = '';
      try { reason = interaction.fields.getTextInputValue('reason')?.trim() || ''; } catch {}

      const client = await db.pool.connect();
      let w; // to store withdrawal row for later use
      try {
        await client.query('BEGIN');

        // Fetch withdrawal row (for amount & user)
        const wRes = await client.query('SELECT user_id, amount, method, details FROM affiliate_withdrawals WHERE withdrawal_id=$1 FOR UPDATE', [withdrawalId]);
        if (wRes.rowCount === 0) {
          await interaction.reply({ content: 'Unknown withdrawal request.', ephemeral: true });
          await client.query('ROLLBACK');
          client.release();
          return;
        }
        w = wRes.rows[0];

        // If refund path, return funds to balance
        if (type === 'refund') {
          await client.query('UPDATE affiliate_links SET balance = balance + $2 WHERE user_id=$1', [w.user_id, w.amount]);
        }

        // Update withdrawal status and append reason into details JSON
        const detailsObj = typeof w.details==='string'? (w.details?JSON.parse(w.details):{}): (w.details||{});
        let newDetails;
        try {
          const detObj = detailsObj;
          if (reason) detObj.cancel_reason = reason;
          detObj.cancel_type = type;
          newDetails = JSON.stringify(detObj);
        } catch {
          newDetails = w.details;
        }

        await client.query('UPDATE affiliate_withdrawals SET status=$2, details=$3 WHERE withdrawal_id=$1', [withdrawalId, type === 'refund' ? 'cancelled_refund' : 'cancelled', newDetails]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        client.release();
        console.error('[WITHDRAW_CANCEL] ', err);
        await interaction.reply({ content: 'Error processing cancellation.', ephemeral: true });
        return;
      }
      client.release();

      // Notify the user about the cancellation via DM
      try {
        const userObj = await interaction.client.users.fetch(w.user_id);
        if (userObj) {
          const { EmbedBuilder } = require('discord.js');
          const dmEmbed = new EmbedBuilder()
            .setColor(type === 'refund' ? 0x4a90e2 : 0xff0000)
            .setTitle('Payout Cancelled' + (type==='refund'?' - Money Refunded':''))
            .setDescription(`Your ${w.method} withdrawal of \`€${parseFloat(w.amount).toFixed(2)}\` has been cancelled by <@${interaction.user.id}>.\n\n${type==='refund' ? 'Your money has been refunded' : 'Your money will not be refunded'}, for ${type==='refund' ? 'more information' : 'support'} please open a ticket at https://discord.com/channels/1292895164595175444/1292896201859141722 in the category 'Other'.\n\n**Reason:**\n\`${reason||'None Provided'}\``)
            .setTimestamp();
          await userObj.send({ embeds: [dmEmbed] }).catch(() => {});
        }
      } catch (dmErr) {
        console.error('[WITHDRAW_CANCEL_DM]', dmErr);
      }

      // Try to update original staff message buttons (if accessible via interaction.message)
      try {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('cancelled')
            .setLabel(type === 'refund' ? 'Payout Cancelled - Money Refunded' : 'Payout Cancelled')
            .setEmoji(type === 'refund' ? '<:moneyy:1391899345208606772>' : '<:cross:1351689463453061130>')
            .setStyle(type==='refund'?ButtonStyle.Primary:ButtonStyle.Danger)
            .setDisabled(true)
        );
        // Fetch the original message by ID and edit
        const originalMsg = await interaction.channel.messages.fetch(sourceMessageId).catch(() => null);
        if(originalMsg) await originalMsg.edit({ components: [disabledRow] }).catch(()=>{});
      } catch (e) { console.error('[WITHDRAW_CANCEL_EDIT]', e); }

      await interaction.reply({ content: `Withdrawal ${type === 'refund' ? 'cancelled and amount refunded' : 'cancelled without refund'} successfully.`, ephemeral: true });
      return;
    }
    
    // Handle other modal types here...
    
    console.warn(`[INTERACTION] Unhandled modal interaction: ${customId}`);
    return false;
  } catch (error) {
    console.error(`[INTERACTION] Error handling modal ${customId}: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred processing your submission. Please try again.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'An error occurred processing your submission. Please try again.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[INTERACTION] Error replying to interaction: ${replyError.message}`);
    }
    
    return false;
  }
}

// Main interaction handler
async function handleInteraction(interaction) {
  try {
    // Route to the appropriate handler based on interaction type
    if (interaction.isButton()) {
      return handleButtonInteraction(interaction);
    } else if (interaction.isChatInputCommand()) {
      // Route slash commands (e.g. /invites) through the central commands handler
      const { handleCommand } = require('../../commands.js');
      await handleCommand(interaction);
      return true;
    } else if (interaction.isStringSelectMenu()) {
      return handleSelectMenuInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      return handleModalSubmit(interaction);
    }
    
    console.warn(`[INTERACTION] Unhandled interaction type: ${interaction.type}`);
    return false;
  } catch (error) {
    console.error(`[INTERACTION] Error in main interaction handler: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

module.exports = {
  handleInteraction,
  handleButtonInteraction,
  handleSelectMenuInteraction,
  handleModalSubmit,
  handleWithdrawalModal
}; 