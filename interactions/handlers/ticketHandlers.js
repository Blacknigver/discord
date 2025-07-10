const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { 
    flowState,
    handleRankedFlow,
    handleBulkFlow,
    handleMasteryFlow,
} = require('../../src/modules/ticketFlow.js');

const ticketHandlers = {
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
    }
};

module.exports = ticketHandlers; 