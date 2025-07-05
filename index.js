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
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Add handlers collection
client.handlers = new Collection();

// Initialize handlers
const { PayPalHandler, PayPalVerifierHandler, TicketManager } = require('./src/handlers');

// Register handlers
client.handlers.set('paypal', new PayPalHandler(client));
client.handlers.set('paypalVerifier', new PayPalVerifierHandler(client));
client.handlers.set('ticketManager', new TicketManager(client));

// Debug logging
console.log('Environment variables loaded:');
console.log('BOT_TOKEN exists:', !!process.env.BOT_TOKEN);
console.log('BOT_TOKEN length:', process.env.BOT_TOKEN ? process.env.BOT_TOKEN.length : 0);
console.log('BOT_TOKEN first 5 chars:', process.env.BOT_TOKEN ? process.env.BOT_TOKEN.substring(0, 5) : 'none');
console.log('BOT_TOKEN contains spaces:', process.env.BOT_TOKEN ? process.env.BOT_TOKEN.includes(' ') : false);
console.log('BOT_TOKEN contains quotes:', process.env.BOT_TOKEN ? (process.env.BOT_TOKEN.includes('"') || process.env.BOT_TOKEN.includes("'")) : false);

// Use only the new handler for button interactions
const { handleInteraction } = require('./src/handlers/interactionHandler');
const processedInteractions = new Set(); // Track processed interactions

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
    
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
    } else if (interaction.isButton()) {
      // Process button interactions
      await processButtonInteraction(interaction);
    } else {
      // Use our new unified interaction handler for all other interaction types
      await handleInteraction(interaction);
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

/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Discord.js v14
 * Uses process.env.TOKEN for the bot token.
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
const token = process.env.BOT_TOKEN;

// Define slash commands
const defaultCommands = [
  // Review command is now handled in commands.js
];

// Combine default commands with imported commands
const allCommands = [...defaultCommands, ...commands];

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, async readyClient => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  
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
    
    // Setup ticket handlers
  if (typeof setupTicketHandlers === 'function') {
    setupTicketHandlers(client);
      console.log('Ticket handlers have been set up');
  }
  
    // Setup interactions
  if (typeof setupInteractions === 'function') {
    setupInteractions(client);
      console.log('Interaction handlers have been set up');
    }
  } catch (error) {
    console.error('Error loading handlers:', error);
  }
});

// Handle message commands
// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand()) return;

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
      
      // Create and send the ticket panel
      // This is a simplified example - you'll need to implement the actual panel creation
      await interaction.reply({
        content: 'Ticket panel created!',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(`Error handling slash command ${commandName}:`, error);
    await interaction.reply({ 
      content: 'There was an error executing this command!', 
      ephemeral: true 
    });
  }
});

// Handle message commands
client.on(Events.MessageCreate, async message => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
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
client.login(process.env.BOT_TOKEN)
  .then(() => console.log('Successfully logged in!'))
  .catch(error => {
    console.error('Failed to log in:', error);
    process.exit(1);
  });

// Process button interactions
async function processButtonInteraction(interaction) {
  const { customId } = interaction;
  console.log(`[INTERACTION] Button clicked: ${customId} by user ${interaction.user.id}`);

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
      const boosterRoleId = config.ROLES.BOOSTER_ROLE || '1303702944696504441';
      await interaction.channel.permissionOverwrites.edit(boosterRoleId, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false
      });
      
      console.log(`[PAYPAL_BUTTON] Set view-only permissions for booster role ${boosterRoleId} in channel ${interaction.channel.id}`);
      
      // Send boost available embed as a reply to the verification message
      await sendBoostAvailableEmbed(interaction.channel, {}, creatorId, boosterRoleId, message);
      
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