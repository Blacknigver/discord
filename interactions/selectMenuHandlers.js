const { EmbedBuilder } = require('discord.js');
const { 
    flowState,
    showPaymentMethodSelection,
    handleRankedFlow,
    handleBulkFlow,
    handleTrophyFlow,
    handleOtherFlow,
    getRankValue,
    handlePaymentMethodSelect,
    handleDutchMethodSelect,
    handleCryptoTypeSelect
} = require('../src/modules/ticketFlow.js');

const selectMenuHandlers = {
    // Ranked selection handlers
    ranked_select: async (interaction) => {
        try {
            const [rank, specific] = interaction.values[0].split('_');
            const userData = flowState.get(interaction.user.id);
            
            if (!userData) {
                return interaction.reply({
                    content: 'Your session has expired. Please start over.',
                    ephemeral: true
                });
            }

            if (userData.type !== 'ranked') {
                return interaction.reply({
                    content: 'Invalid selection type.',
                    ephemeral: true
                });
            }

            // Update user data with selected rank
            if (userData.currentRank) {
                userData.desiredRank = rank;
                userData.desiredRankSpecific = specific;
                userData.formattedDesiredRank = `${rank} ${specific}`;
            } else {
                userData.currentRank = rank;
                userData.currentRankSpecific = specific;
                userData.formattedCurrentRank = `${rank} ${specific}`;
            }

            flowState.set(interaction.user.id, userData);

            // Continue the ranked flow
            await handleRankedFlow(interaction, interaction.channel);
        } catch (error) {
            console.error('[RANKED_SELECT] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your selection.',
                    ephemeral: true
                });
            }
        }
    },

    // Mastery selection handlers - REMOVED (feature disabled)
    // The mastery feature has been removed from Brawl Stars

    // Crypto selection handlers
    payment_method_select: handlePaymentMethodSelect,
    dutch_method_select: handleDutchMethodSelect,
    crypto_type_select: handleCryptoTypeSelect,

    // Profile purchase payment flow (prefix handlers)
    'profile_payment_primary_': require('../src/handlers/profilePurchasePayment.js').handlePrimarySelect,
    'profile_payment_crypto_': require('../src/handlers/profilePurchasePayment.js').handleCryptoSelect,
    'profile_payment_dutch_': require('../src/handlers/profilePurchasePayment.js').handleDutchSelect,

    // Profile purchase payment handled in interactionHandlers.js to avoid duplicate processing.
};

module.exports = selectMenuHandlers; 