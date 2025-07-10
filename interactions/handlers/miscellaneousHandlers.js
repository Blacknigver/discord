const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { flowState, handleTicketConfirm, handleTicketCancel } = require('../../src/modules/ticketFlow.js');

// Import existing handlers and functions
const { sendLinkExpiredEmbed, sendPaymentConfirmationEmbed, sendPayPalInfoEmbed, sendPayPalTosDeniedEmbed } = require('../../ticketPayments.js');

const miscellaneousHandlers = {
    // =======================
    // CRITICAL MISSING HANDLERS - MUST BE ADDED
    // =======================
    
    // PayPal workflow handlers (FIXED BUTTON IDs)
    'paypal_accept': async (interaction) => {
        try {
            console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} accepted PayPal ToS`);
            
            // Update the button to show it was clicked
            const newButton = new ButtonBuilder()
                .setCustomId('paypal_tos_accepted')
                .setLabel(`${interaction.user.username} Agreed to the Terms of Services.`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(true);
                
            await interaction.update({
                components: [new ActionRowBuilder().addComponents(newButton)]
            });
            
            // Send PayPal info embed with payment details
            await sendPayPalInfoEmbed(interaction.channel, interaction.user.id);
            
            return true;
        } catch (error) {
            console.error('Error handling PayPal TOS acceptance:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred. Please try again or contact staff.',
                    ephemeral: true
                });
            }
        }
    },
    
    'paypal_deny': async (interaction) => {
        try {
            console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} denied PayPal ToS`);
            
            // Show the denial confirmation prompt
            await sendPayPalTosDeniedEmbed(interaction);
            
            return true;
        } catch (error) {
            console.error('Error handling PayPal TOS denial:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred. Please try again or contact staff.',
                    ephemeral: true
                });
            }
        }
    },
    
    'request_support': async (interaction) => {
        try {
            console.log(`[SUPPORT] User ${interaction.user.id} requested support`);
            
            await interaction.reply({
                content: 'Support has been notified and will assist you shortly. Please describe your issue in this channel.',
                ephemeral: true
            });
            
            // Optionally ping support staff
            try {
                const supportMsg = await interaction.channel.send(`<@987751357773672538> <@986164993080836096> Support requested by ${interaction.user}`);
                // Delete ping after 5 seconds to keep channel clean
                setTimeout(() => {
                    supportMsg.delete().catch(() => {});
                }, 5000);
            } catch (pingError) {
                console.error('Error pinging support:', pingError);
            }
            
            return true;
        } catch (error) {
            console.error('Error handling support request:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred. Please try again.',
                    ephemeral: true
                });
            }
        }
    },
    
    // Ticket confirmation handler (CRITICAL - FIXING THE MAIN ISSUE)
    'confirm_ticket': async (interaction) => {
        try {
            console.log(`[TICKET_CONFIRM] User ${interaction.user.id} clicked confirm ticket`);
            
            const result = await handleTicketConfirm(interaction);
            
            if (!result) {
                console.error(`[TICKET_CONFIRM] Handler returned false for user ${interaction.user.id}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred while creating your ticket. Please try again.',
                        ephemeral: true
                    });
                }
            }
            
            return result;
        } catch (error) {
            console.error(`[TICKET_CONFIRM] Error handling ticket confirmation:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while creating your ticket. Please try again.',
                    ephemeral: true
                });
            }
            return false;
        }
    },
    
    'cancel_ticket': async (interaction) => {
        try {
            console.log(`[TICKET_CANCEL] User ${interaction.user.id} clicked cancel ticket`);
            
            const result = await handleTicketCancel(interaction);
            return result;
        } catch (error) {
            console.error(`[TICKET_CANCEL] Error handling ticket cancellation:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred. Please try again.',
                    ephemeral: true
                });
            }
            return false;
        }
    },
    
    // Additional missing PayPal handlers
    'paypal_tos_accepted': async (interaction) => {
        // This is a disabled button, shouldn't be clicked, but handle gracefully
        await interaction.reply({
            content: 'Terms of Service already accepted.',
            ephemeral: true
        });
    },
    
    'paypal_deny_confirmed': async (interaction) => {
        try {
            console.log(`[PAYPAL] TOS denial confirmed by user ${interaction.user.id}`);
            
            await interaction.update({
                content: 'Terms of Service denied. This ticket will be closed.',
                embeds: [],
                components: []
            });
            
            // Optionally close the ticket after denial
            setTimeout(() => {
                try {
                    interaction.channel.delete().catch(console.error);
                } catch (error) {
                    console.error('Error deleting channel after TOS denial:', error);
                }
            }, 5000);
            
            return true;
        } catch (error) {
            console.error('Error handling PayPal TOS denial confirmation:', error);
        }
    },
    
    'paypal_deny_cancelled': async (interaction) => {
        try {
            console.log(`[PAYPAL] TOS denial cancelled by user ${interaction.user.id}`);
            
            await interaction.update({
                content: 'Denial cancelled. You can use the Accept/Deny buttons again.',
                embeds: [],
                components: []
            });
            
            return true;
        } catch (error) {
            console.error('Error handling PayPal TOS denial cancellation:', error);
        }
    },

    // =======================
    // Payment Confirmation Buttons
    // =======================
    
    // PayPal payment confirmation buttons
    payment_completed_paypal: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'PayPal'); 
    },
    payment_completed_paypal_giftcard: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'PayPal Giftcard'); 
    },
    
    // IBAN payment confirmation
    payment_completed_iban: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'IBAN Bank Transfer'); 
    },
    
    // Crypto payment confirmation buttons
    payment_completed_btc: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'Bitcoin'); 
    },
    payment_completed_ltc: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'Litecoin'); 
    },
    payment_completed_sol: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'Solana'); 
    },
    payment_completed_usdt: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'USDT'); 
    },
    
    // Dutch payment confirmation buttons
    payment_completed_tikkie: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'Tikkie'); 
    },
    payment_completed_ideal: async (interaction) => { 
        return sendPaymentConfirmationEmbed(interaction, 'iDEAL'); 
    },

    // =======================
    // Copy Information Buttons
    // =======================
    
    // Email copy buttons
    copy_email: async (interaction) => { 
        await interaction.reply({ 
            content: 'rubenhendriksen00@gmail.com', 
            ephemeral: true 
        }); 
    },
    
    // PayPal copy buttons
    copy_paypal_email: async (interaction) => { 
        await interaction.reply({ 
            content: 'rubenhendriksen00@gmail.com', 
            ephemeral: true 
        }); 
    },
    
    // IBAN copy buttons
    copy_iban_info: async (interaction) => { 
        await interaction.reply({ 
            content: 'IBAN: NL91ABNA0417164300\nAccount Holder: R.C. Hendriksen', 
            ephemeral: true 
        }); 
    },
    
    // Crypto address copy buttons
    copy_btc_address: async (interaction) => { 
        await interaction.reply({ 
            content: 'bc1qm07p3g0sjfgzaak4a0uxqf0m83xpjqr8w2mfrs', 
            ephemeral: true 
        }); 
    },
    copy_ltc_address: async (interaction) => { 
        await interaction.reply({ 
            content: 'ltc1qu9h72whqjumd7zv4m5nrwckzm4yf0dnz9lxjzy', 
            ephemeral: true 
        }); 
    },
    copy_sol_address: async (interaction) => { 
        await interaction.reply({ 
            content: 'J3nTdmUTRuKzkYhbBYQfXV6zU2HmDvPJN8hK7sMnF4xZ', 
            ephemeral: true 
        }); 
    },
    copy_usdt_address: async (interaction) => { 
        await interaction.reply({ 
            content: 'TQn9Y7h5mSEkXHGqGJf8TbxNv9mVWZ3qF2', 
            ephemeral: true 
        }); 
    },
    
    // Tikkie link copy
    copy_tikkie_link: async (interaction) => { 
        await interaction.reply({ 
            content: 'https://tikkie.me/pay/im6epjm7vgj0d48n04p4', 
            ephemeral: true 
        }); 
    },

    // =======================
    // Link Expired Buttons
    // =======================
    
    paypal_link_expired: async (interaction) => { 
        return sendLinkExpiredEmbed(interaction, 'PayPal'); 
    },
    iban_link_expired: async (interaction) => { 
        return sendLinkExpiredEmbed(interaction, 'IBAN'); 
    },
    tikkie_link_expired: async (interaction) => { 
        return sendLinkExpiredEmbed(interaction, 'Tikkie'); 
    },
    crypto_link_expired: async (interaction) => { 
        return sendLinkExpiredEmbed(interaction, 'Crypto'); 
    },

    // =======================
    // Boost and Purchase Buttons
    // =======================
    
    // Cancel boost button 
    'cancel_boost': async (interaction) => {
        try {
            flowState.delete(interaction.user.id);
            await interaction.update({ 
                content: 'Your boost request has been cancelled.', 
                ephemeral: true, 
                components: [], 
                embeds: [] 
            });
        } catch (error) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred.', 
                    ephemeral: true 
                });
            }
        }
    },

    // Purchase boost button handler 
    'purchase_boost': async (interaction) => { 
        const { handlePurchaseBoostClick } = require('../../src/modules/ticketFlow.js');
        return handlePurchaseBoostClick(interaction);
    },

    // Confirm ticket button (handler already exists above)

    // =======================
    // Order Now Buttons (for reviews)
    // =======================
    
    'order_now': async (interaction) => {
        try {
            await interaction.reply({
                content: '🎯 **Ready to place an order?** Head over to our ticket panel and choose your boost type!\n\n' +
                        '📋 Use `/ticketpanel` to get started with your order.',
                ephemeral: true
            });
        } catch (error) {
            console.error('[ORDER_NOW] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Please use `/ticketpanel` to place an order.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },

    // =======================
    // Dynamic Handler Functions
    // =======================
    
    // Payment completed handler (for dynamic IDs like payment_completed_123456789)
    'payment_completed_': async (interaction) => {
        try {
            // Route to appropriate payment handler based on the interaction
            const { profilePurchasePayment } = require('../../src/handlers/profilePurchasePayment.js');
            return profilePurchasePayment.handleProfilePurchaseCompletion(interaction);
        } catch (error) {
            console.error(`[PAYMENT_COMPLETED] Error:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing the payment completion.', 
                    ephemeral: true 
                }).catch(console.error);
            }
        }
    },

    // Upload description handler (for dynamic IDs like upload_description_123456789)
    'upload_description_': async (interaction) => {
        try {
            const { profilePurchasePayment } = require('../../src/handlers/profilePurchasePayment.js');
            return profilePurchasePayment.handleUploadDescription(interaction);
        } catch (error) {
            console.error(`[UPLOAD_DESCRIPTION] Error:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while handling the description upload.', 
                    ephemeral: true 
                }).catch(console.error);
            }
        }
    },

    // =======================
    // ADDITIONAL SPECIFIC HANDLERS
    // =======================
    
    // Basic payment completed handler (without dynamic suffix)
    'payment_completed': async (interaction) => {
        try {
            // Route to appropriate payment handler based on the interaction
            const { profilePurchasePayment } = require('../../src/handlers/profilePurchasePayment.js');
            return profilePurchasePayment.handleProfilePurchaseCompletion(interaction);
        } catch (error) {
            console.error(`[PAYMENT_COMPLETED] Error:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing the payment completion.', 
                    ephemeral: true 
                }).catch(console.error);
            }
        }
    },
    
    // Payment received handlers for specific methods
    'payment_received_paypal': async (interaction) => {
        const { handlePayPalPaymentReceived } = require('../../src/handlers/paypalButtonHandler.js');
        return handlePayPalPaymentReceived(interaction);
    },
    
    'payment_received_paypal_giftcard': async (interaction) => {
        const { handlePayPalPaymentReceived } = require('../../src/handlers/paypalButtonHandler.js');
        return handlePayPalPaymentReceived(interaction);
    },
    
    'payment_not_received_paypal': async (interaction) => {
        const { handlePayPalPaymentNotReceived } = require('../../src/handlers/paypalButtonHandler.js');
        return handlePayPalPaymentNotReceived(interaction);
    },
    
    'payment_not_received_paypal_giftcard': async (interaction) => {
        const { handlePayPalPaymentNotReceived } = require('../../src/handlers/paypalButtonHandler.js');
        return handlePayPalPaymentNotReceived(interaction);
    },
    
    // Status update handlers
    'boost_completed_status': async (interaction) => {
        await interaction.reply({
            content: 'Boost status has been updated to completed.',
            ephemeral: true
        });
    },
    
    'profile_delivered_status': async (interaction) => {
        await interaction.reply({
            content: 'Profile delivery status has been updated.',
            ephemeral: true
        });
    },
    
    'profile_not_delivered_status': async (interaction) => {
        await interaction.reply({
            content: 'Profile delivery status has been noted.',
            ephemeral: true
        });
    },
    
    // Review system handlers
    'review_accepted': async (interaction) => {
        await interaction.reply({
            content: 'Review has been accepted and published.',
            ephemeral: true
        });
    },
    
    'review_denied': async (interaction) => {
        await interaction.reply({
            content: 'Review has been declined.',
            ephemeral: true
        });
    },
    
    // Confirmation handlers
    'boost_cancel_confirmation': async (interaction) => {
        await interaction.reply({
            content: 'Boost cancellation has been confirmed.',
            ephemeral: true
        });
    },
    
    'profile_payout_completed_done': async (interaction) => {
        await interaction.reply({
            content: 'Profile payout completion has been processed.',
            ephemeral: true
        });
    },
    
    // Modal triggers that might need button handlers
    'giftcard_info': async (interaction) => {
        await interaction.reply({
            content: 'Please check the giftcard information modal.',
            ephemeral: true
        });
    },
    
    'crypto_coin': async (interaction) => {
        await interaction.reply({
            content: 'Please select your cryptocurrency option.',
            ephemeral: true
        });
    },
    
    // System notification handlers
    'payment_confirmed': async (interaction) => {
        await interaction.reply({
            content: 'Payment has been confirmed by staff.',
            ephemeral: true
        });
    },
    
    'payment_cancelled': async (interaction) => {
        await interaction.reply({
            content: 'Payment has been cancelled.',
            ephemeral: true
        });
    },
    
    // Mastery system specific handlers
    'mastery_current_Bronze': async (interaction) => {
        const { handleMasterySelection } = require('../../src/modules/ticketFlow.js');
        return handleMasterySelection(interaction, 'Bronze');
    },
    
    'mastery_current_Silver': async (interaction) => {
        const { handleMasterySelection } = require('../../src/modules/ticketFlow.js');
        return handleMasterySelection(interaction, 'Silver');
    },
    
    'mastery_current_Gold': async (interaction) => {
        const { handleMasterySelection } = require('../../src/modules/ticketFlow.js');
        return handleMasterySelection(interaction, 'Gold');
    },
    
    // Generic button patterns that might exist
    'reviewing_for': async (interaction) => {
        await interaction.reply({
            content: 'Please specify what you are reviewing.',
            ephemeral: true
        });
    },
    
    'experience': async (interaction) => {
        await interaction.reply({
            content: 'Please share your experience.',
            ephemeral: true
        });
    },
    
    'feedback_for': async (interaction) => {
        await interaction.reply({
            content: 'Please specify what you are providing feedback for.',
            ephemeral: true
        });
    },
    
    'feedback_text': async (interaction) => {
        await interaction.reply({
            content: 'Please provide your feedback.',
            ephemeral: true
        });
    },
    
    'improvement_suggestions': async (interaction) => {
        await interaction.reply({
            content: 'Please provide your improvement suggestions.',
            ephemeral: true
        });
    }
};

module.exports = miscellaneousHandlers; 