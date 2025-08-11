const { EmbedBuilder } = require('discord.js');
const { EMBED_COLOR } = require('../config.js');
const { calculateTrophyPrice } = require('../utils.js');

// Import the specific modal handler functions for ticket flows
// Assuming src/modules/modalHandlers.js exports them directly or under a sub-object we can access.
// Based on previous search, it exports an object modalHandlers: { 'custom_id': handlerFn }
// Let's try importing the functions themselves if they are also exported individually, or import the whole object.

// Attempting to import specific handlers from the src/modules/modalHandlers.js file
const ticketFlowModalFunctions = require('../src/modules/modalHandlers.js'); 
// This will give us an object like: 
// {
//   handleTrophiesStartModal,
//   handleBulkTrophiesModal,
//   handleMasteryBrawlerModal,
//   handleOtherRequestModal,
//   handleCryptoTxForm, (if exported individually)
//   modalHandlers: { 'custom_id': handlerFn } // The nested object
// }

const existingModalHandlers = {
    // Add form handlers
    modal_add_115k: async (interaction) => {
        try {
            const invites = parseInt(interaction.fields.getTextInputValue('invites'));
            
            if (isNaN(invites) || invites < 3) {
                return interaction.reply({
                    content: 'You need at least 3 invites to add a 115k trophy player.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('115k Trophy Player Add Request')
                .setDescription(`User ${interaction.user} has requested to add a 115k trophy player.\nThey have ${invites} invites.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('[MODAL_ADD_115K] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        }
    },

    modal_add_matcherino: async (interaction) => {
        try {
            const invites = parseInt(interaction.fields.getTextInputValue('invites'));
            
            if (isNaN(invites) || invites < 5) {
                return interaction.reply({
                    content: 'You need at least 5 invites to add a Matcherino winner.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('Matcherino Winner Add Request')
                .setDescription(`User ${interaction.user} has requested to add a Matcherino winner.\nThey have ${invites} invites.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('[MODAL_ADD_MATCHERINO] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        }
    },

    // Friend list form handlers
    modal_buy_add: async (interaction) => {
        try {
            const player = interaction.fields.getTextInputValue('player');
            
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('Friend List Add Purchase Request')
                .setDescription(`User ${interaction.user} wants to buy add from player: ${player}`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('[MODAL_BUY_ADD] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        }
    },

    modal_player_info: async (interaction) => {
        try {
            const player = interaction.fields.getTextInputValue('player');
            
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('Player Information Request')
                .setDescription(`User ${interaction.user} requested information about player: ${player}`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('[MODAL_PLAYER_INFO] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        }
    },
    
    // Special case for trophies modal - define here as a backup
    modal_trophies_start: async (interaction) => {
        try {
            console.log('====================================');
            console.log(`[MODAL_TROPHIES] STARTING HANDLER for user ${interaction.user.id}`);
            console.log('====================================');
            
            // Get form values
            let brawlerName, currentTrophies, desiredTrophies;
            
            try {
                brawlerName = interaction.fields.getTextInputValue('brawler_name').trim();
                console.log(`[MODAL_TROPHIES] Brawler name: "${brawlerName}"`);
                
                const currentTrophiesText = interaction.fields.getTextInputValue('brawler_current').trim();
                console.log(`[MODAL_TROPHIES] Current trophies text: "${currentTrophiesText}"`);
                currentTrophies = parseInt(currentTrophiesText);
                
                const desiredTrophiesText = interaction.fields.getTextInputValue('brawler_desired').trim();
                console.log(`[MODAL_TROPHIES] Desired trophies text: "${desiredTrophiesText}"`);
                desiredTrophies = parseInt(desiredTrophiesText);
                
                console.log(`[MODAL_TROPHIES] Parsed values: current=${currentTrophies}, desired=${desiredTrophies}`);
            } catch (parseError) {
                console.error(`[MODAL_TROPHIES] Error parsing form inputs:`, parseError);
                return interaction.reply({
                    content: 'Error reading form values. Please try again.',
                    ephemeral: true
                });
            }
            
            // Validate inputs
            if (isNaN(currentTrophies) || isNaN(desiredTrophies)) {
                console.error(`[MODAL_TROPHIES] Invalid numeric inputs: current=${currentTrophies}, desired=${desiredTrophies}`);
                return interaction.reply({
                    content: 'Please enter valid numbers for trophy counts.',
                    ephemeral: true
                });
            }
            
            if (currentTrophies >= desiredTrophies) {
                console.error(`[MODAL_TROPHIES] Current >= Desired: ${currentTrophies} >= ${desiredTrophies}`);
                return interaction.reply({
                    content: 'The desired trophy count must be higher than the current trophy count.',
                    ephemeral: true
                });
            }
            
            // Get and validate brawler level if provided
            let brawlerLevel = null;
            try {
                const brawlerLevelText = interaction.fields.getTextInputValue('brawler_level')?.trim();
                if (brawlerLevelText) {
                    brawlerLevel = parseInt(brawlerLevelText);
                    if (isNaN(brawlerLevel) || brawlerLevel < 1) {
                        console.error(`[MODAL_TROPHIES] Invalid brawler level: ${brawlerLevelText}`);
                        return interaction.reply({
                            content: 'Please enter a valid power level (1-11).',
                            ephemeral: true
                        });
                    }
                    console.log(`[MODAL_TROPHIES] Parsed brawler level: ${brawlerLevel}`);
                }
            } catch (levelError) {
                console.log(`[MODAL_TROPHIES] Brawler level field not found or empty, continuing without power level`);
            }
            
            // Calculate price with extensive error handling
            console.log(`[MODAL_TROPHIES] Calculating price for ${currentTrophies} -> ${desiredTrophies}, power level: ${brawlerLevel}`);
            let price;
            
            try {
                // Directly import to ensure we have the function
                const { calculateTrophyPrice } = require('../utils.js');
                console.log(`[MODAL_TROPHIES] calculateTrophyPrice function imported:`, typeof calculateTrophyPrice);
                
                price = calculateTrophyPrice(currentTrophies, desiredTrophies, brawlerLevel);
                console.log(`[MODAL_TROPHIES] Raw price result:`, price);
                
                if (price === undefined || price === null) {
                    throw new Error('Price calculation returned undefined or null');
                }
                
                if (isNaN(price)) {
                    throw new Error('Price calculation returned NaN');
                }
                
                if (price <= 0) {
                    throw new Error(`Price calculation returned invalid amount: ${price}`);
                }
                
                console.log(`[MODAL_TROPHIES] Final price: €${price.toFixed(2)}`);
            } catch (priceError) {
                console.error(`[MODAL_TROPHIES] Price calculation error:`, priceError);
                return interaction.reply({
                    content: 'Invalid price calculation. Please try again or contact support.',
                    ephemeral: true
                });
            }
            
            // Get the flowState and show payment selection with error handling
            try {
                console.log(`[MODAL_TROPHIES] Setting up flowState for user ${interaction.user.id}`);
                const { flowState, showPaymentMethodSelection } = require('../src/modules/ticketFlow');
                
                if (!flowState) {
                    throw new Error('flowState is undefined');
                }
                
                if (!showPaymentMethodSelection) {
                    throw new Error('showPaymentMethodSelection is undefined');
                }
                
                // Calculate power level multiplier for display purposes
                let powerLevelMultiplier = 1.0;
                let basePrice = price;
                
                if (brawlerLevel !== null && brawlerLevel !== undefined) {
                    const { calculateTrophyPowerLevelMultiplier } = require('../utils.js');
                    powerLevelMultiplier = calculateTrophyPowerLevelMultiplier(desiredTrophies, brawlerLevel);
                    basePrice = price / powerLevelMultiplier;
                    console.log(`[MODAL_TROPHIES] Base price: €${basePrice.toFixed(2)}, multiplier: ${powerLevelMultiplier}x, final: €${price.toFixed(2)}`);
                }
                
                // Store the data in flowState
                const userData = {
                    type: 'trophies',
                    brawler: brawlerName,
                    brawlerLevel: brawlerLevel,
                    powerLevel: brawlerLevel,
                    currentTrophies,
                    desiredTrophies,
                    price: price.toFixed(2),
                    basePrice: basePrice.toFixed(2),
                    powerLevelMultiplier: powerLevelMultiplier,
                    step: 'payment_method',
                    timestamp: Date.now()
                };
                
                console.log(`[MODAL_TROPHIES] Setting flowState data:`, userData);
                flowState.set(interaction.user.id, userData);
                
                // Show payment method selection
                console.log(`[MODAL_TROPHIES] Calling showPaymentMethodSelection for user ${interaction.user.id}`);
                const result = await showPaymentMethodSelection(interaction);
                console.log(`[MODAL_TROPHIES] Payment selection result:`, result ? 'Success' : 'Undefined/null result');
                return result;
            } catch (flowError) {
                console.error(`[MODAL_TROPHIES] Error in flowState/payment selection:`, flowError);
                return interaction.reply({
                    content: 'Error setting up payment options. Please try again or contact support.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('[MODAL_TROPHIES] CRITICAL ERROR in trophies modal handler:', error);
            
            try {
                return interaction.reply({
                    content: 'A critical error occurred. Please try again later or contact support.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('[MODAL_TROPHIES] Failed to reply with error message:', replyError);
            }
        }
    }
};

// Merge the handlers. We need to access the nested modalHandlers from ticketFlowModalFunctions
const allModalHandlers = {
    ...existingModalHandlers,
    ...(ticketFlowModalFunctions.modalHandlers || {}), // Spread the nested modalHandlers object
    
    // Add missing crypto withdrawal modal handlers
    withdraw_paypal_modal: async (interaction) => {
        const { handleWithdrawalModal } = require('../src/handlers/interactionHandler');
        return handleWithdrawalModal(interaction);
    },
    
    withdraw_iban_modal: async (interaction) => {
        const { handleWithdrawalModal } = require('../src/handlers/interactionHandler');
        return handleWithdrawalModal(interaction);
    },
    
    withdraw_crypto_modal_sol: async (interaction) => {
        const { handleWithdrawalModal } = require('../src/handlers/interactionHandler');
        return handleWithdrawalModal(interaction);
    },
    
    withdraw_crypto_modal_btc: async (interaction) => {
        const { handleWithdrawalModal } = require('../src/handlers/interactionHandler');
        return handleWithdrawalModal(interaction);
    },
    
    withdraw_crypto_modal_ltc: async (interaction) => {
        const { handleWithdrawalModal } = require('../src/handlers/interactionHandler');
        return handleWithdrawalModal(interaction);
    },
    
    withdraw_crypto_modal_usdt: async (interaction) => {
        const { handleWithdrawalModal } = require('../src/handlers/interactionHandler');
        return handleWithdrawalModal(interaction);
    },
    
    // If specific functions were also exported top-level and needed, add them here:
    // e.g. if handleCryptoTxForm was globally used and not just via custom ID mapping:
    // handleCryptoTxForm: ticketFlowModalFunctions.handleCryptoTxForm (if it exists top-level)
};

// We need to ensure the custom IDs used in showModal match these keys.
    // 'modal_trophies_start', 'modal_bulk_trophies', 'modal_mastery_brawler', 'modal_other_request'

module.exports = allModalHandlers; 