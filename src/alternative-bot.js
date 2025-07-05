/**
 * Alternative bot implementation with different structure
 * NOTE: This is NOT the main entry point. The main bot entry is index.js in the root directory.
 * This file provides an alternative implementation with different handler organization.
 */

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  Collection
} = require('discord.js');

// Import modules
const { TOKEN, CLIENT_ID } = require('./constants');
const { listCommand, messageCommands, buttonHandlers, modalHandlers } = require('./commands');
const { checkTicketTimeouts, ticketDataMap, TicketData } = require('./utils/ticketManager');
const db = require('../database');
const { 
  handleBulkTrophiesModal,
  handleMasteryBrawlerModal,
  handleOtherRequestModal
} = require('./modules/modalHandlers');
const config = require('../config');
const { handleButtonInteraction, handleSelectMenuInteraction, handleModalSubmitInteraction } = require('./interactionHandlers');

// Import handlers from index.js
const { PayPalHandler, PayPalVerifierHandler, TicketManager } = require('./handlers');

// Import PayPal button handlers for direct access
const {
  handlePayPalPaymentReceived,
  handlePayPalPaymentNotReceived
} = require('./handlers/paypalButtonHandler');

// Client setup with intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.commands = new Collection();
client.commands.set(listCommand.data.name, listCommand);

// Set up handlers collection
client.handlers = new Collection();

// Initialize handlers
const initHandlers = async () => {
  console.log('Initializing handlers...');
  
  // Initialize PayPal handler
  const paypalHandler = new PayPalHandler(client);
  client.handlers.set('paypal', paypalHandler);
  
  // Initialize PayPal verifier handler
  const paypalVerifierHandler = new PayPalVerifierHandler(client);
  client.handlers.set('paypalVerifier', paypalVerifierHandler);
  
  // Initialize Ticket manager
  const ticketManager = new TicketManager(client);
  client.handlers.set('ticketManager', ticketManager);
  
  console.log('All handlers initialized successfully');
};

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  try {
    // Button interactions
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction, client);
    }
    // Select menu interactions
    else if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction, client);
    }
    // Modal submit interactions
    else if (interaction.isModalSubmit()) {
      await handleModalSubmitInteraction(interaction, client);
    }
    // Slash commands (if any)
    else if (interaction.isChatInputCommand()) {
      // Handle slash commands if needed
      console.log(`Received command: ${interaction.commandName}`);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing your interaction.',
      ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
});

// Handle message commands
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const command = messageCommands[message.content.toLowerCase()];
  if (command) {
    try {
      await command(message);
    } catch (error) {
      console.error(error);
      await message.reply('There was an error executing this command!');
    }
  }
});

// Handle ticket messages
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const ticketData = ticketDataMap.get(message.channel.id);
  if (ticketData) {
    ticketData.msgCount++;
    if (ticketData.msgCount === 1) {
      ticketData.noMsgReminderSent = true;
    }
  }
});

// Count messages in ticket channels
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const data = ticketDataMap.get(message.channel.id);
  if (!data || message.author.id !== data.openerId) return;
  data.msgCount += 1;
  data.lastOpenerMsgTime = Date.now();
  await db.query(`
    INSERT INTO tickets(channel_id, opener_id, channel_name, open_time, msg_count, last_msg_time, reminder_6h, reminder_12h, reminder_24h)
    VALUES($1,$2,$3,to_timestamp($4/1000),$5,to_timestamp($6/1000),$7,$8,$9)
    ON CONFLICT (channel_id) DO UPDATE SET
      msg_count = EXCLUDED.msg_count,
      last_msg_time = EXCLUDED.last_msg_time,
      reminder_6h = EXCLUDED.reminder_6h,
      reminder_12h = EXCLUDED.reminder_12h,
      reminder_24h = EXCLUDED.reminder_24h;
  `, [
    message.channel.id,
    data.openerId,
    data.channelName,
    data.openTime,
    data.msgCount,
    data.lastOpenerMsgTime,
    data.reminder6hSent,
    data.reminder12hSent,
    data.reminder24hSent
  ]).catch(console.error);
});

// When client is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  try {
    await initHandlers();
    console.log('Bot is ready!');
  } catch (error) {
    console.error('Error during initialization:', error);
  }
});

// Auto-close check every minute
setInterval(() => checkTicketTimeouts(client), 60000);

// Welcome message functionality
const WELCOME_CHANNELS = ['1352022023307657359', '1292896201859141722'];
const WELCOME_CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes

client.on('guildMemberAdd', async (member) => {
  for (const channelId of WELCOME_CHANNELS) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel) {
        const message = await channel.send(`Welcome <@${member.id}>!`);
        setTimeout(() => message.delete().catch(() => {}), 100);
      }
    } catch (error) {
      console.error(`Error sending welcome message to channel ${channelId}:`, error);
    }
  }
});

// Add cleanup interval
setInterval(async () => {
  for (const channelId of WELCOME_CHANNELS) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel) {
        const messages = await channel.messages.fetch({ limit: 100 });
        for (const message of messages.values()) {
          if (message.content.includes('Welcome <@') && message.content.includes('>!')) {
            message.delete().catch(() => {});
          }
        }
      }
    } catch (error) {
      console.error(`Error cleaning up welcome messages in channel ${channelId}:`, error);
    }
  }
}, WELCOME_CLEANUP_INTERVAL);

// Handle errors
client.on('error', (error) => {
  console.error('Client error:', error);
});

client.on('warn', (warning) => {
  console.warn('Client warning:', warning);
});

// Login
client.login(config.TOKEN).catch((error) => {
  console.error('Failed to login:', error);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

// Export client for other modules
module.exports = client; 