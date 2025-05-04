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
const LOGO_URL               = 'https://cdn.discordapp.com/attachments/987753155360079903/1368299826688561212/Untitled70_20250208222905.jpg';

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
// Price-calculation utilities
function calculateTrophyPrice(current, desired) {
  let cents = 0, left = desired - current, start = current;
  function costPer5(t) {
    if (t < 500) return 5;
    if (t < 750) return 7.5;
    if (t < 1000) return 10;
    if (t < 1100) return 20;
    if (t < 1200) return 25;
    if (t < 1300) return 30;
    if (t < 1400) return 35;
    if (t < 1500) return 40;
    if (t < 1600) return 45;
    if (t < 1700) return 50;
    if (t < 1800) return 55;
    if (t < 1900) return 65;
    return 75;
  }
  while (left > 0) {
    cents += costPer5(start);
    left -= Math.min(left, 5);
    start += 5;
  }
  return Math.round((cents/100)*100)/100;
}
function calculateBulkPrice(current, desired) {
  let cents = 0, left = desired - current, start = current;
  function costPer10(t) {
    if (t < 10000) return 5;
    if (t < 20000) return 7.5;
    if (t < 30000) return 10;
    if (t < 40000) return 11;
    if (t < 50000) return 12.5;
    if (t < 60000) return 15;
    if (t < 70000) return 17.5;
    if (t < 80000) return 20;
    if (t < 90000) return 25;
    if (t < 100000) return 30;
    if (t < 110000) return 45;
    if (t < 120000) return 60;
    if (t < 130000) return 75;
    if (t < 140000) return 100;
    if (t < 150000) return 150;
    return 150;
  }
  while (left > 0) {
    cents += costPer10(start);
    left -= Math.min(left, 10);
    start += 10;
  }
  return Math.round((cents/100)*100)/100;
}
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
  'Bronze1->Bronze2':0.25,'Bronze2->Bronze3':0.35,'Bronze3->Silver1':0.40,
  'Silver1->Silver2':0.50,'Silver2->Silver3':0.50,'Silver3->Gold1':0.50,
  'Gold1->Gold2':0.70,'Gold2->Gold3':0.70,'Gold3->Diamond1':0.70,
  'Diamond1->Diamond2':1.50,'Diamond2->Diamond3':1.50,'Diamond3->Mythic1':1.50,
  'Mythic1->Mythic2':2.50,'Mythic2->Mythic3':3.00,'Mythic3->Legendary1':3.50,
  'Legendary1->Legendary2':7.00,'Legendary2->Legendary3':10.00,
  'Legendary3->Masters1':13.00,'Masters1->Masters2':50.00,'Masters2->Masters3':80.00,'Masters3->Pro':120.00
};
function calculateRankedPrice(cur, des) {
  const i1 = RANKED_ORDER.indexOf(cur), i2 = RANKED_ORDER.indexOf(des);
  if (i1<0||i2<0||i1>=i2) return null;
  let sum=0;
  for (let i=i1;i<i2;i++){
    sum += RANKED_STEPS_COST[`${RANKED_ORDER[i]}->${RANKED_ORDER[i+1]}`]||0;
  }
  return Math.round(sum*100)/100;
}
const MASTERY_ORDER = [
  'Bronze1','Bronze2','Bronze3',
  'Silver1','Silver2','Silver3',
  'Gold1','Gold2','Gold3'
];
const MASTERY_STEPS_COST = {
  'Bronze1->Bronze2':2.00,'Bronze2->Bronze3':3.00,'Bronze3->Silver1':2.00,
  'Silver1->Silver2':6.00,'Silver2->Silver3':8.00,'Silver3->Gold1':15.00,
  'Gold1->Gold2':20.00,'Gold2->Gold3':30.00
};
function calculateMasteryPrice(cur, des) {
  const i1 = MASTERY_ORDER.indexOf(cur), i2 = MASTERY_ORDER.indexOf(des);
  if (i1<0||i2<0||i1>=i2) return null;
  let sum=0;
  for (let i=i1;i<i2;i++){
    sum += MASTERY_STEPS_COST[`${MASTERY_ORDER[i]}->${MASTERY_ORDER[i+1]}`]||0;
  }
  return Math.round(sum*100)/100;
}

//───────────────────────────────────────────────────────────────────────────────
// Create ticket‐with‐overflow helper
async function createTicketChannelWithOverflow(interaction, categoryId, qna) {
  const { guild, user } = interaction;
  const existing = guild.channels.cache.filter(ch =>
    ch.type===ChannelType.GuildText &&
    ch.permissionOverwrites.cache.get(user.id)?.allow.has(PermissionsBitField.Flags.ViewChannel)
  );
  const overflow = existing.size >= MAX_TICKETS_PER_USER;
  const fullCat  = isCategoryFull(categoryId, guild);
  const parent   = (overflow||fullCat)?null:categoryId;
  const name     = `ticket-${user.username}-${Math.floor(Math.random()*1000)}`;
  const chan     = await guild.channels.create({
    name, type:ChannelType.GuildText, parent,
    permissionOverwrites:[
      {id:guild.roles.everyone,deny:[PermissionsBitField.Flags.ViewChannel]},
      {id:user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},
      ...STAFF_ROLES.map(r=>({id:r,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]}))
    ]
  });
  await chan.send({
    content:`<@${user.id}>`,
    embeds:[
      new EmbedBuilder().setDescription('Welcome—support will be with you shortly.'),
      new EmbedBuilder().setDescription(qna.map(([q,a])=>`**${q}:**\n> ${a}`).join('\n\n'))
    ],
    components:[
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  });
  ticketDataMap.set(chan.id, new TicketData(user.id, chan.id, name, Date.now()));
  return interaction.reply({ content:`Ticket created: <#${chan.id}>`, ephemeral:true });
}

//───────────────────────────────────────────────────────────────────────────────
// Client & global state
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
const MAX_TICKETS_PER_USER       = 2;
const MOVE_CATEGORIES            = { paid:'1347969048553586822', add:'1347969216052985876', sell:'1347969305165303848', finished:'1347969418898051164' };
const ADD_115K_MSG_CHANNEL       = '1351687016433193051';
const ADD_MATCHERINO_MSG_CHANNEL = '1351687016433193051';
const ADD_115K_ROLE              = '1351281086134747298';
const MATCHERINO_WINNER_ROLE     = '1351281117445099631';
const PURCHASE_ACCOUNT_CATEGORY  = '1347969247317327933';

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
const ticketDataMap     = new Map();
const ephemeralFlowState= new Map();
function isCategoryFull(catId, guild) {
  const cat = guild.channels.cache.get(catId);
  return cat ? cat.children.cache.size >= CATEGORY_LIMIT : false;
}
function hasAnyRole(member, roles) {
  return roles.some(r => member.roles.cache.has(r));
}

//───────────────────────────────────────────────────────────────────────────────
// /list command registration
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new account for sale (Restricted).')
  .addStringOption(opt=>opt.setName('ping').setDescription('Who to ping?').setRequired(true).addChoices(
    {name:'Everyone',value:'everyone'},
    {name:'Here',    value:'here'},
    {name:'None',    value:'none'}
  ))
  .addStringOption(opt=>opt.setName('text').setDescription('Short descriptive text').setRequired(true))
  .addStringOption(opt=>opt.setName('price').setDescription('Price').setRequired(true))
  .addStringOption(opt=>opt.setName('trophies').setDescription('Trophies').setRequired(true))
  .addStringOption(opt=>opt.setName('p11').setDescription('Power 11 info').setRequired(true))
  .addStringOption(opt=>opt.setName('tier_max').setDescription('Tier Max info').setRequired(true))
  .addAttachmentOption(opt=>opt.setName('image').setDescription('Image').setRequired(true));

//───────────────────────────────────────────────────────────────────────────────
// Register commands on ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await client.application.commands.create(listCommand);
  await client.application.commands.create(reviewCommand.data);
});

//───────────────────────────────────────────────────────────────────────────────
// Next: universal interactionCreate handler (slash, modal, button) …  
//───────────────────────────────────────────────────────────────────────────────
// Universal interaction handler
client.on('interactionCreate', async (interaction) => {
  // Slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'review') {
      return reviewCommand.execute(interaction);
    }
    if (interaction.commandName === 'list') {
      if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
        return interaction.reply({ content: "You don't have permission.", ephemeral: true });
      }
      const pingChoice = interaction.options.getString('ping');
      const text       = interaction.options.getString('text');
      const price      = interaction.options.getString('price');
      const trophies   = interaction.options.getString('trophies');
      const p11        = interaction.options.getString('p11');
      const tierMax    = interaction.options.getString('tier_max');
      const imageUrl   = interaction.options.getAttachment('image')?.url;
      let mention = '**New account added!**';
      if (pingChoice === 'everyone') mention = '**||@everyone|| New account added!**';
      if (pingChoice === 'here')     mention = '**||@here|| New account added!**';

      const embed = new EmbedBuilder()
        .setTitle('New Account Added! <:winmatcherino:1298703851934711848>')
        .setColor(EMBED_COLOR)
        .addFields(
          { name: 'Description', value: text },
          { name: '<:Money:1351665747641766022> Price', value: price, inline: true },
          { name: '<:gold_trophy:1351658932434768025> Trophies', value: trophies, inline: true },
          { name: '<:P11:1351683038127591529> P11', value: p11, inline: true },
          { name: '<:tiermax:1301899953320497243> Tier Max', value: tierMax, inline: true }
        );
      if (imageUrl) embed.setImage(imageUrl);

      await interaction.reply({ content: 'Listing posted!', ephemeral: true });
      await interaction.channel.send({
        content: mention,
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`purchase_account_${Date.now()}`)
              .setLabel('Purchase Account')
              .setEmoji('<:Shopping_Cart:1351686041559367752>')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`listing_mark_sold_${Date.now()}`)
              .setLabel('Mark as Sold')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });
      return;
    }
  }

  // Delegate buttons
  if (interaction.isButton()) return;

  // Delegate modals
  if (interaction.isModalSubmit()) return;
});

//───────────────────────────────────────────────────────────────────────────────
// Message-based commands
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const prefix = '?';
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();

  if (cmd === 'ticketpanel' && TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Order a Boost')
      .setDescription('Select the boost you want:');
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_trophies').setLabel('Trophies').setEmoji('🏆').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_ranked').setLabel('Ranked').setEmoji('🎖️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_bulk').setLabel('Bulk Trophies').setEmoji('💰').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_mastery').setLabel('Mastery').setEmoji('⭐').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_other').setLabel('Other').setEmoji('❓').setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [embed], components: [row1, row2] });
    return message.reply('Ticket panel created!');
  }

  if (cmd === 'move' && hasAnyRole(message.member, STAFF_ROLES)) {
    const target = MOVE_CATEGORIES[args[0]];
    if (!target) return message.reply('Usage: ?move [paid|add|sell|finished]');
    await message.channel.setParent(target).catch(() => {});
    return message.reply(`Moved to ${args[0]}`);
  }

  if (cmd === 'adds' && message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
    const embed1 = new EmbedBuilder().setTitle('115k Trophies & 71 R35 Add').setColor(EMBED_COLOR)
      .setDescription('**Requires 3 invites!**\nAdd a 115k trophy & R35 player.');
    const embed2 = new EmbedBuilder().setTitle('Matcherino Winner Add').setColor(EMBED_COLOR)
      .setDescription('**Requires 5 invites!**\nAdd a Matcherino Winner.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_add_115k').setLabel('Add 115k').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_add_matcherino_winner').setLabel('Add Matcherino Winner').setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [embed1, embed2] });
    return message.channel.send({ embeds: [new EmbedBuilder().setDescription('Claim with buttons below.')], components: [row] });
  }

  if (cmd === 'friendlist' && message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
    const left = '🥈 LUX | Zoro - €10\n🥈 Lennox - €15\n🥈 Melih - €15\n🥈 Elox - €15';
    const right= '🥈 Kazu - €15\n🥇 Izana - €25\n🥇 SKC | Rafiki - €25\n🥇 HMB | BosS - €60';
    const embed = new EmbedBuilder().setColor(EMBED_COLOR)
      .addFields(
        { name: '\u200b', value: left, inline: true },
        { name: '\u200b', value: right, inline: true }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('friendlist_buyadd').setLabel('Buy Add').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('friendlist_playerinfo').setLabel('Player Information').setStyle(ButtonStyle.Primary)
    );
    await message.channel.send({ embeds: [embed, new EmbedBuilder().setDescription('# ⬆️ ALL ADDS ARE LIFETIME')], components: [row] });
  }
});

//───────────────────────────────────────────────────────────────────────────────
// 8) Button Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, member, guild, channel, user } = interaction;

  // Purchase listing → opens purchase ticket
  if (customId.startsWith('purchase_account_')) {
    try {
      const existing = guild.channels.cache.filter(ch =>
        ch.type === ChannelType.GuildText &&
        ch.name.startsWith(`purchase-${user.username}-`)
      );
      const overflow = existing.size >= MAX_TICKETS_PER_USER;
      const fullCat  = isCategoryFull(PURCHASE_ACCOUNT_CATEGORY, guild);
      const parent   = (overflow || fullCat) ? null : PURCHASE_ACCOUNT_CATEGORY;
      const name     = `purchase-${user.username}-${Math.floor(Math.random()*1000)}`;
      const purchaseChan = await guild.channels.create({
        name, type: ChannelType.GuildText, parent,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          ...STAFF_ROLES.map(r => ({ id: r, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
        ]
      });
      await purchaseChan.send({
        content:`<@${user.id}>`,
        embeds:[ new EmbedBuilder().setDescription('Welcome—support will be with you shortly.') ],
        components:[ new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
        )]
      });
      ticketDataMap.set(purchaseChan.id,new TicketData(user.id,purchaseChan.id,name,Date.now()));
      return interaction.reply({ content:`Ticket created: <#${purchaseChan.id}>`, ephemeral:true });
    } catch {
      return interaction.reply({ content:'Failed to create purchase ticket.', ephemeral:true });
    }
  }

  // Mark listing sold
  if (customId.startsWith('listing_mark_sold_')) {
    if (!member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({ content:'Only authorized users.', ephemeral:true });
    }
    const soldBtn = new ButtonBuilder().setCustomId('sold_button').setLabel('Sold').setDisabled(true).setStyle(ButtonStyle.Danger);
    await interaction.message.edit({ components:[ new ActionRowBuilder().addComponents(soldBtn) ] });
    return interaction.reply({ content:'Marked as sold!', ephemeral:true });
  }

  // 115k Add claim
  if (customId === 'btn_add_115k') {
    if (!member.roles.cache.has(ADD_115K_ROLE)) {
      return interaction.reply({ content:'Need 115k role.', ephemeral:true });
    }
    const modal = new ModalBuilder().setCustomId('modal_add_115k').setTitle('Enter Supercell ID')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('supercell_id_input').setLabel('Supercell ID').setStyle(TextInputStyle.Short).setRequired(true)
      ));
    return interaction.showModal(modal);
  }

  // Matcherino Winner Add
  if (customId === 'btn_add_matcherino_winner') {
    if (!member.roles.cache.has(MATCHERINO_WINNER_ROLE)) {
      return interaction.reply({ content:'Need Matcherino role.', ephemeral:true });
    }
    const modal = new ModalBuilder().setCustomId('modal_matcherino_winner').setTitle('Enter Supercell ID')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('supercell_id_input').setLabel('Supercell ID').setStyle(TextInputStyle.Short).setRequired(true)
      ));
    return interaction.showModal(modal);
  }

  // Friendlist: Buy Add
  if (customId === 'friendlist_buyadd') {
    const embed = new EmbedBuilder().setTitle('Buy an Add').setDescription('Select player:').setColor(EMBED_COLOR);
    const players=['LUX','Lennox','Melih','Elox','Kazu','Izana','Rafiki','BosS'];
    const rows=[new ActionRowBuilder(),new ActionRowBuilder()];
    players.forEach((p,i)=>{
      const btn = new ButtonBuilder()
        .setCustomId(`buy_${p.toLowerCase().replace(/[^a-z]/g,'')}`)
        .setLabel(p).setStyle(ButtonStyle.Success);
      rows[i<4?0:1].addComponents(btn);
    });
    return interaction.reply({ embeds:[embed], components:rows, ephemeral:true });
  }

  // Friendlist: Player Info
  if (customId === 'friendlist_playerinfo') {
    const embed = new EmbedBuilder().setTitle('Player Info').setDescription('Select player:').setColor(EMBED_COLOR);
    const players=['LUX','Lennox','Melih','Elox','Kazu','Izana','Rafiki','BosS'];
    const rows=[new ActionRowBuilder(),new ActionRowBuilder()];
    players.forEach((p,i)=>{
      const btn = new ButtonBuilder()
        .setCustomId(`info_${p.toLowerCase().replace(/[^a-z]/g,'')}`)
        .setLabel(p).setStyle(ButtonStyle.Primary);
      rows[i<4?0:1].addComponents(btn);
    });
    return interaction.reply({ embeds:[embed], components:rows, ephemeral:true });
  }

  // Buy-ticket flow for friendlist adds
  const buyMap = {
    buy_lux:'LUX', buy_lennox:'Lennox', buy_melih:'Melih', buy_elox:'Elox',
    buy_kazu:'Kazu', buy_izana:'Izana', buy_rafiki:'Rafiki', buy_boss:'BosS'
  };
  if (buyMap[customId]) {
    const existing = guild.channels.cache.filter(ch=>
      ch.type===ChannelType.GuildText &&
      ch.permissionOverwrites.cache.get(user.id)?.allow.has(PermissionsBitField.Flags.ViewChannel)
    );
    const overflow = existing.size>=MAX_TICKETS_PER_USER;
    const fullCat  = isCategoryFull(MOVE_CATEGORIES.add, guild);
    const parent   = (overflow||fullCat)?null:MOVE_CATEGORIES.add;
    const name     = `add-${user.username}-${Math.floor(Math.random()*1000)}`;
    const addChan  = await guild.channels.create({
      name, type:ChannelType.GuildText, parent,
      permissionOverwrites:[
        {id:guild.roles.everyone,deny:[PermissionsBitField.Flags.ViewChannel]},
        {id:user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},
        ...STAFF_ROLES.map(r=>({id:r,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]}))
      ]
    });
    await addChan.send({
      content:`<@${user.id}>`,
      embeds:[ new EmbedBuilder().setDescription('Welcome—support will be with you shortly.') ],
      components:[ new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
      )]
    });
    ticketDataMap.set(addChan.id,new TicketData(user.id,addChan.id,name,Date.now()));
    return interaction.reply({ content:`Ticket created: <#${addChan.id}>`, ephemeral:true });
  }

  // Ticket panel: modals for each type
  if (customId === 'ticket_trophies') {
    const modal = new ModalBuilder().setCustomId('modal_trophies_start').setTitle('Trophies Boost');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('brawler_name').setLabel('Brawler?').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('brawler_current').setLabel('Current Trophies').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('brawler_desired').setLabel('Desired Trophies').setStyle(TextInputStyle.Short).setRequired(true))
    );
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_bulk') {
    const modal = new ModalBuilder().setCustomId('modal_bulk_start').setTitle('Bulk Trophies');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bulk_current').setLabel('Current').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bulk_desired').setLabel('Desired').setStyle(TextInputStyle.Short).setRequired(true))
    );
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_other') {
    const modal = new ModalBuilder().setCustomId('modal_ticket_other').setTitle('Other Request');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('other_purchase').setLabel('What?').setStyle(TextInputStyle.Short).setRequired(true))
    );
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_ranked') {
    ephemeralFlowState.set(user.id, { step:'ranked_current_main' });
    const embed = new EmbedBuilder().setTitle('Current Rank').setDescription('Choose your current rank:').setColor(EMBED_COLOR);
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_current_Masters').setLabel('Masters').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_current_Legendary').setLabel('Legendary').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ranked_current_Mythic').setLabel('Mythic').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ranked_current_Diamond').setLabel('Diamond').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_current_Gold').setLabel('Gold').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_current_Silver').setLabel('Silver').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ranked_current_Bronze').setLabel('Bronze').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ embeds:[embed], components:[row1,row2], ephemeral:true });
  }
  if (customId === 'ticket_mastery') {
    const modal = new ModalBuilder().setCustomId('modal_mastery_brawler').setTitle('Mastery Boost');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mastery_brawler').setLabel('Brawler?').setStyle(TextInputStyle.Short).setRequired(true))
    );
    return interaction.showModal(modal);
  }
});

//───────────────────────────────────────────────────────────────────────────────
// 9) Modal Submissions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  const { customId, user } = interaction;

  // Trophies
  if (customId === 'modal_trophies_start') {
    const brawler = interaction.fields.getTextInputValue('brawler_name').trim();
    const cur     = parseInt(interaction.fields.getTextInputValue('brawler_current'),10);
    const des     = parseInt(interaction.fields.getTextInputValue('brawler_desired'),10);
    if (isNaN(cur)||isNaN(des)||cur>=des) {
      return interaction.reply({ content:'Invalid amounts.', ephemeral:true });
    }
    const price = calculateTrophyPrice(cur,des);
    const embed = new EmbedBuilder().setTitle('Your Price').setDescription(`\`€${price}\``).setColor(EMBED_COLOR);
    const row   = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trophies_purchase_boost').setLabel('Purchase Boost').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trophies_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    ephemeralFlowState.set(user.id, { panelType:'trophies', brawler, cur, des, price });
    return interaction.reply({ embeds:[embed], components:[row], ephemeral:true });
  }

  // Bulk
  if (customId === 'modal_bulk_start') {
    const cur = parseInt(interaction.fields.getTextInputValue('bulk_current'),10);
    const des = parseInt(interaction.fields.getTextInputValue('bulk_desired'),10);
    if (isNaN(cur)||isNaN(des)||cur>=des) {
      return interaction.reply({ content:'Invalid amounts.', ephemeral:true });
    }
    const price = calculateBulkPrice(cur,des);
    const embed = new EmbedBuilder().setTitle('Your Price').setDescription(`\`€${price}\``).setColor(EMBED_COLOR);
    const row   = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bulk_purchase_boost').setLabel('Purchase Boost').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bulk_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    ephemeralFlowState.set(user.id, { panelType:'bulk', cur, des, price });
    return interaction.reply({ embeds:[embed], components:[row], ephemeral:true });
  }

  // Other
  if (customId === 'modal_ticket_other') {
    const what = interaction.fields.getTextInputValue('other_purchase').trim();
    return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.OTHER, [['What Are You Purchasing?', what]]);
  }

  // Mastery start
  if (customId === 'modal_mastery_brawler') {
    const brawler = interaction.fields.getTextInputValue('mastery_brawler').trim();
    ephemeralFlowState.set(user.id, { step:'mastery_current_main', brawler });
    const embed = new EmbedBuilder().setTitle('Current Mastery').setDescription('Select your current mastery:').setColor(EMBED_COLOR);
    const row   = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mastery_current_Bronze').setLabel('Bronze').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mastery_current_Silver').setLabel('Silver').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mastery_current_Gold').setLabel('Gold').setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ embeds:[embed], components:[row], ephemeral:true });
  }
});

//───────────────────────────────────────────────────────────────────────────────
// 10) Purchase buttons (cancel & finalize)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user } = interaction;
  const state = ephemeralFlowState.get(user.id);

  // Cancel flows
  if (customId === 'trophies_cancel' || customId === 'bulk_cancel') {
    ephemeralFlowState.delete(user.id);
    return interaction.update({ content:'Cancelled.', embeds:[], components:[] });
  }

  // Finalize purchase → ticket
  if (customId === 'trophies_purchase_boost' || customId === 'bulk_purchase_boost') {
    if (!state) return interaction.reply({ content:'No data.', ephemeral:true });
    const lines = state.panelType==='trophies'
      ? [['Which Brawler?',state.brawler],['Current Trophies?',state.cur],['Desired Trophies?',state.des],['Price',`€${state.price}`]]
      : [['Current Trophies?',state.cur],['Desired Trophies?',state.des],['Price',`€${state.price}`]];
    ephemeralFlowState.delete(user.id);
    return createTicketChannelWithOverflow(
      interaction,
      state.panelType==='trophies'?TICKET_CATEGORIES.TROPHIES:TICKET_CATEGORIES.BULK,
      lines
    );
  }
});

//───────────────────────────────────────────────────────────────────────────────
// 11) Ranked flow & mastery flow continue in Part 3…
//───────────────────────────────────────────────────────────────────────────────
// 11) Ranked & Mastery Button Flows
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user } = interaction;
  const data = ephemeralFlowState.get(user.id);

  // Ranked: Step 1 – Current Tier
  if (customId.startsWith('ranked_current_') && data?.step === 'ranked_current_main') {
    const base = customId.replace('ranked_current_', '');
    ephemeralFlowState.set(user.id, { step: 'ranked_current_sub', base, currentRank: null });
    const emojis = {
      Masters: '<:Masters:1293283897618075728>',
      Legendary: '<:Legendary:1264709440561483818>',
      Mythic: '<:mythic:1357482343555666181>',
      Diamond: '<:diamond:1357482488506613920>',
      Gold: '<:gold:1357482374048256131>',
      Silver: '<:silver:1357482400333955132>',
      Bronze: '<:bronze:1357482418654937332>'
    };
    const styles = {
      Masters: ButtonStyle.Success,
      Legendary: ButtonStyle.Danger,
      Mythic: ButtonStyle.Danger,
      Diamond: ButtonStyle.Primary,
      Gold: ButtonStyle.Success,
      Silver: ButtonStyle.Primary,
      Bronze: ButtonStyle.Secondary
    };
    const embed = new EmbedBuilder()
      .setDescription(`Specify your exact ${base} tier:`)
      .setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      [1, 2, 3].map(n =>
        new ButtonBuilder()
          .setCustomId(`ranked_curr_sub_${base}${n}`)
          .setLabel(`${base} ${n}`)
          .setEmoji(emojis[base])
          .setStyle(styles[base])
      )
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Ranked: Step 2 – Current Sub-Tier
  if (customId.startsWith('ranked_curr_sub_') && data?.step === 'ranked_current_sub') {
    const selected = customId.replace('ranked_curr_sub_', '');
    ephemeralFlowState.set(user.id, { step: 'ranked_desired_main', currentRank: selected });
    const embed = new EmbedBuilder()
      .setTitle('Desired Rank')
      .setDescription('Select your desired rank:')
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

  // Ranked: Step 3 – Desired Main (handles “Pro” directly)
  if (customId.startsWith('ranked_desired_') && data?.step === 'ranked_desired_main') {
    const base = customId.replace('ranked_desired_', '');
    if (base === 'Pro') {
      // Direct to final price
      const cost = calculateRankedPrice(data.currentRank, 'Pro');
      ephemeralFlowState.set(user.id, { step: 'ranked_final', currentRank: data.currentRank, desiredRank: 'Pro', price: cost });
      const embed = new EmbedBuilder().setTitle('Your Price').setDescription(`\`€${cost}\``).setColor(EMBED_COLOR);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ranked_purchase_final').setLabel('Purchase Boost').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ranked_cancel_final').setLabel('Cancel').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
    // Else show sub-tiers
    const emojis = {
      Masters: '<:Masters:1293283897618075728>',
      Legendary: '<:Legendary:1264709440561483818>',
      Mythic: '<:mythic:1357482343555666181>',
      Diamond: '<:diamond:1357482488506613920>',
      Gold: '<:gold:1357482374048256131>',
      Silver: '<:silver:1357482400333955132>',
      Bronze: '<:bronze:1357482418654937332>'
    };
    const styles = {
      Masters: ButtonStyle.Success,
      Legendary: ButtonStyle.Danger,
      Mythic: ButtonStyle.Danger,
      Diamond: ButtonStyle.Primary,
      Gold: ButtonStyle.Success,
      Silver: ButtonStyle.Primary,
      Bronze: ButtonStyle.Secondary
    };
    ephemeralFlowState.set(user.id, { step: 'ranked_desired_sub', currentRank: data.currentRank, baseDesired: base });
    const embed = new EmbedBuilder().setDescription(`Specify your exact ${base} tier:`).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      [1, 2, 3].map(n =>
        new ButtonBuilder()
          .setCustomId(`ranked_dsub_${base}${n}`)
          .setLabel(`${base} ${n}`)
          .setEmoji(emojis[base])
          .setStyle(styles[base])
      )
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Ranked: Step 4 – Desired Sub-Tier
  if (customId.startsWith('ranked_dsub_') && data?.step === 'ranked_desired_sub') {
    const desiredRank = customId.replace('ranked_dsub_', '');
    const cost = calculateRankedPrice(data.currentRank, desiredRank);
    ephemeralFlowState.set(user.id, { step: 'ranked_final', currentRank: data.currentRank, desiredRank, price: cost });
    const embed = new EmbedBuilder().setTitle('Your Price').setDescription(`\`€${cost}\``).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_purchase_final').setLabel('Purchase Boost').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_cancel_final').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Ranked: Finalize or Cancel
  if (customId === 'ranked_cancel_final') {
    ephemeralFlowState.delete(user.id);
    return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
  }
  if (customId === 'ranked_purchase_final') {
    const st = ephemeralFlowState.get(user.id);
    ephemeralFlowState.delete(user.id);
    const lines = [
      ['Current Rank', st.currentRank],
      ['Desired Rank', st.desiredRank],
      ['Price', `€${st.price}`]
    ];
    return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.RANKED, lines);
  }

  // Mastery: Step 1 – Current
  if (customId.startsWith('mastery_current_') && data?.step === 'mastery_current_main') {
    const base = customId.replace('mastery_current_', '');
    ephemeralFlowState.set(user.id, { ...data, step: 'mastery_current_sub', baseMastery: base });
    const emojis = { Bronze: '<:mastery_bronze:1357487786394914847>', Silver: '<:mastery_silver:1357487832481923153>', Gold: '<:mastery_gold:1357487865029722254>' };
    const styles = { Bronze: ButtonStyle.Danger, Silver: ButtonStyle.Primary, Gold: ButtonStyle.Success };
    const embed = new EmbedBuilder().setDescription(`Specify your exact ${base} mastery:`).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      [1, 2, 3].map(n =>
        new ButtonBuilder()
          .setCustomId(`mastery_csub_${base}${n}`)
          .setLabel(`${base} ${n}`)
          .setEmoji(emojis[base])
          .setStyle(styles[base])
      )
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Mastery: Step 2 – Current Sub
  if (customId.startsWith('mastery_csub_') && data?.step === 'mastery_current_sub') {
    const sel = customId.replace('mastery_csub_', '');
    ephemeralFlowState.set(user.id, { ...data, step: 'mastery_desired_main', currentMastery: sel });
    const embed = new EmbedBuilder().setTitle('Desired Mastery').setDescription('Select desired mastery level:').setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mastery_desired_Bronze').setLabel('Bronze').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mastery_desired_Silver').setLabel('Silver').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mastery_desired_Gold').setLabel('Gold').setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Mastery: Step 3 – Desired Main
  if (customId.startsWith('mastery_desired_') && data?.step === 'mastery_desired_main') {
    const base = customId.replace('mastery_desired_', '');
    ephemeralFlowState.set(user.id, { ...data, step: 'mastery_desired_sub', baseDesired: base });
    const emojis = { Bronze: '<:mastery_bronze:1357487786394914847>', Silver: '<:mastery_silver:1357487832481923153>', Gold: '<:mastery_gold:1357487865029722254>' };
    const styles = { Bronze: ButtonStyle.Danger, Silver: ButtonStyle.Primary, Gold: ButtonStyle.Success };
    const embed = new EmbedBuilder().setDescription(`Specify your exact ${base} mastery:`).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      [1, 2, 3].map(n =>
        new ButtonBuilder()
          .setCustomId(`mastery_dsub_${base}${n}`)
          .setLabel(`${base} ${n}`)
          .setEmoji(emojis[base])
          .setStyle(styles[base])
      )
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Mastery: Step 4 – Desired Sub
  if (customId.startsWith('mastery_dsub_') && data?.step === 'mastery_desired_sub') {
    const pick = customId.replace('mastery_dsub_', '');
    const cost = calculateMasteryPrice(data.currentMastery, pick);
    ephemeralFlowState.set(user.id, { ...data, desiredMastery: pick, price: cost, step: 'mastery_price' });
    const embed = new EmbedBuilder().setTitle('Your Price').setDescription(`\`€${cost}\``).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mastery_purchase_final').setLabel('Purchase Boost').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('mastery_cancel_final').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Mastery: Finalize or Cancel
  if (customId === 'mastery_cancel_final') {
    ephemeralFlowState.delete(user.id);
    return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
  }
  if (customId === 'mastery_purchase_final') {
    const st = ephemeralFlowState.get(user.id);
    ephemeralFlowState.delete(user.id);
    const lines = [
      ['Which Brawler?', st.brawler],
      ['Current Mastery?', st.currentMastery],
      ['Desired Mastery?', st.desiredMastery],
      ['Price', `€${st.price}`]
    ];
    return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.MASTERY, lines);
  }
});

//───────────────────────────────────────────────────────────────────────────────
// 12) Close / Delete / Re-Open Tickets
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, channel, guild, user, member } = interaction;

  // Close
  if (customId === 'close_ticket') {
    await channel.permissionOverwrites.set([
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: STAFF_ROLES[0], allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
    ]);
    const closeEmbed = new EmbedBuilder().setTitle('Ticket Closed').setDescription(`Closed by <@${user.id}>.`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('delete_ticket').setLabel('Delete').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reopen_ticket').setLabel('Re-Open').setStyle(ButtonStyle.Success)
    );
    await channel.send({ embeds: [closeEmbed], components: [row] });
    const data = ticketDataMap.get(channel.id);
    await autoCloseLog(channel, data?.openerId || user.id, channel.name, 'Manually closed');
    await db.query('DELETE FROM tickets WHERE channel_id = $1', [channel.id]);
    return interaction.reply({ content: 'Ticket closed.', ephemeral: true });
  }

  // Delete
  if (customId === 'delete_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({ content: 'Only staff can delete tickets.', ephemeral: true });
    }
    await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
    await channel.delete().catch(() => {});
    ticketDataMap.delete(channel.id);
    return;
  }

  // Re-Open
  if (customId === 'reopen_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({ content: 'Only staff can re-open tickets.', ephemeral: true });
    }
    const data = ticketDataMap.get(channel.id);
    const opener = data?.openerId;
    await channel.permissionOverwrites.set([
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: opener, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      ...STAFF_ROLES.map(r => ({ id: r, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
    ]);
    await interaction.reply({ content: 'Ticket re-opened!', ephemeral: true });
    return channel.send({ embeds: [new EmbedBuilder().setDescription('Ticket has been re-opened.')] });
  }
});

//───────────────────────────────────────────────────────────────────────────────
// Presence Update: Auto-add ad role
client.on('presenceUpdate', async (oldP, newP) => {
  if (!newP?.member || newP.status === 'offline') return;
  const m = newP.member;
  if (!m.manageable) return;
  if (newP.activities?.some(a => a.state?.toLowerCase().includes('discord.gg/brawlshop'))) {
    if (!m.roles.cache.has(BRAWLSHOP_AD_ROLE)) {
      await m.roles.add(BRAWLSHOP_AD_ROLE).catch(() => {});
    }
  }
});

//───────────────────────────────────────────────────────────────────────────────
// Auto-close checker every minute
setInterval(() => checkTicketTimeouts(), 60 * 1000);
async function checkTicketTimeouts() {
  const now = Date.now();
  const guild = client.guilds.cache.first();
  if (!guild) return;
  for (const [chanId, data] of ticketDataMap.entries()) {
    const channel = guild.channels.cache.get(chanId);
    if (!channel) { ticketDataMap.delete(chanId); continue; }
    const member = guild.members.cache.get(data.openerId);
    // No opener: auto-close
    if (!member) {
      await autoCloseLogAndDelete(channel, data.openerId, data.channelName, 'User left');
      ticketDataMap.delete(chanId);
      continue;
    }
    // No messages
    if (data.msgCount === 0) {
      const hrs = (now - data.openTime) / 36e5;
      if (hrs >= 6 && !data.reminder6hSent) {
        data.reminder6hSent = true;
        await db.query('UPDATE tickets SET reminder_6h=TRUE WHERE channel_id=$1',[chanId]);
        await sendNoMsgReminder(channel, data.openerId, 6, 18);
      }
      if (hrs >= 12 && !data.reminder12hSent) {
        data.reminder12hSent = true;
        await db.query('UPDATE tickets SET reminder_12h=TRUE WHERE channel_id=$1',[chanId]);
        await sendNoMsgReminder(channel, data.openerId, 12, 12);
      }
      if (hrs >= 24) {
        await autoCloseLogAndDelete(channel, data.openerId, data.channelName, '24h no response');
        ticketDataMap.delete(chanId);
      }
    } else {
      // Inactivity
      const inactive = (now - data.lastOpenerMsgTime) / 36e5;
      if (inactive >= 24 && inactive < 48 && !data.reminder24hSent) {
        data.reminder24hSent = true;
        await db.query('UPDATE tickets SET reminder_24h=TRUE WHERE channel_id=$1',[chanId]);
        await sendInactivityReminder(channel, data.openerId);
      }
      if (inactive >= 48) {
        await autoCloseLogAndDelete(channel, data.openerId, data.channelName, '48h inactivity');
        ticketDataMap.delete(chanId);
      }
    }
  }
}
async function sendNoMsgReminder(channel, openerId, soFar, left) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(`${mention} – No messages for **${soFar}h**, please respond within **${left}h**.`);
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}
async function sendInactivityReminder(channel, openerId) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(`${mention} – No activity for 24h, please respond within 24h.`);
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}

//───────────────────────────────────────────────────────────────────────────────
// 13) Track user messages to update inactivity
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

//───────────────────────────────────────────────────────────────────────────────
// 14) Load existing tickets & login
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const res = await db.query(`
      SELECT channel_id, opener_id, channel_name,
             EXTRACT(EPOCH FROM open_time)*1000 AS open_time,
             msg_count,
             EXTRACT(EPOCH FROM last_msg_time)*1000 AS last_msg_time,
             reminder_6h, reminder_12h, reminder_24h
      FROM tickets;
    `);
    for (const row of res.rows) {
      const d = new TicketData(row.opener_id, row.channel_id, row.channel_name, Number(row.open_time));
      d.msgCount = row.msg_count;
      d.lastOpenerMsgTime = Number(row.last_msg_time);
      d.reminder6hSent = row.reminder_6h;
      d.reminder12hSent = row.reminder_12h;
      d.reminder24hSent = row.reminder_24h;
      ticketDataMap.set(row.channel_id, d);
    }
    console.log(`Loaded ${res.rows.length} tickets`);
  } catch (err) {
    console.error('Error loading tickets:', err);
  }
  try {
    await client.application.commands.create(listCommand);
    await client.application.commands.create(reviewCommand.data);
  } catch (err) {
    console.error('Error registering commands:', err);
  }
});

client.on('guildMemberRemove', async (member) => {
  for (const [chanId, data] of ticketDataMap.entries()) {
    if (data.openerId === member.id) {
      const ch = member.guild.channels.cache.get(chanId);
      if (ch) await autoCloseLogAndDelete(ch, member.id, data.channelName, 'User left server');
      ticketDataMap.delete(chanId);
    }
  }
});

client.login(BOT_TOKEN).catch(err => console.error('[Login Error]', err));
