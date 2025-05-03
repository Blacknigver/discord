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

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require('discord.js');

// load .env so process.env.DATABASE_URL (and TOKEN) is populated
require('dotenv').config();
// our Postgres helper
const db = require('./database');
// review command
const reviewCommand = require('./review');

// Constants & Setup
const BOT_TOKEN = process.env.TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID_HERE';
const CATEGORY_LIMIT = 50; // Max channels per category

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

// Roles & IDs
const TICKET_PANEL_ALLOWED_USERS = ['658351335967686659', '986164993080836096']; // for ?ticketpanel
const STAFF_ROLES = [
  '1292933924116500532',
  '1292933200389083196',
  '1303702944696504441',
  '1322611585281425478'
];
const LIST_COMMAND_ROLE = '1292933200389083196'; // for /list
const BRAWLSHOP_AD_ROLE = '1351998501982048346'; // for presence update

// Ticket Categories
const TICKET_CATEGORIES = {
  TROPHIES: '1322947795803574343',
  RANKED: '1322913302921089094',
  BULK: '1351659422484791306',
  MASTERY: '1351659903621791805',
  OTHER: '1322947859561320550'
};
const MAX_TICKETS_PER_USER = 2;

// ?move Categories
const MOVE_CATEGORIES = {
  paid: '1347969048553586822',
  add: '1347969216052985876',
  sell: '1347969305165303848',
  finished: '1347969418898051164'
};

// For ?adds – Only 115k Add and Matcherino Winner Add remain (matcherino swap removed)
const ADD_115K_MSG_CHANNEL = '1351687016433193051';
const ADD_MATCHERINO_MSG_CHANNEL = '1351687016433193051';

// Role requirements for adds
const ADD_115K_ROLE = '1351281086134747298';
const MATCHERINO_WINNER_ROLE = '1351281117445099631';

// Purchase Account Category
const PURCHASE_ACCOUNT_CATEGORY = '1347969247317327933';

// Auto-Close Log Channel
const AUTO_CLOSE_LOG_CHANNEL = '1354587880382795836';

// Embed Color
const EMBED_COLOR = '#E68DF2';

// Auto-Close Data Class
class TicketData {
  constructor(openerId, channelId, channelName, openTime) {
    this.openerId = openerId;
    this.channelId = channelId;
    this.channelName = channelName;
    this.openTime = openTime;
    this.msgCount = 0;
    this.lastOpenerMsgTime = openTime;
    this.reminder6hSent = false;
    this.reminder12hSent = false;
    this.reminder24hSent = false;
  }
}

const ticketDataMap = new Map();

/**
 * Check if a category is full (≥ CATEGORY_LIMIT channels)
 */
function isCategoryFull(categoryId, guild) {
  const category = guild.channels.cache.get(categoryId);
  if (!category) return false;
  return category.children.cache.size >= CATEGORY_LIMIT;
}

// Utility to log closure
async function autoCloseLog(channel, openerId, channelName, afterLabel) {
  const guild = channel.guild;
  if (!guild) return;
  const logChannel = guild.channels.cache.get(AUTO_CLOSE_LOG_CHANNEL);
  if (!logChannel) return;
  await logChannel.send({
    content: `**Ticket Closed**\nUser: <@${openerId}>\nTicket Name: ${channelName}\nClosed After: ${afterLabel}`
  });
}

// Utility to fetch username or return null
async function fetchUsername(userId) {
  try {
    const user = await client.users.fetch(userId);
    return user.username;
  } catch {
    return null;
  }
}

/**
 * Log + close a channel automatically
 */
async function autoCloseLogAndDelete(channel, openerId, channelName, reason) {
  try {
    await channel.send({
      content: `**Ticket auto-closed**\nUser: <@${openerId}>\nTicket Name: ${channelName}\nClosed Because: ${reason}`
    });
  } catch {/* ignore */}
  await autoCloseLog(channel, openerId, channelName, reason);
  await channel.delete().catch(() => {});

  // 🗑 Remove from DB
  try {
    await db.query(
      `DELETE FROM tickets WHERE channel_id = $1`,
      [channel.id]
    );
  } catch (err) {
    console.error('❌ Failed to delete ticket row on auto-close:', err);
  }
}

// Auto-close check every minute
setInterval(() => {
  checkTicketTimeouts();
}, 60 * 1000);

async function checkTicketTimeouts() {
  const now = Date.now();
  const guild = client.guilds.cache.first();
  if (!guild) return;

  for (const [channelId, data] of ticketDataMap.entries()) {
    const { openerId, channelName, openTime, msgCount, lastOpenerMsgTime } = data;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      ticketDataMap.delete(channelId);
      continue;
    }

    // (1) If the opener left the server
    const openerMember = guild.members.cache.get(openerId);
    if (!openerMember) {
      const username = (await fetchUsername(openerId)) || 'Unknown';
      await autoCloseLogAndDelete(
        channel,
        openerId,
        channelName,
        `User left the server (was: ${username}).`
      );
      ticketDataMap.delete(channelId);
      continue;
    }

    // (2) No messages yet → 6h, 12h, then 24h auto-close
    if (msgCount === 0) {
      const hoursSinceOpen = (now - openTime) / 36e5;

      // 6-hour reminder
      if (hoursSinceOpen >= 6 && !data.reminder6hSent) {
        data.reminder6hSent = true;
        try {
          await db.query(
            `UPDATE tickets SET reminder_6h = TRUE WHERE channel_id = $1`,
            [channelId]
          );
        } catch (err) {
          console.error('❌ Failed to persist 6h flag', err);
        }
        await sendNoMsgReminder(channel, openerId, 6, 18);
      }

      // 12-hour reminder
      if (hoursSinceOpen >= 12 && !data.reminder12hSent) {
        data.reminder12hSent = true;
        try {
          await db.query(
            `UPDATE tickets SET reminder_12h = TRUE WHERE channel_id = $1`,
            [channelId]
          );
        } catch (err) {
          console.error('❌ Failed to persist 12h flag', err);
        }
        await sendNoMsgReminder(channel, openerId, 12, 12);
      }

      // 24-hour auto-close
      if (hoursSinceOpen >= 24) {
        await autoCloseLogAndDelete(
          channel,
          openerId,
          channelName,
          '24 hours (no messages from user).'
        );
        ticketDataMap.delete(channelId);
      }

    } else {
      // (3) Has ≥1 message → 24h inactivity remind, 48h auto-close
      const hoursInactive = (now - lastOpenerMsgTime) / 36e5;

      // 24-hour inactivity reminder
      if (hoursInactive >= 24 && hoursInactive < 48 && !data.reminder24hSent) {
        data.reminder24hSent = true;
        try {
          await db.query(
            `UPDATE tickets SET reminder_24h = TRUE WHERE channel_id = $1`,
            [channelId]
          );
        } catch (err) {
          console.error('❌ Failed to persist 24h flag', err);
        }
        await sendInactivityReminder(channel, openerId);
      }

      // 48-hour auto-close
      if (hoursInactive >= 48) {
        await autoCloseLogAndDelete(
          channel,
          openerId,
          channelName,
          '48 hours (no messages from user).'
        );
        ticketDataMap.delete(channelId);
      }
    }
  }
}

async function sendNoMsgReminder(channel, openerId, hoursSoFar, hoursLeft) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(
      `${mention} - You have not sent a single message for **${hoursSoFar} hours**, ` +
      `please send a message within the next **${hoursLeft} hours** or your ticket will be closed.`
    );
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}

async function sendInactivityReminder(channel, openerId) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(
      `${mention} - You have not sent a message for 24 hours, ` +
      `please send a message within the next 24 hours or your ticket will be closed.`
    );
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}

// Message counting + DB persistence
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const data = ticketDataMap.get(message.channel.id);
  if (!data) return;

  // only count messages from the original opener
  if (message.author.id !== data.openerId) return;

  // update in-memory
  data.msgCount += 1;
  data.lastOpenerMsgTime = Date.now();

  // persist to Postgres
  try {
    await db.query(
      `INSERT INTO tickets(
          channel_id,
          opener_id,
          channel_name,
          open_time,
          msg_count,
          last_msg_time,
          reminder_6h,
          reminder_12h,
          reminder_24h
        ) VALUES($1,$2,$3,to_timestamp($4/1000),$5,to_timestamp($6/1000),$7,$8,$9)
        ON CONFLICT (channel_id) DO UPDATE SET
          msg_count       = EXCLUDED.msg_count,
          last_msg_time   = EXCLUDED.last_msg_time,
          reminder_6h     = EXCLUDED.reminder_6h,
          reminder_12h    = EXCLUDED.reminder_12h,
          reminder_24h    = EXCLUDED.reminder_24h;`,
      [
        message.channel.id,
        data.openerId,
        data.channelName,
        data.openTime,
        data.msgCount,
        data.lastOpenerMsgTime,
        data.reminder6hSent,
        data.reminder12hSent,
        data.reminder24hSent
      ]
    );
  } catch (err) {
    console.error('❌ Failed to upsert ticket row:', err);
  }
});

/** Checks if a member has at least one of the specified roles. */
function hasAnyRole(member, roleIds = []) {
  return roleIds.some(r => member.roles.cache.has(r));
}

// 3) /list slash command
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new account for sale (Restricted).')
  .addStringOption(opt =>
    opt.setName('ping')
      .setDescription('Who to ping?')
      .setRequired(true)
      .addChoices(
        { name: 'Everyone', value: 'everyone' },
        { name: 'Here', value: 'here' },
        { name: 'None', value: 'none' }
      )
  )
  .addStringOption(opt =>
    opt.setName('text')
      .setDescription('Short descriptive text to include')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('price')
      .setDescription('Price of the account')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('trophies')
      .setDescription('Trophies value')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('p11')
      .setDescription('Power 11 info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('tier_max')
      .setDescription('Tier Max info')
      .setRequired(true)
  )
  .addAttachmentOption(opt =>
    opt.setName('image')
      .setDescription('Main image (upload a file)')
      .setRequired(true)
  );

// 4) Bot startup
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // ─── hydrate ticketDataMap from DB ────────────────────────────────────────────────
  try {
    const res = await db.query(`
      SELECT
        channel_id,
        opener_id,
        channel_name,
        EXTRACT(EPOCH FROM open_time)*1000 AS open_time,
        msg_count,
        EXTRACT(EPOCH FROM last_msg_time)*1000 AS last_msg_time,
        reminder_6h,
        reminder_12h,
        reminder_24h
      FROM tickets
    `);
    for (const row of res.rows) {
      const data = new TicketData(
        row.opener_id,
        row.channel_id,
        row.channel_name,
        Number(row.open_time)
      );
      data.msgCount = row.msg_count;
      data.lastOpenerMsgTime = Number(row.last_msg_time);
      data.reminder6hSent  = row.reminder_6h;
      data.reminder12hSent = row.reminder_12h;
      data.reminder24hSent = row.reminder_24h;
      ticketDataMap.set(row.channel_id, data);
    }
    console.log(`Loaded ${res.rows.length} tickets from database.`);
  } catch (err) {
    console.error('Error loading tickets from DB:', err);
  }
  // ─────────────────────────────────────────────────────────────────────────────────

  // now register your slash commands exactly as before
  try {
    await client.application.commands.create(listCommand);
    console.log('[Slash Command] /list registered successfully');
    await client.application.commands.create(reviewCommand.data);
    console.log('[Slash Command] /review registered successfully');
  } catch (err) {
    console.error('Error registering /list:', err);
  }
});

// 5) Presence Update
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.member) return;
  const member = newPresence.member;
  if (!member.manageable) return;
  if (newPresence.status === "offline") return;
  let foundLink = false;
  if (newPresence.activities) {
    for (const act of newPresence.activities) {
      if (act.state && act.state.toLowerCase().includes('discord.gg/brawlshop')) {
        foundLink = true;
        break;
      }
    }
  }
  if (foundLink && !member.roles.cache.has(BRAWLSHOP_AD_ROLE)) {
    await member.roles.add(BRAWLSHOP_AD_ROLE).catch(() => {});
  }
});

// 6) Message Handler (for ?ticketpanel, ?move, ?adds, ?friendlist)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const prefix = '?';
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  if (cmd === 'ticketpanel') {
    if (!TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply("You don't have permission to use this command!");
    }
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Order a Boost')
      .setDescription('Looking to Purchase a Boost? Please select what kind of boost you want below.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_trophies')
        .setLabel('Trophies')
        .setEmoji('<:trophy:1301901071471345664>')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ticket_ranked')
        .setLabel('Ranked')
        .setEmoji('<:Masters:1293283897618075728>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ticket_bulk')
        .setLabel('Bulk Trophies')
        .setEmoji('<:gold_trophy:1351658932434768025>')
        .setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_mastery')
        .setLabel('Mastery')
        .setEmoji('<:mastery:1351659726991134832>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ticket_other')
        .setLabel('Other')
        .setEmoji('<:winmatcherino:1298703851934711848>')
        .setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [embed], components: [row, row2] });
    await message.reply('Ticket panel created!');
  }

  if (cmd === 'move') {
    if (!hasAnyRole(message.member, STAFF_ROLES)) {
      return message.reply("You don't have permission to use this command!");
    }
    const sub = args[0];
    if (!sub || !MOVE_CATEGORIES[sub]) {
      return message.reply('Invalid syntax. Usage: ?move [paid|add|sell|finished]');
    }
    const targetCat = MOVE_CATEGORIES[sub];
    try {
      await message.channel.setParent(targetCat, { lockPermissions: false });
      await message.reply(`Channel moved to category: ${sub}`);
    } catch (err) {
      console.error(err);
      message.reply('Could not move the channel. Check permissions or category ID.');
    }
  }

  if (cmd === 'adds') {
    if (!message.member.roles.cache.has('1292933200389083196')) {
      return message.reply("You don't have permission to use this command!");
    }
    const embed2 = new EmbedBuilder()
      .setTitle('115k Trophies & 71 R35 Add')
      .setColor(EMBED_COLOR)
      .setDescription('**__This requires 3 invites!__**\n\nAdd a 115k Trophy and 71 legacy R35 Player.')
      .setImage('https://media.discordapp.net/attachments/1351687016433193051/1351997791425007656/IMG_2580.png');
    const embed3 = new EmbedBuilder()
      .setTitle('Matcherino Winner Add')
      .setColor(EMBED_COLOR)
      .setDescription('**__This requires 5 invites!__**\n\nAdd a **Matcherino Winner!**')
      .setImage('https://media.discordapp.net/attachments/1351687016433193051/1351997783028142170/IMG_2581.png');
    const embed4 = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription('**Once you have enough invites, claim your reward using the buttons below.**\n\nMake sure to follow https://discord.com/channels/1292895164595175444/1293243690185265233');
    await message.channel.send({ embeds: [embed2, embed3] });
    const rowAll = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_add_115k')
        .setLabel('Add 115k')
        .setEmoji('<:gold_trophy:1351658932434768025>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_add_matcherino_winner')
        .setLabel('Add Matcherino Winner')
        .setEmoji('<:pro:1351687685328208003>')
        .setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [embed4], components: [rowAll] });
  }

  if (cmd === 'friendlist') {
    if (!message.member.roles.cache.has('1292933200389083196')) {
      return message.reply("You don't have permission to use this command!");
    }
    const embedRowLeft =
      '🥈| **LUX | Zoro** - €10\n' +
      '🥈| **Lennox** - €15\n' +
      '🥈| **Melih** - €15\n' +
      '🥈| **Elox** - €15';
    const embedRowRight =
      '🥈| **Kazu** - €15\n' +
      '🥇| **Izana** - €25\n' +
      '🥇| **SKC | Rafiki** - €25\n' +
      '🥇| **HMB | BosS** - €60';
    const friendEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .addFields(
        { name: '\u200b', value: embedRowLeft, inline: true },
        { name: '\u200b', value: embedRowRight, inline: true }
      );
    const friendEmbed2 = new EmbedBuilder().setDescription('# ⬆️ ALL ADDS ARE LIFETIME');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('friendlist_buyadd')
        .setLabel('Buy Add')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('friendlist_playerinfo')
        .setLabel('Player Information')
        .setStyle(ButtonStyle.Primary)
    );
    await message.channel.send({ embeds: [friendEmbed, friendEmbed2], components: [row] });
  }
});

// PRICE CALC UTILS
function calculateTrophyPrice(current, desired) {
  let totalCents = 0;
  let trophiesLeft = desired - current;
  let start = current;
  function costPer5(trophyCount) {
    if (trophyCount < 500) return 5;
    if (trophyCount < 750) return 7.5;
    if (trophyCount < 1000) return 10;
    if (trophyCount < 1100) return 20;
    if (trophyCount < 1200) return 25;
    if (trophyCount < 1300) return 30;
    if (trophyCount < 1400) return 35;
    if (trophyCount < 1500) return 40;
    if (trophyCount < 1600) return 45;
    if (trophyCount < 1700) return 50;
    if (trophyCount < 1800) return 55;
    if (trophyCount < 1900) return 65;
    if (trophyCount < 2000) return 75;
    return 75;
  }
  while (trophiesLeft > 0) {
    const thisBlock = Math.min(trophiesLeft, 5);
    const costSegment = costPer5(start);
    totalCents += costSegment;
    trophiesLeft -= thisBlock;
    start += 5;
  }
  const totalEuros = totalCents / 100;
  return Math.round(totalEuros * 100) / 100;
}

function calculateBulkPrice(current, desired) {
  let totalCents = 0;
  let trophiesLeft = desired - current;
  let start = current;
  function costPer10(trophyCount) {
    if (trophyCount < 10000) return 5;
    if (trophyCount < 20000) return 7.5;
    if (trophyCount < 30000) return 10;
    if (trophyCount < 40000) return 11;
    if (trophyCount < 50000) return 12.5;
    if (trophyCount < 60000) return 15;
    if (trophyCount < 70000) return 17.5;
    if (trophyCount < 80000) return 20;
    if (trophyCount < 90000) return 25;
    if (trophyCount < 100000) return 30;
    if (trophyCount < 110000) return 45;
    if (trophyCount < 120000) return 60;
    if (trophyCount < 130000) return 75;
    if (trophyCount < 140000) return 100;
    if (trophyCount < 150000) return 150;
    return 150;
  }
  while (trophiesLeft > 0) {
    const thisBlock = Math.min(trophiesLeft, 10);
    const costSegment = costPer10(start);
    totalCents += costSegment;
    trophiesLeft -= thisBlock;
    start += 10;
  }
  const totalEuros = totalCents / 100;
  return Math.round(totalEuros * 100) / 100;
}

// Rank / Mastery arrays
const RANKED_ORDER = [
  'Bronze1','Bronze2','Bronze3',
  'Silver1','Silver2','Silver3',
  'Gold1','Gold2','Gold3',
  'Diamond1','Diamond2','Diamond3',
  'Mythic1','Mythic2','Mythic3',
  'Legendary1','Legendary2','Legendary3',
  'Masters1','Masters2','Masters3',
  'Pro'
];
const RANKED_STEPS_COST = {
  'Bronze1->Bronze2': 0.25,
  'Bronze2->Bronze3': 0.35,
  'Bronze3->Silver1': 0.40,
  'Silver1->Silver2': 0.50,
  'Silver2->Silver3': 0.50,
  'Silver3->Gold1': 0.50,
  'Gold1->Gold2': 0.70,
  'Gold2->Gold3': 0.70,
  'Gold3->Diamond1': 0.70,
  'Diamond1->Diamond2': 1.50,
  'Diamond2->Diamond3': 1.50,
  'Diamond3->Mythic1': 1.50,
  'Mythic1->Mythic2': 2.50,
  'Mythic2->Mythic3': 3.00,
  'Mythic3->Legendary1': 3.50,
  'Legendary1->Legendary2': 7.00,
  'Legendary2->Legendary3': 10.00,
  'Legendary3->Masters1': 13.00,
  'Masters1->Masters2': 50.00,
  'Masters2->Masters3': 80.00,
  'Masters3->Pro': 120.00
};
function calculateRankedPrice(currentRank, desiredRank) {
  const idxStart = RANKED_ORDER.indexOf(currentRank);
  const idxEnd = RANKED_ORDER.indexOf(desiredRank);
  if (idxStart < 0 || idxEnd < 0 || idxStart >= idxEnd) {
    return null;
  }
  let total = 0;
  for (let i = idxStart; i < idxEnd; i++) {
    const stepKey = `${RANKED_ORDER[i]}->${RANKED_ORDER[i+1]}`;
    const stepCost = RANKED_STEPS_COST[stepKey] || 0;
    total += stepCost;
  }
  return Math.round(total * 100) / 100;
}

// Mastery
const MASTERY_ORDER = [
  'Bronze1','Bronze2','Bronze3',
  'Silver1','Silver2','Silver3',
  'Gold1','Gold2','Gold3'
];
const MASTERY_STEPS_COST = {
  'Bronze1->Bronze2': 2.00,
  'Bronze2->Bronze3': 3.00,
  'Bronze3->Silver1': 2.00,
  'Silver1->Silver2': 6.00,
  'Silver2->Silver3': 8.00,
  'Silver3->Gold1': 15.00,
  'Gold1->Gold2': 20.00,
  'Gold2->Gold3': 30.00
};
function calculateMasteryPrice(currentRank, desiredRank) {
  const idxStart = MASTERY_ORDER.indexOf(currentRank);
  const idxEnd = MASTERY_ORDER.indexOf(desiredRank);
  if (idxStart < 0 || idxEnd < 0 || idxStart >= idxEnd) {
    return null;
  }
  let total = 0;
  for (let i = idxStart; i < idxEnd; i++) {
    const stepKey = `${MASTERY_ORDER[i]}->${MASTERY_ORDER[i+1]}`;
    const stepCost = MASTERY_STEPS_COST[stepKey] || 0;
    total += stepCost;
  }
  return Math.round(total * 100) / 100;
}

const ephemeralFlowState = new Map();

// 8) Button Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, member, guild, channel, user } = interaction;

  // Purchase listing
  if (customId.startsWith('purchase_account_')) {
    try {
      const existingTickets = guild.channels.cache.filter(ch => {
        return ch.type === ChannelType.GuildText && ch.name.startsWith(`purchase-${user.username}-`);
      });
      const hasOverflowUser = (existingTickets.size >= MAX_TICKETS_PER_USER);
      const categoryFull = isCategoryFull(PURCHASE_ACCOUNT_CATEGORY, guild);
      const parentToUse = (hasOverflowUser || categoryFull) ? null : PURCHASE_ACCOUNT_CATEGORY;
      const channelName = `purchase-${user.username}-${Math.floor(Math.random()*1000)}`;
      const purchaseChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentToUse,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          ...STAFF_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
        ]
      });
      const mentionText = `<@${user.id}>`;
      const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');
      const closeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );
      await purchaseChannel.send({ content: mentionText, embeds: [welcomeEmbed], components: [closeBtnRow] });
      ticketDataMap.set(purchaseChannel.id, new TicketData(user.id, purchaseChannel.id, channelName, Date.now()));
      return interaction.reply({ content: `Ticket created: <#${purchaseChannel.id}>`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Failed to create purchase ticket channel.', ephemeral: true });
    }
  }

  if (customId.startsWith('listing_mark_sold_')) {
    if (!member.roles.cache.has('1292933200389083196')) {
      return interaction.reply({ content: 'Only members with role 1292933200389083196 can mark this as sold.', ephemeral: true });
    }
    const originalMsg = interaction.message;
    if (!originalMsg) {
      return interaction.reply({ content: 'Could not fetch the original message to edit.', ephemeral: true });
    }
    const soldButton = new ButtonBuilder()
      .setCustomId('sold_button')
      .setLabel('This account has been sold.')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
    const soldRow = new ActionRowBuilder().addComponents(soldButton);
    try {
      await originalMsg.edit({ components: [soldRow] });
      return interaction.reply({ content: 'Listing marked as sold!', ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Failed to mark as sold. Check permissions.', ephemeral: true });
    }
  }

  // 115k / matcherino
  if (customId === 'btn_add_115k') {
    if (!member.roles.cache.has(ADD_115K_ROLE)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setDescription('Insufficient Invites: You must have the role 1351281086134747298.')],
        ephemeral: true
      });
    }
    const modal = new ModalBuilder().setCustomId('modal_add_115k').setTitle('Supercell ID');
    const input = new TextInputBuilder()
      .setCustomId('supercell_id_input')
      .setLabel('Supercell ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);
    return interaction.showModal(modal);
  }

  if (customId === 'btn_add_matcherino_winner') {
    if (!member.roles.cache.has(MATCHERINO_WINNER_ROLE)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setDescription('Insufficient Invites: You must have the role 1351281117445099631.')],
        ephemeral: true
      });
    }
    const modal = new ModalBuilder().setCustomId('modal_matcherino_winner').setTitle('Supercell ID');
    const input = new TextInputBuilder()
      .setCustomId('supercell_id_input')
      .setLabel('Supercell ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);
    return interaction.showModal(modal);
  }

  // FRIENDLIST
  if (customId === 'friendlist_buyadd') {
    const buyTitle = 'Buy an Add';
    const buyDesc = 'Please select the player you would like to add.';
    const friendlistPlayers = [
      'LUX | Zoro',
      'Lennox',
      'Melih',
      'Elox',
      'Kazu',
      'Izana',
      'SKC | Rafiki',
      'HMB | BosS'
    ];
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    const customIds = ['buy_luxzoro','buy_lennox','buy_melih','buy_elox','buy_kazu','buy_izana','buy_rafiki','buy_boss'];
    for (let i = 0; i < 5; i++) {
      row1.addComponents(
        new ButtonBuilder().setCustomId(customIds[i]).setLabel(friendlistPlayers[i]).setStyle(ButtonStyle.Success)
      );
    }
    for (let i = 5; i < 8; i++) {
      row2.addComponents(
        new ButtonBuilder().setCustomId(customIds[i]).setLabel(friendlistPlayers[i]).setStyle(ButtonStyle.Success)
      );
    }
    const embed = new EmbedBuilder().setTitle(buyTitle).setDescription(buyDesc).setColor(EMBED_COLOR);
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  }

  if (customId === 'friendlist_playerinfo') {
    const infoTitle = 'Player Information';
    const infoDesc = 'Get more information about the player you would like to add!';
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    const friendlistPlayers = [
      'LUX | Zoro',
      'Lennox',
      'Melih',
      'Elox',
      'Kazu',
      'Izana',
      'SKC | Rafiki',
      'HMB | BosS'
    ];
    const customIds = [
      'info_luxzoro','info_lennox','info_melih','info_elox',
      'info_kazu','info_izana','info_rafiki','info_boss'
    ];
    for (let i = 0; i < 5; i++) {
      row1.addComponents(
        new ButtonBuilder().setCustomId(customIds[i]).setLabel(friendlistPlayers[i]).setStyle(ButtonStyle.Primary)
      );
    }
    for (let i = 5; i < 8; i++) {
      row2.addComponents(
        new ButtonBuilder().setCustomId(customIds[i]).setLabel(friendlistPlayers[i]).setStyle(ButtonStyle.Primary)
      );
    }
    const embed = new EmbedBuilder().setTitle(infoTitle).setDescription(infoDesc).setColor(EMBED_COLOR);
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  }

  const buyMap = {
    'buy_luxzoro': 'LUX | Zoro',
    'buy_lennox': 'Lennox',
    'buy_melih': 'Melih',
    'buy_elox': 'Elox',
    'buy_kazu': 'Kazu',
    'buy_izana': 'Izana',
    'buy_rafiki': 'SKC | Rafiki',
    'buy_boss': 'HMB | BosS'
  };
  if (Object.keys(buyMap).includes(customId)) {
    try {
      const existingTickets = guild.channels.cache.filter(ch => {
        if (ch.type === ChannelType.GuildText) {
          const perm = ch.permissionOverwrites.cache.get(user.id);
          return perm?.allow.has(PermissionsBitField.Flags.ViewChannel);
        }
        return false;
      });
      const hasOverflow = (existingTickets.size >= MAX_TICKETS_PER_USER);
      const categoryFull = isCategoryFull(MOVE_CATEGORIES.add, guild);
      const parentToUse = (hasOverflow || categoryFull) ? null : MOVE_CATEGORIES.add;
      const channelName = `add-${user.username}-${Math.floor(Math.random()*1000)}`;
      const addChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentToUse,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          ...STAFF_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
        ]
      });
      const mentionText = `<@${user.id}>`;
      const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');
      const closeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );
      await addChannel.send({ content: mentionText, embeds: [welcomeEmbed], components: [closeBtnRow] });
      ticketDataMap.set(addChannel.id, new TicketData(user.id, addChannel.id, addChannel.name, Date.now()));
      return interaction.reply({ content: `Ticket created: <#${addChannel.id}>`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Failed to create add ticket channel.', ephemeral: true });
    }
  }

  // INFO
  const infoMap = {
    'info_luxzoro': 'LUX | Zoro',
    'info_lennox': 'Lennox',
    'info_melih': 'Melih',
    'info_elox': 'Elox',
    'info_kazu': 'Kazu',
    'info_izana': 'Izana',
    'info_rafiki': 'SKC | Rafiki',
    'info_boss': 'HMB | BosS'
  };
  if (Object.keys(infoMap).includes(customId)) {
    // ...
    // Already coded above, returning info
  }

  // Trophies
  if (customId === 'ticket_trophies') {
    // EXACT question text
    const modal = new ModalBuilder()
      .setCustomId('modal_trophies_start')
      .setTitle('Trophies Boost');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('brawler_name')
          .setLabel('Which Brawler Do You Want Boosted?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('brawler_current')
          .setLabel('How Many Trophies Does Your Brawler Have?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('brawler_desired')
          .setLabel('What Are Your Desired Trophies?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  // Bulk
  if (customId === 'ticket_bulk') {
    const modal = new ModalBuilder()
      .setCustomId('modal_bulk_start')
      .setTitle('Bulk Trophies');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bulk_current')
          .setLabel('How Many Trophies Do You Currently Have?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bulk_desired')
          .setLabel('What Is Your Desired Total Trophies?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  // Other
  if (customId === 'ticket_other') {
    const modal = new ModalBuilder()
      .setCustomId('modal_ticket_other')
      .setTitle('Other Request');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('other_purchase')
          .setLabel('What Are You Purchasing?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  // RANKED
  if (customId === 'ticket_ranked') {
    // We'll store ephemeral state
    ephemeralFlowState.set(user.id, { step: 'ranked_current_main' });
    const embed = new EmbedBuilder()
      .setTitle('Current Rank')
      .setDescription('What Is Your Current Rank?')
      .setColor(EMBED_COLOR);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_current_Masters').setLabel('Masters').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_current_Legendary').setLabel('Legendary').setEmoji('<:Legendary:1264709440561483818>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ranked_current_Mythic').setLabel('Mythic').setEmoji('<:mythic:1357482343555666181>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ranked_current_Diamond').setLabel('Diamond').setEmoji('<:diamond:1357482488506613920>').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_current_Gold').setLabel('Gold').setEmoji('<:gold:1357482374048256131>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_current_Silver').setLabel('Silver').setEmoji('<:silver:1357482400333955132>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ranked_current_Bronze').setLabel('Bronze').setEmoji('<:bronze:1357482418654937332>').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  }

  // Mastery
  if (customId === 'ticket_mastery') {
    // "Which Brawler Do You Want Boosted?" in a modal
    const modal = new ModalBuilder()
      .setCustomId('modal_mastery_brawler')
      .setTitle('Mastery Boost');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('mastery_brawler')
          .setLabel('Which Brawler Do You Want Boosted?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }
});

// 9) Modal Submissions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  const { customId, user } = interaction;

  // TROPHIES
  if (customId === 'modal_trophies_start') {
    const brawlerName = interaction.fields.getTextInputValue('brawler_name')?.trim();
    const currentStr = interaction.fields.getTextInputValue('brawler_current')?.trim();
    const desiredStr = interaction.fields.getTextInputValue('brawler_desired')?.trim();
    const currentTrophies = parseInt(currentStr, 10);
    const desiredTrophies = parseInt(desiredStr, 10);

    if (isNaN(currentTrophies) || isNaN(desiredTrophies) || currentTrophies >= desiredTrophies) {
      return interaction.reply({ content: 'Please Enter A Valid Trophy Amount.', ephemeral: true });
    }
    const price = calculateTrophyPrice(currentTrophies, desiredTrophies);

    const embed = new EmbedBuilder()
      .setTitle('Your Price')
      .setDescription(`Your Price Will Be:\n\n\`€${price}\``)
      .setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trophies_purchase_boost').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trophies_cancel').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
    );
    ephemeralFlowState.set(user.id, {
      panelType: 'trophies',
      brawlerName,
      currentTrophies,
      desiredTrophies,
      price
    });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // BULK
  if (customId === 'modal_bulk_start') {
    const currentStr = interaction.fields.getTextInputValue('bulk_current')?.trim();
    const desiredStr = interaction.fields.getTextInputValue('bulk_desired')?.trim();
    const current = parseInt(currentStr, 10);
    const desired = parseInt(desiredStr, 10);

    if (isNaN(current) || isNaN(desired) || current >= desired) {
      return interaction.reply({ content: 'Please Enter A Valid Trophy Amount.', ephemeral: true });
    }
    const price = calculateBulkPrice(current, desired);

    const embed = new EmbedBuilder()
      .setTitle('Your Price')
      .setDescription(`Your Price Will Be:\n\n\`€${price}\`\n\n**Up to a 50% Discount can be given if you buy several Thousands of Trophies.**`)
      .setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bulk_purchase_boost').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bulk_cancel').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
    );
    ephemeralFlowState.set(user.id, {
      panelType: 'bulk',
      current,
      desired,
      price
    });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // OTHER
  if (customId === 'modal_ticket_other') {
    const whatPurchase = interaction.fields.getTextInputValue('other_purchase')?.trim();
    const lines = [
      ['What Are You Purchasing?', whatPurchase]
    ];
    return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.OTHER, lines);
  }

  // MASTERY "Which Brawler?"
  if (customId === 'modal_mastery_brawler') {
    const brawlerName = interaction.fields.getTextInputValue('mastery_brawler')?.trim() || 'Unknown Brawler';
    ephemeralFlowState.set(interaction.user.id, {
      step: 'mastery_current_main',
      brawlerName
    });

    const embed = new EmbedBuilder()
      .setTitle('Current Mastery')
      .setDescription('What Is Your Current Mastery?')
      .setColor(EMBED_COLOR);
    // 3 buttons: Bronze, Silver, Gold (with correct color/emoji)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mastery_current_Bronze').setLabel('Bronze').setEmoji('<:mastery_bronze:1357487786394914847>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mastery_current_Silver').setLabel('Silver').setEmoji('<:mastery_silver:1357487832481923153>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mastery_current_Gold').setLabel('Gold').setEmoji('<:mastery_gold:1357487865029722254>').setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
});

// Create ticket channel
async function createTicketChannelWithOverflow(interaction, categoryId, answers) {
  const { guild, user } = interaction;
  const existingTickets = guild.channels.cache.filter(ch => {
    if (ch.type === ChannelType.GuildText) {
      const perm = ch.permissionOverwrites.cache.get(user.id);
      return perm?.allow.has(PermissionsBitField.Flags.ViewChannel);
    }
    return false;
  });
  const hasOverflow = (existingTickets.size >= MAX_TICKETS_PER_USER);
  const categoryFull = isCategoryFull(categoryId, guild);
  const parentToUse = (hasOverflow || categoryFull) ? null : categoryId;
  try {
    const channelName = `ticket-${user.username}-${Math.floor(Math.random()*1000)}`;
    const newChan = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentToUse,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        ...STAFF_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
      ]
    });
    const mentionText = `<@${user.id}>`;
    const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\nSupport will respond soon.');
    let desc = '';
    for (const [q, ans] of answers) {
      desc += `**${q}:**\n${ans}\n\n`;
    }
    const qnaEmbed = new EmbedBuilder().setDescription(desc.trim());
    const closeBtnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setEmoji('<:Lock:1349157009244557384>')
        .setStyle(ButtonStyle.Danger)
    );
    await newChan.send({ content: mentionText, embeds: [welcomeEmbed, qnaEmbed], components: [closeBtnRow] });
    ticketDataMap.set(newChan.id, new TicketData(user.id, newChan.id, newChan.name, Date.now()));
    return interaction.reply({ content: `Ticket created: <#${newChan.id}>`, ephemeral: true });
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: 'Failed to create ticket channel. Check permissions.', ephemeral: true });
  }
}

// 8) Button Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

  // Slash Command: /list
  if (interaction.isChatInputCommand() && interaction.commandName === 'list') {
    if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({ content: "You don't have the required role to use this command.", ephemeral: true });
    }
    const pingChoice = interaction.options.getString('ping');
    const text = interaction.options.getString('text');
    const price = interaction.options.getString('price');
    const trophies = interaction.options.getString('trophies');
    const p11 = interaction.options.getString('p11');
    const tierMax = interaction.options.getString('tier_max');
    const mainImage = interaction.options.getAttachment('image');
    const imageUrl = mainImage?.url;

    let nonEmbedText;
    if (pingChoice === 'everyone') {
      nonEmbedText = '**||@everyone|| New account added!**';
    } else if (pingChoice === 'here') {
      nonEmbedText = '**||@here|| New account added!**';
    } else {
      nonEmbedText = '**New account added!**';
    }

    const mainEmbed = new EmbedBuilder()
      .setTitle('New Account Added! <:winmatcherino:1298703851934711848>')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Description', value: text, inline: false },
        { name: '<:Money:1351665747641766022> Price', value: price, inline: true },
        { name: '<:gold_trophy:1351658932434768025> Trophies', value: trophies, inline: true },
        { name: '<:P11:1351683038127591529> P11', value: p11, inline: true },
        { name: '<:tiermax:1301899953320497243> Tier Max', value: tierMax, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      );
    if (imageUrl) {
      mainEmbed.setImage(imageUrl);
    }

    const rowOfButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('purchase_account_temp')
        .setLabel('Purchase Account')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('listing_mark_sold_temp')
        .setLabel('Mark as Sold')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: 'Listing posted!', ephemeral: true });
    const listingMessage = await interaction.channel.send({ content: nonEmbedText, embeds: [mainEmbed], components: [rowOfButtons] });

    // fix customId
    const newPurchaseId = `purchase_account_${listingMessage.id}`;
    const newSoldId = `listing_mark_sold_${listingMessage.id}`;
    const updatedRows = [];
    for (const rowComp of listingMessage.components) {
      const rowBuilder = ActionRowBuilder.from(rowComp);
      for (const comp of rowBuilder.components) {
        if (comp.customId === 'purchase_account_temp') {
          comp.setCustomId(newPurchaseId);
        } else if (comp.customId === 'listing_mark_sold_temp') {
          comp.setCustomId(newSoldId);
        }
      }
      updatedRows.push(rowBuilder);
    }
    await listingMessage.edit({ components: updatedRows });
    return;
  }


  // Button Interactions
  if (interaction.isButton()) {
    const { customId, member, guild, channel, user } = interaction;

    // Purchase listing
    if (customId.startsWith('purchase_account_')) {
      try {
        const existingTickets = guild.channels.cache.filter(ch => {
          return ch.type === ChannelType.GuildText && ch.name.startsWith(`purchase-${user.username}-`);
        });
        const hasOverflowUser = (existingTickets.size >= MAX_TICKETS_PER_USER);
        const categoryFull = isCategoryFull(PURCHASE_ACCOUNT_CATEGORY, guild);
        const parentToUse = (hasOverflowUser || categoryFull) ? null : PURCHASE_ACCOUNT_CATEGORY;
        const channelName = `purchase-${user.username}-${Math.floor(Math.random()*1000)}`;
        const purchaseChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parentToUse,
          permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            ...STAFF_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
          ]
        });
        const mentionText = `<@${user.id}>`;
        const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');
        const closeBtnRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setEmoji('<:Lock:1349157009244557384>')
            .setStyle(ButtonStyle.Danger)
        );
        await purchaseChannel.send({ content: mentionText, embeds: [welcomeEmbed], components: [closeBtnRow] });
        ticketDataMap.set(purchaseChannel.id, new TicketData(user.id, purchaseChannel.id, channelName, Date.now()));
        return interaction.reply({ content: `Ticket created: <#${purchaseChannel.id}>`, ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: 'Failed to create purchase ticket channel.', ephemeral: true });
      }
    }

    if (customId.startsWith('listing_mark_sold_')) {
      if (!member.roles.cache.has('1292933200389083196')) {
        return interaction.reply({ content: 'Only members with role 1292933200389083196 can mark this as sold.', ephemeral: true });
      }
      const originalMsg = interaction.message;
      if (!originalMsg) {
        return interaction.reply({ content: 'Could not fetch the original message to edit.', ephemeral: true });
      }
      const soldButton = new ButtonBuilder()
        .setCustomId('sold_button')
        .setLabel('This account has been sold.')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);
      const soldRow = new ActionRowBuilder().addComponents(soldButton);
      try {
        await originalMsg.edit({ components: [soldRow] });
        return interaction.reply({ content: 'Listing marked as sold!', ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: 'Failed to mark as sold. Check permissions.', ephemeral: true });
      }
    }

    // 115k / matcherino
    if (customId === 'btn_add_115k') {
      if (!member.roles.cache.has(ADD_115K_ROLE)) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('Insufficient Invites: You must have the role 1351281086134747298.')],
          ephemeral: true
        });
      }
      const modal = new ModalBuilder().setCustomId('modal_add_115k').setTitle('Supercell ID');
      const input = new TextInputBuilder()
        .setCustomId('supercell_id_input')
        .setLabel('Supercell ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);
      return interaction.showModal(modal);
    }

    if (customId === 'btn_add_matcherino_winner') {
      if (!member.roles.cache.has(MATCHERINO_WINNER_ROLE)) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('Insufficient Invites: You must have the role 1351281117445099631.')],
          ephemeral: true
        });
      }
      const modal = new ModalBuilder().setCustomId('modal_matcherino_winner').setTitle('Supercell ID');
      const input = new TextInputBuilder()
        .setCustomId('supercell_id_input')
        .setLabel('Supercell ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);
      return interaction.showModal(modal);
    }

    // FRIENDLIST
    if (customId === 'friendlist_buyadd') {
      const buyTitle = 'Buy an Add';
      const buyDesc = 'Please select the player you would like to add.';
      const friendlistPlayers = [
        'LUX | Zoro',
        'Lennox',
        'Melih',
        'Elox',
        'Kazu',
        'Izana',
        'SKC | Rafiki',
        'HMB | BosS'
      ];
      const row1 = new ActionRowBuilder();
      const row2 = new ActionRowBuilder();
      const customIds = ['buy_luxzoro','buy_lennox','buy_melih','buy_elox','buy_kazu','buy_izana','buy_rafiki','buy_boss'];
      for (let i = 0; i < 5; i++) {
        row1.addComponents(
          new ButtonBuilder().setCustomId(customIds[i]).setLabel(friendlistPlayers[i]).setStyle(ButtonStyle.Success)
        );
      }
      for (let i = 5; i < 8; i++) {
        row2.addComponents(
          new ButtonBuilder().setCustomId(customIds[i]).setLabel(friendlistPlayers[i]).setStyle(ButtonStyle.Success)
        );
      }
      const embed = new EmbedBuilder().setTitle(buyTitle).setDescription(buyDesc).setColor(EMBED_COLOR);
      return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }

    if (customId === 'friendlist_playerinfo') {
      const infoTitle = 'Player Information';
      const infoDesc = 'Get more information about the player you would like to add!';
      const row1 = new ActionRowBuilder();
      const row2 = new ActionRowBuilder();
      const friendlistPlayers = [
        'LUX | Zoro',
        'Lennox',
        'Melih',
        'Elox',
        'Kazu',
        'Izana',
        'SKC | Rafiki',
        'HMB | BosS'
      ];
      const customIds = [
        'info_luxzoro','info_lennox','info_melih','info_elox',
        'info_kazu','info_izana','info_rafiki','info_boss'
      ];
      for (let i = 0; i < 5; i++) {
        row1.addComponents(
          new ButtonBuilder().setCustomId(customIds[i]).setLabel(friendlistPlayers[i]).setStyle(ButtonStyle.Primary)
        );
      }
      for (let i = 5; i < 8; i++) {
        row2.addComponents(
          new ButtonBuilder().setCustomId(customIds[i]).setLabel(friendlistPlayers[i]).setStyle(ButtonStyle.Primary)
        );
      }
      const embed = new EmbedBuilder().setTitle(infoTitle).setDescription(infoDesc).setColor(EMBED_COLOR);
      return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }

    const buyMap = {
      'buy_luxzoro': 'LUX | Zoro',
      'buy_lennox': 'Lennox',
      'buy_melih': 'Melih',
      'buy_elox': 'Elox',
      'buy_kazu': 'Kazu',
      'buy_izana': 'Izana',
      'buy_rafiki': 'SKC | Rafiki',
      'buy_boss': 'HMB | BosS'
    };
    if (Object.keys(buyMap).includes(customId)) {
      try {
        const existingTickets = guild.channels.cache.filter(ch => {
          if (ch.type === ChannelType.GuildText) {
            const perm = ch.permissionOverwrites.cache.get(user.id);
            return perm?.allow.has(PermissionsBitField.Flags.ViewChannel);
          }
          return false;
        });
        const hasOverflow = (existingTickets.size >= MAX_TICKETS_PER_USER);
        const categoryFull = isCategoryFull(MOVE_CATEGORIES.add, guild);
        const parentToUse = (hasOverflow || categoryFull) ? null : MOVE_CATEGORIES.add;
        const channelName = `add-${user.username}-${Math.floor(Math.random()*1000)}`;
        const addChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parentToUse,
          permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            ...STAFF_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
          ]
        });
        const mentionText = `<@${user.id}>`;
        const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');
        const closeBtnRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setEmoji('<:Lock:1349157009244557384>')
            .setStyle(ButtonStyle.Danger)
        );
        await addChannel.send({ content: mentionText, embeds: [welcomeEmbed], components: [closeBtnRow] });
        ticketDataMap.set(addChannel.id, new TicketData(user.id, addChannel.id, addChannel.name, Date.now()));
        return interaction.reply({ content: `Ticket created: <#${addChannel.id}>`, ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: 'Failed to create add ticket channel.', ephemeral: true });
      }
    }

    // INFO
    const infoMap = {
      'info_luxzoro': 'LUX | Zoro',
      'info_lennox': 'Lennox',
      'info_melih': 'Melih',
      'info_elox': 'Elox',
      'info_kazu': 'Kazu',
      'info_izana': 'Izana',
      'info_rafiki': 'SKC | Rafiki',
      'info_boss': 'HMB | BosS'
    };
    if (Object.keys(infoMap).includes(customId)) {
      // ...
      // Already coded above, returning info
    }

    // Trophies
    if (customId === 'ticket_trophies') {
      // EXACT question text
      const modal = new ModalBuilder()
        .setCustomId('modal_trophies_start')
        .setTitle('Trophies Boost');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('brawler_name')
            .setLabel('Which Brawler Do You Want Boosted?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('brawler_current')
            .setLabel('How Many Trophies Does Your Brawler Have?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('brawler_desired')
            .setLabel('What Are Your Desired Trophies?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }

    // Bulk
    if (customId === 'ticket_bulk') {
      const modal = new ModalBuilder()
        .setCustomId('modal_bulk_start')
        .setTitle('Bulk Trophies');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('bulk_current')
            .setLabel('How Many Trophies Do You Currently Have?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('bulk_desired')
            .setLabel('What Is Your Desired Total Trophies?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }

    // Other
    if (customId === 'ticket_other') {
      const modal = new ModalBuilder()
        .setCustomId('modal_ticket_other')
        .setTitle('Other Request');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('other_purchase')
            .setLabel('What Are You Purchasing?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }

    // RANKED
    if (customId === 'ticket_ranked') {
      // We'll store ephemeral state
      ephemeralFlowState.set(user.id, { step: 'ranked_current_main' });
      const embed = new EmbedBuilder()
        .setTitle('Current Rank')
        .setDescription('What Is Your Current Rank?')
        .setColor(EMBED_COLOR);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ranked_current_Masters').setLabel('Masters').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ranked_current_Legendary').setLabel('Legendary').setEmoji('<:Legendary:1264709440561483818>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ranked_current_Mythic').setLabel('Mythic').setEmoji('<:mythic:1357482343555666181>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ranked_current_Diamond').setLabel('Diamond').setEmoji('<:diamond:1357482488506613920>').setStyle(ButtonStyle.Primary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ranked_current_Gold').setLabel('Gold').setEmoji('<:gold:1357482374048256131>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ranked_current_Silver').setLabel('Silver').setEmoji('<:silver:1357482400333955132>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ranked_current_Bronze').setLabel('Bronze').setEmoji('<:bronze:1357482418654937332>').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }

    // Mastery
    if (customId === 'ticket_mastery') {
      // "Which Brawler Do You Want Boosted?" in a modal
      const modal = new ModalBuilder()
        .setCustomId('modal_mastery_brawler')
        .setTitle('Mastery Boost');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('mastery_brawler')
            .setLabel('Which Brawler Do You Want Boosted?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }

    // Modal Submissions
    if (interaction.isModalSubmit()) {
      const { customId, user } = interaction;

      // TROPHIES
      if (customId === 'modal_trophies_start') {
        const brawlerName = interaction.fields.getTextInputValue('brawler_name')?.trim();
        const currentStr = interaction.fields.getTextInputValue('brawler_current')?.trim();
        const desiredStr = interaction.fields.getTextInputValue('brawler_desired')?.trim();
        const currentTrophies = parseInt(currentStr, 10);
        const desiredTrophies = parseInt(desiredStr, 10);

        if (isNaN(currentTrophies) || isNaN(desiredTrophies) || currentTrophies >= desiredTrophies) {
          return interaction.reply({ content: 'Please Enter A Valid Trophy Amount.', ephemeral: true });
        }
        const price = calculateTrophyPrice(currentTrophies, desiredTrophies);

        const embed = new EmbedBuilder()
          .setTitle('Your Price')
          .setDescription(`Your Price Will Be:\n\n\`€${price}\``)
          .setColor(EMBED_COLOR);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('trophies_purchase_boost').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('trophies_cancel').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
        );
        ephemeralFlowState.set(user.id, {
          panelType: 'trophies',
          brawlerName,
          currentTrophies,
          desiredTrophies,
          price
        });
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      // BULK
      if (customId === 'modal_bulk_start') {
        const currentStr = interaction.fields.getTextInputValue('bulk_current')?.trim();
        const desiredStr = interaction.fields.getTextInputValue('bulk_desired')?.trim();
        const current = parseInt(currentStr, 10);
        const desired = parseInt(desiredStr, 10);

        if (isNaN(current) || isNaN(desired) || current >= desired) {
          return interaction.reply({ content: 'Please Enter A Valid Trophy Amount.', ephemeral: true });
        }
        const price = calculateBulkPrice(current, desired);

        const embed = new EmbedBuilder()
          .setTitle('Your Price')
          .setDescription(`Your Price Will Be:\n\n\`€${price}\`\n\n**Up to a 50% Discount can be given if you buy several Thousands of Trophies.**`)
          .setColor(EMBED_COLOR);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('bulk_purchase_boost').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('bulk_cancel').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
        );
        ephemeralFlowState.set(user.id, {
          panelType: 'bulk',
          current,
          desired,
          price
        });
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      // OTHER
      if (customId === 'modal_ticket_other') {
        const whatPurchase = interaction.fields.getTextInputValue('other_purchase')?.trim();
        const lines = [
          ['What Are You Purchasing?', whatPurchase]
        ];
        return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.OTHER, lines);
      }

      // MASTERY "Which Brawler?"
      if (customId === 'modal_mastery_brawler') {
        const brawlerName = interaction.fields.getTextInputValue('mastery_brawler')?.trim() || 'Unknown Brawler';
        ephemeralFlowState.set(interaction.user.id, {
          step: 'mastery_current_main',
          brawlerName
        });

        const embed = new EmbedBuilder()
          .setTitle('Current Mastery')
          .setDescription('What Is Your Current Mastery?')
          .setColor(EMBED_COLOR);
        // 3 buttons: Bronze, Silver, Gold (with correct color/emoji)
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mastery_current_Bronze').setLabel('Bronze').setEmoji('<:mastery_bronze:1357487786394914847>').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('mastery_current_Silver').setLabel('Silver').setEmoji('<:mastery_silver:1357487832481923153>').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('mastery_current_Gold').setLabel('Gold').setEmoji('<:mastery_gold:1357487865029722254>').setStyle(ButtonStyle.Success)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }
      return;
    }

    // CANCEL (Trophies/Bulk final price)
    if (customId === 'trophies_cancel' || customId === 'bulk_cancel') {
      ephemeralFlowState.delete(user.id);
      return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
    }

    // Trophies / Bulk purchase
    if (customId === 'trophies_purchase_boost' || customId === 'bulk_purchase_boost') {
      const data = ephemeralFlowState.get(user.id);
      if (!data) {
        return interaction.reply({ content: 'No data found. Please try again.', ephemeral: true });
      }
      ephemeralFlowState.delete(user.id);
      if (data.panelType === 'trophies') {
        const lines = [
          ['Which Brawler Do You Want Boosted?', data.brawlerName],
          ['How Many Trophies Does Your Brawler Have?', data.currentTrophies],
          ['What Are Your Desired Trophies?', data.desiredTrophies],
          ['Price', `€${data.price}`]
        ];
        return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.TROPHIES, lines);
      } else {
        // bulk
        const lines = [
          ['How Many Trophies Do You Currently Have?', data.current],
          ['What Is Your Desired Total Trophies?', data.desired],
          ['Price', `€${data.price}`]
        ];
        return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.BULK, lines);
      }
    }

    // RANKED STEPS
    if (customId.startsWith('ranked_current_')) {
      // e.g. ranked_current_Masters
      const rankBase = customId.replace('ranked_current_', ''); // "Masters"
      ephemeralFlowState.set(user.id, { step: 'ranked_current_sub', rankBase });

      // same color & emoji
      let style = ButtonStyle.Success;
      let emoji = '';
      if (rankBase === 'Masters')    { emoji = '<:Masters:1293283897618075728>'; style = ButtonStyle.Success; }
      if (rankBase === 'Legendary')  { emoji = '<:Legendary:1264709440561483818>'; style = ButtonStyle.Danger; }
      if (rankBase === 'Mythic')     { emoji = '<:mythic:1357482343555666181>'; style = ButtonStyle.Danger; }
      if (rankBase === 'Diamond')    { emoji = '<:diamond:1357482488506613920>'; style = ButtonStyle.Primary; }
      if (rankBase === 'Gold')       { emoji = '<:gold:1357482374048256131>'; style = ButtonStyle.Success; }
      if (rankBase === 'Silver')     { emoji = '<:silver:1357482400333955132>'; style = ButtonStyle.Primary; }
      if (rankBase === 'Bronze')     { emoji = '<:bronze:1357482418654937332>'; style = ButtonStyle.Secondary; }

      const embed = new EmbedBuilder()
        .setDescription(`Please specify exactly which ${rankBase} rank you have.`)
        .setColor(EMBED_COLOR);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ranked_curr_sub_${rankBase}1`).setLabel(`${rankBase} 1`).setEmoji(emoji).setStyle(style),
        new ButtonBuilder().setCustomId(`ranked_curr_sub_${rankBase}2`).setLabel(`${rankBase} 2`).setEmoji(emoji).setStyle(style),
        new ButtonBuilder().setCustomId(`ranked_curr_sub_${rankBase}3`).setLabel(`${rankBase} 3`).setEmoji(emoji).setStyle(style)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId.startsWith('ranked_curr_sub_')) {
      // e.g. ranked_curr_sub_Masters1 => "Masters1"
      const rankSelected = customId.replace('ranked_curr_sub_', '');
      ephemeralFlowState.set(user.id, {
        step: 'ranked_desired_main',
        currentRank: rankSelected
      });
      const embed = new EmbedBuilder()
        .setTitle('Desired Rank')
        .setDescription('What Is Your Desired Rank?')
        .setColor(EMBED_COLOR);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ranked_desired_Masters').setLabel('Masters').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ranked_desired_Legendary').setLabel('Legendary').setEmoji('<:Legendary:1264709440561483818>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ranked_desired_Mythic').setLabel('Mythic').setEmoji('<:mythic:1357482343555666181>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ranked_desired_Diamond').setLabel('Diamond').setEmoji('<:diamond:1357482488506613920>').setStyle(ButtonStyle.Primary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ranked_desired_Gold').setLabel('Gold').setEmoji('<:gold:1357482374048256131>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ranked_desired_Silver').setLabel('Silver').setEmoji('<:silver:1357482400333955132>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ranked_desired_Bronze').setLabel('Bronze').setEmoji('<:bronze:1357482418654937332>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ranked_desired_Pro').setLabel('Pro').setEmoji('<:pro:1351687685328208003>').setStyle(ButtonStyle.Success)
      );
      return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }

    if (customId.startsWith('ranked_desired_')) {
      const data = ephemeralFlowState.get(user.id);
      if (!data?.currentRank) {
        return interaction.reply({ content: 'No current rank stored. Please restart.', ephemeral: true });
      }
      const base = customId.replace('ranked_desired_', '');
      if (base === 'Pro') {
        // final price
        const cost = calculateRankedPrice(data.currentRank, 'Pro');
        if (cost === null) {
          return interaction.reply({ content: 'Invalid rank range.', ephemeral: true });
        }
        ephemeralFlowState.set(user.id, {
          step: 'ranked_final',
          currentRank: data.currentRank,
          desiredRank: 'Pro',
          price: cost
        });
        const embed = new EmbedBuilder()
          .setTitle('Your Price')
          .setDescription(`Your Price Will Be:\n\n\`€${cost}\``)
          .setColor(EMBED_COLOR);
        // final step => purchase or cancel
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ranked_purchase_final').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('ranked_cancel_final').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      } else {
        // sub-rank
        let style = ButtonStyle.Success;
        let emoji = '';
        if (base === 'Masters')    { emoji = '<:Masters:1293283897618075728>'; style = ButtonStyle.Success; }
        if (base === 'Legendary')  { emoji = '<:Legendary:1264709440561483818>'; style = ButtonStyle.Danger; }
        if (base === 'Mythic')     { emoji = '<:mythic:1357482343555666181>'; style = ButtonStyle.Danger; }
        if (base === 'Diamond')    { emoji = '<:diamond:1357482488506613920>'; style = ButtonStyle.Primary; }
        if (base === 'Gold')       { emoji = '<:gold:1357482374048256131>'; style = ButtonStyle.Success; }
        if (base === 'Silver')     { emoji = '<:silver:1357482400333955132>'; style = ButtonStyle.Primary; }
        if (base === 'Bronze')     { emoji = '<:bronze:1357482418654937332>'; style = ButtonStyle.Secondary; }

        ephemeralFlowState.set(user.id, {
          step: 'ranked_desired_sub',
          currentRank: data.currentRank,
          baseDesired: base
        });
        const embed = new EmbedBuilder()
          .setDescription(`Please specify exactly which ${base} rank you want.`)
          .setColor(EMBED_COLOR);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ranked_dsub_${base}1`).setLabel(`${base} 1`).setEmoji(emoji).setStyle(style),
          new ButtonBuilder().setCustomId(`ranked_dsub_${base}2`).setLabel(`${base} 2`).setEmoji(emoji).setStyle(style),
          new ButtonBuilder().setCustomId(`ranked_dsub_${base}3`).setLabel(`${base} 3`).setEmoji(emoji).setStyle(style)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }
    }

    if (customId.startsWith('ranked_dsub_')) {
      const data = ephemeralFlowState.get(user.id);
      if (!data?.currentRank) {
        return interaction.reply({ content: 'No current rank. Please restart.', ephemeral: true });
      }
      const finalPick = customId.replace('ranked_dsub_', ''); // e.g. "Masters1"
      const cost = calculateRankedPrice(data.currentRank, finalPick);
      if (cost === null) {
        return interaction.reply({ content: 'Invalid rank range.', ephemeral: true });
      }
      ephemeralFlowState.set(user.id, {
        step: 'ranked_final',
        currentRank: data.currentRank,
        desiredRank: finalPick,
        price: cost
      });
      const embed = new EmbedBuilder()
        .setTitle('Your Price')
        .setDescription(`Your Price Will Be:\n\n\`€${cost}\``)
        .setColor(EMBED_COLOR);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ranked_purchase_final').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ranked_cancel_final').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId === 'ranked_cancel_final') {
      ephemeralFlowState.delete(user.id);
      return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
    }

    if (customId === 'ranked_purchase_final') {
      const data = ephemeralFlowState.get(user.id);
      if (!data) {
        return interaction.reply({ content: 'No data found, please retry.', ephemeral: true });
      }
      ephemeralFlowState.delete(user.id);
      const lines = [
        ['Current Rank?', data.currentRank],
        ['Desired Rank?', data.desiredRank],
        ['Price', `€${data.price}`]
      ];
      return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.RANKED, lines);
    }

    // MASTERY flow
    if (customId.startsWith('mastery_current_')) {
      const data = ephemeralFlowState.get(user.id);
      if (!data) {
        return interactionreply({ content: 'No mastery data found, please re-open.', ephemeral: true });
      }
      const base = customId.replace('mastery_current_', ''); // "Bronze"/"Silver"/"Gold"
      ephemeralFlowState.set(user.id, { ...data, step: 'mastery_current_sub', baseMastery: base });

      // same color & emoji
      let style = ButtonStyle.Danger;
      let emoji = '<:mastery_bronze:1357487786394914847>';
      if (base === 'Silver') { style = ButtonStyle.Primary; emoji = '<:mastery_silver:1357487832481923153>'; }
      if (base === 'Gold') { style = ButtonStyle.Success; emoji = '<:mastery_gold:1357487865029722254>'; }

      const embed = new EmbedBuilder()
        .setDescription(`Please specify exactly which ${base} mastery you have.`)
        .setColor(EMBED_COLOR);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mastery_csub_${base}1`).setLabel(`${base} 1`).setEmoji(emoji).setStyle(style),
        new ButtonBuilder().setCustomId(`mastery_csub_${base}2`).setLabel(`${base} 2`).setEmoji(emoji).setStyle(style),
        new ButtonBuilder().setCustomId(`mastery_csub_${base}3`).setLabel(`${base} 3`).setEmoji(emoji).setStyle(style)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId.startsWith('mastery_csub_')) {
      // e.g. mastery_csub_Bronze1
      const data = ephemeralFlowState.get(user.id);
      if (!data) {
        return interaction.reply({ content: 'No mastery data found, please re-open.', ephemeral: true });
      }
      const pick = customId.replace('mastery_csub_', ''); // e.g. "Bronze1"
      ephemeralFlowState.set(user.id, { ...data, currentMastery: pick, step: 'mastery_desired_main' });

      const embed = new EmbedBuilder()
        .setTitle('Desired Mastery')
        .setDescription('What Is Your Desired Mastery?')
        .setColor(EMBED_COLOR);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mastery_desired_Bronze').setLabel('Bronze').setEmoji('<:mastery_bronze:1357487786394914847>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('mastery_desired_Silver').setLabel('Silver').setEmoji('<:mastery_silver:1357487832481923153>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mastery_desired_Gold').setLabel('Gold').setEmoji('<:mastery_gold:1357487865029722254>').setStyle(ButtonStyle.Success)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId.startsWith('mastery_desired_')) {
      const data = ephemeralFlowState.get(user.id);
      if (!data?.currentMastery) {
        return interaction.reply({ content: 'No current mastery set, please re-open.', ephemeral: true });
      }
      const base = customId.replace('mastery_desired_', '');
      ephemeralFlowState.set(user.id, { ...data, step: 'mastery_desired_sub', baseDesired: base });

      let style = ButtonStyle.Danger;
      let emoji = '<:mastery_bronze:1357487786394914847>';
      if (base === 'Silver') { style = ButtonStyle.Primary; emoji = '<:mastery_silver:1357487832481923153>'; }
      if (base === 'Gold') { style = ButtonStyle.Success; emoji = '<:mastery_gold:1357487865029722254>'; }

      const embed = new EmbedBuilder()
        .setDescription(`Please specify exactly which ${base} mastery you want.`)
        .setColor(EMBED_COLOR);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mastery_dsub_${base}1`).setLabel(`${base} 1`).setEmoji(emoji).setStyle(style),
        new ButtonBuilder().setCustomId(`mastery_dsub_${base}2`).setLabel(`${base} 2`).setEmoji(emoji).setStyle(style),
        new ButtonBuilder().setCustomId(`mastery_dsub_${base}3`).setLabel(`${base} 3`).setEmoji(emoji).setStyle(style)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId.startsWith('mastery_dsub_')) {
      // e.g. mastery_dsub_Bronze1
      const data = ephemeralFlowState.get(user.id);
      if (!data?.currentMastery) {
        return interaction.reply({ content: 'No current mastery set, please re-open.', ephemeral: true });
      }
      const finalPick = customId.replace('mastery_dsub_', '');
      const cost = calculateMasteryPrice(data.currentMastery, finalPick);
      if (cost === null) {
        return interaction.reply({ content: 'Invalid mastery range.', ephemeral: true });
      }
      ephemeralFlowState.set(user.id, {
        ...data,
        desiredMastery: finalPick,
        price: cost,
        step: 'mastery_price'
      });
      const embed = new EmbedBuilder()
        .setTitle('Your Price')
        .setDescription(`Your Price Will Be:\n\n\`€${cost}\``)
        .setColor(EMBED_COLOR);
      // final step => purchase / cancel
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mastery_purchase_final').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('mastery_cancel_final').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId === 'mastery_cancel_final' || customId === 'close_ticket' || customId === 'delete_ticket' || customId === 'reopen_ticket') {
      //All the ticket close/reopen/delete logic from the original code is included here.
      if (customId === 'mastery_cancel_final') {
        ephemeralFlowState.delete(user.id);
        return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
      }
      const { customId, channel, guild, user, member } = interaction;

      if (customId === 'close_ticket') {
        try {
          await channel.permissionOverwrites.set([
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: '1292933924116500532', allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
          ]);
          const closeEmbed = new EmbedBuilder().setTitle('Ticket Closed').setDescription(`This ticket has been closed by <@${user.id}>.`);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('delete_ticket').setLabel('Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('reopen_ticket').setLabel('Re-Open').setStyle(ButtonStyle.Success)
          );
          await channel.send({ embeds: [closeEmbed], components: [row] });
          // log
          const data = ticketDataMap.get(channel.id);
          const openerId = data?.openerId || user.id;
          await autoCloseLog(channel, openerId, channel.name, 'Manually closed');

          // 🗑 Remove from DB on manual close
          try {
            await db.query(
              `DELETE FROM tickets WHERE channel_id = $1`,
              [channel.id]
            );
          } catch (err) {
            console.error('❌ Failed to delete ticket row on manual close:', err);
          }

          return interaction.reply({ content: 'Ticket closed.', ephemeral: true });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: 'Failed to close the ticket.', ephemeral: true });
        }
      }

      if (customId === 'delete_ticket') {
        if (!hasAnyRole(member, STAFF_ROLES)) {
          return interaction.reply({ content: 'Only staff can delete tickets.', ephemeral: true });
        }
        await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
        await channel.delete().catch(console.error);
        ticketDataMap.delete(channel.id);
      }

      if (customId === 'reopen_ticket') {
        if (!hasAnyRole(member, STAFF_ROLES)) {
          return interaction.reply({ content: 'Only staff can re-open tickets.', ephemeral: true });
        }
        const data = ticketDataMap.get(channel.id);
        const openerId = data?.openerId;
        if (!openerId) {
          return interaction.reply({ content: 'Could not find who opened this ticket originally.', ephemeral: true });
        }
        try {
          await channel.permissionOverwrites.set([
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: openerId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            ...STAFF_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
          ]);
          await interaction.reply({ content: 'Ticket re-opened!', ephemeral: true });
          const reopenEmbed = new EmbedBuilder().setDescription('Ticket has been re-opened. Original user and staff can now see it again.');
          await channel.send({ embeds: [reopenEmbed] });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: 'Failed to re-open ticket.', ephemeral: true });
        }
      }
      return;
    }

    if (customId === 'mastery_purchase_final') {
      const data = ephemeralFlowState.get(user.id);
      if (!data?.currentMastery || !data?.desiredMastery) {
        return interaction.reply({ content: 'No data found, please retry.', ephemeral: true });
      }
      ephemeralFlowState.delete(user.id);
      const lines = [
        ['Which Brawler Do You Want Boosted?', data.brawlerName || 'Unknown'],
        ['Current Mastery?', data.currentMastery],
        ['Desired Mastery?', data.desiredMastery],
        ['Price', `€${data.price}`]
      ];
      return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.MASTERY, lines);
    }

  }

});

// If opener leaves => auto close
client.on('guildMemberRemove', async (member) => {
  const userId = member.id;
  for (const [channelId, data] of ticketDataMap.entries()) {
    if (data.openerId === userId) {
      const guild = member.guild;
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        await autoCloseLogAndDelete(channel, userId, data.channelName, 'User left the server.');
      }
      ticketDataMap.delete(channelId);
    }
  }
});

// 11) Log in
client.login(BOT_TOKEN).catch(err => {
  console.error('[Login Error]', err);
});
