const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buttonHandlers, modalHandlers, selectMenuHandlers } = require('./handlers.js');
const reviewCommand = require('./review.js');
const { EMBED_COLOR } = require('./config.js');
const { handleCommand, handleListButtons } = require('./commands.js');
const { Komponenten, Kategorien, NutzerDaten, TicketArten, TicketStatus, TicketPanel } = require('./config');
const handlers = require('./handlers');
const ticketSystem = require('./tickets.js');
const { 
    flowState, 
    showPaymentMethodSelection,
    handleMasteryBrawlerModal,
    handleBulkTrophiesModal,
    handleRankedRankSelection,
    handleMasterySelection,
} = require('./src/modules/ticketFlow.js');
const { InteractionResponseFlags } = require('discord.js');

/**
 * Set up all Discord interaction handlers
 */
function setupInteractions(client) {
  // Handle slash commands
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'review') {
      try {
        // Get command arguments
        const user = interaction.options.getUser('user');
        const message = interaction.options.getString('message');
        
        if (!user || !message) {
          return interaction.reply({
            content: 'Missing required arguments: user and message',
            ephemeral: true
          });
        }
        
        // Call the review command handler
        await reviewCommand.execute({
          author: interaction.user,
          channel: interaction.channel,
          reply: (content) => interaction.reply({ content, ephemeral: true }),
          guild: interaction.guild
        }, [user.id, message]);
        
      } catch (error) {
        console.error('Error executing review command:', error);
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true
        });
      }
    } else if (commandName === 'list') {
      try {
        // Process using the handler from commands.js
        await handleCommand(interaction);
      } catch (error) {
        console.error('Error executing list command:', error);
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true
        });
      }
    }
  });

  // Handle button interactions
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    try {
      const { customId } = interaction;
      
      // Skip if the interaction is no longer repliable
      if (!interaction.isRepliable()) {
        console.log(`[INTERACTION] Skipping non-repliable interaction: ${interaction.id}, button: ${customId}`);
        return;
      }
      
      // Find the correct handler based on button ID
      let handlerFound = false;
      
      // Handle review accept/deny buttons first (from review.js)
      if (customId.startsWith('review_accept_') || customId.startsWith('review_deny_')) {
        try {
          const { handleButton } = require('./review.js');
          await handleButton(interaction);
          handlerFound = true;
          return;
        } catch (error) {
          console.error(`[INTERACTION] Error handling review moderation button ${customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing this review action.',
              ephemeral: true
            });
          }
          handlerFound = true;
          return;
        }
      }
      
      // Check specific cases first
      if (customId.startsWith('copy_address_')) {
        const address = customId.replace('copy_address_', '');
        await interaction.reply({
          content: `${address}`,
          ephemeral: true
        });
        handlerFound = true;
      } else if (customId === 'copy_email') {
        try {
          const { PAYMENT_METHODS } = require('./config.js');
          const paypalEmail = (PAYMENT_METHODS && PAYMENT_METHODS.PAYPAL && PAYMENT_METHODS.PAYPAL.email) 
            ? PAYMENT_METHODS.PAYPAL.email 
            : 'mathiasbenedetto@gmail.com';
          
          // Send just the plain email, no labels or formatting
          await interaction.reply({
            content: paypalEmail,
            ephemeral: true
          });
          console.log(`[COPY_PAYPAL_EMAIL] User ${interaction.user.id} requested PayPal email.`);
          handlerFound = true;
        } catch (error) {
          console.error(`[COPY_PAYPAL_EMAIL] Error handling copy PayPal email:`, error);
          handlerFound = true; // Mark as handled even if there was an error
        }
      } else if (customId.startsWith('copy_amount_')) {
        const amount = customId.replace('copy_amount_', '');
        await interaction.reply({
          content: `${amount}`,
          ephemeral: true
        });
        handlerFound = true;
      } else if (customId.startsWith('copy_btc_amount_')) {
        const amount = customId.replace('copy_btc_amount_', '');
        await interaction.reply({
          content: `${amount}`,
          ephemeral: true
        });
        handlerFound = true;
      } else if (customId.startsWith('copy_ltc_amount_')) {
        const amount = customId.replace('copy_ltc_amount_', '');
        await interaction.reply({
          content: `${amount}`,
          ephemeral: true
        });
        handlerFound = true;
      }
      // HANDLERS FOR DYNAMICALLY CREATED BUTTONS (e.g. ranked_Legendary_1)
      else if (customId.startsWith('ranked_') && !customId.startsWith('ticket_')) {
        await handleRankedRankSelection(interaction, customId.replace(/^ranked_/, ''));
        handlerFound = true;
      } else if (customId.startsWith('mastery_') && !customId.startsWith('ticket_')) {
        await handleMasterySelection(interaction, customId.replace(/^mastery_/, ''));
        handlerFound = true;
      }
      // Handle review and feedback buttons
      else if (customId.startsWith('review_button_') || customId.startsWith('feedback_button_')) {
        try {
          // Get the base ID (review_button or feedback_button)
          const baseId = customId.split('_').slice(0, 2).join('_');
          
          // Import the review/feedback handlers directly
          const { reviewFeedbackButtonHandlers } = require('./paymentHandlers.js');
          
          if (reviewFeedbackButtonHandlers && reviewFeedbackButtonHandlers[baseId]) {
            await reviewFeedbackButtonHandlers[baseId](interaction);
            handlerFound = true;
          } else {
            console.error(`[INTERACTION] Review/feedback handler not found for ${baseId}`);
            await interaction.reply({
              content: 'This button function is currently unavailable.',
              ephemeral: true
            });
            handlerFound = true;
          }
        } catch (error) {
          console.error(`[INTERACTION] Error handling review/feedback button ${customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing your request.',
              ephemeral: true
            });
          }
          handlerFound = true;
        }
      }
      // Handle review star rating buttons
      else if (customId.startsWith('review_star_')) {
        try {
          // Import the review star handler directly
          const { reviewFeedbackButtonHandlers } = require('./paymentHandlers.js');
          
          if (reviewFeedbackButtonHandlers && reviewFeedbackButtonHandlers['review_star_1']) {
            await reviewFeedbackButtonHandlers['review_star_1'](interaction);
            handlerFound = true;
          } else {
            console.error(`[INTERACTION] Review star handler not found for ${customId}`);
            await interaction.reply({
              content: 'The rating function is currently unavailable.',
              ephemeral: true
            });
            handlerFound = true;
          }
        } catch (error) {
          console.error(`[INTERACTION] Error handling review star button ${customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing your rating.',
              ephemeral: true
            });
          }
          handlerFound = true;
        }
      }
      // Handle review anonymous/username buttons
      else if (customId.startsWith('review_anonymous_') || customId.startsWith('review_username_')) {
        try {
          // Get the base ID (review_anonymous or review_username)
          const baseId = customId.split('_').slice(0, 2).join('_');
          
          // Import the review anonymous handler directly
          const { reviewFeedbackButtonHandlers } = require('./paymentHandlers.js');
          
          if (reviewFeedbackButtonHandlers && reviewFeedbackButtonHandlers[baseId]) {
            await reviewFeedbackButtonHandlers[baseId](interaction);
            handlerFound = true;
          } else {
            console.error(`[INTERACTION] Review anonymity handler not found for ${baseId}`);
            await interaction.reply({
              content: 'This function is currently unavailable.',
              ephemeral: true
            });
            handlerFound = true;
          }
        } catch (error) {
          console.error(`[INTERACTION] Error handling review anonymity button ${customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing your selection.',
              ephemeral: true
            });
          }
          handlerFound = true;
        }
      }
      // Find the correct handler based on button ID
      else if (buttonHandlers && buttonHandlers[customId]) {
        try {
        await buttonHandlers[customId](interaction, client);
        handlerFound = true;
        } catch (handlerError) {
          console.error(`[INTERACTION] Error in button handler for ${customId}:`, handlerError);
          // Don't attempt to respond if the error is about the interaction
          if (!handlerError.message.includes('Unknown interaction') && 
              !handlerError.message.includes('already been acknowledged')) {
            try {
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                  content: 'An error occurred with this action. Please try again later.', 
                  ephemeral: true 
                });
              }
            } catch (replyError) {
              console.error(`[INTERACTION] Failed to send error reply for ${customId}:`, replyError);
            }
          }
          handlerFound = true; // Mark as handled even if there was an error
        }
      } else {
        // Check for prefix matches (like 'payment_completed_' etc)
        if (buttonHandlers) {
          for (const key of Object.keys(buttonHandlers)) {
            if (key.endsWith('_') && customId.startsWith(key)) {
              try {
              await buttonHandlers[key](interaction, client);
              handlerFound = true;
              break;
              } catch (prefixHandlerError) {
                console.error(`[INTERACTION] Error in prefix button handler ${key} for ${customId}:`, prefixHandlerError);
                // Don't attempt to respond if the error is about the interaction
                if (!prefixHandlerError.message.includes('Unknown interaction') && 
                    !prefixHandlerError.message.includes('already been acknowledged')) {
                  try {
                    if (!interaction.replied && !interaction.deferred) {
                      await interaction.reply({ 
                        content: 'An error occurred with this action. Please try again later.', 
                        ephemeral: true 
                      });
                    }
                  } catch (replyError) {
                    console.error(`[INTERACTION] Failed to send error reply for ${customId}:`, replyError);
                  }
                }
                handlerFound = true; // Mark as handled even if there was an error
                break;
              }
            }
          }
        }
      }
      
      if (!handlerFound) {
        console.warn(`[INTERACTION] Unhandled button interaction: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'This button does not have a handler.', 
            ephemeral: true 
          }).catch(error => {
            console.error(`[INTERACTION] Error replying to unhandled button: ${error}`);
          });
        }
      }
    } catch (error) {
      console.error(`[INTERACTION] Error handling button interaction:`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: 'An error occurred while processing your request.', 
          ephemeral: true 
        }).catch(secondError => {
          console.error(`[INTERACTION] Failed to send error response: ${secondError}`);
        });
      }
    }
  });

  // Handle select menu interactions
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    
    try {
      const { customId } = interaction;
      
      // Skip if the interaction is no longer repliable
      if (!interaction.isRepliable()) {
        console.log(`[INTERACTION] Skipping non-repliable interaction: ${interaction.id}, select menu: ${customId}`);
        return;
      }
      
      // Find the correct handler based on select ID
      let handlerFound = false;
      
      if (customId === 'payment_method_select') {
        try {
          console.log(`[PAYMENT_SELECT] Processing payment method selection for ${interaction.user.id}: ${interaction.values[0]}`);
          
          // Check if the interaction has already been replied to
          if (interaction.replied || interaction.deferred) {
            console.log(`[PAYMENT_SELECT] Interaction ${interaction.id} has already been replied to, using followUp`);
            handlerFound = true;
            return;
          }
          
          const { flowState } = require('./src/modules/ticketFlow');
          const userData = flowState.get(interaction.user.id);
          
          if (!userData) {
            console.error(`[PAYMENT_SELECT] No user data found for ${interaction.user.id}`);
            await interaction.reply({ 
              content: 'Session data not found. Please try again.',
              flags: 64
            });
            handlerFound = true;
            return;
          }
          
          // Update payment method in user data
          const selectedMethod = interaction.values[0];
          
          // Map payment method values to display names
          const methodDisplayNames = {
            'paypal': 'PayPal',
            'crypto': 'Crypto',
            'iban': 'IBAN Bank Transfer',
            'paypal_giftcard': 'PayPal Giftcard',
            'dutch': 'Dutch Payment Methods',
            'apple_giftcard': 'German Apple Giftcard'
          };
          
          // Store both the raw value and the display name
          userData.paymentMethod = methodDisplayNames[selectedMethod] || selectedMethod;
          userData.paymentMethodRaw = selectedMethod; // Store raw value for conditional handling
          
          console.log(`[PAYMENT_SELECT] Set payment method for ${interaction.user.id} to: ${userData.paymentMethod} (${userData.paymentMethodRaw})`);
          flowState.set(interaction.user.id, userData);
          
          // Create price embed
          const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
          const PINK_COLOR = '#e68df2';
          const { calculateTrophyPrice } = require('./utils.js');
          
          console.log(`[TROPHY_PRICE_DEBUG] calculateTrophyPrice imported: ${typeof calculateTrophyPrice}`);
          
          // Calculate price based on user data
          let price = 0;
          let priceMultiplier = 1.0;
          
          if (userData.type === 'trophies') {
            // Calculate base price
            price = calculateTrophyPrice(userData.currentTrophies, userData.desiredTrophies);
            console.log(`[TROPHY_PRICE_DEBUG] Calculated total price from ${userData.currentTrophies} to ${userData.desiredTrophies}: €${price.toFixed(2)}`);
            
            // Apply price multiplier based on the stored multiplier in userData
            if (userData.priceMultiplier !== undefined) {
              priceMultiplier = userData.priceMultiplier;
              console.log(`[TROPHY_PRICE_DEBUG] Applying multiplier: ${priceMultiplier}x for level ${userData.brawlerLevel}`);
              price = price * priceMultiplier;
              console.log(`[TROPHY_PRICE_DEBUG] Final price after multiplier: €${price.toFixed(2)}`);
            } else {
              console.warn(`[TROPHY_PRICE_DEBUG] No price multiplier found in userData!`);
            }
          }
          
          // Format price for display
          const formattedPrice = `€${price.toFixed(2)}`;
          
          // Create embed based on boost type
          const embed = new EmbedBuilder()
            .setTitle('Order Confirmation')
            .setColor(PINK_COLOR);
          
          if (userData.type === 'trophies') {
            let description = `Please confirm your order details:\n\n**Brawler:** \`${userData.brawler}\`\n**Current Trophies:** \`${userData.currentTrophies}\`\n**Desired Trophies:** \`${userData.desiredTrophies}\``;
            
            // Add brawler level if available
            if (userData.brawlerLevel !== undefined) {
              description += `\n**Brawler Power Level:** \`${userData.brawlerLevel}\``;
            }
            
            // Add price multiplier if available
            if (userData.priceMultiplier !== undefined && userData.priceMultiplier !== 1.0) {
              description += `\n**Price Multiplier:** \`${userData.priceMultiplier}x\``;
              
              // Add base price if available
              if (userData.basePrice) {
                description += `\n**Base Price:** \`€${userData.basePrice}\``;
              }
            }
            
            description += `\n**Payment Method:** \`${userData.paymentMethod}\`\n\n**Total Price:** \`${formattedPrice}\``;
            
            embed.setDescription(description);
          }
          
          // Add confirmation buttons
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('confirm_ticket')
              .setLabel('Confirm')
              .setEmoji('<:checkmark:1357478063616688304>')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('cancel_ticket')
              .setLabel('Cancel')
              .setEmoji('❌')
              .setStyle(ButtonStyle.Danger)
          );
          
          // Send the price confirmation
          await interaction.reply({
            embeds: [embed],
            components: [row],
            flags: 64
          });
          
          handlerFound = true;
        } catch (error) {
          console.error(`[PAYMENT_SELECT] Error handling payment method selection:`, error);
          // Try to respond with an error if we haven't already
          try {
            if (!interaction.replied) {
            await interaction.reply({ 
              content: 'An error occurred while processing your payment method selection.', 
                flags: 64
              });
            }
          } catch (replyError) {
            console.error(`[PAYMENT_SELECT] Error sending error response: ${replyError}`);
          }
          handlerFound = true; // Mark as handled even if there was an error
        }
      } else if (selectMenuHandlers && selectMenuHandlers[customId]) {
        try {
          await selectMenuHandlers[customId](interaction);
          handlerFound = true;
        } catch (handlerError) {
          console.error(`[INTERACTION] Error in select handler for ${customId}:`, handlerError);
          // Try to respond with an error if we haven't already
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
              content: 'An error occurred with this action. Please try again later.', 
              ephemeral: true 
            }).catch(console.error);
          }
          handlerFound = true; // Mark as handled even if there was an error
        }
      } else {
        // Check for prefix matches
        if (selectMenuHandlers) {
          for (const key of Object.keys(selectMenuHandlers)) {
            if (key.endsWith('_') && customId.startsWith(key)) {
              try {
                await selectMenuHandlers[key](interaction);
                handlerFound = true;
                break;
              } catch (prefixHandlerError) {
                console.error(`[INTERACTION] Error in prefix select handler ${key} for ${customId}:`, prefixHandlerError);
                if (!interaction.replied && !interaction.deferred) {
                  await interaction.reply({ 
                    content: 'An error occurred with this action. Please try again later.', 
                    ephemeral: true 
                  }).catch(console.error);
                }
                handlerFound = true; // Mark as handled even if there was an error
                break;
              }
            }
          }
        }
      }
      
      if (!handlerFound) {
        console.warn(`[INTERACTION] Unhandled select menu interaction: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'This select menu does not have a handler.', 
            ephemeral: true 
          }).catch(error => {
            console.error(`[INTERACTION] Error replying to unhandled select menu: ${error}`);
          });
        }
      }
    } catch (error) {
      console.error(`[INTERACTION] Error handling select menu interaction:`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: 'An error occurred while processing your request.', 
          ephemeral: true 
        }).catch(secondError => {
          console.error(`[INTERACTION] Failed to send error response: ${secondError}`);
        });
      }
    }
  });

  // Handle modal submissions
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    
    try {
      let handlerFound = false;
      const customId = interaction.customId;
      
      // Track processed modal IDs to prevent double handling
      if (!client.processedModalIds) {
        client.processedModalIds = new Set();
      }
      
      // Check if we've already processed this modal
      if (client.processedModalIds.has(interaction.id)) {
        console.log(`[INTERACTION] Modal ${customId} with ID ${interaction.id} already processed, skipping`);
        return;
      }
      
      // Add this modal ID to the processed set
      client.processedModalIds.add(interaction.id);
      
      // Clean up old IDs occasionally to prevent memory leaks
      if (client.processedModalIds.size > 1000) {
        const oldestIds = Array.from(client.processedModalIds).slice(0, 500);
        oldestIds.forEach(id => client.processedModalIds.delete(id));
      }
      
      console.log(`[INTERACTION] Modal submitted: ${customId} by user ${interaction.user.id}`);
      
      // Handle P11 modal submission
      if (customId === 'modal_p11_count') {
        handlerFound = true; // Set this immediately to prevent double handling
        try {
          console.log(`[INTERACTION] Handling P11 modal submission from ${interaction.user.id}`);
          const { handleP11ModalSubmit } = require('./src/modules/ticketFlow');
          await handleP11ModalSubmit(interaction);
        } catch (error) {
          console.error(`[INTERACTION] Error handling P11 modal:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing your P11 count. Please try again.',
              ephemeral: true
            });
          }
        }
      }
      
      // Handle trophies modal submissions
      else if (customId === 'modal_trophies_start') {
        try {
          console.log(`[INTERACTION] Direct handling modal_trophies_start`);
          
          // Get form values
          const brawlerName = interaction.fields.getTextInputValue('brawler_name').trim();
          const currentTrophiesText = interaction.fields.getTextInputValue('brawler_current').trim();
          const desiredTrophiesText = interaction.fields.getTextInputValue('brawler_desired').trim();
          const brawlerLevelText = interaction.fields.getTextInputValue('brawler_level').trim();
          
          console.log(`[INTERACTION] Trophy modal values: brawler="${brawlerName}", current="${currentTrophiesText}", desired="${desiredTrophiesText}", level="${brawlerLevelText}"`);
          
          const currentTrophies = parseInt(currentTrophiesText);
          const desiredTrophies = parseInt(desiredTrophiesText);
          const brawlerLevel = parseInt(brawlerLevelText);
          
          // Validate inputs
          if (isNaN(currentTrophies) || isNaN(desiredTrophies) || isNaN(brawlerLevel)) {
            console.error(`[INTERACTION] Invalid inputs: current=${currentTrophies}, desired=${desiredTrophies}, level=${brawlerLevel}`);
            return interaction.reply({
              content: 'Please enter valid numbers for trophy counts and brawler level.',
              flags: 64
            });
          }
          
          if (currentTrophies >= desiredTrophies) {
            console.error(`[INTERACTION] Current trophies >= desired: ${currentTrophies} >= ${desiredTrophies}`);
            return interaction.reply({
              content: 'The desired trophy count must be higher than the current trophy count.',
              flags: 64
            });
          }
          
          if (brawlerLevel < 1 || brawlerLevel > 11) {
            console.error(`[INTERACTION] Invalid brawler level: ${brawlerLevel}`);
            return interaction.reply({
              content: 'Brawler power level must be between 1 and 11.',
              flags: 64
            });
          }
          
          // Get the calculateTrophyPrice function
          const { calculateTrophyPrice } = require('./utils.js');
          console.log(`[INTERACTION] calculateTrophyPrice imported: ${typeof calculateTrophyPrice}`);
          
          // Calculate base price with error handling
          const basePrice = calculateTrophyPrice(currentTrophies, desiredTrophies);
          console.log(`[INTERACTION] Calculated base price for ${currentTrophies} -> ${desiredTrophies}: €${basePrice}`);
          
          if (!basePrice || basePrice <= 0) {
            console.error(`[INTERACTION] Invalid price calculation result: ${basePrice}`);
            return interaction.reply({
              content: 'There was an error calculating the price. Please try again or contact support.',
              flags: 64
            });
          }
          
          // Apply price multiplier based on brawler level and desired trophies
          let priceMultiplier = 1.0;
          
          // Determine price multiplier based on desired trophies and brawler level
          if (desiredTrophies <= 500) {
            if (brawlerLevel <= 2) priceMultiplier = 3.0;
            else if (brawlerLevel <= 5) priceMultiplier = 2.0;
            else if (brawlerLevel <= 7) priceMultiplier = 1.5;
            else if (brawlerLevel === 8) priceMultiplier = 1.2;
            else if (brawlerLevel === 11) priceMultiplier = 0.9;
          }
          else if (desiredTrophies <= 750) {
            if (brawlerLevel <= 2) priceMultiplier = 3.0;
            else if (brawlerLevel <= 5) priceMultiplier = 2.0;
            else if (brawlerLevel <= 7) priceMultiplier = 1.75;
            else if (brawlerLevel === 8) priceMultiplier = 1.4;
            else if (brawlerLevel === 11) priceMultiplier = 0.9;
          }
          else if (desiredTrophies <= 1000) {
            if (brawlerLevel <= 2) priceMultiplier = 3.0;
            else if (brawlerLevel <= 5) priceMultiplier = 2.5;
            else if (brawlerLevel <= 7) priceMultiplier = 2.0;
            else if (brawlerLevel === 8) priceMultiplier = 1.5;
          }
          else if (desiredTrophies <= 1200) {
            if (brawlerLevel <= 2) priceMultiplier = 4.0;
            else if (brawlerLevel <= 5) priceMultiplier = 3.0;
            else if (brawlerLevel <= 7) priceMultiplier = 2.5;
            else if (brawlerLevel === 8) priceMultiplier = 1.75;
            else if (brawlerLevel === 9) priceMultiplier = 1.2;
            else if (brawlerLevel === 10) priceMultiplier = 1.05;
          }
          else if (desiredTrophies <= 1500) {
            if (brawlerLevel <= 2) priceMultiplier = 4.0;
            else if (brawlerLevel <= 5) priceMultiplier = 3.0;
            else if (brawlerLevel <= 7) priceMultiplier = 2.5;
            else if (brawlerLevel === 8) priceMultiplier = 1.8;
            else if (brawlerLevel === 9) priceMultiplier = 1.4;
            else if (brawlerLevel === 10) priceMultiplier = 1.1;
          }
          else if (desiredTrophies <= 1750) {
            if (brawlerLevel <= 2) priceMultiplier = 5.0;
            else if (brawlerLevel <= 5) priceMultiplier = 4.0;
            else if (brawlerLevel <= 7) priceMultiplier = 3.0;
            else if (brawlerLevel === 8) priceMultiplier = 2.5;
            else if (brawlerLevel === 9) priceMultiplier = 1.6;
            else if (brawlerLevel === 10) priceMultiplier = 1.15;
          }
          else if (desiredTrophies <= 1900) {
            if (brawlerLevel <= 2) priceMultiplier = 5.0;
            else if (brawlerLevel <= 5) priceMultiplier = 4.0;
            else if (brawlerLevel <= 7) priceMultiplier = 3.5;
            else if (brawlerLevel === 8) priceMultiplier = 2.7;
            else if (brawlerLevel === 9) priceMultiplier = 1.7;
            else if (brawlerLevel === 10) priceMultiplier = 1.2;
          }
          else { // desiredTrophies > 1900
            if (brawlerLevel <= 2) priceMultiplier = 6.0;
            else if (brawlerLevel <= 5) priceMultiplier = 4.5;
            else if (brawlerLevel <= 7) priceMultiplier = 3.75;
            else if (brawlerLevel === 8) priceMultiplier = 3.0;
            else if (brawlerLevel === 9) priceMultiplier = 2.25;
            else if (brawlerLevel === 10) priceMultiplier = 1.3;
          }
          
          // Calculate final price
          const finalPrice = basePrice * priceMultiplier;
          console.log(`[INTERACTION] Applied multiplier ${priceMultiplier}x for level ${brawlerLevel} at ${desiredTrophies} trophies. Final price: €${finalPrice.toFixed(2)}`);
          
          // Get the ticketFlow module
          const { flowState } = require('./src/modules/ticketFlow.js');
          
          // Store data in flowState
          flowState.set(interaction.user.id, {
            type: 'trophies',
            brawler: brawlerName,
            currentTrophies,
            desiredTrophies,
            brawlerLevel,
            basePrice: basePrice.toFixed(2),
            priceMultiplier,
            price: finalPrice.toFixed(2),
            step: 'payment_method',
            timestamp: Date.now()
          });
          
          console.log(`[INTERACTION] Set flowState for user ${interaction.user.id}, proceeding to payment selection`);
          
          // Import the necessary modules
          const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
          const PINK_COLOR = '#e68df2';
          
          // Create payment method selection embed
          const embed = new EmbedBuilder()
            .setTitle('Payment Method')
            .setDescription('Please select your payment method.')
            .setColor(PINK_COLOR);

          // Prepare option for PayPal
          const paypalOption = new StringSelectMenuOptionBuilder()
            .setValue('paypal')
            .setLabel('PayPal')
            .setDescription('Friends & Family + PayPal Balance Payments ONLY!')
            .setEmoji('<:paypal:1371862922766192680>');
          
          // Prepare option for Crypto
          const cryptoOption = new StringSelectMenuOptionBuilder()
            .setValue('crypto')
            .setLabel('Crypto')
            .setDescription('No memecoins or such.')
            .setEmoji('<:crypto:1371863500720177314>');
          
          // Prepare option for IBAN
          const ibanOption = new StringSelectMenuOptionBuilder()
            .setValue('iban')
            .setLabel('IBAN Bank Transfer')
            .setDescription('IBAN only. This only works for EU banks.')
            .setEmoji('<:bank:1371863843789209691>');
          
          // Prepare option for PayPal Giftcard
          const paypalGiftcardOption = new StringSelectMenuOptionBuilder()
            .setValue('paypal_giftcard')
            .setLabel('PayPal Giftcard')
            .setDescription('Purchaseable on G2A.com or Eneba.com - Extra fees may apply.')
            .setEmoji('<:paypal:1371862922766192680>');
          
          // Prepare option for Dutch Payment Methods
          const dutchOption = new StringSelectMenuOptionBuilder()
            .setValue('dutch')
            .setLabel('Dutch Payment Methods')
            .setDescription('Only for Dutch people - the Netherlands - No other countries.')
            .setEmoji('<:tikkie:1371869238259875922>');
          
          // Prepare option for German Apple Giftcards
          const appleGiftcardOption = new StringSelectMenuOptionBuilder()
            .setValue('apple_giftcard')
            .setLabel('German Apple Giftcard')
            .setDescription('German Apple giftcards only, other countries are not accepted.')
            .setEmoji('<:applepay:1371864533047578755>');

          // Create payment method select menu
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('payment_method_select')
            .setPlaceholder('Select Payment Method')
            .addOptions(paypalOption, cryptoOption, ibanOption, paypalGiftcardOption, dutchOption, appleGiftcardOption);

          const row = new ActionRowBuilder().addComponents(selectMenu);

          // Send the payment method selection directly instead of the processing message
          await interaction.reply({
            embeds: [embed],
            components: [row],
            flags: 64
          });
          
          handlerFound = true;
        } catch (error) {
          console.error(`[INTERACTION] Error directly handling trophies modal:`, error);
          // Try to handle it through the backup in modalHandlers
          if (modalHandlers && modalHandlers[customId]) {
            console.log(`[INTERACTION] Falling back to modalHandlers for trophies modal`);
            await modalHandlers[customId](interaction);
            handlerFound = true;
          } else {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content: 'An error occurred processing your trophies request. Please try again.',
                flags: 64
              });
            } else {
              await interaction.editReply({
                content: 'An error occurred processing your trophies request. Please try again.',
                flags: 64
              });
            }
            handlerFound = true;
          }
        }
      }
      // Check for exact match
      else if (modalHandlers && modalHandlers[customId]) {
        await modalHandlers[customId](interaction);
        handlerFound = true;
      } 
      // Handle review and feedback modals
      else if (customId.startsWith('review_modal_') || customId.startsWith('feedback_modal_')) {
        try {
          // Get the base ID (review_modal or feedback_modal)
          const baseId = customId.split('_').slice(0, 2).join('_');
          
          console.log(`[INTERACTION] Processing ${baseId} modal with ID: ${customId}`);
          
          // Import the review/feedback modal handlers directly
          const { reviewFeedbackModalHandlers } = require('./paymentHandlers.js');
          
          if (reviewFeedbackModalHandlers && reviewFeedbackModalHandlers[baseId]) {
            await reviewFeedbackModalHandlers[baseId](interaction);
            handlerFound = true;
            // We handled it here, so return immediately to prevent further processing
            return;
          } else {
            console.error(`[INTERACTION] Review/feedback modal handler not found for ${baseId}`);
            await interaction.reply({
              content: 'This form cannot be processed. Please try again later.',
              ephemeral: true
            });
            handlerFound = true;
          }
        } catch (error) {
          console.error(`[INTERACTION] Error handling review/feedback modal ${customId}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while processing your submission.',
              ephemeral: true
            });
          }
          handlerFound = true;
        }
      }
      else {
        // Check for prefix matches (like 'crypto_tx_form_' etc)
        if (modalHandlers) {
          for (const key of Object.keys(modalHandlers)) {
            if (key.endsWith('_') && customId.startsWith(key)) {
              await modalHandlers[key](interaction);
              handlerFound = true;
              break;
            }
          }
        }
      }
      
      if (!handlerFound) {
        console.warn(`No handler found for modal: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'This form cannot be processed. Please contact support.', 
            ephemeral: true 
          }).catch(error => {
            console.error(`Error replying to modal with no handler: ${error}`);
          });
        }
      }
    } catch (error) {
      console.error(`Error handling modal submission: ${interaction.customId}`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: 'An error occurred while processing your submission. Please try again later or contact support.', 
          ephemeral: true 
        }).catch(secondError => {
          console.error(`Failed to send error response for modal: ${secondError}`);
        });
      }
    }
  });
}

module.exports = {
  setupInteractions
}; 