const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, InteractionResponseFlags, MessageFlags } = require('discord.js');

// Polyfill InteractionResponseFlags.Ephemeral for discord.js versions where it is missing
if (typeof InteractionResponseFlags !== 'object' || InteractionResponseFlags === null) {
  global.InteractionResponseFlags = { Ephemeral: MessageFlags?.Ephemeral ?? (1 << 6) };
} else if (!('Ephemeral' in InteractionResponseFlags)) {
  InteractionResponseFlags.Ephemeral = MessageFlags?.Ephemeral ?? (1 << 6);
}

// Polyfill Components V2 flag for MessageFlags
if (!('IsComponentsV2' in MessageFlags)) {
  MessageFlags.IsComponentsV2 = 1 << 31;
}
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('@discordjs/builders');
const { 
    EMBED_COLOR,
    STAFF_ROLES,
    TICKET_CATEGORIES,
    TICKET_LOG_CHANNEL,
    TICKET_STAFF_ROLE,
    TICKET_TRANSCRIPT_CHANNEL,
    TICKET_CLOSE_TIMEOUT,
    TICKET_ARCHIVE_CATEGORY,
    TICKET_OVERFLOW_CATEGORIES,
    TICKET_PANEL_ALLOWED_USERS
} = require('../config.js');
const {
    PAYMENT_STAFF,
    ROLE_IDS,
    PAYMENT_METHODS
} = require('../src/constants.js');
const { 
    flowState,
    showPaymentMethodSelection,
    showCryptoSelection,
    showDutchPaymentMethodSelection,
    handleRankedFlow,
    handleBulkFlow,
    getRankValue,
    handleRankedRankSelection,
    createRankedSelectionRows,
    showPriceEmbed,
    handleTicketConfirm,
    handleTicketCancel,
    getChannelNameByType,
    getCategoryIdByType
} = require('../src/modules/ticketFlow.js');
const {
    staffPaymentCompleted,
    handlePaymentCompleted
} = require('../src/handlers/staffOperationsHandlers.js');
const {
    claimBoostHandler,
    boostCompletedHandler,
    boostCancelHandler
} = require('../src/handlers/boostManagementHandlers.js');
const {
    boostManagementHandlers
} = require('../src/handlers/boostManagementHandlers.js');
const {
    staffOperationsHandlers
} = require('../src/handlers/staffOperationsHandlers.js');
const { 
    cryptoPaymentCompleted
} = require('../src/handlers/cryptoPaymentHandlers.js');
const {
    paypalPaymentCompletedHandler
} = require('../src/handlers/paypalWorkflowHandlers.js');
const {
    handlePayPalAcceptToS,
    handlePayPalDenyToS,
    handlePayPalDenyConfirm,
    handlePayPalDenyCancel,
    handlePayPalCopyEmail,
    handlePayPalPaymentReceived,
    handlePayPalPaymentNotReceived
} = require('../src/handlers/paypalButtonHandler.js');
const {
    createTicketChannelWithOverflow,
    closeTicket,
    archiveTicket,
    ticketDataMap
} = require('../tickets.js');
const {
    setupCryptoTimeout,
    getRankEmoji,
    getRankButtonProperties,
    createRankButtons,
    convertEuroToCrypto,
    sendOrderRecapEmbed,
    sendPayPalTermsEmbed,
    sendPayPalInfoEmbed,
    sendLitecoinEmbed,
    sendSolanaEmbed,
    sendBitcoinEmbed,
    sendIbanEmbed,
    sendAppleGiftcardEmbed,
    sendBolGiftcardEmbed,
    sendTikkieEmbed,
    sendLinkExpiredEmbed,
    sendPaymentConfirmationEmbed,
    sendStaffPaymentVerificationEmbed,
    sendBoostAvailableEmbed,
    createCryptoTxForm,
    verifyCryptoTransaction,
    sendCryptoWaitingEmbed,
    sendCryptoStillWaitingEmbed,
    sendInsufficientAmountEmbed,
    resendLitecoinEmbed,
    resendSolanaEmbed,
    sendStaffPaymentVerificationEmbedWithUserId,
    sendCryptoFailedEmbed,
    resendBitcoinEmbed,
    cancelActiveCryptoPayment,
    activeCryptoPayments,
    usedTransactionIds,
    sendWelcomeEmbed,
    createOrderInformationEmbed,
    sendPayPalPaymentVerificationEmbed,
    sendBoostReadyEmbed,
    sendPayPalTosDeniedEmbed,
    sendPayPalTosDenialConfirmedEmbed,
    sendPayPalTosAcceptedEmbed
} = require('../ticketPayments.js');

// Import PayPal handlers from paymentHandlers.js
const { allButtonHandlers, reviewFeedbackButtonHandlers, reviewFeedbackModalHandlers } = require('../paymentHandlers.js');

// Define the pink color constant
const PINK_COLOR = '#e68df2';

// ===== In-memory helpers for profile purchase flow =====
// Map channelId -> { authorizedUserId, listingId }
const profilePurchaseFlow = new Map();

// Helper to open crypto withdrawal modal
function showCryptoModal(interaction, coin){
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
  const modal = new ModalBuilder().setCustomId(`withdraw_crypto_modal_${coin.toLowerCase()}`).setTitle(`${coin} Withdrawal`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('wallet').setLabel(`${coin} Address`).setStyle(TextInputStyle.Short).setPlaceholder(`Enter your ${coin} address`).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('withdraw_amount').setLabel('Amount to Withdraw (€)').setStyle(TextInputStyle.Short).setPlaceholder('Leave blank = All').setRequired(false)
    )
  );
  return interaction.showModal(modal);
}

const buttonHandlers = {
    // Review and feedback handlers
    review_button: reviewFeedbackButtonHandlers.review_button,
    feedback_button: reviewFeedbackButtonHandlers.feedback_button,
    
    // Verification handlers
    verification_why: async (interaction) => {
        try {
            const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('@discordjs/builders');
            const { MessageFlags } = require('discord.js');
            
            // Create Components V2 container for the ephemeral response
            const container = new ContainerBuilder()
                .addTextDisplayComponents(txt =>
                    txt.setContent('## Why do I have to verify?')
                )
                .addSeparatorComponents(sep =>
                    sep.setDivider(true)
                       .setSpacing(2) // Large spacing with divider
                )
                .addTextDisplayComponents(txt =>
                    txt.setContent('Due to lots of other boosting servers being terminated, we want members to verify in to our bot for our safety.\n\nThe reason for this is that the bot will have the permission to add you to servers, we will be using this in case something bad happens to the server, such as a server termination.\n\n**We will not be abusing the add to server permission! You will not be added to random servers.**')
                );

            await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
                ephemeral: true
            });
        } catch (error) {
            console.error('[VERIFICATION_WHY] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing verification information. Please try again.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },
    
    // === DISCOUNT SYSTEM HANDLERS ===
    claim_10_percent_discount: async (interaction) => {
        try {
            const { handleClaimDiscountButton } = require('../src/handlers/discountHandlers.js');
            await handleClaimDiscountButton(interaction);
        } catch (error) {
            console.error('[CLAIM_DISCOUNT] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while claiming your discount. Please try again or contact support.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },
    
    // PayPal Terms of Service handlers
    paypal_accept: handlePayPalAcceptToS,
    paypal_deny: handlePayPalDenyToS,
    paypal_deny_confirm: handlePayPalDenyConfirm,
    paypal_deny_cancel: handlePayPalDenyCancel,
    
    // PayPal payment workflow handlers
    copy_email: handlePayPalCopyEmail,
    payment_received: handlePayPalPaymentReceived,
    payment_received_paypal_giftcard: handlePayPalPaymentReceived, // Add handler for PayPal Giftcard
    payment_not_received: handlePayPalPaymentNotReceived,
    payment_completed: async (interaction) => {
        // Call the auto-close handler first to stop auto-close system
        try {
            const { handlePaymentCompleted } = require('../tickets.js');
            await handlePaymentCompleted(interaction.channel.id, interaction.user.id);
        } catch (error) {
            console.error('[PAYMENT_COMPLETED] Error handling auto-close logic:', error);
        }
        
        // Use the modern PayPal payment completed handler (no countdown)
        await paypalPaymentCompletedHandler(interaction);
    },
    
    // Crypto address copy handlers
    copy_ltc_address: async (interaction) => {
        try {
            await interaction.reply({ content: 'LMEBUghAdAKKdNTtUBExHyN33b6JS75TkH', ephemeral: true });
        } catch (error) {
            console.error('[COPY_LTC_ADDRESS] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Error copying address.', ephemeral: true }).catch(console.error);
            }
        }
    },
    copy_sol_address: async (interaction) => {
        try {
            await interaction.reply({ content: 'B9z5EhzPnPFf8t5CptAArYRFhzkrQkv1i7URz1pVSNdH', ephemeral: true });
        } catch (error) {
            console.error('[COPY_SOL_ADDRESS] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Error copying address.', ephemeral: true }).catch(console.error);
            }
        }
    },
    copy_btc_address: async (interaction) => {
        try {
            await interaction.reply({ content: 'bc1qcxrteqq6rgr4u5s6hg9n4d27zar22ssgzx7s8v', ephemeral: true });
        } catch (error) {
            console.error('[COPY_BTC_ADDRESS] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Error copying address.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    // Tikkie link handler
    copy_tikkie_link: async (interaction) => {
        try {
            await interaction.reply({ content: 'https://tikkie.me/pay/im6epjm7vgj0d48n04p4', ephemeral: true });
        } catch (error) {
            console.error('[COPY_TIKKIE_LINK] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Error copying Tikkie link.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    // Boost management handlers
    claim_boost: claimBoostHandler,
    boost_completed: boostCompletedHandler,
    boost_cancel: boostCancelHandler,
    
    // PayPal denial confirmation handlers
    confirm_deny: async (interaction) => {
        try {
            // Disable the buttons on the original message
            const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
            disabledRow.components.forEach(button => button.setDisabled(true));
            
            await interaction.update({ components: [disabledRow] });
            
            // Send message that terms were denied
            await interaction.channel.send({
                content: `${interaction.user} has denied the Terms of Services.\n\nPlease explain why you denied the Terms of Services.\n\nIf no other solution can be found, this order will have to be cancelled.`
            });
        } catch (error) {
            console.error('[CONFIRM_DENY] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing this action.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    cancel_deny: async (interaction) => {
        try {
            // Simply dismiss the confirmation dialog
            await interaction.update({ 
                content: 'Denial cancelled. You can continue with the order.', 
                embeds: [], 
                components: [] 
            });
        } catch (error) {
            console.error('[CANCEL_DENY] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing this action.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    // Ticket creation buttons
    ticket_trophies: async (interaction) => {
        try {
            flowState.set(interaction.user.id, { 
                type: 'trophies', 
                step: 'trophies_input',
                timestamp: Date.now()
            });
            console.log(`[TICKET_TROPHIES] Set initial flow state for user ${interaction.user.id}`);

            const modal = new ModalBuilder()
                .setCustomId('modal_trophies_start')
                .setTitle('Trophies Boost');

            const brawlerNameInput = new TextInputBuilder()
                .setCustomId('brawler_name')
                .setLabel('Brawler Name')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter the name of the brawler')
                .setRequired(true);

            const currentInput = new TextInputBuilder()
                .setCustomId('brawler_current')
                .setLabel('Current Trophies')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter the current trophy count')
                .setRequired(true);

            const desiredInput = new TextInputBuilder()
                .setCustomId('brawler_desired')
                .setLabel('Desired Trophies')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter the desired trophy count')
                .setRequired(true);

            const brawlerLevelInput = new TextInputBuilder()
                .setCustomId('brawler_level')
                .setLabel('Brawler Power Level (1-11)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter the power level of the brawler (1-11)')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(brawlerNameInput),
                new ActionRowBuilder().addComponents(currentInput),
                new ActionRowBuilder().addComponents(desiredInput),
                new ActionRowBuilder().addComponents(brawlerLevelInput)
            );
            await interaction.showModal(modal);
        } catch (error) {
            console.error('[TICKET_TROPHIES] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing the trophy form.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },

    ticket_ranked: async (interaction) => {
        try {
            // Don't defer the reply since we'll show a modal
            // Instead, set the flow state and call handleRankedFlow
            flowState.set(interaction.user.id, { 
                type: 'ranked', 
                step: 'p11_modal',
                timestamp: Date.now()
            });
            await handleRankedFlow(interaction);
        } catch (error) {
            console.error('[TICKET_RANKED] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while creating the ranked ticket.',
                    ephemeral: true
                }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: 'An error occurred while creating the ranked ticket.'
                }).catch(console.error);
            }
        }
    },

    ticket_bulk: async (interaction) => {
        try {
            flowState.set(interaction.user.id, { 
                type: 'bulk', 
                step: 'trophies_input',
                timestamp: Date.now()
            });
            await handleBulkFlow(interaction);
        } catch (error) {
            console.error('[TICKET_BULK] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while creating the bulk ticket.',
                    ephemeral: true
                }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: 'An error occurred while creating the bulk ticket.'
                }).catch(console.error);
            }
        }
    },



    ticket_other: async (interaction) => {
        try {
            flowState.set(interaction.user.id, {
                type: 'other',
                step: 'request_input',
                timestamp: Date.now()
            });
            console.log(`[TICKET_OTHER] Set initial flow state for user ${interaction.user.id}`);

            const modal = new ModalBuilder()
                .setCustomId('modal_other_request')
                .setTitle('Other Request');

            const requestDetailsInput = new TextInputBuilder()
                .setCustomId('other_request')
                .setLabel('Request Details')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Please describe your request in detail')
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(requestDetailsInput)
            );
            await interaction.showModal(modal);
        } catch (error) {
            console.error('[TICKET_OTHER] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing the request form.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },

    // =======================
    // Affiliate Program Buttons
    // =======================
    affiliate_info: async (interaction) => {
        try {
            const { MessageFlags } = require('discord.js');
            const { ContainerBuilder, SeparatorBuilder } = require('@discordjs/builders');

            const infoContainer = new ContainerBuilder()
                .setAccentColor(0x4a90e2)
                .addTextDisplayComponents(txt => txt.setContent('# Affiliate Program Information'))
                .addSeparatorComponents(sep => sep.setDivider(true).setSpacing(2))
                // Withdrawal Information
                .addTextDisplayComponents(txt => txt.setContent('## Withdrawal Information'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                .addTextDisplayComponents(txt => txt.setContent('- Withdrawals are done through PayPal, Crypto, or IBAN Bank Transfer.\n- The minimum withdrawal is €1.\n- The maximum withdrawal per day is 1.'))
                .addSeparatorComponents(sep => sep.setDivider(true).setSpacing(2))
                // Forbidden Activities
                .addTextDisplayComponents(txt => txt.setContent('## Forbidden Activities'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                .addTextDisplayComponents(txt => txt.setContent('- Inviting yourself through an alt, or inviting an alt is strictly forbidden and will result in consequences.\n- Making people re-join through your link is strictly forbidden and will result in consequences.'))
                .addSeparatorComponents(sep => sep.setDivider(true).setSpacing(2))
                // Program Information
                .addTextDisplayComponents(txt => txt.setContent('## Program Information'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                .addTextDisplayComponents(txt => txt.setContent('- If someone leaves and re-joins the server, the new inviter will not receive the credit, the affiliate credit will stay with the first inviter.\n- The 5% earnings are **lifetime**.\n- Use your own custom link **only**, if you use a vanity link, so a link that ends on \'brawlshop\' you will not be resulted.'))
                .addSeparatorComponents(sep => sep.setDivider(true).setSpacing(2))
                .addTextDisplayComponents(txt => txt.setContent('We wish you good luck with earning, if you have any remaining questions please dm <@987751357773672538> or <@986164993080836096>\n\nTo view your balance, press the \'View Balance\' button.\nTo withdraw your earnings, press the \'Withdraw\' button.'));

            await interaction.reply({
                components: [infoContainer],
                flags: MessageFlags.IsComponentsV2,
                ephemeral: true
            });
        } catch (error) {
            console.error('[AFFILIATE_INFO] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while showing program information.', ephemeral: true }).catch(console.error);
            }
        }
    },

    affiliate_balance: async (interaction) => {
        try {
            const db = require('../database.js');
            await db.waitUntilConnected().catch(()=>{});
            let balance = 0;
            try{
                const res = await db.query('SELECT balance FROM affiliate_links WHERE user_id=$1', [interaction.user.id]);
                if(res.rowCount>0){
                    balance = parseFloat(res.rows[0].balance);
                }
            }catch(err){
                console.error('[AFFILIATE_BALANCE] DB error:', err.message);
            }
            const formatted = balance.toFixed(2);
            const { ContainerBuilder, SeparatorBuilder } = require('@discordjs/builders');
            const embed = new ContainerBuilder()
                .setAccentColor(0x4a90e2)
                .addTextDisplayComponents(txt => txt.setContent('**Your Balance:**'))
                .addTextDisplayComponents(txt => txt.setContent(`\`€${formatted}\``));
            if(balance < 1){
                embed.addSeparatorComponents(sep=>sep.setDivider(false).setSpacing(1))
                     .addTextDisplayComponents(txt=>txt.setContent('You need a balance of atleast €1 to be able to withdraw your earnings.'));
                await interaction.reply({components:[embed], flags: require('discord.js').MessageFlags.IsComponentsV2, ephemeral:true});
            }else{
                const withdrawRow = new (require('discord.js').ActionRowBuilder)().addComponents(
                    new (require('discord.js').ButtonBuilder)()
                        .setCustomId('affiliate_withdraw')
                        .setLabel('Withdraw Earnings')
                        .setEmoji('<:bank:1371863843789209691>')
                        .setStyle(require('discord.js').ButtonStyle.Success)
                );
                embed.addSeparatorComponents(sep=>sep.setDivider(false).setSpacing(1))
                     .addTextDisplayComponents(txt=>txt.setContent('You are eligible to withdraw your earnings. Use the **Withdraw Earnings** button to withdraw your balance.'));
                await interaction.reply({components:[embed, withdrawRow], flags: require('discord.js').MessageFlags.IsComponentsV2, ephemeral:true});
            }
        } catch (error) {
            console.error('[AFFILIATE_BALANCE] Error:', error);
            if(!interaction.replied) await interaction.reply({content:'Error fetching balance.',ephemeral:true});
        }
    },

    affiliate_withdraw: async (interaction) => {
        try {
            const db = require('../database.js');
            await db.waitUntilConnected().catch(()=>{});
            const res = await db.query('SELECT balance FROM affiliate_links WHERE user_id=$1', [interaction.user.id]);
            const bal = res.rowCount? parseFloat(res.rows[0].balance):0;
            const formatted = bal.toFixed(2);
            const { ContainerBuilder, SeparatorBuilder } = require('@discordjs/builders');
            const cb = new ContainerBuilder().setAccentColor(0x4a90e2).addTextDisplayComponents(t=>t.setContent('**Your Balance:**')).addTextDisplayComponents(t=>t.setContent(`\`€${formatted}\``));
            const { MessageFlags, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
            // Add a header manually using markdown since ContainerBuilder has no setHeader()
            const headerText = '## Withdraw Earnings';

            if(bal < 1){
                cb.addSeparatorComponents(s=>s.setDivider(false).setSpacing(1))
                  .addTextDisplayComponents(t=>t.setContent(headerText))
                  .addSeparatorComponents(s=>s.setDivider(false).setSpacing(1))
                  .addTextDisplayComponents(t=>t.setContent('You need a balance of atleast `€1` to be able to withdraw your earnings.'));
                await interaction.reply({components:[cb], flags: MessageFlags.IsComponentsV2, ephemeral:true});
            }else{
                cb.addSeparatorComponents(s=>s.setDivider(false).setSpacing(1))
                  .addTextDisplayComponents(t=>t.setContent(headerText))
                  .addSeparatorComponents(s=>s.setDivider(false).setSpacing(1))
                  .addTextDisplayComponents(t=>t.setContent('Withdraw your earnings with PayPal, Crypto, or IBAN Bank Transfer.'))
                  .addSeparatorComponents(s=>s.setDivider(false).setSpacing(1))
                  .addTextDisplayComponents(t=>t.setContent('Please select a payout method below to withdraw your balance.'));
                const row=new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('withdraw_paypal').setLabel('PayPal').setEmoji('<:paypal:1371862922766192680>').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('withdraw_crypto').setLabel('Crypto').setEmoji('<:crypto:1371863500720177314>').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('withdraw_iban').setLabel('IBAN Bank Transfer').setEmoji('<:bank:1371863843789209691>').setStyle(ButtonStyle.Danger)
                );
                await interaction.reply({components:[cb,row], flags:MessageFlags.IsComponentsV2,ephemeral:true});
            }
        }catch(err){
            console.error('[AFFILIATE_WITHDRAW] Error:',err);
            if(!interaction.replied) await interaction.reply({content:'Error processing withdrawal request.',ephemeral:true});
        }
    },

    // =====================
    // Create Link Button
    // =====================
    affiliate_create_link: async (interaction) => {
        try {
            const TARGET_GUILD_ID = '1292895164595175444';
            const { MessageFlags } = require('discord.js');

            // Ensure this is run inside the correct guild
            if (interaction.guildId !== TARGET_GUILD_ID) {
                return interaction.reply({ content: 'This button can only be used inside the Brawl Shop server.', ephemeral: true });
            }

            // Defer to avoid 3-second timeout
            if(!interaction.deferred && !interaction.replied){
                await interaction.deferReply({ephemeral:true});
            }

            const { waitUntilConnected, query } = require('../database.js');
            await waitUntilConnected().catch(() => {}); // proceed even if DB unavailable

            let existingLink = null;
            try {
                const res = await query('SELECT invite_code FROM affiliate_links WHERE user_id=$1', [interaction.user.id]);
                if (res.rowCount > 0) {
                    existingLink = `https://discord.gg/${res.rows[0].invite_code}`;
                }
            } catch (err) {
                console.error('[AFFILIATE] DB lookup failed:', err.message);
            }

            // If link already exists, send info embed
            if (existingLink) {
                const { ContainerBuilder, SeparatorBuilder } = require('@discordjs/builders');
                const container = new ContainerBuilder()
                    .setAccentColor(0x4a90e2)
                    .addTextDisplayComponents(txt => txt.setContent('## Your Custom Link'))
                    .addSeparatorComponents(sep => sep.setDivider(true).setSpacing(2))
                    .addTextDisplayComponents(txt => txt.setContent('You already have a custom affiliate link.'))
                    .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                    .addTextDisplayComponents(txt => txt.setContent('**Your link:**'))
                    .addTextDisplayComponents(txt => txt.setContent(`> \`${existingLink}\``))
                    .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                    .addTextDisplayComponents(txt => txt.setContent('Please use **only this link** when inviting people, otherwise you will not earn for your referrals.'));

                const copyRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`affiliate_copy_${existingLink.split('/').pop()}`)
                        .setLabel('Copy Link')
                        .setEmoji('<:copy:1372240644013035671>')
                        .setStyle(ButtonStyle.Primary)
                );
                return interaction.editReply({ components: [container, copyRow], flags: MessageFlags.IsComponentsV2 });
            }

            // No link yet -> create new invite
            const guild = interaction.client.guilds.cache.get(TARGET_GUILD_ID);
            if (!guild) {
                return interaction.reply({ content: 'Unable to access the guild to create invite. Please try again later.', ephemeral: true });
            }

            // Use the channel where the button was pressed if it belongs to guild and is a text channel
            const channel = interaction.channel;
            if (!channel || channel.guildId !== TARGET_GUILD_ID || !channel.isTextBased()) {
                return interaction.reply({ content: 'Please use this button in a text channel inside the Brawl Shop server.', ephemeral: true });
            }

            let invite;
            try {
                invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: `Affiliate link for ${interaction.user.tag}` });
            } catch (err) {
                console.error('[AFFILIATE] Failed to create invite:', err);
                return interaction.reply({ content: 'Could not create invite link. Please contact staff.', ephemeral: true });
            }

            const inviteLink = `https://discord.gg/${invite.code}`;

            // Store in DB
            try {
                await query('INSERT INTO affiliate_links(user_id, invite_code, created_at) VALUES($1,$2,NOW())', [interaction.user.id, invite.code]);
            } catch (err) {
                console.error('[AFFILIATE] Failed to insert invite_code:', err.message);
            }

            const { ContainerBuilder, SeparatorBuilder } = require('@discordjs/builders');
            const container = new ContainerBuilder()
                .setAccentColor(0x4a90e2)
                .addTextDisplayComponents(txt => txt.setContent('## Successfully Created Link'))
                .addSeparatorComponents(sep => sep.setDivider(true).setSpacing(2))
                .addTextDisplayComponents(txt => txt.setContent('Successfully created custom affiliate link.'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                .addTextDisplayComponents(txt => txt.setContent('**Your link:**'))
                .addTextDisplayComponents(txt => txt.setContent(`> \`${inviteLink}\``))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                .addTextDisplayComponents(txt => txt.setContent('Please use **only this link** when inviting people, otherwise you will not earn for your referrals.'));

            const copyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`affiliate_copy_${invite.code}`)
                    .setLabel('Copy Link')
                    .setEmoji('<:copy:1372240644013035671>')
                    .setStyle(ButtonStyle.Primary)
            );
            await interaction.editReply({ components: [container, copyRow], flags: MessageFlags.IsComponentsV2 });

        } catch (error) {
            console.error('[AFFILIATE_CREATE_LINK] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while creating your affiliate link.', ephemeral: true }).catch(console.error);
            }
        }
    },

    // Payment method selection buttons
    btn_paypal: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'PayPal');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_PAYPAL] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing PayPal information.',
                    ephemeral: true
                });
            }
        }
    },

    btn_paypal_giftcard: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'PayPal Giftcard');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_PAYPAL_GIFTCARD] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing PayPal Giftcard information.',
                    ephemeral: true
                });
            }
        }
    },

    btn_iban: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'IBAN Bank Transfer');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_IBAN] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing IBAN information.',
                    ephemeral: true
                });
            }
        }
    },



    btn_dutch_methods: async (interaction) => {
        try {
            await showDutchPaymentMethodSelection(interaction);
        } catch (error) {
            console.error('[BTN_DUTCH_METHODS] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing Dutch payment methods.',
                    ephemeral: true
                });
            }
        }
    },

    btn_tikkie: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'Dutch Payment Methods', 'Tikkie');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_TIKKIE] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing Tikkie information.',
                    ephemeral: true
                });
            }
        }
    },

    btn_bol_giftcard: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'Dutch Payment Methods', 'Bol.com Giftcard');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_BOL_GIFTCARD] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing Bol.com Giftcard information.',
                    ephemeral: true
                });
            }
        }
    },

    btn_crypto: async (interaction) => {
        try {
            await showCryptoSelection(interaction);
        } catch (error) {
            console.error('[BTN_CRYPTO] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing crypto selection.',
                    ephemeral: true
                });
            }
        }
    },

    btn_litecoin: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'Crypto', 'Litecoin');
            setupCryptoTimeout({ client: interaction.client, channelId: interaction.channel.id }, 'litecoin');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_LITECOIN] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing Litecoin information.',
                    ephemeral: true
                });
            }
        }
    },

    btn_solana: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'Crypto', 'Solana');
            setupCryptoTimeout({ client: interaction.client, channelId: interaction.channel.id }, 'solana');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_SOLANA] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing Solana information.',
                    ephemeral: true
                });
            }
        }
    },

    btn_bitcoin: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'Crypto', 'Bitcoin');
            setupCryptoTimeout({ client: interaction.client, channelId: interaction.channel.id }, 'bitcoin');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_BITCOIN] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing Bitcoin information.',
                    ephemeral: true
                });
            }
        }
    },

    // Add buttons
    btn_add_115k: async (interaction) => {
        try {
            const modal = new ModalBuilder()
                .setCustomId('modal_add_115k')
                .setTitle('Add 115k Trophy Player');

            const inviteInput = new TextInputBuilder()
                .setCustomId('invites')
                .setLabel('How many invites do you have?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(inviteInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } catch (error) {
            console.error('[BTN_ADD_115K] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing the add form.',
                    ephemeral: true
                });
            }
        }
    },

    btn_add_matcherino_winner: async (interaction) => {
        try {
            const modal = new ModalBuilder()
                .setCustomId('modal_add_matcherino')
                .setTitle('Add Matcherino Winner');

            const inviteInput = new TextInputBuilder()
                .setCustomId('invites')
                .setLabel('How many invites do you have?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(inviteInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } catch (error) {
            console.error('[BTN_ADD_MATCHERINO] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing the add form.',
                    ephemeral: true
                });
            }
        }
    },

    // Friend list buttons
    friendlist_buyadd: async (interaction) => {
        try {
            const modal = new ModalBuilder()
                .setCustomId('modal_buy_add')
                .setTitle('Buy Friend List Add');

            const playerInput = new TextInputBuilder()
                .setCustomId('player')
                .setLabel('Which player do you want to buy?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(playerInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } catch (error) {
            console.error('[FRIENDLIST_BUYADD] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing the purchase form.',
                    ephemeral: true
                });
            }
        }
    },

    friendlist_playerinfo: async (interaction) => {
        try {
            const modal = new ModalBuilder()
                .setCustomId('modal_player_info')
                .setTitle('Player Information');

            const playerInput = new TextInputBuilder()
                .setCustomId('player')
                .setLabel('Which player do you want information about?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(playerInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } catch (error) {
            console.error('[FRIENDLIST_PLAYERINFO] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing the info form.',
                    ephemeral: true
                });
            }
        }
    },

    // Mastery handler removed - feature disabled

    // General rank specific buttons 
    'ranked_specific_1': async (interaction) => {
        const userData = flowState.get(interaction.user.id);
        if (!userData) {
            return interaction.reply({ content: 'Session data not found. Please try again.', ephemeral: true });
        }
        if (userData.step === 'current_rank_specific') {
            userData.currentRankSpecific = '1';
            userData.step = 'desired_rank';
            userData.formattedCurrentRank = `${userData.currentRank} 1`;
            const embed = new EmbedBuilder().setTitle('Desired Rank').setColor(EMBED_COLOR).setDescription(`Your current rank is **${userData.formattedCurrentRank}**\\n\\nPlease select your **Desired Rank**`);
            const rows = createRankedSelectionRows(userData.currentRank, userData.currentRankSpecific);
            return interaction.update({ embeds: [embed], components: rows });
        } else if (userData.step === 'desired_rank_specific') {
            userData.desiredRankSpecific = '1';
            userData.step = 'payment_method';
            userData.formattedDesiredRank = `${userData.desiredRank} 1`;
            flowState.set(interaction.user.id, userData);
            return showPaymentMethodSelection(interaction);
        }
    },
    'ranked_specific_2': async (interaction) => {
        const userData = flowState.get(interaction.user.id);
        if (!userData) {
            return interaction.reply({ content: 'Session data not found. Please try again.', ephemeral: true });
        }
        if (userData.step === 'current_rank_specific') {
            userData.currentRankSpecific = '2';
            userData.step = 'desired_rank';
            userData.formattedCurrentRank = `${userData.currentRank} 2`;
            const embed = new EmbedBuilder().setTitle('Desired Rank').setColor(EMBED_COLOR).setDescription(`Your current rank is **${userData.formattedCurrentRank}**\\n\\nPlease select your **Desired Rank**`);
            const rows = createRankedSelectionRows(userData.currentRank, userData.currentRankSpecific);
            return interaction.update({ embeds: [embed], components: rows });
        } else if (userData.step === 'desired_rank_specific') {
            userData.desiredRankSpecific = '2';
            userData.step = 'payment_method';
            userData.formattedDesiredRank = `${userData.desiredRank} 2`;
            flowState.set(interaction.user.id, userData);
            return showPaymentMethodSelection(interaction);
        }
    },
    'ranked_specific_3': async (interaction) => {
        const userData = flowState.get(interaction.user.id);
        if (!userData) {
            return interaction.reply({ content: 'Session data not found. Please try again.', ephemeral: true });
        }
        if (userData.step === 'current_rank_specific') {
            userData.currentRankSpecific = '3';
            userData.step = 'desired_rank';
            userData.formattedCurrentRank = `${userData.currentRank} 3`;
            const embed = new EmbedBuilder().setTitle('Desired Rank').setColor(EMBED_COLOR).setDescription(`Your current rank is **${userData.formattedCurrentRank}**\\n\\nPlease select your **Desired Rank**`);
            const rows = createRankedSelectionRows(userData.currentRank, userData.currentRankSpecific);
            return interaction.update({ embeds: [embed], components: rows });
        } else if (userData.step === 'desired_rank_specific') {
            userData.desiredRankSpecific = '3';
            userData.step = 'payment_method';
            userData.formattedDesiredRank = `${userData.desiredRank} 3`;
            const currentValue = getRankValue(userData.currentRank, userData.currentRankSpecific);
            const desiredValue = getRankValue(userData.desiredRank, '3');
            if (desiredValue <= currentValue) {
                return interaction.reply({ content: 'Desired rank must be higher than current rank.', ephemeral: true });
            }
            flowState.set(interaction.user.id, userData);
            return showPaymentMethodSelection(interaction);
        }
    },

    // Specific rank tier buttons 
    'ranked_Pro_1': async (interaction) => handleRankedRankSelection(interaction, 'Pro_1'),
    'ranked_Pro_2': async (interaction) => handleRankedRankSelection(interaction, 'Pro_2'),
    'ranked_Pro_3': async (interaction) => handleRankedRankSelection(interaction, 'Pro_3'),
    'ranked_Masters_1': async (interaction) => handleRankedRankSelection(interaction, 'Masters_1'),
    'ranked_Masters_2': async (interaction) => handleRankedRankSelection(interaction, 'Masters_2'),
    'ranked_Masters_3': async (interaction) => handleRankedRankSelection(interaction, 'Masters_3'),
    'ranked_Legendary_1': async (interaction) => handleRankedRankSelection(interaction, 'Legendary_1'),
    'ranked_Legendary_2': async (interaction) => handleRankedRankSelection(interaction, 'Legendary_2'),
    'ranked_Legendary_3': async (interaction) => handleRankedRankSelection(interaction, 'Legendary_3'),
    'ranked_Mythic_1': async (interaction) => handleRankedRankSelection(interaction, 'Mythic_1'),
    'ranked_Mythic_2': async (interaction) => handleRankedRankSelection(interaction, 'Mythic_2'),
    'ranked_Mythic_3': async (interaction) => handleRankedRankSelection(interaction, 'Mythic_3'),
    'ranked_Diamond_1': async (interaction) => handleRankedRankSelection(interaction, 'Diamond_1'),
    'ranked_Diamond_2': async (interaction) => handleRankedRankSelection(interaction, 'Diamond_2'),
    'ranked_Diamond_3': async (interaction) => handleRankedRankSelection(interaction, 'Diamond_3'),
    'ranked_Gold_1': async (interaction) => handleRankedRankSelection(interaction, 'Gold_1'),
    'ranked_Gold_2': async (interaction) => handleRankedRankSelection(interaction, 'Gold_2'),
    'ranked_Gold_3': async (interaction) => handleRankedRankSelection(interaction, 'Gold_3'),
    'ranked_Silver_1': async (interaction) => handleRankedRankSelection(interaction, 'Silver_1'),
    'ranked_Silver_2': async (interaction) => handleRankedRankSelection(interaction, 'Silver_2'),
    'ranked_Silver_3': async (interaction) => handleRankedRankSelection(interaction, 'Silver_3'),
    'ranked_Bronze_1': async (interaction) => handleRankedRankSelection(interaction, 'Bronze_1'),
    'ranked_Bronze_2': async (interaction) => handleRankedRankSelection(interaction, 'Bronze_2'),
    'ranked_Bronze_3': async (interaction) => handleRankedRankSelection(interaction, 'Bronze_3'),

    // Main rank handlers for initial selection in the flow 
    'ranked_Pro': async (interaction) => {
        const userData = flowState.get(interaction.user.id);
        if (userData && userData.step === 'desired_rank') {
            userData.desiredRank = 'Pro';
            userData.desiredRankSpecific = '1'; // Default to Pro 1 as Pro only has 1 tier effectively
            userData.formattedDesiredRank = 'Pro';
            userData.step = 'payment_method';
            const currentValue = getRankValue(userData.currentRank, userData.currentRankSpecific);
            const desiredValue = getRankValue('Pro', '1');
            if (desiredValue <= currentValue) {
                return interaction.reply({ content: 'Desired rank must be higher than current rank.', ephemeral: true });
            }
            flowState.set(interaction.user.id, userData);
            return showPaymentMethodSelection(interaction);
        } else {
            return handleRankedRankSelection(interaction, 'Pro');
        }
    },
    'ranked_Masters': async (interaction) => handleRankedRankSelection(interaction, 'Masters'),
    'ranked_Legendary': async (interaction) => handleRankedRankSelection(interaction, 'Legendary'),
    'ranked_Mythic': async (interaction) => handleRankedRankSelection(interaction, 'Mythic'),
    'ranked_Diamond': async (interaction) => handleRankedRankSelection(interaction, 'Diamond'),
    'ranked_Gold': async (interaction) => handleRankedRankSelection(interaction, 'Gold'),
    'ranked_Silver': async (interaction) => handleRankedRankSelection(interaction, 'Silver'),
    'ranked_Bronze': async (interaction) => handleRankedRankSelection(interaction, 'Bronze'),

    // Payment selection buttons & related 
    'payment_paypal': async (interaction) => {
        const userData = flowState.get(interaction.user.id);
        if (userData) {
            userData.paymentMethod = 'PayPal';
            flowState.set(interaction.user.id, userData);
            if (userData.type === 'other') {
                const type = userData.type;
                const username = interaction.user.username;
                const channelName = getChannelNameByType(type, userData, username);
                const categoryId = getCategoryIdByType(type);
                const channel = await createTicketChannelWithOverflow(
                    interaction.guild,
                    interaction.user.id,
                    categoryId,
                    channelName
                );
                if (channel) {
                    const orderFields = [{ name: '**Request:**', value: `\`${userData.requestDetails || 'Custom request'}\`` }, { name: '**Payment Method:**', value: `\`PayPal\`` }];
                    const orderEmbed = new EmbedBuilder().setTitle('Order Information').setColor(PINK_COLOR).addFields(orderFields);
                    await channel.send({ embeds: [orderEmbed] });
                    await sendPayPalTermsEmbed(channel, interaction.user.id, interaction);
                    console.log(`[PAYMENT_PAYPAL_OTHER] Ticket ${channel.id} created for 'other' type. Sent PayPal ToS embed.`);
                    flowState.delete(interaction.user.id);
                    return interaction.reply({ content: `Your ticket has been created: <#${channel.id}>`, ephemeral: true });
                } else {
                    console.error(`[PAYMENT_PAYPAL_OTHER] Failed to create ticket channel for user ${interaction.user.id}`);
                    return interaction.reply({ content: 'Failed to create ticket for "other" request. Please try again later.', ephemeral: true });
                }
            } else {
                console.log(`[PAYMENT_PAYPAL_FLOW] User ${interaction.user.id} selected PayPal for ${userData.type}. Proceeding to show price.`);
                return showPriceEmbed(interaction);
            }
        } else {
            console.warn(`[PAYMENT_PAYPAL_FLOW] No userData found for user ${interaction.user.id}. Interaction ID: ${interaction.id}`);
            return interaction.reply({content: "Your session has expired or data is missing. Please start over.", ephemeral: true}).catch(e => console.error("Error replying to user about missing session data:", e));
        }
    },
    'payment_crypto': async (interaction) => {
        const userData = flowState.get(interaction.user.id);
        if (userData) {
            userData.paymentMethod = 'Crypto';
            flowState.set(interaction.user.id, userData);
            return showCryptoSelection(interaction);
        }
    },
    'payment_iban': async (interaction) => {
        const userData = flowState.get(interaction.user.id);
        if (userData) {
            userData.paymentMethod = 'IBAN Bank Transfer';
            flowState.set(interaction.user.id, userData);
            if (userData.type === 'other') {
                const type = userData.type;
                const username = interaction.user.username;
                const channelName = getChannelNameByType(type, userData, username);
                const categoryId = getCategoryIdByType(type);
                const channel = await createTicketChannelWithOverflow(
                    interaction.guild,
                    interaction.user.id,
                    categoryId,
                    channelName
                );
                if (channel) {
                    const orderFields = [{ name: '**Request:**', value: `\`${userData.requestDetails || 'Custom request'}\`` }, { name: '**Payment Method:**', value: `\`IBAN Bank Transfer\`` }];
                    const orderEmbed = new EmbedBuilder().setTitle('Order Information').setColor(PINK_COLOR).addFields(orderFields);
                    await channel.send({ embeds: [orderEmbed] });
                    await sendIbanEmbed(channel, interaction.user.id, interaction);
                    flowState.delete(interaction.user.id);
                    return interaction.reply({ content: `Your ticket has been created: <#${channel.id}>`, ephemeral: true });
                } else {
                    return interaction.reply({ content: 'Failed to create ticket. Please try again later.', ephemeral: true });
                }
            } else {
                return showPriceEmbed(interaction);
            }
        }
    },

    // Crypto payment completion that shows modal
    payment_completed_ltc: async (interaction) => {
        try {
            // Call the auto-close handler first to stop auto-close system
            try {
                const { handlePaymentCompleted } = require('../tickets.js');
                await handlePaymentCompleted(interaction.channel.id, interaction.user.id);
            } catch (error) {
                console.error('[PAYMENT_COMPLETED_LTC] Error handling auto-close logic:', error);
            }
            
            const { createLitecoinTxModal } = require('../ticketPayments.js');
            await createLitecoinTxModal(interaction);
            console.log(`[PAYMENT_COMPLETED_LTC] User ${interaction.user.id} opened Litecoin TX modal.`);
        } catch (error) {
            console.error('[PAYMENT_COMPLETED_LTC] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred.', ephemeral: true }).catch(console.error);
            }
        }
    },

    payment_completed_sol: async (interaction) => {
        try {
            // Call the auto-close handler first to stop auto-close system
            try {
                const { handlePaymentCompleted } = require('../tickets.js');
                await handlePaymentCompleted(interaction.channel.id, interaction.user.id);
            } catch (error) {
                console.error('[PAYMENT_COMPLETED_SOL] Error handling auto-close logic:', error);
            }
            
            const { createSolanaTxModal } = require('../ticketPayments.js');
            await createSolanaTxModal(interaction);
            console.log(`[PAYMENT_COMPLETED_SOL] User ${interaction.user.id} opened Solana TX modal.`);
        } catch (error) {
            console.error('[PAYMENT_COMPLETED_SOL] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred.', ephemeral: true }).catch(console.error);
            }
        }
    },
    payment_completed_btc: async (interaction) => {
        try {
            // Call the auto-close handler first to stop auto-close system
            try {
                const { handlePaymentCompleted } = require('../tickets.js');
                await handlePaymentCompleted(interaction.channel.id, interaction.user.id);
            } catch (error) {
                console.error('[PAYMENT_COMPLETED_BTC] Error handling auto-close logic:', error);
            }
            
            const { createBitcoinTxModal } = require('../ticketPayments.js');
            await createBitcoinTxModal(interaction);
            console.log(`[PAYMENT_COMPLETED_BTC] User ${interaction.user.id} opened Bitcoin TX modal.`);
        } catch (error) {
            console.error('[PAYMENT_COMPLETED_BTC] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred.', ephemeral: true }).catch(console.error);
            }
        }
    },

    // Tikkie related handlers
    copy_tikkie_link: async (interaction) => { await interaction.reply({ content: 'https://tikkie.me/pay/im6epjm7vgj0d48n04p4', ephemeral: true }); },
    tikkie_link_expired: async (interaction) => { return sendLinkExpiredEmbed(interaction, 'Tikkie'); },
    payment_completed_tikkie: async (interaction) => { return sendPaymentConfirmationEmbed(interaction, 'Tikkie'); },
    
    // Cancel boost button 
    'cancel_boost': async (interaction) => {
        try {
            flowState.delete(interaction.user.id);
            await interaction.update({ content: 'Your boost request has been cancelled.', ephemeral: true, components: [], embeds: [] });
        } catch (error) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred.', ephemeral: true });
            }
        }
    },

    // Purchase boost button handler 
    'purchase_boost': async (interaction) => { 
        const { handlePurchaseBoostClick } = require('../src/modules/ticketFlow.js');
        return handlePurchaseBoostClick(interaction);
    },

    // Close ticket buttons 
    'close_ticket': async (interaction) => {
        try {
            // Check permissions: owner, head admin, admin roles, or ticket opener
            const ALLOWED_ROLES = [
                ROLE_IDS.OWNER || '1292933200389083196',      // Owner Role
                ROLE_IDS.HEAD_ADMIN || '1358101527658627270', // Head Admin Role
                ROLE_IDS.ADMIN || '1292933924116500532'       // Admin Role
            ];
            
            // Get ticket data
            const ticketData = ticketDataMap.get(interaction.channel.id);
            const isTicketCreator = ticketData && ticketData.openerId === interaction.user.id;
            const hasPermission = ALLOWED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId)) || isTicketCreator;
            
            if (!hasPermission) {
                return interaction.reply({
                    content: 'You do not have permission to close this ticket.',
                    ephemeral: true
                });
            }
            
            const confirmEmbed = new EmbedBuilder()
                .setColor(PINK_COLOR)
                .setTitle('Are you sure?')
                .setDescription('Are you sure you would like to close this ticket?\n\nThis action can not be reversed.');
            
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close_cancel')
                    .setLabel('Cancel')
                    .setEmoji({ id: '1351689463453061130' })
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('ticket_close_continue')
                    .setLabel('Continue')
                    .setEmoji({ id: '1357478063616688304' })
                    .setStyle(ButtonStyle.Danger)
            );
            
            await interaction.reply({ 
                embeds: [confirmEmbed], 
                components: [confirmRow],
                ephemeral: true 
            });
        } catch (error) {
            console.error(`[CLOSE_TICKET] Error: ${error.message}`);
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: 'An error occurred. Please try again later.',
                        ephemeral: true
                    });
                } catch (replyError) {
                    console.error(`[CLOSE_TICKET] Error sending reply: ${replyError.message}`);
                }
            }
        }
    },
    
    'ticket_close_cancel': async (interaction) => {
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: 'Ticket close cancelled.', components: [] });
            } else if (interaction.replied) {
                await interaction.followUp({ content: 'Ticket close cancelled.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Ticket close cancelled.', ephemeral: true });
            }
        } catch (err) {
            console.error('[TICKET_CLOSE] Cancel error:', err);
        }
        return;
    },

    'ticket_close_continue': async (interaction) => {
        try {
            const { deleteTicket } = require('../tickets.js');
            // Defer to acknowledge quickly
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            // Attempt to delete the ticket channel
            await deleteTicket(interaction.channel, interaction.user);
            // Note: channel deletion will remove the context, reply may fail silently
        } catch (err) {
            console.error('[TICKET_CLOSE] Continue error:', err);
            if (interaction.deferred && !interaction.replied) {
                await interaction.followUp({ content: 'Failed to delete ticket.', ephemeral: true }).catch(() => {});
            }
        }
        return;
    },

    // ===== Payment completed for profile purchase =====
    'payment_completed_profile_': async (interaction) => {
        const ALLOWED = ['987751357773672538', '986164993080836096'];
        if (!ALLOWED.includes(interaction.user.id)) {
            await interaction.reply({ content: '❌ You are not authorized to use this button.', ephemeral: true });
            return;
        }

        const listingId = interaction.customId.split('_').pop();

        // Defer to acknowledge the button click quickly
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        // Prompt for transaction image
        const txEmbed = new EmbedBuilder()
            .setTitle('Transaction Image')
            .setDescription('Please upload a screenshot that shows proof of the completed transaction.')
            .setColor(PINK_COLOR);

        const promptMsg = await interaction.channel.send({
            content: `<@${interaction.user.id}>`,
            embeds: [txEmbed]
        });

        // Store flow info so we can validate later steps
        profilePurchaseFlow.set(interaction.channel.id, {
            authorizedUserId: interaction.user.id,
            listingId
        });

        // Collector waiting for image attachment from the same user
        const filter = msg => {
            if (msg.author.id !== interaction.user.id) return false;

            // Accept if the message has at least one attachment (image)
            if (msg.attachments.size > 0) return true;

            // Accept if message content contains an image URL (.png/.jpg/.jpeg/.webp/.gif) or Discord media CDN link
            const urlRegex = /(https?:\/\/[^\s]+\.(?:png|jpe?g|webp|gif))/i;
            const discordCdnRegex = /https?:\/\/media\.discordapp\.net\/[^\s]+/i;
            if (urlRegex.test(msg.content) || discordCdnRegex.test(msg.content)) return true;

            return false;
        };
        const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 300_000 }); // 5 minutes

        collector.on('collect', async (message) => {
            try { await promptMsg.delete().catch(() => {}); } catch {}

            // Extract image URL or attachment
            let imageUrl = null;
            if (message.attachments.size > 0) {
                imageUrl = message.attachments.first().url;
                } else {
                // Check for URLs in message content
                const urlRegex = /(https?:\/\/[^\s]+\.(?:png|jpe?g|webp|gif))/i;
                const discordCdnRegex = /https?:\/\/media\.discordapp\.net\/[^\s]+/i;
                const urlMatch = message.content.match(urlRegex) || message.content.match(discordCdnRegex);
                if (urlMatch) {
                    imageUrl = urlMatch[0];
                }
            }

            // Update profilePurchaseFlow with image URL
            const flowData = profilePurchaseFlow.get(interaction.channel.id);
            if (flowData) {
                flowData.imageUrl = imageUrl;
                profilePurchaseFlow.set(interaction.channel.id, flowData);
            }

            const descEmbed = new EmbedBuilder()
                .setTitle('Account Description')
                .setDescription('Please upload the description of the account, this will be added sent in https://discord.com/channels/1292895164595175444/1293288739669413928')
                .setColor(PINK_COLOR);

            const uploadBtn = new ButtonBuilder()
                .setCustomId(`upload_description_${listingId}_${interaction.user.id}`)
                .setLabel('Upload Description')
                .setEmoji({ id: '1391899181488279685' })
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(uploadBtn);

            await interaction.channel.send({
                content: `<@${interaction.user.id}>`,
                embeds: [descEmbed],
                components: [row]
            });

            await interaction.followUp({ content: '✅ Transaction image received. Please provide the account description.', ephemeral: true });
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.followUp({ content: '⏰ No image received within 5 minutes. Please click the button again if needed.', ephemeral: true }).catch(() => {});
            }
        });
    },

    // ===== Upload description button =====
    'upload_description_': async (interaction) => {
        const parts = interaction.customId.split('_'); // upload description <listingId> <userId>
        if (parts.length < 4) return; // safety guard
        const listingId = parts[2];
        const authorizedUserId = parts[3];

        if (interaction.user.id !== authorizedUserId) {
            await interaction.reply({ content: '❌ Only the staff member who clicked Payment Completed can upload the description.', ephemeral: true });
                return;
            }
            
        // Build and show modal
        const modal = new ModalBuilder()
            .setCustomId(`description_modal_${listingId}_${authorizedUserId}`)
            .setTitle('Upload Account Description');

        const input = new TextInputBuilder()
            .setCustomId('account_description')
            .setLabel('Account Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Describe the account, this will be uploaded as {description} Profile')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));

        await interaction.showModal(modal);
    },

    // Ticket confirmation buttons
    'confirm_ticket': handleTicketConfirm,
    'cancel_ticket': handleTicketCancel,
    
    // Add all boost management handlers
    ...boostManagementHandlers,
    
    // Add all staff operations handlers
    ...staffOperationsHandlers,

    // Crypto withdrawal handlers
    'withdraw_complete_': async (interaction) => {
        // ... existing code ...
    },

    // Withdrawal method selection handlers
    withdraw_paypal: async (interaction) => {
        try {
            await showCryptoModal(interaction, 'PayPal');
        } catch (error) {
            console.error('[WITHDRAW_PAYPAL] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing PayPal withdrawal.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    withdraw_crypto: async (interaction) => {
        try {
            // Show crypto selection for withdrawal
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('Select Cryptocurrency')
                .setDescription('Choose which cryptocurrency you want to withdraw to:')
                .setColor('#e68df2');
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('withdraw_crypto_btc')
                    .setLabel('Bitcoin (BTC)')
                    .setEmoji('<:bitcoin:1371863500720177314>')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('withdraw_crypto_ltc')
                    .setLabel('Litecoin (LTC)')
                    .setEmoji('<:litecoin:1371863500720177314>')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('withdraw_crypto_sol')
                    .setLabel('Solana (SOL)')
                    .setEmoji('<:solana:1371863500720177314>')
                    .setStyle(ButtonStyle.Danger)
            );
            
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } catch (error) {
            console.error('[WITHDRAW_CRYPTO] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing crypto withdrawal.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    withdraw_iban: async (interaction) => {
        try {
            await showCryptoModal(interaction, 'IBAN');
        } catch (error) {
            console.error('[WITHDRAW_IBAN] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing IBAN withdrawal.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    // Specific crypto withdrawal handlers
    withdraw_crypto_btc: async (interaction) => {
        try {
            await showCryptoModal(interaction, 'Bitcoin');
        } catch (error) {
            console.error('[WITHDRAW_CRYPTO_BTC] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing Bitcoin withdrawal.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    withdraw_crypto_ltc: async (interaction) => {
        try {
            await showCryptoModal(interaction, 'Litecoin');
        } catch (error) {
            console.error('[WITHDRAW_CRYPTO_LTC] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing Litecoin withdrawal.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    withdraw_crypto_sol: async (interaction) => {
        try {
            await showCryptoModal(interaction, 'Solana');
        } catch (error) {
            console.error('[WITHDRAW_CRYPTO_SOL] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing Solana withdrawal.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    // Affiliate handlers
}; // end buttonHandlers

const paymentButtonHandlers = {
    'payment_completed_paypal': paypalPaymentCompletedHandler,
    'payment_completed_crypto': cryptoPaymentCompleted,
    'payment_completed_iban': async (interaction) => {
        // Modern IBAN handler - direct staff verification without countdown
        try {
            // Call the auto-close handler first to stop auto-close system
            try {
                const { handlePaymentCompleted } = require('../tickets.js');
                await handlePaymentCompleted(interaction.channel.id, interaction.user.id);
            } catch (error) {
                console.error('[PAYMENT_COMPLETED_IBAN] Error handling auto-close logic:', error);
            }
            
            const { sendStaffPaymentVerificationEmbed } = require('../ticketPayments.js');
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
        // Modern Tikkie handler - direct staff verification without countdown
        try {
            // Call the auto-close handler first to stop auto-close system
            try {
                const { handlePaymentCompleted } = require('../tickets.js');
                await handlePaymentCompleted(interaction.channel.id, interaction.user.id);
            } catch (error) {
                console.error('[PAYMENT_COMPLETED_TIKKIE] Error handling auto-close logic:', error);
            }
            
            const { sendStaffPaymentVerificationEmbed } = require('../ticketPayments.js');
            await sendStaffPaymentVerificationEmbed(interaction.channel, interaction.user.id, 'tikkie');
            await interaction.reply({
                content: 'Payment confirmation sent to staff for verification.',
                ephemeral: true
            });
        } catch (error) {
            console.error('Error handling Tikkie payment completion:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred. Please try again or contact staff.',
                    ephemeral: true
                });
            }
        }
    },
    // Crypto modals that are technically 'payment completed' flows
    'payment_completed_ltc': buttonHandlers.payment_completed_ltc,
    'payment_completed_sol': buttonHandlers.payment_completed_sol,
    'payment_completed_btc': buttonHandlers.payment_completed_btc,
};

async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    console.log(`[BUTTON_HANDLER] Received button interaction with customId: ${customId} from user ${interaction.user.id}`);

    // CHECK BUTTON RATE LIMITS FIRST
    const { checkButtonRateLimit } = require('../src/utils/rateLimitSystem');
    const rateLimitCheck = await checkButtonRateLimit(interaction.user.id, `button:${customId}`);
    
    if (!rateLimitCheck.allowed) {
        console.log(`[BUTTON_HANDLER] User ${interaction.user.id} blocked by button rate limit: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: rateLimitCheck.reason,
                ephemeral: true
            }).catch(console.error);
        }
        return;
    }

    // Handle upload description button (dynamic IDs) - PRIORITY FIRST
    if (customId.startsWith('upload_description_')) {
        try {
            await buttonHandlers['upload_description_'](interaction);
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling upload description button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing this action.', ephemeral: true }).catch(console.error);
            }
        }
        return;
    }

    // Handle review and feedback buttons with user IDs (review_button_123456789, feedback_button_123456789)
    if (customId.startsWith('review_button_') || customId.startsWith('feedback_button_')) {
        const baseId = customId.split('_')[0] + '_' + customId.split('_')[1]; // Gets 'review_button' or 'feedback_button'
        
        try {
            console.log(`[BUTTON_HANDLER] Processing dynamic button with base ID: ${baseId}`);
            
            if (buttonHandlers[baseId]) {
                await buttonHandlers[baseId](interaction);
            } else {
                console.error(`[BUTTON_HANDLER] No handler found for base ID ${baseId} from ${customId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'This button function is currently unavailable.',
                        ephemeral: true 
                    });
                }
            }
            return;
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling dynamic button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing this action.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }

    // Handle affiliate withdrawal management buttons (dynamic IDs)
    if (
        customId.startsWith('withdraw_complete_') ||
        customId.startsWith('withdraw_copy_') ||
        customId.startsWith('withdraw_cancel_nrf_') ||
        customId.startsWith('withdraw_cancel_refund_')
    ) {
        try {
            // Re-use the unified handler defined with key `withdraw_complete_`
            await buttonHandlers['withdraw_complete_'](interaction);
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling withdrawal button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing this withdrawal action.', ephemeral: true }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.followUp({ content: 'An error occurred while processing this withdrawal action.', ephemeral: true }).catch(e => console.error('Error in withdrawal followUp:', e));
            }
        }
        return;
    }

    // Handle profile purchase and regular payment completed buttons
    if (customId.startsWith('payment_completed_')) {
        try {
            let handler;
            // Handle profile purchase with dynamic listing ID
            if (customId.startsWith('payment_completed_profile_')) {
                handler = buttonHandlers['payment_completed_profile_'];
            } else {
                // Handle specific payment methods
                const handlerKey = customId.startsWith('payment_completed_crypto') ? 'payment_completed_crypto' : customId;
                handler = paymentButtonHandlers[handlerKey] || buttonHandlers[handlerKey];
            }

            if (handler) {
                await handler(interaction);
            } else {
                console.error(`[BUTTON_HANDLER] No handler found for payment button ${customId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'This payment action is currently unavailable.', ephemeral: true });
                }
            }
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling payment completed button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing this payment action.', ephemeral: true }).catch(console.error);
            }
        }
        return;
    }

    // Handle static button IDs with registered handlers
    if (buttonHandlers[customId]) {
        try {
            await buttonHandlers[customId](interaction);
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error in static handler for ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred with this action.', ephemeral: true }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.followUp({ content: 'An error occurred with this action.', ephemeral: true }).catch(e => console.error("Error in static handler followUp:",e));
            }
        }
        return;
    }

    // Handle review accept/deny buttons
    if (customId.startsWith('review_accept_') || customId.startsWith('review_deny_')) {
        try {
            const reviewHandler = require('../review.js');
            if (reviewHandler && reviewHandler.handleButton) {
                await reviewHandler.handleButton(interaction);
                return;
            } else {
                console.error(`[BUTTON_HANDLER] Review handler not found for ${customId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'The review moderation function is currently unavailable.',
                        ephemeral: true 
                    });
                }
                return;
            }
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling review moderation button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing the review moderation.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }

    // Handle review star rating buttons
    if (customId.startsWith('review_star_')) {
        try {
            // Get the reviewStarHandler from paymentHandlers.js
            const reviewStarHandler = require('../paymentHandlers.js').reviewFeedbackButtonHandlers['review_star_1'];
            
            if (reviewStarHandler) {
                await reviewStarHandler(interaction);
                return;
            } else {
                console.error(`[BUTTON_HANDLER] No handler found for review star rating from ${customId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'The rating function is currently unavailable.',
                        ephemeral: true 
                    });
                }
                return;
            }
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling star rating button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your rating.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }
    
    // Handle feedback star rating buttons
    if (customId.startsWith('feedback_star_')) {
        try {
            // Get the feedbackStarHandler from paymentHandlers.js
            const feedbackStarHandler = require('../paymentHandlers.js').reviewFeedbackButtonHandlers['feedback_star_1'];
            
            if (feedbackStarHandler) {
                await feedbackStarHandler(interaction);
                return;
            } else {
                console.error(`[BUTTON_HANDLER] No handler found for feedback star rating from ${customId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'The feedback rating function is currently unavailable.',
                        ephemeral: true 
                    });
                }
                return;
            }
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling feedback star rating button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your feedback rating.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }
    
    // Handle anonymous/username selection for reviews
    if (customId.startsWith('review_anonymous_') || customId.startsWith('review_username_')) {
        try {
            const baseId = customId.split('_')[0] + '_' + customId.split('_')[1]; // Gets 'review_anonymous' or 'review_username'
            if (reviewFeedbackButtonHandlers[baseId]) {
                await reviewFeedbackButtonHandlers[baseId](interaction);
                return;
            }
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling review anonymity button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your selection.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }

    // Handle anonymous/username selection for feedback
    if (customId.startsWith('feedback_anonymous_') || customId.startsWith('feedback_username_')) {
        try {
            const baseId = customId.split('_')[0] + '_' + customId.split('_')[1]; // Gets 'feedback_anonymous' or 'feedback_username'
            if (reviewFeedbackButtonHandlers[baseId]) {
                await reviewFeedbackButtonHandlers[baseId](interaction);
                return;
            }
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling feedback anonymity button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your feedback selection.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }

    // Handle dynamic ticket confirm/cancel buttons
    if (customId.startsWith('confirm_ticket_') || customId.startsWith('cancel_ticket_')) {
        try {
            const parts = customId.split('_');
            const action = parts[0]; // 'confirm' or 'cancel'
            
            if (action === 'confirm') {
                await handleTicketConfirm(interaction);
            } else if (action === 'cancel') {
                await handleTicketCancel(interaction);
            }
            return;
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling ticket action ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred with your ticket request.', ephemeral: true }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.followUp({ content: 'An error occurred with your ticket request.', ephemeral: true }).catch(console.error);
            }
            return;
        }
    }

    // Handle dynamic staff confirmation/cancellation
    if (customId.startsWith('staff_confirm_payment_') || customId.startsWith('staff_cancel_payment_')) {
        try {
            const parts = customId.split('_');
            if (parts.length < 6) {
                console.error(`[STAFF_BUTTON_DYN] Invalid customId format: ${customId}. Expected 6 parts.`);
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(console.error);
                await interaction.followUp({ content: 'Error: Action ID format incorrect.', ephemeral: true });
                return;
            }

            const action = parts[1]; 
            const paymentType = parts[3];
            const targetUserId = parts[4];
            const verifierId = parts[5];

            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(e => console.error("Error deferring in staff dynamic handler:", e));
            
            console.log(`[STAFF_BUTTON_DYN] Handling: Action=${action}, Type=${paymentType}, TargetUser=${targetUserId}, Verifier=${verifierId}, Clicker=${interaction.user.id}`);

            // Allow either the target user OR the verifier to click the button
            if (interaction.user.id !== targetUserId && interaction.user.id !== verifierId) {
                await interaction.followUp({ content: 'You are not authorized to perform this action.', ephemeral: true });
                console.log(`[STAFF_BUTTON_DYN] Unauthorized click by ${interaction.user.id} (expected ${targetUserId} or ${verifierId}) for ${customId}`);
                return;
            }

            const ticketChannel = interaction.channel;
            const originalMessage = interaction.message;
            const userFlowData = flowState.get(targetUserId) || {}; 
            // Extract order details from channel messages
            let orderDetails = { 
                price: 'N/A', 
                current: 'N/A', 
                desired: 'N/A', 
                paymentMethod: paymentType 
            };
            
            try {
                const messages = await ticketChannel.messages.fetch({ limit: 20 });
                const orderDetailMsg = messages.find(msg => 
                    msg.embeds.length > 0 && 
                    (msg.embeds[0].description?.includes('Current Rank') || 
                     msg.embeds[0].description?.includes('Current Mastery') || 
                     msg.embeds[0].description?.includes('Current Trophies') ||
                     msg.embeds[0].description?.includes('Final Price'))
                );
                
                if (orderDetailMsg && orderDetailMsg.embeds[0]) {
                    const embedDesc = orderDetailMsg.embeds[0].description;
                    
                    // Try to parse current rank/mastery/trophies
                    const currentMatch = embedDesc.match(/\*\*Current .*?:\*\*\s*`([^`]+)`/i);
                    if (currentMatch && currentMatch[1]) {
                        orderDetails.current = currentMatch[1];
                    }
                    
                    // Try to parse desired rank/mastery/trophies
                    const desiredMatch = embedDesc.match(/\*\*Desired .*?:\*\*\s*`([^`]+)`/i);
                    if (desiredMatch && desiredMatch[1]) {
                        orderDetails.desired = desiredMatch[1];
                    }
                    
                    // Try to parse price
                    const priceMatch = embedDesc.match(/\*\*Final Price:\*\*\s*`([^`]+)`/i);
                    if (priceMatch && priceMatch[1]) {
                        orderDetails.price = priceMatch[1];
                    }
                    
                    // Try to parse P11 count for ranked boosts
                    const p11Match = embedDesc.match(/\*\*P11 Count:\*\*\s*`([^`]+)`/i);
                    if (p11Match && p11Match[1]) {
                        orderDetails.p11Count = p11Match[1];
                    }
                    
                    console.log(`[STAFF_BUTTON_DYN] Extracted order details: ${JSON.stringify(orderDetails)}`);
                }
            } catch (error) {
                console.error(`[STAFF_BUTTON_DYN] Error extracting order details: ${error.message}`);
            }

            if (action === 'confirm') {
                await sendBoostAvailableEmbed(ticketChannel, orderDetails, targetUserId);
                
                // Clean up payment method messages AFTER boost available is sent
                const { cleanupMessages } = require('../src/utils/messageCleanup.js');
                await cleanupMessages(ticketChannel, null, 'payment_confirmed');
                
                const confirmedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                    .setTitle(`${paymentType.toUpperCase()} Payment Confirmed`)
                    .setDescription(`Payment confirmed by <@${interaction.user.id}>. Boost is now available.`)
                    .setColor(0x00FF00); 
                await originalMessage.edit({ embeds: [confirmedEmbed], components: [] });
                console.log(`[STAFF_BUTTON_DYN] Staff ${interaction.user.id} confirmed ${paymentType} payment for user ${targetUserId}.`);

            } else if (action === 'cancel') {
                const cancelledEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                    .setTitle(`${paymentType.toUpperCase()} Payment Not Received`)
                    .setDescription(`Payment status updated to 'Not Received' by <@${interaction.user.id}>.`)
                    .setColor(0xFF0000); 
                await originalMessage.edit({ embeds: [cancelledEmbed], components: [] });

                await ticketChannel.send({ content: `<@${targetUserId}>, your ${paymentType} payment could not be confirmed by staff. Please check with them for details.` });
                console.log(`[STAFF_BUTTON_DYN] Staff ${interaction.user.id} cancelled ${paymentType} payment for user ${targetUserId}.`);
            }
        } catch (error) {
            console.error(`[STAFF_BUTTON_DYN] Error handling dynamic staff button ${customId}:`, error);
            if (interaction.deferred && !interaction.replied) {
                await interaction.followUp({ content: 'An error occurred while processing this staff action.', ephemeral: true }).catch(e => console.error("Error in staff dynamic handler followUp:", e));
            } else if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: 'An error occurred processing staff action.', ephemeral: true }).catch(console.error);
            }
        }
        return;
    }
    
    if (customId.startsWith('resend_crypto_')) {
        try {
            const parts = customId.split('_'); 
            if (parts.length < 5) {
                 console.error(`[CRYPTO_RESEND_DYN] Invalid customId: ${customId}. Expected 5 parts.`);
                 if(!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(console.error);
                 await interaction.followUp({content: "Error: Resend ID format incorrect.", ephemeral: true});
                 return;
            }
            const coinType = parts[2].toLowerCase(); 
            const priceInEuros = parseFloat(parts[3]);
            const userId = parts[4]; 
            const ticketChannel = interaction.channel;

            if (isNaN(priceInEuros)) {
                console.error(`[CRYPTO_RESEND_DYN] Invalid price in customId: ${customId}. Price: ${parts[3]}`);
                if(!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(console.error);
                await interaction.followUp({content: "Error: Invalid price in resend ID.", ephemeral: true});
                return;
            }

            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(e => console.error("Error deferring in crypto resend handler:", e));
            
            console.log(`[CRYPTO_RESEND_DYN] User ${interaction.user.id} (original payment for ${userId}) clicked resend for ${coinType} at €${priceInEuros}`);
            
            await interaction.message.delete().catch(e => console.warn("[CRYPTO_RESEND_DYN] Could not delete crypto failed message:", e));

            if (coinType === 'ltc') {
                await resendLitecoinEmbed(ticketChannel, userId, priceInEuros, interaction);
            } else if (coinType === 'sol') { 
                await resendSolanaEmbed(ticketChannel, userId, priceInEuros, interaction);
            } else if (coinType === 'btc') {
                await resendBitcoinEmbed(ticketChannel, userId, interaction); 
            } else {
                console.error(`[CRYPTO_RESEND_DYN] Unknown coin type for resend: ${coinType}`);
                await ticketChannel.send({content: `Could not resend payment info for the coin type: ${coinType}. Please contact staff.`});
                return;
            }
            console.log(`[CRYPTO_RESEND_DYN] Resent ${coinType} payment info for user ${userId}.`);

        } catch (error) {
            console.error(`[CRYPTO_RESEND_DYN] Error handling ${customId}:`, error);
            if (interaction.deferred && !interaction.replied) {
                await interaction.followUp({ content: 'An error occurred while resending payment information.', ephemeral: true }).catch(e => console.error("Error in crypto resend followUp:",e));
            }
        }
        return;
    }

    // Handle affiliate copy link button
    if (customId.startsWith('affiliate_copy_')) {
        const code = customId.replace('affiliate_copy_', '');
        const link = `https://discord.gg/${code}`;
        try {
            await interaction.reply({ content: link, ephemeral: true });
        } catch(err){
            console.error('[AFFILIATE_COPY] Error sending link:', err);
        }
        return;
    }

    // Handle list command buttons (more_info, purchase_account, listing_mark_sold)
    if (customId.startsWith('more_info_') || customId.startsWith('purchase_account_') || customId.startsWith('listing_mark_sold_')) {
        try {
            const { handleListButtons } = require('../commands.js');
            await handleListButtons(interaction);
            return;
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling list button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing this action.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }

    // === DISCOUNT SYSTEM HANDLERS ===
    if (customId === 'claim_10_percent_discount') {
        try {
            const { handleClaimDiscountButton } = require('../src/handlers/discountHandlers.js');
            await handleClaimDiscountButton(interaction);
            return;
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling discount claim button:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while claiming your discount.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }

    // Handle discount ticket buttons (same as regular but with discount flag)
    if (customId.startsWith('discount_ticket_')) {
        try {
            const ticketType = customId.replace('discount_ticket_', '');
            console.log(`[DISCOUNT_TICKET] User ${interaction.user.id} clicked discount ticket button: ${ticketType}`);
            
            // Mark this user as having a discount for the flow
            flowState.set(interaction.user.id, {
                type: ticketType,
                hasDiscount: true,
                discountClaimed: true,
                timestamp: Date.now()
            });
            
            // Route to appropriate handler based on ticket type
            if (ticketType === 'ranked') {
                const { handleRankedFlow } = require('../src/modules/ticketFlow.js');
                await handleRankedFlow(interaction);
            } else if (ticketType === 'bulk') {
                const { handleBulkFlow } = require('../src/modules/ticketFlow.js');
                await handleBulkFlow(interaction);
            } else if (ticketType === 'trophies') {
                // Handle trophies with modal (same as regular ticket_trophies)
                const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
                
                const modal = new ModalBuilder()
                    .setCustomId('modal_trophies_start')
                    .setTitle('Trophies Boost');

                const brawlerNameInput = new TextInputBuilder()
                    .setCustomId('brawler_name')
                    .setLabel('Brawler Name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter the name of the brawler')
                    .setRequired(true);

                const currentInput = new TextInputBuilder()
                    .setCustomId('brawler_current')
                    .setLabel('Current Trophies')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter the current trophy count')
                    .setRequired(true);

                const desiredInput = new TextInputBuilder()
                    .setCustomId('brawler_desired')
                    .setLabel('Desired Trophies')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter the desired trophy count')
                    .setRequired(true);

                const brawlerLevelInput = new TextInputBuilder()
                    .setCustomId('brawler_level')
                    .setLabel('Brawler Power Level (1-11)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter the power level of the brawler (1-11)')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(brawlerNameInput),
                    new ActionRowBuilder().addComponents(currentInput),
                    new ActionRowBuilder().addComponents(desiredInput),
                    new ActionRowBuilder().addComponents(brawlerLevelInput)
                );
                
                await interaction.showModal(modal);
            } else if (ticketType === 'other') {
                // Handle other with modal (same as regular ticket_other)
                const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
                
                const modal = new ModalBuilder()
                    .setCustomId('modal_other_request')
                    .setTitle('Other Request');

                const requestDetailsInput = new TextInputBuilder()
                    .setCustomId('other_request')
                    .setLabel('Request Details')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Please describe your request in detail')
                    .setRequired(true)
                    .setMaxLength(1000);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(requestDetailsInput)
                );
                
                await interaction.showModal(modal);
            }
            return;
        } catch (error) {
            console.error(`[DISCOUNT_TICKET] Error handling discount ticket button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                }).catch(console.error);
            }
            return;
        }
    }

    // If no handler is found, log it
    console.log(`[BUTTON_HANDLER] No specific handler found for customId: ${customId}. User: ${interaction.user.id}, Channel: ${interaction.channel?.id}`);
    
    // Send a default response for unhandled buttons
    if (!interaction.replied && !interaction.deferred) {
        try {
            await interaction.reply({
                content: 'This feature is currently unavailable or under maintenance.',
                ephemeral: true
            });
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error sending default response:`, error);
        }
    }
}

// Combine all button handlers
const combinedButtonHandlers = {
    ...buttonHandlers,
    ...allButtonHandlers
};

module.exports = {
    handleButtonInteraction,
    profilePurchaseFlow
}; 