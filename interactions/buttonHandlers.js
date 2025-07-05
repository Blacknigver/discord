const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, InteractionResponseFlags } = require('discord.js');
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
    handleMasteryFlow,
    getRankValue,
    getMasteryValue,
    handleRankedRankSelection,
    handleMasterySelection,
    createRankedSelectionRows,
    showPriceEmbed,
    handleTicketConfirm,
    handleTicketCancel,
    getChannelNameByType,
    getCategoryIdByType
} = require('../src/modules/ticketFlow.js');
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
    sendPayPalGiftcardEmbed,
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
    sendPaymentConfirmationEmbedWithCountdown,
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

const buttonHandlers = {
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

    ticket_mastery: async (interaction) => {
        try {
            flowState.set(interaction.user.id, { 
                type: 'mastery', 
                step: 'brawler_input',
                timestamp: Date.now()
            });
            await handleMasteryFlow(interaction);
        } catch (error) {
            console.error('[TICKET_MASTERY] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while creating the mastery ticket.',
                    ephemeral: true
                }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: 'An error occurred while creating the mastery ticket.'
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

    btn_apple_giftcard: async (interaction) => {
        try {
            await sendPaymentInfoEmbed(interaction.channel, 'German Apple Giftcard');
            await interaction.deferUpdate();
        } catch (error) {
            console.error('[BTN_APPLE_GIFTCARD] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while showing Apple Giftcard information.',
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

    // Gold 1 specific handler to fix flow issues
    'mastery_Gold_1_fix': async (interaction) => {
        console.log('Using mastery_Gold_1_fix handler');
        const userData = flowState.get(interaction.user.id);
        if (!userData) {
            return interaction.reply({
                content: 'Session data not found. Please try again.',
                ephemeral: true
            });
        }

        if (userData.step === 'desired_mastery_specific') {
            userData.desiredMastery = 'Gold';
            userData.desiredMasterySpecific = '1';
            userData.formattedDesiredMastery = 'Gold 1';
            userData.step = 'payment_method';

            const currentValue = getMasteryValue(userData.currentMastery, userData.currentMasterySpecific);
            const desiredValue = getMasteryValue('Gold', '1');

            if (desiredValue <= currentValue) {
                return interaction.reply({
                    content: 'Desired mastery must be higher than current mastery.',
                    ephemeral: true
                });
            }

            flowState.set(interaction.user.id, userData);
            return showPaymentMethodSelection(interaction);
        }

        return interaction.reply({
            content: 'This button is not valid for your current step.',
            ephemeral: true
        });
    },

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
    'ranked_Pro_1': async (interaction) => handleRankedRankSelection(interaction, 'Pro', '1'),
    'ranked_Pro_2': async (interaction) => handleRankedRankSelection(interaction, 'Pro', '2'),
    'ranked_Pro_3': async (interaction) => handleRankedRankSelection(interaction, 'Pro', '3'),
    'ranked_Masters_1': async (interaction) => handleRankedRankSelection(interaction, 'Masters', '1'),
    'ranked_Masters_2': async (interaction) => handleRankedRankSelection(interaction, 'Masters', '2'),
    'ranked_Masters_3': async (interaction) => handleRankedRankSelection(interaction, 'Masters', '3'),
    'ranked_Legendary_1': async (interaction) => handleRankedRankSelection(interaction, 'Legendary', '1'),
    'ranked_Legendary_2': async (interaction) => handleRankedRankSelection(interaction, 'Legendary', '2'),
    'ranked_Legendary_3': async (interaction) => handleRankedRankSelection(interaction, 'Legendary', '3'),
    'ranked_Mythic_1': async (interaction) => handleRankedRankSelection(interaction, 'Mythic', '1'),
    'ranked_Mythic_2': async (interaction) => handleRankedRankSelection(interaction, 'Mythic', '2'),
    'ranked_Mythic_3': async (interaction) => handleRankedRankSelection(interaction, 'Mythic', '3'),
    'ranked_Diamond_1': async (interaction) => handleRankedRankSelection(interaction, 'Diamond', '1'),
    'ranked_Diamond_2': async (interaction) => handleRankedRankSelection(interaction, 'Diamond', '2'),
    'ranked_Diamond_3': async (interaction) => handleRankedRankSelection(interaction, 'Diamond', '3'),
    'ranked_Gold_1': async (interaction) => handleRankedRankSelection(interaction, 'Gold', '1'),
    'ranked_Gold_2': async (interaction) => handleRankedRankSelection(interaction, 'Gold', '2'),
    'ranked_Gold_3': async (interaction) => handleRankedRankSelection(interaction, 'Gold', '3'),
    'ranked_Silver_1': async (interaction) => handleRankedRankSelection(interaction, 'Silver', '1'),
    'ranked_Silver_2': async (interaction) => handleRankedRankSelection(interaction, 'Silver', '2'),
    'ranked_Silver_3': async (interaction) => handleRankedRankSelection(interaction, 'Silver', '3'),
    'ranked_Bronze_1': async (interaction) => handleRankedRankSelection(interaction, 'Bronze', '1'),
    'ranked_Bronze_2': async (interaction) => handleRankedRankSelection(interaction, 'Bronze', '2'),
    'ranked_Bronze_3': async (interaction) => handleRankedRankSelection(interaction, 'Bronze', '3'),

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

    // Mastery selection buttons 
    'mastery_Bronze': async (interaction) => handleMasterySelection(interaction, 'Bronze'),
    'mastery_Silver': async (interaction) => handleMasterySelection(interaction, 'Silver'),
    'mastery_Gold': async (interaction) => handleMasterySelection(interaction, 'Gold'),
    'mastery_Bronze_1': async (interaction) => handleMasterySelection(interaction, 'Bronze', '1'),
    'mastery_Bronze_2': async (interaction) => handleMasterySelection(interaction, 'Bronze', '2'),
    'mastery_Bronze_3': async (interaction) => handleMasterySelection(interaction, 'Bronze', '3'),
    'mastery_Silver_1': async (interaction) => handleMasterySelection(interaction, 'Silver', '1'),
    'mastery_Silver_2': async (interaction) => handleMasterySelection(interaction, 'Silver', '2'),
    'mastery_Silver_3': async (interaction) => handleMasterySelection(interaction, 'Silver', '3'),
    'mastery_Gold_1': async (interaction) => handleMasterySelection(interaction, 'Gold', '1'),
    'mastery_Gold_2': async (interaction) => handleMasterySelection(interaction, 'Gold', '2'),
    'mastery_Gold_3': async (interaction) => handleMasterySelection(interaction, 'Gold', '3'),

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
    payment_completed_ltc: async (interaction) => { return createCryptoTxForm(interaction, 'ltc'); },
    payment_completed_sol: async (interaction) => { return createCryptoTxForm(interaction, 'sol'); },
    payment_completed_btc: async (interaction) => { return createCryptoTxForm(interaction, 'btc'); },

    // Tikkie related handlers
    copy_tikkie_link: async (interaction) => { await interaction.reply({ content: 'https://tikkie.me/pay/im6epjm7vgj0d48n04p4', ephemeral: true }); },
    tikkie_link_expired: async (interaction) => { return sendLinkExpiredEmbed(interaction, 'Tikkie'); },
    payment_completed_tikkie: async (interaction) => { return sendPaymentConfirmationEmbed(interaction, 'Tikkie'); },
    
    // Crypto address copy handlers
    copy_ltc_address: async (interaction) => { await interaction.reply({ content: 'LMEBUghAdAKKdNTtUBExHyN33b6JS75TkH', ephemeral: true }); }, 
    copy_sol_address: async (interaction) => { await interaction.reply({ content: 'B9z5EhzPnPFf8t5CptAArYRFhzkrQkv1i7URz1pVSNdH', ephemeral: true }); },
    copy_btc_address: async (interaction) => { await interaction.reply({ content: 'bc1qcxrteqq6rgr4u5s6hg9n4d27zar22ssgzx7s8v', ephemeral: true }); }, 

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
                .setTitle('Close Ticket')
                .setDescription('Are you sure you want to close this ticket?');
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_close_ticket')
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_close_ticket')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );
            
            await interaction.reply({ 
                embeds: [confirmEmbed], 
                components: [row], 
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
    
    'confirm_close_ticket': async (interaction) => {
        try {
            await interaction.deferUpdate();
            
            const { closeTicket } = require('../tickets.js');
            await closeTicket(interaction.channel, interaction.user);
            
            await interaction.editReply({ 
                content: 'Closing ticket...', 
                embeds: [], 
                components: [] 
            });
            
            console.log(`[TICKET_CLOSE] Ticket ${interaction.channel.id} closed by ${interaction.user.id}`);
        } catch (error) {
            console.error(`[TICKET_CLOSE] Error closing ticket:`, error);
            try {
                await interaction.editReply({
                    content: 'An error occurred while closing the ticket.',
                    embeds: [],
                    components: []
                });
            } catch (replyError) {
                console.error(`[TICKET_CLOSE] Error updating reply: ${replyError.message}`);
            }
        }
    },
    
    'cancel_close_ticket': async (interaction) => {
        try {
            await interaction.update({ 
                content: 'Ticket close cancelled.', 
                embeds: [], 
                components: [], 
                ephemeral: true 
            });
        } catch (error) {
            console.error(`[TICKET_CANCEL] Error: ${error.message}`);
        }
    },
    
    // Reopen and delete ticket handlers
    'reopen_ticket': async (interaction) => {
        try {
            // Check permissions: only staff can reopen
            const ALLOWED_ROLES = [
                ROLE_IDS.OWNER || '1292933200389083196',      // Owner Role
                ROLE_IDS.HEAD_ADMIN || '1358101527658627270', // Head Admin Role
                ROLE_IDS.ADMIN || '1292933924116500532'       // Admin Role
            ];
            
            const hasPermission = ALLOWED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasPermission) {
                return interaction.reply({
                    content: 'You do not have permission to reopen this ticket.',
                    ephemeral: true
                });
            }
            
            await interaction.deferUpdate();
            
            const { reopenTicket } = require('../tickets.js');
            await reopenTicket(interaction.channel, interaction.user);
            
            // Update the button message
            await interaction.editReply({
                components: []
            });
            
            console.log(`[TICKET_REOPEN] Ticket ${interaction.channel.id} reopened by ${interaction.user.id}`);
        } catch (error) {
            console.error(`[TICKET_REOPEN] Error reopening ticket:`, error);
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: 'An error occurred while reopening the ticket.',
                        components: []
                    });
                } else if (!interaction.replied) {
                    await interaction.reply({
                        content: 'An error occurred while reopening the ticket.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error(`[TICKET_REOPEN] Error sending reply: ${replyError.message}`);
            }
        }
    },
    
    'delete_ticket': async (interaction) => {
        try {
            // Check permissions: only staff can delete
            const ALLOWED_ROLES = [
                ROLE_IDS.OWNER || '1292933200389083196',      // Owner Role
                ROLE_IDS.HEAD_ADMIN || '1358101527658627270', // Head Admin Role
                ROLE_IDS.ADMIN || '1292933924116500532'       // Admin Role
            ];
            
            const hasPermission = ALLOWED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasPermission) {
                return interaction.reply({
                    content: 'You do not have permission to delete this ticket.',
                    ephemeral: true
                });
            }
            
            // Confirm deletion
            const confirmEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Delete Ticket')
                .setDescription('Are you sure you want to permanently delete this ticket? This action cannot be undone.');
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_delete_ticket')
                    .setLabel('Confirm Delete')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_delete_ticket')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );
            
            await interaction.reply({
                embeds: [confirmEmbed],
                components: [row],
                ephemeral: true
            });
            
            console.log(`[TICKET_DELETE] Delete requested for ticket ${interaction.channel.id} by ${interaction.user.id}`);
        } catch (error) {
            console.error(`[TICKET_DELETE] Error with delete request:`, error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred while processing your delete request.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error(`[TICKET_DELETE] Error sending reply: ${replyError.message}`);
            }
        }
    },
    
    'confirm_delete_ticket': async (interaction) => {
        try {
            await interaction.deferUpdate();
            
            const { deleteTicket } = require('../tickets.js');
            await deleteTicket(interaction.channel, interaction.user);
            
            await interaction.editReply({
                content: 'Deleting ticket...',
                embeds: [],
                components: []
            });
            
            console.log(`[TICKET_DELETE] Ticket ${interaction.channel.id} being deleted by ${interaction.user.id}`);
        } catch (error) {
            console.error(`[TICKET_DELETE] Error deleting ticket:`, error);
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: 'An error occurred while deleting the ticket.',
                        embeds: [],
                        components: []
                    });
                }
            } catch (replyError) {
                console.error(`[TICKET_DELETE] Error updating reply: ${replyError.message}`);
            }
        }
    },
    
    'cancel_delete_ticket': async (interaction) => {
        try {
            await interaction.update({
                content: 'Ticket deletion cancelled.',
                embeds: [],
                components: [],
                ephemeral: true
            });
        } catch (error) {
            console.error(`[TICKET_DELETE_CANCEL] Error: ${error.message}`);
        }
    },

    // PayPal ToS acceptance and denial
    paypal_accept: async (interaction) => {
        try {
            const { handlePayPalAcceptToS } = require('../src/handlers/paypalButtonHandler');
            await handlePayPalAcceptToS(interaction);
        } catch (error) {
            console.error(`[PAYPAL_ACCEPT] Error handling PayPal ToS acceptance: ${error.message}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred processing your request.', 
                    ephemeral: true 
                }).catch(console.error);
            }
        }
    },
    
    paypal_deny: async (interaction) => {
        try {
            const { handlePayPalDenyToS } = require('../src/handlers/paypalButtonHandler');
            await handlePayPalDenyToS(interaction);
        } catch (error) {
            console.error(`[PAYPAL_DENY] Error handling PayPal ToS denial: ${error.message}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred processing your request.', 
                    ephemeral: true 
                }).catch(console.error);
            }
        }
    },
    
    // Ticket confirmation handlers
    confirm_ticket: async (interaction) => {
        const { handleTicketConfirm } = require('../src/modules/ticketFlow');
        try {
            await handleTicketConfirm(interaction);
        } catch (error) {
            console.error(`[CONFIRM_TICKET] Error handling confirm ticket: ${error.message}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred with your ticket request.', ephemeral: true }).catch(console.error);
            }
        }
    },
    
    cancel_ticket: async (interaction) => {
        const { handleTicketCancel } = require('../src/modules/ticketFlow');
        try {
            await handleTicketCancel(interaction);
        } catch (error) {
            console.error(`[CANCEL_TICKET] Error handling cancel ticket: ${error.message}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred with your ticket request.', ephemeral: true }).catch(console.error);
            }
        }
    },

    // PayPal specific handlers from paymentHandlers.js
    paypal_accept_tos: allButtonHandlers.paypal_accept_tos,
    paypal_deny_tos: allButtonHandlers.paypal_deny_tos,
    paypal_deny_confirmed: allButtonHandlers.paypal_deny_confirmed,
    paypal_deny_cancelled: allButtonHandlers.paypal_deny_cancelled,
    payment_completed_paypal: allButtonHandlers.payment_completed_paypal,
    paypal_payment_received: allButtonHandlers.paypal_payment_received,
    paypal_payment_not_received: allButtonHandlers.paypal_payment_not_received,
    claim_boost: allButtonHandlers.claim_boost,
    
    // Request Support button handler
    request_support: async (interaction) => {
        try {
            const userId = interaction.user.id;
            const channel = interaction.channel;
            
            // The user who clicks the button is always allowed to request support
            // This is because this button only appears in tickets and is meant for the ticket creator
            
            // Get the original message with all buttons
            const message = interaction.message;
            
            // Create a new row with the Request Support button disabled but other buttons still active
            const newRow = new ActionRowBuilder();
            
            // Loop through all buttons in the original message and only disable the Request Support button
            message.components[0].components.forEach(component => {
                if (component.customId === 'request_support') {
                    newRow.addComponents(
                        ButtonBuilder.from(component).setDisabled(true)
                    );
                } else {
                    newRow.addComponents(
                        ButtonBuilder.from(component)
                    );
                }
            });
            
            // Update the original message
            await interaction.update({ components: [newRow] });
            
            // Create and send the support request embed
            const supportEmbed = new EmbedBuilder()
                .setTitle('Support Requested')
                .setDescription(`<@${userId}> has requested support, please assist them.\n\n**Support will be with you shortly! Please be patient.**`)
                .setColor('#e68df2');
            
            // Send the support embed with role pings
            await channel.send({
                content: '<@&1292933200389083196> <@&1292933924116500532>',
                embeds: [supportEmbed]
            });
            
            console.log(`[REQUEST_SUPPORT] User ${userId} requested support in channel ${channel.id}`);
        } catch (error) {
            console.error('[REQUEST_SUPPORT] Error:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred while requesting support.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error(`[REQUEST_SUPPORT] Error sending reply: ${replyError.message}`);
            }
        }
    },
    
    // Direct button handlers for payment verification
    payment_received: async (interaction) => {
        try {
            const { handlePayPalPaymentReceived } = require('../src/handlers/paypalButtonHandler');
            await handlePayPalPaymentReceived(interaction);
            console.log(`[PAYMENT_HANDLER] Payment received button clicked by ${interaction.user.id}`);
        } catch (error) {
            console.error(`[PAYMENT_HANDLER] Error handling payment_received:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your payment verification.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },
    
    payment_not_received: async (interaction) => {
        try {
            const { handlePayPalPaymentNotReceived } = require('../src/handlers/paypalButtonHandler');
            await handlePayPalPaymentNotReceived(interaction);
            console.log(`[PAYMENT_HANDLER] Payment not received button clicked by ${interaction.user.id}`);
        } catch (error) {
            console.error(`[PAYMENT_HANDLER] Error handling payment_not_received:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your payment verification.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },
    
    // Alias for payment_completed_paypal
    payment_completed: async (interaction) => {
        try {
            // Use the direct handler from src/handlers/paypalButtonHandler.js 
            // to ensure we go through the screenshot collection flow
            const { handlePayPalPaymentCompleted } = require('../src/handlers/paypalButtonHandler');
            await handlePayPalPaymentCompleted(interaction);
            console.log(`[PAYMENT_COMPLETED] User ${interaction.user.id} clicked Payment Completed`);
        } catch (error) {
            console.error('[PAYMENT_COMPLETED] Error handling payment completed:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your payment completion.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },

    // Copy PayPal Email button handler
    copy_paypal_email: async (interaction) => {
        try {
            // Check if interaction can be replied to
            if (!interaction.isRepliable()) {
                console.log(`[COPY_PAYPAL_EMAIL] Skipping non-repliable interaction: ${interaction.id}`);
                return;
            }
            
            const paypalEmail = 'mathiasbenedetto@gmail.com';
            
            // Send just the plain email, no labels or formatting
            await interaction.reply({
                content: paypalEmail,
                ephemeral: true
            });
            
            console.log(`[COPY_PAYPAL_EMAIL] User ${interaction.user.id} requested PayPal email.`);
        } catch (error) {
            console.error('[COPY_PAYPAL_EMAIL] Error handling copy PayPal email:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while copying the email.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },

    // Alias for copy_paypal_email
    copy_email: async (interaction) => {
        try {
            // Check if interaction can be replied to
            if (!interaction.isRepliable()) {
                console.log(`[COPY_EMAIL] Skipping non-repliable interaction: ${interaction.id}`);
                return;
            }
            
            const paypalEmail = 'mathiasbenedetto@gmail.com';
            
            // Send just the plain email, no labels or formatting
            await interaction.reply({
                content: paypalEmail,
                ephemeral: true
            });
            
            console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} copied PayPal email`);
        } catch (error) {
            console.error('[COPY_EMAIL] Error handling copy email:', error);
             if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while copying the email.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },

    // Copy IBAN (use handler from paymentHandlers.js)
    copy_iban: allButtonHandlers.copy_iban,

    // Payment Completed - IBAN (removed duplicate, using allButtonHandlers version above)

    // Cancel Payment Confirmation (generic for ephemeral countdown messages)
    cancel_payment_confirm: async (interaction) => {
        try {
            await interaction.update({
                content: 'Payment confirmation cancelled.',
                embeds: [],
                components: [],
            });
            console.log(`[CANCEL_PAYMENT_CONFIRM] User ${interaction.user.id} cancelled payment confirmation.`);
        } catch (error) {
            console.error('[CANCEL_PAYMENT_CONFIRM] Error handling cancel payment confirmation:', error);
        }
    },

    // IBAN Payment handlers
    payment_completed_iban: allButtonHandlers.payment_completed_iban,
    confirm_payment_iban: allButtonHandlers.confirm_payment_iban,
    cancel_payment_iban: allButtonHandlers.cancel_payment_iban,
    
    // Boost functionality handlers  
    boost_completed: allButtonHandlers.boost_completed,
    boost_cancel: allButtonHandlers.boost_cancel,
    boost_is_completed: allButtonHandlers.boost_is_completed,
    boost_not_completed: allButtonHandlers.boost_not_completed,
    boost_confirm_completed: allButtonHandlers.boost_confirm_completed,
    boost_confirm_not_completed: allButtonHandlers.boost_confirm_not_completed, 
    boost_cancel_confirmation: allButtonHandlers.boost_cancel_confirmation,
    payout_completed: allButtonHandlers.payout_completed,
    claim_boost: allButtonHandlers.claim_boost,

    // Review and Feedback buttons
    review_button: async (interaction) => {
        try {
            // Directly use the reviewButtonHandler function
            const reviewButtonHandler = require('../paymentHandlers.js').reviewFeedbackButtonHandlers['review_button'];
            
            if (reviewButtonHandler) {
                await reviewButtonHandler(interaction);
            } else {
                console.error('[REVIEW_BUTTON] Handler not found in reviewFeedbackButtonHandlers');
                await interaction.reply({ 
                    content: 'The review function is currently unavailable. Please try again later.',
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.error('[REVIEW_BUTTON] Error handling review button:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your review request.',
                    ephemeral: true 
                }).catch(console.error);
            }
        }
    },
    
    feedback_button: async (interaction) => {
        try {
            // Directly use the feedbackButtonHandler function
            const feedbackButtonHandler = require('../paymentHandlers.js').reviewFeedbackButtonHandlers['feedback_button'];
            
            if (feedbackButtonHandler) {
                await feedbackButtonHandler(interaction);
            } else {
                console.error('[FEEDBACK_BUTTON] Handler not found in reviewFeedbackButtonHandlers');
                await interaction.reply({ 
                    content: 'The feedback function is currently unavailable. Please try again later.',
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.error('[FEEDBACK_BUTTON] Error handling feedback button:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your feedback request.',
                    ephemeral: true 
                }).catch(console.error);
            }
        }
    },
};

async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    console.log(`[BUTTON_HANDLER] Received button interaction with customId: ${customId} from user ${interaction.user.id}`);

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

            if (interaction.user.id !== verifierId) {
                await interaction.followUp({ content: 'You are not authorized to perform this action.', ephemeral: true });
                console.log(`[STAFF_BUTTON_DYN] Unauthorized click by ${interaction.user.id} (expected ${verifierId}) for ${customId}`);
                return;
            }

            const ticketChannel = interaction.channel;
            const originalMessage = interaction.message;
            const userFlowData = flowState.get(targetUserId) || {}; 
            const orderDetails = userFlowData.orderDetails || { 
                price: 'N/A', 
                current: 'N/A', 
                desired: 'N/A', 
                paymentMethod: paymentType 
            };

            if (action === 'confirm') {
                await sendBoostAvailableEmbed(ticketChannel, orderDetails, targetUserId);
                
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
                await resendBitcoinEmbed(ticketChannel, userId, priceInEuros, interaction); 
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

    console.warn(`[BUTTON_HANDLER] No specific handler found for customId: ${customId}. User: ${interaction.user.id}, Channel: ${interaction.channel.id}`);
}

module.exports = { handleButtonInteraction, buttonHandlers }; 