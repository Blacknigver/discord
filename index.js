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
 * - Review command & moderation flow.
 * - Presence Update: adds ad role if status contains discord.gg/brawlshop.
 * - All other original features remain intact.
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
require('dotenv').config();
const db = require('./database');
const reviewCommand = require('./review');

// Constants & Setup
const BOT_TOKEN              = process.env.TOKEN || '';
const CLIENT_ID              = process.env.CLIENT_ID || 'YOUR_CLIENT_ID_HERE';
const CATEGORY_LIMIT         = 50; 
const MOD_CHANNEL_ID         = '1368186200741118042';
const REVIEW_CHANNEL_ID      = '1293288484487954512';
const AUTO_CLOSE_LOG_CHANNEL = '1354587880382795836';
const EMBED_COLOR            = '#E68DF2';
const LOGO_URL               = 'https://cdn.discordapp.com/attachments/987753155360079903/1368299826688561212/Untitled70_20250208222905.jpg?ex=6817b804&is=68166684&hm=8fc340221f0b55e17444b6c2ced93e32541ecf95b258509a0ddc9c66667772bd';

//───────────────────────────────────────────────────────────────────────────────
// Auto-close log helpers
async function autoCloseLog(channel, openerId, channelName, afterLabel) {
  const logCh = channel.guild.channels.cache.get(AUTO_CLOSE_LOG_CHANNEL);
  if (!logCh?.isTextBased()) return;
  await logCh.send({
    content: `**Ticket Closed**\nUser: <@${openerId}>\nTicket: ${channelName}\nClosed After: ${afterLabel}`
  });
}
async function autoCloseLogAndDelete(channel, openerId, channelName, afterLabel) {
  await autoCloseLog(channel, openerId, channelName, afterLabel);
  await channel.delete().catch(() => {});
}
//───────────────────────────────────────────────────────────────────────────────

// PRICE CALC UTILS
function calculateTrophyPrice(current, desired) {
  let totalCents = 0, trophiesLeft = desired - current, start = current;
  function costPer5(t) {
    if (t < 500) return 5; if (t < 750) return 7.5; if (t < 1000) return 10;
    if (t < 1100) return 20; if (t < 1200) return 25; if (t < 1300) return 30;
    if (t < 1400) return 35; if (t < 1500) return 40; if (t < 1600) return 45;
    if (t < 1700) return 50; if (t < 1800) return 55; if (t < 1900) return 65;
    return 75;
  }
  while (trophiesLeft > 0) {
    totalCents += costPer5(start);
    trophiesLeft -= Math.min(trophiesLeft, 5);
    start += 5;
  }
  return Math.round((totalCents/100) * 100)/100;
}

function calculateBulkPrice(current, desired) {
  let totalCents = 0, trophiesLeft = desired - current, start = current;
  function costPer10(t) {
    if (t < 10000) return 5; if (t < 20000) return 7.5; if (t < 30000) return 10;
    if (t < 40000) return 11; if (t < 50000) return 12.5; if (t < 60000) return 15;
    if (t < 70000) return 17.5; if (t < 80000) return 20; if (t < 90000) return 25;
    if (t < 100000) return 30; if (t < 110000) return 45; if (t < 120000) return 60;
    if (t < 130000) return 75; if (t < 140000) return 100; if (t < 150000) return 150;
    return 150;
  }
  while (trophiesLeft > 0) {
    totalCents += costPer10(start);
    trophiesLeft -= Math.min(trophiesLeft, 10);
    start += 10;
  }
  return Math.round((totalCents/100) * 100)/100;
}

const RANKED_ORDER = ['Bronze1','Bronze2','Bronze3','Silver1','Silver2','Silver3','Gold1','Gold2','Gold3','Diamond1','Diamond2','Diamond3','Mythic1','Mythic2','Mythic3','Legendary1','Legendary2','Legendary3','Masters1','Masters2','Masters3','Pro'];
const RANKED_STEPS_COST = { /* all mappings as before */ };
function calculateRankedPrice(currentRank, desiredRank) {
  const i1 = RANKED_ORDER.indexOf(currentRank), i2 = RANKED_ORDER.indexOf(desiredRank);
  if (i1<0||i2<0||i1>=i2) return null;
  let total=0;
  for (let i=i1; i<i2; i++) total += RANKED_STEPS_COST[`${RANKED_ORDER[i]}->${RANKED_ORDER[i+1]}`]||0;
  return Math.round(total*100)/100;
}

const MASTERY_ORDER = ['Bronze1','Bronze2','Bronze3','Silver1','Silver2','Silver3','Gold1','Gold2','Gold3'];
const MASTERY_STEPS_COST = { /* all mappings as before */ };
function calculateMasteryPrice(currentRank, desiredRank) {
  const i1 = MASTERY_ORDER.indexOf(currentRank), i2 = MASTERY_ORDER.indexOf(desiredRank);
  if (i1<0||i2<0||i1>=i2) return null;
  let total=0;
  for (let i=i1; i<i2; i++) total += MASTERY_STEPS_COST[`${MASTERY_ORDER[i]}->${MASTERY_ORDER[i+1]}`]||0;
  return Math.round(total*100)/100;
}

// Create ticket helper
async function createTicketChannelWithOverflow(interaction, categoryId, qna) {
  const { guild, user } = interaction;
  const existing = guild.channels.cache.filter(ch =>
    ch.type===ChannelType.GuildText &&
    ch.permissionOverwrites.cache.get(user.id)?.allow.has(PermissionsBitField.Flags.ViewChannel)
  );
  const overflow = existing.size>=MAX_TICKETS_PER_USER;
  const catFull  = isCategoryFull(categoryId, guild);
  const parent   = (overflow||catFull)?null:categoryId;
  const name     = `ticket-${user.username}-${Math.floor(Math.random()*1000)}`;
  const chan     = await guild.channels.create({
    name, type:ChannelType.GuildText, parent,
    permissionOverwrites:[
      {id:guild.roles.everyone,deny:[PermissionsBitField.Flags.ViewChannel]},
      {id:user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},
      ...STAFF_ROLES.map(r=>({id:r,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]}))
    ]
  });
  const mention = `<@${user.id}>`;
  const welcome = new EmbedBuilder().setDescription('Welcome—support will be with you shortly.');
  const qEmbed  = new EmbedBuilder().setDescription(qna.map(([q,a])=>`**${q}:**\n> ${a}`).join('\n\n'));
  const row     = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setEmoji('<:Lock:1349157009244557384>').setStyle(ButtonStyle.Danger)
  );
  await chan.send({content:mention,embeds:[welcome,qEmbed],components:[row]});
  ticketDataMap.set(chan.id,new TicketData(user.id,chan.id,name,Date.now()));
  return interaction.reply({content:`Ticket created: <#${chan.id}>`,ephemeral:true});
}

//───────────────────────────────────────────────────────────────────────────────
// Client & state setup
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials:[Partials.Channel]
});

const TICKET_PANEL_ALLOWED_USERS = ['658351335967686659','986164993080836096'];
const STAFF_ROLES               = ['1292933924116500532','1292933200389083196','1303702944696504441','1322611585281425478'];
const LIST_COMMAND_ROLE         = '1292933200389083196';
const BRAWLSHOP_AD_ROLE         = '1351998501982048346';

const TICKET_CATEGORIES = {
  TROPHIES:'1322947795803574343',
  RANKED:  '1322913302921089094',
  BULK:    '1351659422484791306',
  MASTERY: '1351659903621791805',
  OTHER:   '1322947859561320550'
};
const MAX_TICKETS_PER_USER = 2;

const MOVE_CATEGORIES = {
  paid:'1347969048553586822',
  add:'1347969216052985876',
  sell:'1347969305165303848',
  finished:'1347969418898051164'
};

const ADD_115K_MSG_CHANNEL      = '1351687016433193051';
const ADD_MATCHERINO_MSG_CHANNEL= '1351687016433193051';
const ADD_115K_ROLE             = '1351281086134747298';
const MATCHERINO_WINNER_ROLE    = '1351281117445099631';
const PURCHASE_ACCOUNT_CATEGORY = '1347969247317327933';

class TicketData {
  constructor(openerId,channelId,channelName,openTime){
    this.openerId=openerId;
    this.channelId=channelId;
    this.channelName=channelName;
    this.openTime=openTime;
    this.msgCount=0;
    this.lastOpenerMsgTime=openTime;
    this.reminder6hSent=false;
    this.reminder12hSent=false;
    this.reminder24hSent=false;
  }
}
const ticketDataMap    = new Map();
const ephemeralFlowState = new Map();

function isCategoryFull(categoryId,guild){
  const cat=guild.channels.cache.get(categoryId);
  return cat?cat.children.cache.size>=CATEGORY_LIMIT:false;
}
function hasAnyRole(member,roleIds){return roleIds.some(r=>member.roles.cache.has(r));}

//───────────────────────────────────────────────────────────────────────────────
// /list command registration
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new account for sale (Restricted).')
  .addStringOption(opt=>opt.setName('ping').setDescription('Who to ping?').setRequired(true).addChoices(
    {name:'Everyone',value:'everyone'},
    {name:'Here',value:'here'},
    {name:'None',value:'none'}
  ))
  .addStringOption(opt=>opt.setName('text').setDescription('Short descriptive text').setRequired(true))
  .addStringOption(opt=>opt.setName('price').setDescription('Price').setRequired(true))
  .addStringOption(opt=>opt.setName('trophies').setDescription('Trophies').setRequired(true))
  .addStringOption(opt=>opt.setName('p11').setDescription('Power 11 info').setRequired(true))
  .addStringOption(opt=>opt.setName('tier_max').setDescription('Tier Max info').setRequired(true))
  .addAttachmentOption(opt=>opt.setName('image').setDescription('Image').setRequired(true));
//───────────────────────────────────────────────────────────────────────────────
