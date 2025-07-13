require('dotenv').config(); // Load .env file
const { Client, Collection, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const config = require('./config');
const { sendPayPalPaymentVerificationEmbed } = require('./ticketPayments');

// Initialize client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites
  ]
});

// Add handlers collection
client.handlers = new Collection();

// Initialize handlers
const { PayPalHandler, PayPalVerifierHandler, TicketManager } = require('./src/handlers');
const InviteHandler = require('./src/handlers/inviteHandler');

// Register handlers
client.handlers.set('paypal', new PayPalHandler(client));
client.handlers.set('paypalVerifier', new PayPalVerifierHandler(client));
client.handlers.set('ticketManager', new TicketManager(client));

// Initialize invite tracking system
const inviteHandler = new InviteHandler(client);
client.inviteHandler = inviteHandler;

// Debug logging
console.log('Environment variables loaded:');
console.log('TOKEN exists:', !!process.env.TOKEN);
console.log('TOKEN length:', process.env.TOKEN ? process.env.TOKEN.length : 0);
console.log('TOKEN first 5 chars:', process.env.TOKEN ? process.env.TOKEN.substring(0, 5) : 'none');
console.log('TOKEN contains spaces:', process.env.TOKEN ? process.env.TOKEN.includes(' ') : false);
console.log('TOKEN contains quotes:', process.env.TOKEN ? (process.env.TOKEN.includes('"') || process.env.TOKEN.includes("'")) : false);

// Use only the new handler for button interactions
const { handleInteraction } = require('./src/handlers/interactionHandler');
const processedInteractions = new Set(); // Track processed interactions

// SINGLE UNIFIED INTERACTION HANDLER
client.on('interactionCreate', async interaction => {
  try {
    // Check if this interaction has already been processed
    if (processedInteractions.has(interaction.id)) {
      console.log(`[INTERACTION] Skipping already processed interaction: ${interaction.id}`);
      return;
    }
    
    // Mark interaction as being processed
    processedInteractions.add(interaction.id);
    
    // Set a timeout to remove the interaction ID after 5 seconds
    setTimeout(() => {
      processedInteractions.delete(interaction.id);
    }, 5000);
    
    let handled = false;

    // Use interaction utilities if available
    if (client.interactionUtils) {
      if (interaction.isChatInputCommand()) {
        handled = await client.interactionUtils.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        handled = await client.interactionUtils.handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        handled = await client.interactionUtils.handleSelectMenuInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        handled = await client.interactionUtils.handleModalSubmit(interaction);
      }
    }

    // If not handled by utilities, try the unified handler
    if (!handled) {
      handled = await handleInteraction(interaction);
    }
    
    // If still not handled, try legacy handlers
    if (!handled) {
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await processButtonInteraction(interaction);
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    const reply = {
      content: 'There was an error processing your request!',
        ephemeral: true 
    };
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyError) {
      console.error('Error sending error response:', replyError);
    }
  }
});

// Helper function for slash commands
async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  try {
    // Handle ticket panel slash command
    if (commandName === 'ticket-panel') {
      if (!config.TICKET_PANEL_ALLOWED_USERS.includes(interaction.user.id)) {
        return interaction.reply({ 
          content: "You don't have permission to create ticket panels.", 
          ephemeral: true 
        });
      }
      
      await interaction.reply({
        content: 'Ticket panel created!',
        ephemeral: true
      });
    }

    // ===== /addbalance & /removebalance handling =====
    else if (commandName === 'addbalance' || commandName === 'removebalance') {
      const ADMIN_IDS = ['987751357773672538', '986164993080836096'];
      if (!ADMIN_IDS.includes(interaction.user.id)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }

      const targetUser = interaction.options.getUser('user', true);
      const amountRaw = interaction.options.getNumber('amount', true);
      const amount = parseFloat(amountRaw);

      if (isNaN(amount) || amount <= 0) {
        return interaction.reply({ content: 'Invalid amount specified.', ephemeral: true });
      }

      const db = require('./database');
      try {
        await db.waitUntilConnected();
      } catch {
        return interaction.reply({ content: 'Database not connected.', ephemeral: true });
      }

      const delta = commandName === 'addbalance' ? amount : -amount;

      try {
        const res = await db.query('UPDATE affiliate_links SET balance = balance + $2 WHERE user_id = $1 RETURNING balance', [targetUser.id, delta]);
        if (res.rowCount === 0) {
          return interaction.reply({ content: 'Target user does not have an affiliate link record.', ephemeral: true });
        }
        const newBal = parseFloat(res.rows[0].balance).toFixed(2);
        await interaction.reply({ content: `Updated balance for <@${targetUser.id}>. New balance: €${newBal}`, ephemeral: true });
      } catch (err) {
        console.error('[ADMIN_BALANCE_CMD] Error:', err);
        await interaction.reply({ content: 'Failed to update balance.', ephemeral: true });
      }
      return;
    }
  } catch (error) {
    console.error(`Error handling slash command ${commandName}:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: 'There was an error executing this command!', 
        ephemeral: true 
      });
    }
  }
}

/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Discord.js v14
 *
 * FEATURES INCLUDED:
 * - Auto-close logic with reminders:
 *    • If a ticket has 0 messages from the opener:
 *         - Sends a 6-hour reminder and a 12-hour reminder;
 *         - Auto-closes the ticket at 24 hours.
 *    • If a ticket has ≥1 message:
 *         - Sends a 24-hour inactivity reminder;
 *         - Auto-closes the ticket at 48 hours of inactivity.
 *    In both cases, a log is sent in channel 1354587880382795836.
 *
 * - Ticket Overflow: When a target category is full (≥25 channels),
 *   the ticket is created without a category (parent: null).
 *
 * - Purchase tickets close immediately on "Close Ticket" (no confirm).
 *
 * - "Mark as Sold" button is restricted to role 1292933200389083196.
 *
 * - 115k Add:
 *    • Requires role 1351281086134747298.
 *    • Upon successful claim, removes that role from the user and logs 
 *      "!removeinvites <@user> 3" in channel 1354587880382795836.
 *
 * - Matcherino Winner Add:
 *    • Requires role 1351281117445099631.
 *    • Upon successful claim, removes that role from the user and logs 
 *      "!removeinvites <@user> 5" in channel 1354587880382795836.
 *
 * - Removed "matcherino swap" completely.
 *
 * - Presence Update:
 *    • If a member's status includes "discord.gg/brawlshop" (case-insensitive),
 *      the role 1351998501982048346 is added and never removed.
 *
 * - All other original features (ticket panel, /list, ?move, ?friendlist, etc.)
 *   remain intact.
 ********************************************************************/

const { setupInteractions } = require('./interactions.js');
const { setupTicketHandlers } = require('./tickets.js');
const { commands } = require('./commands.js');

// Bot token from environment variable
const token = process.env.TOKEN;

// Initialize rate limiting cleanup
const { cleanupOldRateLimits } = require('./src/utils/rateLimitSystem');
setInterval(cleanupOldRateLimits, 60 * 60 * 1000); // Clean up every hour

// Define slash commands
// =============================
// Define extra admin-only commands (/addbalance & /removebalance)
// =============================

const addBalanceCommand = new SlashCommandBuilder()
  .setName('addbalance')
  .setDescription('Add balance to an affiliate user')
  .addUserOption(opt => opt.setName('user').setDescription('User to add balance to').setRequired(true))
  .addNumberOption(opt => opt.setName('amount').setDescription('Amount to add (use dot for cents)').setRequired(true));

const removeBalanceCommand = new SlashCommandBuilder()
  .setName('removebalance')
  .setDescription('Remove balance from an affiliate user')
  .addUserOption(opt => opt.setName('user').setDescription('User to remove balance from').setRequired(true))
  .addNumberOption(opt => opt.setName('amount').setDescription('Amount to remove (use dot for cents)').setRequired(true));

// By keeping these in-code (not in commands.js) we ensure they are registered once and handled locally.
const defaultCommands = [addBalanceCommand, removeBalanceCommand];

// Combine default commands with imported commands
const allCommands = [...defaultCommands, ...commands];

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, async readyClient => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  
  // Make client available globally for tickets module
  global.client = readyClient;
  
  // Initialize invite tracking system
  try {
    console.log('[BOT] Initializing invite tracking system...');
    await inviteHandler.initialize();
    console.log('[BOT] Invite tracking system initialized successfully');
  } catch (error) {
    console.error('[BOT] Failed to initialize invite tracking system:', error);
  }
  
  // Initialize scheduled embed system
  try {
    console.log('[BOT] Initializing scheduled embed system...');
    const ScheduledEmbedSystem = require('./src/utils/scheduledEmbeds');
    const scheduledEmbeds = new ScheduledEmbedSystem(readyClient);
    await scheduledEmbeds.initialize();
    console.log('[BOT] Scheduled embed system initialized successfully');
  } catch (error) {
    console.error('[BOT] Failed to initialize scheduled embed system:', error);
  }
  
  // Initialize rate limiting cleanup
  try {
    console.log('[BOT] Initializing rate limiting cleanup...');
    const { cleanupOldRateLimits } = require('./src/utils/rateLimitSystem');
    
    // Run cleanup every hour
    setInterval(async () => {
      try {
        await cleanupOldRateLimits();
      } catch (error) {
        console.error('[BOT] Rate limit cleanup error:', error);
      }
    }, 60 * 60 * 1000); // Every hour
    
    console.log('[BOT] Rate limiting cleanup initialized successfully');
  } catch (error) {
    console.error('[BOT] Failed to initialize rate limiting cleanup:', error);
  }
  
  // Register slash commands
  try {
    console.log('Started refreshing application (/) commands.');
    
    const rest = new REST({ version: '10' }).setToken(token);
    
    await rest.put(
      Routes.applicationCommands(readyClient.user.id),
      { body: allCommands.map(command => command.toJSON()) },
    );
    
    console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
    console.error('Error refreshing application commands:', error);
  }
  
  // Load and register handlers
  try {
    // Load handlers dynamically to avoid syntax errors
    const handlers = require('./handlers.js');
    console.log('Successfully loaded handlers.js');
    
    // Setup ticket handlers ONLY ONCE
  if (typeof setupTicketHandlers === 'function') {
    setupTicketHandlers(client);
      console.log('Ticket handlers have been set up');
  }
  
    // Setup interactions ONLY ONCE 
  if (typeof setupInteractions === 'function') {
    setupInteractions(client);
      console.log('Interaction handlers have been set up');
    }
  } catch (error) {
    console.error('Error loading handlers:', error);
  }
});

// Handle message commands and user messages for auto-close reset
client.on(Events.MessageCreate, async message => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // Handle auto-close logic for user messages in ticket channels
  if (message.guild && message.channel.name && (message.channel.name.includes('ticket') || message.channel.name.includes('ranked') || message.channel.name.includes('trophy') || message.channel.name.includes('bulk') || message.channel.name.includes('other'))) {
    try {
      const { handleUserMessage } = require('./tickets.js');
      await handleUserMessage(message.channel.id, message.author.id);
    } catch (error) {
      console.error(`[MESSAGE_HANDLER] Error handling user message for auto-close: ${error.message}`);
    }
  }
  
  // Check for command prefix
  if (!message.content.startsWith('?')) return;
  
  // Extract command and arguments
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  
  try {
    // Import message commands from handlers
    const { messageCommands } = require('./handlers.js');
    
    // Execute command if it exists
    if (messageCommands && messageCommands[commandName]) {
      await messageCommands[commandName](message, args);
    } else if (commandName) {
      console.log(`Command not found: ${commandName}`);
    }
  } catch (error) {
    console.error(`Error handling message command: ${error}`);
    await message.reply('There was an error executing that command!').catch(console.error);
  }
});

// Add a basic error handler to catch unhandled promise rejections
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Log in to Discord with your client's token
client.login(process.env.TOKEN)
  .then(() => console.log('Successfully logged in!'))
  .catch(error => {
    console.error('Failed to log in:', error);
    process.exit(1);
  });

// Process button interactions
async function processButtonInteraction(interaction) {
  const { customId } = interaction;
  console.log(`[INTERACTION] Button clicked: ${customId} by user ${interaction.user.id}`);

  // CHECK BUTTON RATE LIMITS FIRST
  const { checkButtonRateLimit } = require('./src/utils/rateLimitSystem');
  const rateLimitCheck = await checkButtonRateLimit(interaction.user.id, `button:${customId}`);
  
  if (!rateLimitCheck.allowed) {
    console.log(`[INTERACTION] User ${interaction.user.id} blocked by button rate limit: ${customId}`);
    return await interaction.reply({
      content: rateLimitCheck.reason,
      ephemeral: true
    });
  }

  // Special handling for PayPal buttons
  if (customId === 'copy_email') {
    try {
      const paypalEmail = config.PAYPAL_EMAIL || 'mathiasbenedetto@gmail.com';
      await interaction.reply({
        content: paypalEmail,
        ephemeral: true
      });
      console.log(`[PAYPAL_BUTTON] User ${interaction.user.id} copied PayPal email`);
      return;
    } catch (err) {
      console.error(`[PAYPAL_BUTTON] Error handling copy email: ${err.message}`);
    }
  }
  
  // Handle payment verification buttons
  if (customId === 'payment_received') {
    try {
      console.log(`[INTERACTION] Payment received button clicked by ${interaction.user.id}`);
      
      // Get the message with the buttons
      const message = interaction.message;
      const disabledRow = new ActionRowBuilder();
      
      // Get the original components and disable them
      message.components[0].components.forEach(component => {
        disabledRow.addComponents(
          ButtonBuilder.from(component).setDisabled(true)
        );
      });
      
      // Update the message with disabled buttons first
      await interaction.update({ components: [disabledRow] });
      console.log(`[PAYPAL_BUTTON] Disabled buttons on message ${message.id}`);
      
      // Get ticket creator from message content
      const creatorMention = message.embeds[0].description.match(/<@(\d+)>/);
      const creatorId = creatorMention ? creatorMention[1] : null;
      
      if (!creatorId) {
        console.error('[PAYPAL_BUTTON] Could not determine ticket creator from message');
        return interaction.followUp({
          content: 'Error: Could not determine ticket creator. Please contact an admin.',
          ephemeral: true
        });
      }
      
      // Add permissions for the booster role - VIEW ONLY, no send permissions
      const boosterRoleId = config.ROLES.BOOSTER_ROLE;
      await interaction.channel.permissionOverwrites.edit(boosterRoleId, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false
      });
      
      console.log(`[PAYPAL_BUTTON] Set view-only permissions for booster role ${boosterRoleId} in channel ${interaction.channel.id}`);
      
      // Extract order details from the channel messages
      let orderDetails = {};
      
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 10 });
        const orderRecapMsg = messages.find(msg => 
          msg.embeds.length > 0 && msg.embeds[0].title === 'Order Recap'
        );
        
        if (orderRecapMsg && orderRecapMsg.embeds[0]) {
          const embed = orderRecapMsg.embeds[0];
          console.log(`[INDEX] Found Order Recap embed, extracting details...`);
          
          // Extract order information from fields
          if (embed.fields && embed.fields.length > 0) {
            for (const field of embed.fields) {
              const fieldName = field.name.toLowerCase();
              const fieldValue = field.value.replace(/`/g, '').trim(); // Remove backticks
              
              if (fieldName.includes('current rank')) {
                orderDetails.current = fieldValue;
              } else if (fieldName.includes('desired rank')) {
                orderDetails.desired = fieldValue;
              } else if (fieldName.includes('current trophies')) {
                orderDetails.current = fieldValue;
              } else if (fieldName.includes('desired trophies')) {
                orderDetails.desired = fieldValue;
                orderDetails.current = fieldValue;
                orderDetails.desired = fieldValue;
              } else if (fieldName.includes('price')) {
                orderDetails.price = fieldValue;
              } else if (fieldName.includes('payment method')) {
                orderDetails.paymentMethod = fieldValue;
              }
            }
          }
          
          console.log(`[INDEX] Extracted order details:`, orderDetails);
        } else {
          console.log(`[INDEX] No Order Recap embed found, using channel topic for details`);
          
          // Fallback to channel topic if Order Recap not found
          if (interaction.channel.topic) {
            const topicPriceMatch = interaction.channel.topic.match(/Price:\s*([€]?[\d,.]+)/i);
            if (topicPriceMatch) {
              orderDetails.price = topicPriceMatch[1];
            }
            
            const topicRanksMatch = interaction.channel.topic.match(/From:\s*([^|]+)\s*to\s*([^|]+)/i);
            if (topicRanksMatch) {
              orderDetails.current = topicRanksMatch[1].trim();
              orderDetails.desired = topicRanksMatch[2].trim();
            }
          }
        }
      } catch (extractError) {
        console.error(`[INDEX] Error extracting order details: ${extractError.message}`);
      }
      
      // Send boost available embed as a reply to the verification message
      await sendBoostAvailableEmbed(interaction.channel, orderDetails, creatorId, boosterRoleId, message);
      
      // Clean up payment method messages AFTER boost available is sent
      const { cleanupMessages } = require('./src/utils/messageCleanup.js');
      await cleanupMessages(interaction.channel, null, 'payment_confirmed');
      
      return;
    } catch (err) {
      console.error(`[INTERACTION] Error handling payment_received: ${err.message}`);
    }
  }
  
  if (customId === 'payment_not_received') {
    try {
      console.log(`[INTERACTION] Payment not received button clicked by ${interaction.user.id}`);
      
      // Get the message with the buttons
      const message = interaction.message;
      const disabledRow = new ActionRowBuilder();
      
      // Get the original components and disable them
      message.components[0].components.forEach(component => {
        disabledRow.addComponents(
          ButtonBuilder.from(component).setDisabled(true)
        );
      });
      
      // Update the message with disabled buttons
      await interaction.update({ components: [disabledRow] });
      
      // Send message indicating payment was not received
      await interaction.followUp({
        content: 'Payment has been marked as not received. Please ask the customer to check their payment details and try again.',
        ephemeral: false
      });
      
      return;
    } catch (err) {
      console.error(`[INTERACTION] Error handling payment_not_received: ${err.message}`);
    }
  }

  // Note: payment_completed is handled by buttonHandlers.js - don't handle it here
  
  // Let other handlers process the interaction
}