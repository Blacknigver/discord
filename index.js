/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Discord.js v14
 * Uses process.env.TOKEN for the bot token.
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

const BOT_TOKEN = process.env.TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID_HERE';

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
 1) CONFIG CONSTANTS
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

// We'll store who opened each ticket so we can re-open it
const ticketOpeners = new Map();

// Color for /list (and also for the new ?friendlist embed)
const EMBED_COLOR = '#E68DF2';

/************************************************************
 2) UTILITY FUNCTIONS
************************************************************/
function hasAnyRole(member, roleIds = []) {
  return roleIds.some(roleId => member.roles.cache.has(roleId));
}
function hasAllRoles(member, roleIds = []) {
  return roleIds.every(roleId => member.roles.cache.has(roleId));
}

/************************************************************
 3) TRACK LISTINGS FOR "MORE INFORMATION" (/list data)
************************************************************/
const listingDataMap = new Map(); 
// Key: messageId, Value: object with user-provided fields

/************************************************************
 4) BUILD /list Slash Command
************************************************************/
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new account for sale (Restricted).')
  // All required to ensure "More Information" always works
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
      .setDescription('Text to include at the top of the embed')
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
 5) BOT STARTUP
************************************************************/
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register slash command
  try {
    await client.application.commands.create(listCommand);
    console.log('[Slash Command] /list registered successfully.');
  } catch (err) {
    console.error('Error registering /list:', err);
  }
});

/************************************************************
 6) PRESENCE CHECK (discord.gg/brawlshop => BRAWLSHOP_AD_ROLE)
************************************************************/
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.member) return;

  const member = newPresence.member;
  if (!member.manageable) return;

  const hasAdRole = member.roles.cache.has(BRAWLSHOP_AD_ROLE);
  let foundLink = false;

  if (newPresence.activities) {
    for (const act of newPresence.activities) {
      if (act.state && act.state.toLowerCase().includes('discord.gg/brawlshop')) {
        foundLink = true;
        break;
      }
    }
  }

  if (foundLink && !hasAdRole) {
    await member.roles.add(BRAWLSHOP_AD_ROLE).catch(() => {});
  } else if (!foundLink && hasAdRole) {
    await member.roles.remove(BRAWLSHOP_AD_ROLE).catch(() => {});
  }
});

/************************************************************
 7) MESSAGE HANDLER
    (ticketpanel, move, adds, friendlist, mark)
************************************************************/
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const prefix = '?';
  const staffPrefix = ',';

  // ? commands
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    /*******************************************************
     ?ticketpanel
    ********************************************************/
    if (cmd === 'ticketpanel') {
      if (!TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
        return message.reply("You don't have permission to use this command!");
      }

      // embed color => #E68DF2
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
        // "Other" => green
        new ButtonBuilder()
          .setCustomId('ticket_other')
          .setLabel('Other')
          .setEmoji('<:winmatcherino:1298703851934711848>')
          .setStyle(ButtonStyle.Success)
      );

      await message.channel.send({ embeds: [embed], components: [row, row2] });
      await message.reply('Ticket panel created!');
    }

    /*******************************************************
     ?move
    ********************************************************/
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

    /*******************************************************
     ?adds
    ********************************************************/
    if (cmd === 'adds') {
      // Restricted to role 1292933200389083196
      if (!message.member.roles.cache.has('1292933200389083196')) {
        return message.reply("You don't have permission to use this command!");
      }

      const embed1 = new EmbedBuilder()
        .setTitle('Matcherino Swap')
        .setColor(EMBED_COLOR)
        .setDescription(
          '**__This requires 2 invites!__**\n\n' +
          'Swap pins with a **Matcherino Winner** in a friendly game.\n\n' +
          'After that you will be able to use the **Matcherino Winner Pin** yourself during that game.'
        );

      const embed2 = new EmbedBuilder()
        .setTitle('115k Trophies & 71 R35 Add')
        .setColor(EMBED_COLOR)
        .setDescription(
          '**__This requires 3 invites!__**\n\n' +
          'Add a 115k Trophy and 71 legacy R35 Player.'
        )
        .setImage('https://media.discordapp.net/attachments/1351687016433193051/1351997791425007656/IMG_2580.png?ex=67dc6990&is=67db1810&hm=907faa84e6f1e2f77090588d183a509b5c7f973c81f977d0e531069c01d0c987&=&format=webp&quality=lossless&width=1746&height=806');

      const embed3 = new EmbedBuilder()
        .setTitle('Matcherino Winner Add')
        .setColor(EMBED_COLOR)
        .setDescription(
          '**__This requires 3 invites!__**\n\n' +
          'Add a **Matcherino Winner!**'
        )
        .setImage('https://media.discordapp.net/attachments/1351687016433193051/1351997783028142170/IMG_2581.png?ex=67dc698e&is=67db180e&hm=14481cce4458123ee4f63ffd4271dc13a78aafdfc3701b069983851c6b3b8e8c&=&format=webp&quality=lossless&width=1746&height=806');

      const embed4 = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(
          '**Once you have enough invites, claim your reward using the buttons below.**\n\n' +
          'Make sure to follow https://discord.com/channels/1292895164595175444/1293243690185265233'
        );

      const row = new ActionRowBuilder().addComponents(
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
          .setStyle(ButtonStyle.Primary)
        // omit the "Add Matcherino Winner" from this row
      );

      // Send first 3 with full row
      await message.channel.send({
        embeds: [embed1, embed2, embed3],
        components: [row]
      });

      // Then the 4th with row4
      await message.channel.send({
        embeds: [embed4],
        components: [row4]
      });
    }

    /*******************************************************
     ?friendlist
    ********************************************************/
    if (cmd === 'friendlist') {
      // Only useable by role 1292933200389083196
      if (!message.member.roles.cache.has('1292933200389083196')) {
        return message.reply("You don't have permission to use this command!");
      }

      const embedRow1 = '🥈| __LUX | Zoro__ - €10\n🥈 | __Lennox__ - €15\n🥈| __Melih__ - €15\n🥈| __Elox__ - €15';
      const embedRow2 = '🥈| __Kazu__ - €15\n🥇| __Izana__ - €25\n🥇| __SKC | Rafiki__ - €25\n🥇| __HMB | BosS__ - €60';

      const friendEmbed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .addFields(
          { name: 'Row 1', value: embedRow1, inline: true },
          { name: 'Row 2', value: embedRow2, inline: true }
        );

      const friendEmbed2 = new EmbedBuilder()
        .setDescription('# ⬆️ ALL ADDS ARE LIFETIME');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('friendlist_buyadd')
          .setLabel('Buy Add')
          .setEmoji('<:Shopping_Cart:1351686041559367752>')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('friendlist_info')
          .setLabel('Player Information')
          .setStyle(ButtonStyle.Primary)
      );

      await message.channel.send({
        embeds: [friendEmbed, friendEmbed2],
        components: [row]
      });
    }
  }

  // , prefix commands
  if (message.content.startsWith(staffPrefix)) {
    const args = message.content.slice(staffPrefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    /*******************************************************
     ,mark <messageId>
    ********************************************************/
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
 8) /list Interaction Handler
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'list') {
    if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({
        content: "You don't have the required role to use this command.",
        ephemeral: true
      });
    }

    // Gather inputs
    const pingChoice = interaction.options.getString('ping');
    const text       = interaction.options.getString('text');
    const price      = interaction.options.getString('price');
    const trophies   = interaction.options.getString('trophies');
    const p11        = interaction.options.getString('p11');
    const tierMax    = interaction.options.getString('tier_max');
    const imageUrl   = interaction.options.getString('image');

    const brawlers      = interaction.options.getString('brawlers');
    const legendary     = interaction.options.getString('legendary');
    const mythic        = interaction.options.getString('mythic');
    const epic          = interaction.options.getString('epic');
    const superRare     = interaction.options.getString('super_rare');
    const rare          = interaction.options.getString('rare');
    const p9            = interaction.options.getString('p9');
    const p10           = interaction.options.getString('p10');
    const hypercharges  = interaction.options.getString('hypercharges');
    const image2        = interaction.options.getString('image2');

    let nonEmbedText;
    if (pingChoice === 'everyone') nonEmbedText = '**||@everyone|| New account added!**';
    else if (pingChoice === 'here') nonEmbedText = '**||@here|| New account added!**';
    else nonEmbedText = '**New account added!**';

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

    const buttonsRow = new ActionRowBuilder().addComponents(
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
      components: [buttonsRow]
    });

    const newCustomId = `listing_more_info_${listingMessage.id}`;
    const updatedRows = [];
    listingMessage.components.forEach(row => {
      const rowBuilder = ActionRowBuilder.from(row);
      rowBuilder.components.forEach(comp => {
        if (comp.customId === 'listing_more_info_temp') {
          comp.setCustomId(newCustomId);
        }
      });
      updatedRows.push(rowBuilder);
    });
    await listingMessage.edit({ components: updatedRows });

    // Store data for "More Information"
    listingDataMap.set(listingMessage.id, {
      rare, superRare, epic, mythic, legendary,
      brawlers, p9, p10, hypercharges, image2
    });
  }
});

/************************************************************
 9) BUTTON INTERACTION: TICKETS, /list => Purchase, More Info
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, member, guild } = interaction;

  // Helper: build a modal with required questions
  function buildQuestionModal(modalId, title, questions) {
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(title);
    const rows = questions.map(q => {
      const input = new TextInputBuilder()
        .setCustomId(q.customId)
        .setLabel(q.label)
        .setStyle(q.style || TextInputStyle.Short)
        .setRequired(true);
      return new ActionRowBuilder().addComponents(input);
    });
    modal.addComponents(...rows);
    return modal;
  }

  /****************************************************
   TICKET BUTTONS => show modal
  ****************************************************/
  if (customId === 'ticket_trophies') {
    const modal = buildQuestionModal('modal_ticket_trophies', 'Trophies Ticket', [
      { customId: 'current_brawler_trophies', label: 'How many trophies does your brawler have?' },
      { customId: 'desired_brawler_trophies', label: 'What is your desired brawler trophies?' },
      { customId: 'which_brawler', label: 'Which brawler would you like to be boosted?' }
    ]);
    await interaction.showModal(modal);
  }

  if (customId === 'ticket_ranked') {
    const modal = buildQuestionModal('modal_ticket_ranked', 'Ranked Ticket', [
      { customId: 'current_rank', label: 'What rank currently are you?' },
      { customId: 'desired_rank', label: 'What is your desired rank?' }
    ]);
    await interaction.showModal(modal);
  }

  if (customId === 'ticket_bulk') {
    const modal = buildQuestionModal('modal_ticket_bulk', 'Bulk Trophies Ticket', [
      { customId: 'current_total', label: 'How many total trophies do you have?' },
      { customId: 'desired_total', label: 'What is your desired total trophies?' }
    ]);
    await interaction.showModal(modal);
  }

  if (customId === 'ticket_mastery') {
    const modal = buildQuestionModal('modal_ticket_mastery', 'Mastery Ticket', [
      { customId: 'current_mastery_rank', label: 'What is your current mastery rank?' },
      { customId: 'desired_mastery_rank', label: 'What is your desired mastery rank?' },
      { customId: 'which_brawler', label: 'Which brawler would you like to be boosted?' }
    ]);
    await interaction.showModal(modal);
  }

  if (customId === 'ticket_other') {
    const modal = buildQuestionModal('modal_ticket_other', 'Other Ticket', [
      { customId: 'reason', label: 'Why are you opening this ticket?' }
    ]);
    await interaction.showModal(modal);
  }

  /****************************************************
   /list => Purchase Account
  ****************************************************/
  if (customId === 'purchase_account') {
    try {
      const channelName = `purchase-${interaction.user.username}-${Math.floor(Math.random() * 1000)}`;
      const purchaseChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: PURCHASE_ACCOUNT_CATEGORY,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          ...STAFF_ROLES.map(roleId => ({
            id: roleId,
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

      // single embed => close button here
      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );

      await purchaseChannel.send({
        embeds: [welcomeEmbed],
        components: [closeButton]
      });

      ticketOpeners.set(purchaseChannel.id, interaction.user.id);

      await interaction.reply({
        content: `Ticket created: <#${purchaseChannel.id}>`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to create purchase ticket channel.',
        ephemeral: true
      });
    }
  }

  /****************************************************
   /list => More Information
  ****************************************************/
  if (customId.startsWith('listing_more_info_')) {
    const listingId = customId.replace('listing_more_info_', '');
    const data = listingDataMap.get(listingId);
    if (!data) {
      return interaction.reply({
        content: 'No additional information found.',
        ephemeral: true
      });
    }

    const {
      rare, superRare, epic, mythic, legendary,
      brawlers, p9, p10, hypercharges, image2
    } = data;

    const descLines = [];
    descLines.push(`**<:rare:1351963849322004521> Rare Skins:**\n${rare}`);
    descLines.push(`**<:super_rare:1351963921967218839> Super Rare Skins:**\n${superRare}`);
    descLines.push(`**<:epic:1351963993442353365> Epic Skins:**\n${epic}`);
    descLines.push(`**<:mythic:1351964047179907235> Mythic Skins:**\n${mythic}`);
    descLines.push(`**<:legendary:1351964089454428261> Legendary Skins:**\n${legendary}`);
    descLines.push(`**<:brawler:1351965712582705152> Brawlers:**\n${brawlers}`);
    descLines.push(`**<:power_9:1351963484207841331> Power 9's:**\n${p9}`);
    descLines.push(`**<:p10:1351981538740404355> Power 10's:**\n${p10}`);
    descLines.push(`**<:hypercharge:1351963655234650143> Hypercharges:**\n${hypercharges}`);

    const infoEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(descLines.join('\n\n'));

    if (image2) {
      infoEmbed.setImage(image2);
    }

    await interaction.reply({ embeds: [infoEmbed], ephemeral: false });
  }

  /****************************************************
   ?adds => 3 Buttons
  ****************************************************/
  if (customId === 'btn_swap_matcherino') {
    const channelName = `swap-${interaction.user.username}-${Math.floor(Math.random() * 1000)}`;
    try {
      const newChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: MATCHERINO_SWAP_CATEGORY,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
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
      ticketOpeners.set(newChan.id, interaction.user.id);

      await interaction.reply({
        content: `Matcherino swap ticket created: <#${newChan.id}>`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to create swap ticket channel.',
        ephemeral: true
      });
    }
  }

  if (customId === 'btn_add_115k') {
    let hasRequiredRole = false;
    for (const r of ADD_115K_ROLES) {
      if (member.roles.cache.has(r)) {
        hasRequiredRole = true;
        break;
      }
    }

    if (!hasRequiredRole) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('Insufficient Invites, please come back when you have enough!')
        ],
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_add_115k')
      .setTitle('Supercell ID');

    const input = new TextInputBuilder()
      .setCustomId('supercell_id_input')
      .setLabel('Supercell ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  if (customId === 'btn_add_matcherino_winner') {
    let haveFirstPair = hasAllRoles(member, [MATCHERINO_WINNER_ROLE_1A, MATCHERINO_WINNER_ROLE_1B]);
    let haveSecondPair = hasAllRoles(member, [MATCHERINO_WINNER_ROLE_2A, MATCHERINO_WINNER_ROLE_2B]);

    if (!haveFirstPair && !haveSecondPair) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('<:cross:1351689463453061130> - **Insufficient Invites**, please come back when you have enough invites!')
        ],
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_matcherino_winner')
      .setTitle('Supercell ID');

    const input = new TextInputBuilder()
      .setCustomId('supercell_id_input')
      .setLabel('Supercell ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }
});

/************************************************************
10) MODAL SUBMISSIONS
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const { customId } = interaction;

  // Helper to create a new channel with Q&A
  async function createTicketChannel(interaction, categoryId, answers) {
    const { guild, user } = interaction;
    const existingTickets = guild.channels.cache.filter(ch => {
      if (ch.type === ChannelType.GuildText && ch.parentId) {
        const perm = ch.permissionOverwrites.cache.get(user.id);
        if (!perm) return false;
        const isTicketCat = Object.values(TICKET_CATEGORIES).includes(ch.parentId)
          || ch.parentId === MATCHERINO_SWAP_CATEGORY
          || ch.parentId === PURCHASE_ACCOUNT_CATEGORY;
        return perm.allow?.has(PermissionsBitField.Flags.ViewChannel) && isTicketCat;
      }
      return false;
    });

    if (existingTickets.size >= MAX_TICKETS_PER_USER) {
      return interaction.reply({
        content: `You already have the maximum of ${MAX_TICKETS_PER_USER} open tickets!`,
        ephemeral: true
      });
    }

    const channelName = `ticket-${user.username}-${Math.floor(Math.random() * 1000)}`;
    try {
      const newChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
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

      // We'll send 2 embeds + close button on second embed
      const welcomeEmbed = new EmbedBuilder()
        .setDescription(
          'Welcome, thanks for opening a ticket!\n\n' +
          '**Support will be with you shortly, please wait for them to respond.**'
        );

      let desc = '';
      for (const [q, ans] of answers) {
        desc += `**${q}:**\n\`${ans}\`\n\n`;
      }
      const qnaEmbed = new EmbedBuilder().setDescription(desc.trim());

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );

      await newChan.send({
        embeds: [welcomeEmbed, qnaEmbed],
        components: [closeButton]
      });

      ticketOpeners.set(newChan.id, user.id);

      await interaction.reply({
        content: `Ticket created: <#${newChan.id}>`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to create ticket channel. Check permissions.',
        ephemeral: true
      });
    }
  }

  // Trophies
  if (customId === 'modal_ticket_trophies') {
    const current = interaction.fields.getTextInputValue('current_brawler_trophies');
    const desired = interaction.fields.getTextInputValue('desired_brawler_trophies');
    const which = interaction.fields.getTextInputValue('which_brawler');
    const answers = [
      ['How many trophies does your brawler have?', current],
      ['What is your desired brawler trophies?', desired],
      ['Which brawler would you like to be boosted?', which]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.TROPHIES, answers);
  }

  // Ranked
  if (customId === 'modal_ticket_ranked') {
    const currentRank = interaction.fields.getTextInputValue('current_rank');
    const desiredRank = interaction.fields.getTextInputValue('desired_rank');
    const answers = [
      ['What rank currently are you?', currentRank],
      ['What is your desired rank?', desiredRank]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.RANKED, answers);
  }

  // Bulk
  if (customId === 'modal_ticket_bulk') {
    const currentTotal = interaction.fields.getTextInputValue('current_total');
    const desiredTotal = interaction.fields.getTextInputValue('desired_total');
    const answers = [
      ['How many total trophies do you have?', currentTotal],
      ['What is your desired total trophies?', desiredTotal]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.BULK, answers);
  }

  // Mastery
  if (customId === 'modal_ticket_mastery') {
    const currentMastery = interaction.fields.getTextInputValue('current_mastery_rank');
    const desiredMastery = interaction.fields.getTextInputValue('desired_mastery_rank');
    const whichBrawler = interaction.fields.getTextInputValue('which_brawler');
    const answers = [
      ['What is your current mastery rank?', currentMastery],
      ['What is your desired mastery rank?', desiredMastery],
      ['Which brawler would you like to be boosted?', whichBrawler]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.MASTERY, answers);
  }

  // Other
  if (customId === 'modal_ticket_other') {
    const reason = interaction.fields.getTextInputValue('reason');
    const answers = [
      ['Why are you opening this ticket?', reason]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.OTHER, answers);
  }

  // Add 115k
  if (customId === 'modal_add_115k') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');
    const member = interaction.member;

    let foundRole = null;
    for (const r of ADD_115K_ROLES) {
      if (member.roles.cache.has(r)) {
        foundRole = r;
        break;
      }
    }
    if (!foundRole) {
      return interaction.reply({
        content: 'Insufficient Invites; you no longer have the required role.',
        ephemeral: true
      });
    }

    try {
      await member.roles.remove(foundRole);
    } catch (err) {
      console.error('Failed removing 115k role:', err);
      return interaction.reply({
        content: 'Error removing your invite role. Please contact staff.',
        ephemeral: true
      });
    }

    const targetChannel = interaction.guild.channels.cache.get(ADD_115K_MSG_CHANNEL);
    if (!targetChannel) {
      return interaction.reply({
        content: 'Error: cannot find the target channel to post the add.',
        ephemeral: true
      });
    }

    await targetChannel.send({
      content: `**New 115k Add**\nUser: <@${interaction.user.id}>\n\nSupercell ID: \`${supercellId}\``
    });

    const successEmbed = new EmbedBuilder()
      .setDescription('**Successfully added! ✅**\nYou will be added within a day.');
    await interaction.reply({
      embeds: [successEmbed],
      ephemeral: true
    });
  }

  // Add Matcherino Winner
  if (customId === 'modal_matcherino_winner') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');
    const member = interaction.member;

    let haveFirstPair = hasAllRoles(member, [MATCHERINO_WINNER_ROLE_1A, MATCHERINO_WINNER_ROLE_1B]);
    let haveSecondPair = hasAllRoles(member, [MATCHERINO_WINNER_ROLE_2A, MATCHERINO_WINNER_ROLE_2B]);
    if (!haveFirstPair && !haveSecondPair) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('<:cross:1351689463453061130> - **Insufficient Invites**')
        ],
        ephemeral: true
      });
    }

    try {
      if (haveFirstPair) {
        await member.roles.remove(MATCHERINO_WINNER_ROLE_1A);
        await member.roles.remove(MATCHERINO_WINNER_ROLE_1B);
      } else {
        await member.roles.remove(MATCHERINO_WINNER_ROLE_2A);
        await member.roles.remove(MATCHERINO_WINNER_ROLE_2B);
      }
    } catch (err) {
      console.error('Failed removing matcherino roles:', err);
      return interaction.reply({
        content: 'Error removing your invite roles. Please contact staff.',
        ephemeral: true
      });
    }

    const targetChannel = interaction.guild.channels.cache.get(ADD_MATCHERINO_MSG_CHANNEL);
    if (!targetChannel) {
      return interaction.reply({
        content: 'Error: cannot find the target channel to post the add.',
        ephemeral: true
      });
    }

    await targetChannel.send({
      content: `**New Matcherino Winner Add**\nUser: <@${interaction.user.id}>\n\nSupercell ID: \`${supercellId}\``
    });

    const successEmbed = new EmbedBuilder()
      .setDescription('**Successfully added! ✅**\nYou will be added within a day.');
    await interaction.reply({
      embeds: [successEmbed],
      ephemeral: true
    });
  }
});

/************************************************************
11) TICKET CLOSE / REOPEN / DELETE
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, guild, user, member } = interaction;

  /****************************************************
   close_ticket => ephemeral confirmation
  ****************************************************/
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
      embeds: [
        new EmbedBuilder().setDescription('Are you sure you want to close this ticket?')
      ],
      components: [confirmRow],
      ephemeral: true
    });
  }

  /****************************************************
   confirm_close_ticket => remove perms, post "Ticket Closed"
  ****************************************************/
  if (customId === 'confirm_close_ticket') {
    try {
      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          // only role 1292933924116500532 remains
          id: '1292933924116500532',
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

      await interaction.reply({
        content: 'Ticket closed. Only staff can see it now.',
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to close the ticket. Check permissions.',
        ephemeral: true
      });
    }
  }

  if (customId === 'cancel_close_ticket') {
    await interaction.reply({
      content: 'Ticket close canceled.',
      ephemeral: true
    });
  }

  /****************************************************
   delete_ticket => permanently delete the channel
  ****************************************************/
  if (customId === 'delete_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({
        content: 'Only staff can delete tickets.',
        ephemeral: true
      });
    }
    await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
    await channel.delete().catch(console.error);
  }

  /****************************************************
   reopen_ticket => restore perms
  ****************************************************/
  if (customId === 'reopen_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({
        content: 'Only staff can re-open tickets.',
        ephemeral: true
      });
    }

    const openerId = ticketOpeners.get(channel.id);
    if (!openerId) {
      return interaction.reply({
        content: 'Could not find the user who opened this ticket.',
        ephemeral: true
      });
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

      await interaction.reply({
        content: 'Ticket re-opened!',
        ephemeral: true
      });

      const reopenEmbed = new EmbedBuilder()
        .setDescription('Ticket has been re-opened. Original user and staff can now see it again.');
      await channel.send({ embeds: [reopenEmbed] });
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to re-open ticket.',
        ephemeral: true
      });
    }
  }

  /****************************************************
   friendlist_buyadd => "Buy an Add" embed
   friendlist_info => "Player Information" embed
   (No changes requested for these from last code,
   so we omit them unless you need them.)
  ****************************************************/
});

/************************************************************
12) LOG IN THE BOT
************************************************************/
client.login(BOT_TOKEN).catch(err => {
  console.error('[Login Error]', err);
});
