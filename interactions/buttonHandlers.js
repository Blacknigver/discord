const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, InteractionResponseFlags } = require('discord.js');
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
    handleMasteryFlow,
    getRankValue,
    getMasteryValue,
    handleRankedRankSelection,
    handleMasterySelection,
    createRankedSelectionRows,
    showPriceEmbed,
    getChannelNameByType,
    getCategoryIdByType
} = require('../src/modules/ticketFlow.js');
const {
    createTicketChannelWithOverflow,
    closeTicket,
    archiveTicket,
    ticketDataMap
} = require('../tickets.js');

// Import payment handlers with combined button handlers
const { 
    allButtonHandlers, 
    paymentModalHandlers, 
    reviewFeedbackButtonHandlers, 
    reviewFeedbackModalHandlers 
} = require('../paymentHandlers.js');

// Create combined button handlers for easier access
const combinedButtonHandlers = {
    ...allButtonHandlers,
    ...reviewFeedbackButtonHandlers
};

// Import organized handlers from separate files
const ticketHandlers = require('./handlers/ticketHandlers.js');
const affiliateHandlers = require('./handlers/affiliateHandlers.js');
const rankedMasteryHandlers = require('./handlers/rankedMasteryHandlers.js');
const miscellaneousHandlers = require('./handlers/miscellaneousHandlers.js');
const boostHandlers = require('./handlers/boostHandlers.js');
const paymentVerificationHandlers = require('./handlers/paymentVerificationHandlers.js');
const { cryptoHandlers } = require('./handlers/cryptoHandlers.js');

// *** CRITICAL IMPORTS FOR MISSING HANDLERS ***
const { allMissingHandlers } = require('./handlers/allMissingHandlers.js');
const { supportHandlers } = require('./handlers/supportHandlers.js');
const { confirmationHandlers } = require('./handlers/confirmationHandlers.js');

// Import PayPal handlers to fix the critical "No handler found" errors
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
} = require('../src/handlers/paypalButtonHandler.js');

const buttonHandlers = {
    // *** CRITICAL: Add the exact missing handlers that are causing errors ***
    'paypal_accept': handlePayPalAcceptToS,
    'paypal_deny': handlePayPalDenyToS,
    'request_support': async (interaction) => {
        try {
            const supportEmbed = new EmbedBuilder()
                .setTitle('Support Requested')
                .setDescription('A staff member will assist you shortly.\n\nPlease describe your issue or question.')
                .setColor('#3498db');
            
            const pingMsg = await interaction.channel.send(`<@&986164993080836096> Support requested by ${interaction.user}`);
            await interaction.reply({ embeds: [supportEmbed], ephemeral: true });
            setTimeout(() => pingMsg.delete().catch(() => {}), 2000);
        } catch (error) {
            console.error('Support request error:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'Support request sent!', ephemeral: true });
            }
        }
    },
    
    // Import all handlers from paymentHandlers.js
    ...allButtonHandlers,
    
    // Import organized handlers from separate files
    ...ticketHandlers,
    ...affiliateHandlers,
    ...rankedMasteryHandlers,
    ...miscellaneousHandlers,
    ...boostHandlers,
    ...paymentVerificationHandlers,
    ...cryptoHandlers,
    
    // Import missing handlers
    ...allMissingHandlers,
    ...supportHandlers,
    ...confirmationHandlers,

    // =======================
    // Remaining Core Handlers Only
    // =======================
    
    // Profile listing buttons - keep here as they're part of core listing functionality
    'more_info_': async (interaction) => {
        const { handleListButtons } = require('../commands.js');
        return handleListButtons(interaction);
    },
    
    'purchase_account_': async (interaction) => {
        const { handleListButtons } = require('../commands.js');
        return handleListButtons(interaction);
    },
    
    'listing_mark_sold_': async (interaction) => {
        const { handleListButtons } = require('../commands.js');
        return handleListButtons(interaction);
    }
};

// Combined handlers for external access
const combinedAllHandlers = {
    ...buttonHandlers,
    ...combinedButtonHandlers
};

// Main button interaction handler function
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    console.log(`[BUTTON_HANDLER] Received button interaction with customId: ${customId} from user ${interaction.user.id}`);

    // *** CRITICAL: Check for exact match handlers FIRST to fix "No specific handler found" errors ***
    if (combinedAllHandlers[customId]) {
        try {
            console.log(`[BUTTON_HANDLER] Found exact match handler for ${customId}`);
            await combinedAllHandlers[customId](interaction);
            return;
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error in exact match handler for ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred with this action.', ephemeral: true }).catch(console.error);
            }
            return;
        }
    }

    // Handle upload description button (dynamic IDs) - PRIORITY FIRST
    if (customId.startsWith('upload_description_')) {
        try {
            await combinedButtonHandlers['upload_description_'](interaction);
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
            
            if (combinedButtonHandlers[baseId]) {
                await combinedButtonHandlers[baseId](interaction);
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
            await combinedAllHandlers['withdraw_complete_'](interaction);
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

    // Handle profile purchase payment completed buttons (dynamic IDs)
    if (customId.startsWith('payment_completed_')) {
        try {
            await combinedAllHandlers['payment_completed_'](interaction);
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling payment completed button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing this action.', ephemeral: true }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.followUp({ content: 'An error occurred while processing this action.', ephemeral: true }).catch(console.error);
            }
        }
        return;
    }

    // Handle profile delivery confirmation buttons (dynamic IDs)
    if (customId.startsWith('profile_is_delivered_') || 
        customId.startsWith('profile_confirm_delivered_') || 
        customId === 'profile_not_delivered' || 
        customId === 'profile_cancel_confirmation') {
        try {
            let baseId;
            if (customId.startsWith('profile_is_delivered_')) {
                baseId = 'profile_is_delivered';
            } else if (customId.startsWith('profile_confirm_delivered_')) {
                baseId = 'profile_confirm_delivered';
            } else {
                baseId = customId; // For profile_not_delivered and profile_cancel_confirmation
            }
            
            console.log(`[BUTTON_HANDLER] Processing profile delivery button with base ID: ${baseId}`);
            
            if (combinedButtonHandlers[baseId]) {
                await combinedButtonHandlers[baseId](interaction);
            } else {
                console.error(`[BUTTON_HANDLER] No handler found for profile delivery base ID ${baseId} from ${customId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'This profile delivery function is currently unavailable.',
                        ephemeral: true 
                    });
                }
            }
            return;
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling profile delivery button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing profile delivery.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }

    // Handle PayPal verification buttons (dynamic IDs)
    if (customId.startsWith('paypal_verify_approve_') || customId.startsWith('paypal_verify_reject_')) {
        try {
            const baseId = customId.startsWith('paypal_verify_approve_') ? 'paypal_verify_approve_' : 'paypal_verify_reject_';
            
            if (combinedAllHandlers[baseId]) {
                await combinedAllHandlers[baseId](interaction);
            } else {
                console.error(`[BUTTON_HANDLER] No handler found for PayPal verification base ID ${baseId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'PayPal verification function is currently unavailable.',
                        ephemeral: true 
                    });
                }
            }
            return;
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling PayPal verification button ${customId}:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing PayPal verification.',
                    ephemeral: true 
                }).catch(console.error);
            }
            return;
        }
    }

    // Handle static button IDs with registered handlers
    if (combinedAllHandlers[customId]) {
        try {
            await combinedAllHandlers[customId](interaction);
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
            if (reviewFeedbackButtonHandlers['review_star']) {
                await reviewFeedbackButtonHandlers['review_star'](interaction);
                return;
            }
        } catch (error) {
            console.error(`[BUTTON_HANDLER] Error handling review star button ${customId}:`, error);
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

module.exports = { buttonHandlers, handleButtonInteraction, combinedButtonHandlers }; 