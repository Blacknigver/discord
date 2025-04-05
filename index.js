/********************************************************************
 * Main entry point.
 * Splits logic across multiple files:
 *   - operating.js         (Auto-close logic, presence, data classes)
 *   - commandsAndFeatures.js (All the slash commands, the /list code,
 *                             ticketpanel, friendlist, presence update,
 *                             ephemeral flows, etc.)
 ********************************************************************/

require('dotenv').config(); // if you want .env usage

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { registerOperatingLogic } = require('./operating.js');
const { registerCommandsAndFeatures } = require('./commandsAndFeatures.js');

// BOT TOKEN
const BOT_TOKEN = process.env.TOKEN || '';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel]
});

// Once ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Register logic from other files
registerOperatingLogic(client);
registerCommandsAndFeatures(client);

// Login
client.login(BOT_TOKEN).catch(err => {
  console.error('[Login Error]', err);
});
