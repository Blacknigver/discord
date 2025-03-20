/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Discord.js v14
 * Uses process.env.TOKEN for the bot token
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
  PermissionsBitField,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

////////////////////////////////////////////////////////////////////////////////
// 1) BOT TOKEN & CLIENT_ID
////////////////////////////////////////////////////////////////////////////////

const BOT_TOKEN = process.env.TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID_HERE';

////////////////////////////////////////////////////////////////////////////////
// 2) CREATE CLIENT
////////////////////////////////////////////////////////////////////////////////

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

/************************************************************
 3) CONFIG CONSTANTS
************************************************************/
// IDs for ?ticketpanel
const TICKET_PANEL_ALLOWED_USERS = ['658351335967686659', '986164993080836096'];

// Staff roles
const STAFF_ROLES = [
  '1292933924116500532',
  '1292933200389083196',
  '1303702944696504441',
  '1322611585281425478'
];

// Ticket categories
const TICKET_CATEGORIES = {
  TROPHIES: '1322947795803574343',
  RANKED: '1322913302921089094',
  BULK: '1351659422484791306',
  MASTERY: '1351659903621791805',
  OTHER: '1322947859561320550'
};
const MAX_TICKETS_PER_USER = 2;

// ?move categories
const MOVE_CATEGORIES = {
  paid: '1347969048553586822',
  add: '1347969216052985876',
  sell: '1347969305165303848',
  finished: '1347969418898051164'
};

// /list restricted role
const LIST_COMMAND_ROLE = '1292933200389083196';

// Category for "Purchase Account"
const PURCHASE_ACCOUNT_CATEGORY = '1347969247317327933';

// For ?adds
const MATCHERINO_SWAP_CATEGORY = '1351687962907246753';
const ADD_115K_MSG_CHANNEL = '1351687016433193051';
const ADD_MATCHERINO_MSG_CHANNEL = '1351687016433193051';

// Roles for "Add 115k"
const ADD_115K_ROLES = [
  '1351281086134747298',
  '1351687292200423484'
];

// Roles for "Add Matcherino Winner"
const MATCHERINO_WINNER_ROLE_1A = '1351281117445099631';
const MATCHERINO_WINNER_ROLE_1B = '1351281086134747298';
const MATCHERINO_WINNER_ROLE_2A = '1351687292200423484';
const MATCHERINO_WINNER_ROLE_2B = '1351281117445099631';

// Role for presence check
const BRAWLSHOP_AD_ROLE = '1351998501982048346';

// We'll store who opened each ticket so we can re-open
const ticketOpeners = new Map();

// Color for certain embeds
const EMBED_COLOR = '#E68DF2';

/************************************************************
 4) UTILITY FUNCTIONS
************************************************************/
function hasAnyRole(member, roleIds = []) {
  return roleIds.some(roleId => member.roles.cache.has(roleId));
}
function hasAllRoles(member, roleIds = []) {
  return roleIds.every(roleId => member.roles.cache.has(roleId));
}

/************************************************************
 5) BUILD THE /list Slash Command
   (All fields required, including emojis in the embed)
************************************************************/
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new account for sale (Restricted).')

// Required fields
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
      .setDescription('Text at the top of the embed')
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
  .addStringOption(opt =>
    opt.setName('image')
      .setDescription('Main image URL')
      .setRequired(true)
  )

// Additional required fields
  .addStringOption(opt =>
    opt.setName('brawlers')
      .setDescription('Brawlers info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('legendary')
      .setDescription('Legendary Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('mythic')
      .setDescription('Mythic Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('epic')
      .setDescription('Epic Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('super_rare')
      .setDescription('Super Rare Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('rare')
      .setDescription('Rare Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('p9')
      .setDescription('Power 9 info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('p10')
      .setDescription('Power 10 info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('hypercharges')
      .setDescription('Hypercharges info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('image2')
      .setDescription('Additional image URL')
      .setRequired(true)
  );

/************************************************************
 6) BOT STARTUP
************************************************************/
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  try {
    await client.application.commands.create(listCommand);
    console.log('[Slash Command] /list registered successfully.');
  } catch (err) {
    console.error('Error registering /list:', err);
  }
});

/************************************************************
 7) PRESENCE CHECK (discord.gg/brawlshop => BRAWLSHOP_AD_ROLE)
************************************************************/
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.member) return;
  const member = newPresence.member;
  if (!member.manageable) return;

  let foundLink = false;
  if (newPresence.activities) {
    for (const act of newPresence.activities) {
      if (act.state && act.state.toLowerCase().includes('discord.gg/brawlshop')) {
        foundLink = true;
        break;
      }
    }
  }
  const hasAd = member.roles.cache.has(BRAWLSHOP_AD_ROLE);
  if (foundLink && !hasAd) {
    await member.roles.add(BRAWLSHOP_AD_ROLE).catch(() => {});
  } else if (!foundLink && hasAd) {
    await member.roles.remove(BRAWLSHOP_AD_ROLE).catch(() => {});
  }
});

/************************************************************
 8) MESSAGE HANDLER (ticketpanel, move, adds, friendlist, mark)
************************************************************/
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = '?';
  const staffPrefix = ',';

  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    //------------------------------------------------------------------
    // ?ticketpanel
    //------------------------------------------------------------------
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

    //------------------------------------------------------------------
    // ?move
    //------------------------------------------------------------------
    if (cmd === 'move') {
      if (!hasAnyRole(message.member, STAFF_ROLES)) {
        return message.reply("You don't have permission to use this command!");
      }
      const sub = args[0];
      if (!sub || !MOVE_CATEGORIES[sub]) {
        return message.reply('Invalid syntax. Usage: ?move [paid|add|sell|finished]');
      }
      const cat = MOVE_CATEGORIES[sub];
      try {
        await message.channel.setParent(cat, { lockPermissions: false });
        await message.reply(`Channel moved to category: ${sub}`);
      } catch (err) {
        console.error(err);
        message.reply('Could not move the channel. Check permissions or category ID.');
      }
    }

    //------------------------------------------------------------------
    // ?adds
    //------------------------------------------------------------------
    if (cmd === 'adds') {
      // Only role 1292933200389083196
      if (!message.member.roles.cache.has('1292933200389083196')) {
        return message.reply("You don't have permission to use this command!");
      }

      // 1) Swap
      const embed1 = new EmbedBuilder()
        .setTitle('Matcherino Swap')
        .setColor(EMBED_COLOR)
        .setDescription(
          '**__This requires 2 invites!__**\n\n' +
          'Swap pins with a **Matcherino Winner** in a friendly game.\n\n' +
          'After that you will be able to use the **Matcherino Winner Pin** yourself during that game.'
        );

      // 2) 115k Trophies
      const embed2 = new EmbedBuilder()
        .setTitle('115k Trophies & 71 R35 Add')
        .setColor(EMBED_COLOR)
        .setDescription(
          '**__This requires 3 invites!__**\n\n' +
          'Add a 115k Trophy and 71 legacy R35 Player.'
        )
        .setImage('https://media.discordapp.net/attachments/1351687016433193051/1351997791425007656/IMG_2580.png?ex=67dc6990&is=67db1810&hm=907faa84e6f1e2f77090588d183a509b5c7f973c81f977d0e531069c01d0c987&=&format=webp&quality=lossless&width=1746&height=806');

      // 3) Matcherino Winner
      const embed3 = new EmbedBuilder()
        .setTitle('Matcherino Winner Add')
        .setColor(EMBED_COLOR)
        .setDescription(
          '**__This requires 5 invites!__**\n\n' +
          'Add a **Matcherino Winner!**'
        )
        .setImage('https://media.discordapp.net/attachments/1351687016433193051/1351997783028142170/IMG_2581.png?ex=67dc698e&is=67db180e&hm=14481cce4458123ee4f63ffd4271dc13a78aafdfc3701b069983851c6b3b8e8c&=&format=webp&quality=lossless&width=1746&height=806');

      // Send the first 3 with no buttons
      await message.channel.send({ embeds: [embed1, embed2, embed3] });

      // 4) Fourth embed with all 3 buttons
      const embed4 = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(
          '**Once you have enough invites, claim your reward using the buttons below.**\n\n' +
          'Make sure to follow https://discord.com/channels/1292895164595175444/1293243690185265233'
        );

      const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_swap_matcherino')
          .setLabel('Swap Matcherino')
          .setEmoji('<:winmatcherino:1298703851934711848>')
          .setStyle(ButtonStyle.Danger),
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

      await message.channel.send({
        embeds: [embed4],
        components: [row4]
      });
    }

    //------------------------------------------------------------------
    // ?friendlist
    //------------------------------------------------------------------
    if (cmd === 'friendlist') {
      // Only role 1292933200389083196
      if (!message.member.roles.cache.has('1292933200389083196')) {
        return message.reply("You don't have permission to use this command!");
      }

      // Two columns (no row1/row2), replace __ with ** 
      const leftSide = '🥈| **LUX | Zoro** - €10\n🥈| **Lennox** - €15\n🥈| **Melih** - €15\n🥈| **Elox** - €15';
      const rightSide = '🥈| **Kazu** - €15\n🥇| **Izana** - €25\n🥇| **SKC | Rafiki** - €25\n🥇| **HMB | BosS** - €60';

      const friendEmbed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .addFields(
          { name: '\u200B', value: leftSide, inline: true },
          { name: '\u200B', value: rightSide, inline: true }
        );
      const friendEmbed2 = new EmbedBuilder()
        .setDescription('# ⬆️ ALL ADDS ARE LIFETIME');

      // 2 buttons => opens select menus
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('friendlist_buy')
          .setLabel('Buy Add')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('friendlist_info')
          .setLabel('More Information')
          .setStyle(ButtonStyle.Primary)
      );

      await message.channel.send({
        embeds: [friendEmbed, friendEmbed2],
        components: [row]
      });
    }
  }

  // , prefix
  if (message.content.startsWith(staffPrefix)) {
    const args = message.content.slice(staffPrefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'mark') {
      if (!message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
        return message.reply('You do not have permission to use ,mark.');
      }
      const messageId = args[0];
      if (!messageId) {
        return message.reply('Usage: ,mark <messageId>');
      }
      try {
        const targetMessage = await message.channel.messages.fetch(messageId);
        if (!targetMessage) {
          return message.reply('Could not find that message in this channel.');
        }

        const soldButton = new ButtonBuilder()
          .setCustomId('sold_button')
          .setLabel('This account has been sold.')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true);

        const soldRow = new ActionRowBuilder().addComponents(soldButton);
        await targetMessage.edit({ components: [soldRow] });

        message.reply(`Message \`${messageId}\` has been marked as sold.`);
      } catch (err) {
        console.error(err);
        message.reply('Failed to mark the listing. Check the message ID or permissions.');
      }
    }
  }
});

/************************************************************
 9) LIST COMMAND INTERACTION => storing data
************************************************************/
const listingDataMap = new Map(); 
// Key: messageId => { brawlers, legendary, ... image2 }

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'list') return;

  // Must have role
  if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
    return interaction.reply({ content: "You don't have the required role.", ephemeral: true });
  }

  // Gather all fields
  const pingChoice = interaction.options.getString('ping');
  const text = interaction.options.getString('text');
  const price = interaction.options.getString('price');
  const trophies = interaction.options.getString('trophies');
  const p11 = interaction.options.getString('p11');
  const tierMax = interaction.options.getString('tier_max');
  const imageUrl = interaction.options.getString('image');

  const brawlers    = interaction.options.getString('brawlers');
  const legendary   = interaction.options.getString('legendary');
  const mythic      = interaction.options.getString('mythic');
  const epic        = interaction.options.getString('epic');
  const superRare   = interaction.options.getString('super_rare');
  const rare        = interaction.options.getString('rare');
  const p9          = interaction.options.getString('p9');
  const p10         = interaction.options.getString('p10');
  const hypercharges= interaction.options.getString('hypercharges');
  const image2      = interaction.options.getString('image2');

  let nonEmbedText;
  if (pingChoice === 'everyone') nonEmbedText = '**||@everyone|| New account added!**';
  else if (pingChoice === 'here') nonEmbedText = '**||@here|| New account added!**';
  else nonEmbedText = '**New account added!**';

  // Main embed with emojis
  const mainEmbed = new EmbedBuilder()
    .setTitle('New Account Added! <:winmatcherino:1298703851934711848>')
    .setColor(EMBED_COLOR)
    .setDescription(text)
    .setImage(imageUrl)
    .addFields(
      { name: '<:Money:1351665747641766022> Price:', value: price, inline: true },
      { name: '<:gold_trophy:1351658932434768025> Trophies:', value: trophies, inline: true },
      { name: '<:P11:1351683038127591529> P11:', value: p11, inline: true },
      { name: '<:tiermax:1301899953320497243> Tier Max:', value: tierMax, inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('purchase_account')
      .setLabel('Purchase Account')
      .setEmoji('<:Shopping_Cart:1351686041559367752>')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('listing_more_info_temp')
      .setLabel('More Information')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ content: 'Listing posted!', ephemeral: true });

  const listingMessage = await interaction.channel.send({
    content: nonEmbedText,
    embeds: [mainEmbed],
    components: [row]
  });

  // fix customId => listing_more_info_<messageId>
  const newCustomId = `listing_more_info_${listingMessage.id}`;
  const updatedRows = [];
  listingMessage.components.forEach(r => {
    const rowBuilder = ActionRowBuilder.from(r);
    rowBuilder.components.forEach(comp => {
      if (comp.customId === 'listing_more_info_temp') {
        comp.setCustomId(newCustomId);
      }
    });
    updatedRows.push(rowBuilder);
  });
  await listingMessage.edit({ components: updatedRows });

  // Store for More Info
  listingDataMap.set(listingMessage.id, {
    rare, superRare, epic, mythic, legendary,
    brawlers, p9, p10, hypercharges, image2
  });
});

/************************************************************
10) BUTTON INTERACTION => TICKETS, MORE INFO, FRIENDLIST
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, guild, channel, member, user } = interaction;

  //----------------------------------------------------------
  // More Information for /list
  //----------------------------------------------------------
  if (customId.startsWith('listing_more_info_')) {
    const listingId = customId.replace('listing_more_info_', '');
    const data = listingDataMap.get(listingId);
    if (!data) {
      return interaction.reply({ content: 'No additional information found.', ephemeral: true });
    }

    const {
      rare, superRare, epic, mythic, legendary,
      brawlers, p9, p10, hypercharges, image2
    } = data;

    // Build lines
    const descLines = [];
    descLines.push(`**Rare Skins:**\n${rare}`);
    descLines.push(`**Super Rare Skins:**\n${superRare}`);
    descLines.push(`**Epic Skins:**\n${epic}`);
    descLines.push(`**Mythic Skins:**\n${mythic}`);
    descLines.push(`**Legendary Skins:**\n${legendary}`);
    descLines.push(`**Brawlers:**\n${brawlers}`);
    descLines.push(`**Power 9's:**\n${p9}`);
    descLines.push(`**Power 10's:**\n${p10}`);
    descLines.push(`**Hypercharges:**\n${hypercharges}`);

    const infoEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(descLines.join('\n\n'));
    if (image2) infoEmbed.setImage(image2);

    await interaction.reply({ embeds: [infoEmbed], ephemeral: false });
  }

  //----------------------------------------------------------
  // friendlist_buy => open select
  // friendlist_info => open select
  //----------------------------------------------------------
  if (customId === 'friendlist_buy') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('friendlist_buy_select')
      .setPlaceholder('Choose Player')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('LUX | Zoro').setValue('zoro'),
        new StringSelectMenuOptionBuilder().setLabel('Lennox').setValue('lennox'),
        new StringSelectMenuOptionBuilder().setLabel('Melih').setValue('melih'),
        new StringSelectMenuOptionBuilder().setLabel('Elox').setValue('elox'),
        new StringSelectMenuOptionBuilder().setLabel('Kazu').setValue('kazu'),
        new StringSelectMenuOptionBuilder().setLabel('Izana').setValue('izana'),
        new StringSelectMenuOptionBuilder().setLabel('SKC | Rafiki').setValue('rafiki'),
        new StringSelectMenuOptionBuilder().setLabel('HMB | BosS').setValue('boss')
      );
    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content: 'Select a player to buy an add.',
      components: [row],
      ephemeral: true
    });
  }

  if (customId === 'friendlist_info') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('friendlist_info_select')
      .setPlaceholder('Choose Player')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('LUX | Zoro').setValue('zoro'),
        new StringSelectMenuOptionBuilder().setLabel('Lennox').setValue('lennox'),
        new StringSelectMenuOptionBuilder().setLabel('Melih').setValue('melih'),
        new StringSelectMenuOptionBuilder().setLabel('Elox').setValue('elox'),
        new StringSelectMenuOptionBuilder().setLabel('Kazu').setValue('kazu'),
        new StringSelectMenuOptionBuilder().setLabel('Izana').setValue('izana'),
        new StringSelectMenuOptionBuilder().setLabel('SKC | Rafiki').setValue('rafiki'),
        new StringSelectMenuOptionBuilder().setLabel('HMB | BosS').setValue('boss')
      );
    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content: 'Select a player for more information.',
      components: [row],
      ephemeral: true
    });
  }

  //----------------------------------------------------------
  // TICKET CLOSE => confirm => reopen/delete
  //----------------------------------------------------------
  if (customId === 'close_ticket') {
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_close_ticket')
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('cancel_close_ticket')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );
    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription('Are you sure you want to close this ticket?')],
      components: [confirmRow],
      ephemeral: true
    });
  }
  if (customId === 'confirm_close_ticket') {
    try {
      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: '1292933924116500532', // only that staff role remains
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]);
      const closeEmbed = new EmbedBuilder()
        .setTitle('Ticket Closed')
        .setDescription(`This ticket has been closed by <@${user.id}>.`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('delete_ticket')
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('reopen_ticket')
          .setLabel('Re-Open')
          .setStyle(ButtonStyle.Success)
      );
      await channel.send({ embeds: [closeEmbed], components: [row] });

      await interaction.reply({ content: 'Ticket closed. Only staff can see it now.', ephemeral: true });
    } catch (err) {
      console.error(err);
      interaction.reply({ content: 'Failed to close the ticket.', ephemeral: true });
    }
  }
  if (customId === 'cancel_close_ticket') {
    await interaction.reply({ content: 'Ticket close canceled.', ephemeral: true });
  }
  if (customId === 'delete_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({ content: 'Only staff can delete tickets.', ephemeral: true });
    }
    await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
    await channel.delete().catch(console.error);
  }
  if (customId === 'reopen_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({ content: 'Only staff can re-open tickets.', ephemeral: true });
    }
    const openerId = ticketOpeners.get(channel.id);
    if (!openerId) {
      return interaction.reply({ content: 'Could not find the user who opened this ticket.', ephemeral: true });
    }
    try {
      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: openerId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        ...STAFF_ROLES.map(rid => ({
          id: rid,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }))
      ]);
      await interaction.reply({ content: 'Ticket re-opened!', ephemeral: true });

      const reopenEmbed = new EmbedBuilder()
        .setDescription('Ticket has been re-opened. Original user and staff can now see it again.');
      await channel.send({ embeds: [reopenEmbed] });
    } catch (err) {
      console.error(err);
      interaction.reply({ content: 'Failed to re-open ticket.', ephemeral: true });
    }
  }
});

/************************************************************
11) SELECT MENU INTERACTION => friendlist
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  const { customId, values, guild, user, member } = interaction;
  const chosen = values[0];

  // Helper to open a friend ticket
  async function openFriendTicket(playerName) {
    try {
      const channelName = `friend-${playerName}-${Math.floor(Math.random() * 1000)}`;
      const newChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: '1347969216052985876', // Category for friendlist
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          ...STAFF_ROLES.map(rid => ({
            id: rid,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }))
        ]
      });

      const welcomeEmbed = new EmbedBuilder()
        .setDescription(
          'Welcome, thanks for opening a ticket!\n\n' +
          '**Support will be with you shortly, please wait for them to respond.**'
        );
      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );
      await newChan.send({ embeds: [welcomeEmbed], components: [closeButton] });

      const addEmbed = new EmbedBuilder()
        .setDescription(`**Adding Player:**\n\`${playerName}\``);
      await newChan.send({ embeds: [addEmbed] });

      await interaction.reply({
        content: `Ticket created: <#${newChan.id}>`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({ content: 'Failed to create friend ticket channel.', ephemeral: true });
    }
  }

  // Helper to show ephemeral info
  function showPlayerInfo(title, desc, imageUrl) {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc);
    if (imageUrl) embed.setImage(imageUrl);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (customId === 'friendlist_buy_select') {
    // Open a ticket for whichever player
    switch(chosen) {
      case 'zoro':   await openFriendTicket('LUX | Zoro');   break;
      case 'lennox': await openFriendTicket('Lennox');       break;
      case 'melih':  await openFriendTicket('Melih');        break;
      case 'elox':   await openFriendTicket('Elox');         break;
      case 'kazu':   await openFriendTicket('Kazu');         break;
      case 'izana':  await openFriendTicket('Izana');        break;
      case 'rafiki': await openFriendTicket('SKC | Rafiki'); break;
      case 'boss':   await openFriendTicket('HMB | BosS');   break;
    }
  }

  if (customId === 'friendlist_info_select') {
    // Show ephemeral embed with details
    switch(chosen) {
      case 'zoro':
        await showPlayerInfo(
          'LUX | Zoro Information',
          'LUX | Zoro is an e-sports player for the team LuxAeterna, he is a tier C player.\n\nHe has 75k 3v3 wins, 57 legacy R35, and Masters in solo power league.',
          'https://media.discordapp.net/attachments/987753155360079903/1352052664476762296/zoro.webp?ex=67dc9cab&is=67db4b2b&hm=34d0fc54c0bacd4c59fb395c30e70f469f57ba6b86d67f643cfede07a9cd045b&=&format=webp'
        );
        break;
      case 'lennox':
        await showPlayerInfo(
          'Lennox Information',
          'Lennox has 130k peak trophies, 48 legacy r35, and 38 prestige.',
          'https://media.discordapp.net/attachments/987753155360079903/1352052862766813245/lennox.webp?ex=67dc9cda&is=67db4b5a&hm=8d4a2b567b6acdba601efd15a581829f1123d4b050c018de184c6ba05ac45fb9&=&format=webp'
        );
        break;
      case 'melih':
        await showPlayerInfo(
          'Melih Information',
          'Melih has 150k peak trophies, 70 legacy r35, and Masters solo power league.',
          'https://media.discordapp.net/attachments/987753155360079903/1352053558337470535/melih.webp?ex=67dc9d80&is=67db4c00&hm=9bf8673688191879fd014a8b3106826a7e71ffbbe6d5c3ee6814088ef7eb5682&=&format=webp'
        );
        break;
      case 'elox':
        await showPlayerInfo(
          'Elox Information',
          'Elox is an official content creator and has 150k peak trophies.',
          'https://media.discordapp.net/attachments/987753155360079903/1352053811052544111/elox.webp?ex=67dc9dbc&is=67db4c3c&hm=b94c0b1740c3a72a2b4d9f3f0b579c9751c5660da5d754c8452fdb7e82afab78&=&format=webp'
        );
        break;
      case 'kazu':
        await showPlayerInfo(
          'Kazu Information',
          'Kazu is an official content creator and is currently top 10 global with trophies.',
          'https://media.discordapp.net/attachments/987753155360079903/1352055076448899072/kazu.webp?ex=67dc9eea&is=67db4d6a&hm=f0984e497ff616e6d2e89e06a4c78ac3647aef85cfa7321d8998c2fe615c31e5&=&format=webp'
        );
        break;
      case 'izana':
        await showPlayerInfo(
          'Izana Information',
          'Izana is a content creator and holds the Bea world record with over 50k trophies on her.',
          'https://media.discordapp.net/attachments/987753155360079903/1352055480079614074/izana.webp?ex=67dc9f4a&is=67db4dca&hm=488b1a64206e37d39b580d6fe97b563bc21d34f862016363faf631b5b054c835&=&format=webp'
        );
        break;
      case 'rafiki':
        await showPlayerInfo(
          'SKC | Rafiki Information',
          'Rafiki tier S NA pro. He is also a matcherino winner',
          'https://media.discordapp.net/attachments/987753155360079903/1352055818165420102/rafiki.webp?ex=67dc9f9b&is=67db4e1b&hm=2b10fc92bd36a65eb55517ef1cb4071982119b4050e87600db30c9cb26f0286a&=&format=webp'
        );
        break;
      case 'boss':
        await showPlayerInfo(
          'HMB | BosS Information',
          'BosS is an e-sport player for Humble.\n\nIn 2024 he won the world finals.',
          'https://media.discordapp.net/attachments/987753155360079903/1352056193337655356/boss.webp?ex=67dc9ff4&is=67db4e74&hm=b201f9e04f7735c6952c4922fa27ce8d320c51b788ce77a6a92e8c77c2bdc5a9&=&format=webp'
        );
        break;
    }
  }
});

/************************************************************
12) LOG IN
************************************************************/
client.login(BOT_TOKEN).catch(err => {
  console.error('[Login Error]', err);
});
