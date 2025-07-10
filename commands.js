// Command handlers for the Discord bot
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  PermissionsBitField,
  PermissionFlagsBits,
  ChannelType,
  InteractionResponseFlags,
  Client,
  GatewayIntentBits
} = require('discord.js');
const { 
  EMBED_COLOR, 
  STAFF_ROLES, 
  TICKET_CATEGORIES,
  LIST_COMMAND_ROLE,
  TICKET_PANEL_ALLOWED_USERS,
  MOVE_CATEGORIES,
  PURCHASE_ACCOUNT_CATEGORY
} = require('./src/constants');
const { createTicketPanel } = require('./src/modules/ticketFlow');
const { handleReviewCommand } = require('./review');
const invitesCommand = require('./src/commands/invites');
const inviteLeaderboardCommand = require('./src/commands/inviteLeaderboard');
const inviteAdminCommand = require('./src/commands/inviteAdmin');

// Internal state to store ephemeral data between interactions
const ephemeralFlowState = new Map();
const ticketDataMap = new Map();
// Map to avoid duplicate button processing
const processedButtonIds = new Set();

/**
 * Check if a member has any of the specified roles
 * @param {GuildMember} member - The guild member to check
 * @param {string[]} roleIds - Array of role IDs to check against
 * @returns {boolean} True if the member has any of the roles
 */
function hasAnyRole(member, roleIds) {
  return roleIds.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Create a ticket channel with overflow handling
 * @param {Guild} guild - The guild to create the channel in
 * @param {string} channelName - The name for the channel
 * @param {User} user - The user who created the ticket
 * @param {string} categoryId - The category to create the channel in
 * @param {string} ticketType - The type of ticket (e.g., 'profile')
 * @returns {TextChannel|null} The created channel or null if failed
 */
async function createTicketChannelWithOverflow(guild, channelName, user, categoryId, ticketType = null) {
  try {
    let category = null;
    
    // Try to fetch the category first
    try {
      category = await guild.channels.fetch(categoryId);
    } catch (error) {
      console.error(`[TICKET_CREATE] Category ${categoryId} not found, creating without category`);
      category = null;
    }
    
    // Check if category is full (50 channels max per category)
    if (category && category.children.cache.size >= 50) {
      console.log(`[TICKET_CREATE] Category ${categoryId} is full, creating without category`);
      category = null;
    }
    
    // Create channel permissions
    const channelPermissions = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
      }
    ];
    
    // For profile purchase tickets, use specific permissions
    if (ticketType === 'profile' || channelName.startsWith('𝐩𝐫𝐨𝐟𝐢𝐥𝐞-')) {
      // Specific roles for profile purchase tickets
      const PROFILE_PURCHASE_ROLES = [
        '1292933200389083196', // Owner
        '1358101527658627270', // Head Admin
        '1292933924116500532'  // Admin
      ];
      
      // Specific users for profile purchase tickets
      const PROFILE_PURCHASE_USERS = [
        '987751357773672538', // JustRuben
        '986164993080836096'  // Additional user
      ];
      
      // Add role permissions
      for (const roleId of PROFILE_PURCHASE_ROLES) {
        channelPermissions.push({
          id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
        });
      }
      
      // Add user permissions
      for (const userIdSpecific of PROFILE_PURCHASE_USERS) {
        channelPermissions.push({
          id: userIdSpecific,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
        });
      }
    } else {
      // Add staff role permissions for other tickets
    for (const roleId of STAFF_ROLES) {
      channelPermissions.push({
        id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
        });
      }
    }
    
    // Create the channel - with or without category
    const channelOptions = {
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: channelPermissions,
      topic: `User ID: ${user.id} | Created: ${new Date().toISOString()}`
    };
    
    // Only add parent if category exists and isn't full
    if (category) {
      channelOptions.parent = category.id;
    }
    
    const channel = await guild.channels.create(channelOptions);
    
    console.log(`[TICKET_CREATE] Created channel ${channel.name} (${channel.id}) ${category ? `in category ${category.name}` : 'without category'}`);
    
    // Store ticket data
    ticketDataMap.set(channel.id, {
      userId: user.id,
      createdAt: new Date(),
      type: ticketType || channelName.split('-')[0]
    });
    
    return channel;
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    return null;
  }
}

// /list slash command registration
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 for sale (restricted to sellers).')
  .addStringOption(option => option
    .setName('ping')
    .setDescription('Who should be pinged?')
      .setRequired(true)
      .addChoices(
        { name: 'Everyone', value: 'everyone' },
        { name: 'Here', value: 'here' },
        { name: 'None', value: 'none' }
      )
  )
  // Core summary fields
  .addStringOption(option => option.setName('text').setDescription('Short description').setRequired(true))
  .addStringOption(option => option.setName('price').setDescription('Price').setRequired(true))
  .addStringOption(option => option.setName('trophies').setDescription('Total trophies').setRequired(true))
  .addStringOption(option => option.setName('p11').setDescription('P11 info').setRequired(true))
  .addStringOption(option => option.setName('tier_max').setDescription('Tier-max info').setRequired(true))
  // Detailed fields
  .addStringOption(option => option.setName('rare_skins').setDescription('Rare skins').setRequired(true))
  .addStringOption(option => option.setName('super_rare_skins').setDescription('Super-rare skins').setRequired(true))
  .addStringOption(option => option.setName('epic_skins').setDescription('Epic skins').setRequired(true))
  .addStringOption(option => option.setName('mythic_skins').setDescription('Mythic skins').setRequired(true))
  .addStringOption(option => option.setName('legendary_skins').setDescription('Legendary skins').setRequired(true))
  .addStringOption(option => option.setName('titles').setDescription('Titles').setRequired(true))
  .addStringOption(option => option.setName('hypercharges').setDescription('Hypercharges').setRequired(true))
  .addStringOption(option => option.setName('power_10s').setDescription('Number of Power-10 brawlers').setRequired(true))
  .addStringOption(option => option.setName('power_9s').setDescription('Number of Power-9 brawlers').setRequired(true))
  .addStringOption(option => option.setName('old_ranked_rank').setDescription('Old ranked rank').setRequired(true))
  .addStringOption(option => option.setName('new_ranked_rank').setDescription('New ranked rank').setRequired(true))
  // Images
  .addAttachmentOption(option => option.setName('image').setDescription('Main image').setRequired(true))
  .addAttachmentOption(option => option.setName('image2').setDescription('Second image (optional)').setRequired(false));

// /ticket-panel command
const ticketPanelCommand = new SlashCommandBuilder()
  .setName('ticket-panel')
  .setDescription('Create a ticket panel in the current channel');

// /review command
const reviewCommand = new SlashCommandBuilder()
  .setName('review')
  .setDescription('Add a review')
  .addUserOption(option => option.setName('user').setDescription('User to review').setRequired(true))
  .addStringOption(option => option.setName('rating').setDescription('Rating (1-5 stars)').setRequired(true))
  .addStringOption(option => option.setName('comment').setDescription('Review comment').setRequired(true))
  .addBooleanOption(option => option.setName('anonymous').setDescription('Submit anonymously').setRequired(false));

const exportedCommands = [listCommand, ticketPanelCommand, reviewCommand, invitesCommand.data, inviteLeaderboardCommand.data, inviteAdminCommand.data];

// Handle slash commands
async function handleSlashCommands(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'review') {
    return handleReviewCommand(interaction);
  }

  if (interaction.commandName === 'invites') {
    return invitesCommand.execute(interaction);
  }

  if (interaction.commandName === 'invite-leaderboard') {
    return inviteLeaderboardCommand.execute(interaction);
  }

  if (interaction.commandName === 'invite-admin') {
    return inviteAdminCommand.execute(interaction);
  }

  if (interaction.commandName === 'ticket-panel') {
    // Check if user is allowed to create ticket panel
    if (!TICKET_PANEL_ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({ 
        content: "You don't have permission to create ticket panels.", 
        ephemeral: true 
      });
    }
    
    return createTicketPanel(interaction);
  }

  if (interaction.commandName === 'list') {
    // Check if user has the role OR is the specific user with permission
    const hasPermission = 
      (interaction.member && interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) || 
      interaction.user.id === '987751357773672538' || // User JustRuben ID
      interaction.user.id === LIST_COMMAND_ROLE; // In case the ID is directly used
      
    if (!hasPermission) {
      console.log(`[LIST] Permission denied for user ${interaction.user.tag} (${interaction.user.id})`);
      return interaction.reply({ content: "You don't have permission to use this.", ephemeral: true });
    }
    console.log(`[LIST] Command used by ${interaction.user.tag} (${interaction.user.id})`);

    const pingChoice = interaction.options.getString('ping');
    const text = interaction.options.getString('text');
    const price = interaction.options.getString('price');
    const trophies = interaction.options.getString('trophies');
    const p11 = interaction.options.getString('p11');
    const tierMax = interaction.options.getString('tier_max');
    const rareSkins = interaction.options.getString('rare_skins');
    const superRareSkins = interaction.options.getString('super_rare_skins');
    const epicSkins = interaction.options.getString('epic_skins');
    const mythicSkins = interaction.options.getString('mythic_skins');
    const legendarySkins = interaction.options.getString('legendary_skins');
    const titles = interaction.options.getString('titles');
    const hypercharges = interaction.options.getString('hypercharges');
    const power10s = interaction.options.getString('power_10s');
    const power9s = interaction.options.getString('power_9s');
    const oldRankedRank = interaction.options.getString('old_ranked_rank');
    const newRankedRank = interaction.options.getString('new_ranked_rank');
    const image = interaction.options.getAttachment('image')?.url;
    const image2 = interaction.options.getAttachment('image2')?.url;

    console.log('[LIST] All options received successfully');

    let mention = '**New 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 added!**';
    if (pingChoice === 'everyone') mention = '**||@everyone|| New 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 added!**';
    if (pingChoice === 'here') mention = '**||@here|| New 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 added!**';

    const embed = new EmbedBuilder()
      .setTitle('New 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 Added! <:winmatcherino:1298703851934711848>')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: '<:Information:1370838179334066217> Description', value: text },
        { name: '<:Money:1351665747641766022> Price', value: price, inline: true },
        { name: '<:gold_trophy:1351658932434768025> Trophies', value: trophies, inline: true },
        { name: '<:P11:1351683038127591529> P11', value: p11, inline: true },
        { name: '<:tiermax:1392588776957542530> Tier Max', value: tierMax, inline: true }
      );
    if (image) embed.setImage(image);

    // Create the more info embed data
    const moreInfoData = {
      rareSkins,
      superRareSkins,
      epicSkins,
      mythicSkins,
      legendarySkins,
      titles,
      hypercharges,
      power10s,
      power9s,
      oldRankedRank,
      newRankedRank,
      image2
    };

    console.log('[LIST] Created embeds and stored more info data');

    await interaction.reply({ content: 'Listing posted!', ephemeral: true });

    // Create our buttons with proper IDs from the start
    // We'll use a temporary variable to store our components
    const actionRow = new ActionRowBuilder();

    // Create the message first so we have the ID
    const msg = await interaction.channel.send({
      content: mention,
      embeds: [embed]
      // Don't add components yet, we'll add them after we have the message ID
    });

    console.log(`[LIST] Message sent with ID: ${msg.id}`);

    // Store the more info data
    ephemeralFlowState.set(msg.id, moreInfoData);
    console.log(`[LIST] More info data stored for message ${msg.id}`);

    // Save listing to database
    try {
      const db = require('./database');
      await db.waitUntilConnected().catch(() => {});
      
      if (db.isConnected) {
        await db.query(`
          INSERT INTO account_listings (
            message_id, channel_id, seller_id, status, price, description, trophies, p11, tier_max,
            rare_skins, super_rare_skins, epic_skins, mythic_skins, legendary_skins, titles, 
            hypercharges, power_10s, power_9s, old_ranked_rank, new_ranked_rank, 
            main_image, secondary_image, ping_choice
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        `, [
          msg.id, interaction.channel.id, interaction.user.id, 'available',
          price, text, trophies, p11, tierMax,
          rareSkins, superRareSkins, epicSkins, mythicSkins, legendarySkins, titles,
          hypercharges, power10s, power9s, oldRankedRank, newRankedRank,
          image, image2, pingChoice
        ]);
        
        console.log(`[LIST] Saved listing ${msg.id} to database`);
      }
    } catch (dbError) {
      console.error('[LIST] Failed to save listing to database:', dbError);
    }

    // Now create the buttons with the proper IDs
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`purchase_account_${msg.id}`)
        .setLabel('Purchase Profile')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`more_info_${msg.id}`)
        .setLabel('More Information')
        .setEmoji('<:Info:1391899181488279685>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`listing_mark_sold_${msg.id}`)
        .setLabel('Mark as Sold')
        .setEmoji('<:cross:1351689463453061130>')
        .setStyle(ButtonStyle.Danger)
    );

    // Update the message with the components
    await msg.edit({ components: [actionRow] });
    console.log('[LIST] Message updated with components');
  }

  // ======== Admin-only balance commands ========
  if (interaction.commandName === 'addbalance' || interaction.commandName === 'removebalance') {
    const ADMIN_IDS = ['987751357773672538', '986164993080836096'];
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      console.warn(`[BALANCE_CMD] Unauthorized attempt by ${interaction.user.id} to use ${interaction.commandName}`);
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true }).catch(()=>{}); // Ensure we respond within 3s

    const targetUser = interaction.options.getUser('user', true);
    const amountRaw = interaction.options.getNumber('amount', true);
    const amount = parseFloat(amountRaw);

    if (isNaN(amount) || amount <= 0) {
      return interaction.editReply({ content: 'Invalid amount specified.' });
    }

    const db = require('./database');
    try {
      await db.waitUntilConnected();
    } catch {
      return interaction.editReply({ content: 'Database not connected.' });
    }

    const delta = interaction.commandName === 'addbalance' ? amount : -amount;
    try {
      const res = await db.query('UPDATE affiliate_links SET balance = balance + $2 WHERE user_id=$1 RETURNING balance', [targetUser.id, delta]);
      if (res.rowCount === 0) {
        console.warn(`[BALANCE_CMD] No affiliate record for ${targetUser.id}`);
        return interaction.editReply({ content: 'Target user does not have an affiliate link record.' });
      }
      const newBal = parseFloat(res.rows[0].balance).toFixed(2);
      console.log(`[BALANCE_CMD] ${interaction.user.id} ${interaction.commandName} €${amount} to ${targetUser.id}. New balance: ${newBal}`);
      await interaction.editReply({ content: `Updated balance for <@${targetUser.id}>. New balance: €${newBal}` });
    } catch (err) {
      console.error('[BALANCE_CMD] DB Error:', err);
      await interaction.editReply({ content: 'Failed to update balance.' });
    }
    return;
  }
}

// Handle message commands
async function handleMessageCommands(message) {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'move') {
    // Check permissions
    if (!hasAnyRole(message.member, STAFF_ROLES)) {
      return message.reply("You don't have permission to use this command.");
    }

    if (!args[0] || !MOVE_CATEGORIES[args[0]]) {
      return message.reply("Please specify a valid category: paid, add, sell, or finished");
    }

    // Get the target category
    const target = MOVE_CATEGORIES[args[0]];
    if (!target) {
      return message.reply("Invalid category specified.");
    }
    try {
      await message.channel.setParent(target);
      await message.reply(`Moved to ${args[0]}`);
    } catch {
      message.reply('Could not move channel.');
    }
  }

  if (cmd === 'adds') {
    if (!message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return message.reply("No permission!");
    }
    const embed1 = new EmbedBuilder()
      .setTitle('115k Trophies & 71 R35 Add')
      .setColor(EMBED_COLOR)
      .setDescription('**Requires 3 invites!**\nAdd a 115k trophy & R35 player.')
      .setImage('https://media.discordapp.net/.../IMG_2580.png');
    const embed2 = new EmbedBuilder()
      .setTitle('Matcherino Winner Add')
      .setColor(EMBED_COLOR)
      .setDescription('**Requires 5 invites!**\nAdd a Matcherino Winner.')
      .setImage('https://media.discordapp.net/.../IMG_2581.png');
    await message.channel.send({ embeds: [embed1, embed2] });
    const action = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_add_115k').setLabel('Add 115k').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_add_matcherino_winner').setLabel('Add Matcherino Winner').setEmoji('<:pro:1351687685328208003>').setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [new EmbedBuilder().setDescription('Claim with buttons below.')], components: [action] });
  }

  if (cmd === 'friendlist') {
    if (!message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return message.reply("No permission!");
    }
    const left = '🥈 LUX | Zoro - €10\n🥈 Lennox - €15\n🥈 Melih - €15\n🥈 Elox - €15';
    const right = '🥈 Kazu - €15\n🥇 Izana - €25\n🥇 SKC | Rafiki - €25\n🥇 HMB | BosS - €60';
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .addFields(
        { name: '\u200b', value: left, inline: true },
        { name: '\u200b', value: right, inline: true }
      );
    const actions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('friendlist_buyadd').setLabel('Buy Add').setEmoji('<:Shopping_Cart:1351686041559367752>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('friendlist_playerinfo').setLabel('Player Information').setStyle(ButtonStyle.Primary)
    );
    await message.channel.send({ embeds: [embed, new EmbedBuilder().setDescription('# ⬆️ ALL ADDS ARE LIFETIME')], components: [actions] });
  }
}

// Button handler for list command interactions
async function handleListButtons(interaction) {
  if (processedButtonIds.has(interaction.id)) return;
  processedButtonIds.add(interaction.id);
  setTimeout(()=>processedButtonIds.delete(interaction.id),5000);

  const { customId } = interaction;
  console.log(`[BUTTON_HANDLER] Received button interaction with customId: ${customId} from user ${interaction.user.id}`);

  // Extract message ID from custom ID
  const messageId = customId.split('_').pop();
  
  try {
    if (customId.startsWith('more_info_')) {
      // Check if already replied/deferred to prevent double acknowledgment
      if (interaction.replied || interaction.deferred) {
        console.log(`[MORE_INFO] Interaction already handled for ${customId}`);
        return;
      }

      try {
        // Try to get listing from database first
        const db = require('./database');
        const result = await db.query('SELECT * FROM account_listings WHERE message_id = $1', [messageId]);
        
        if (result.rows.length > 0) {
          const listing = result.rows[0];
          console.log(`[MORE_INFO] Retrieved listing details from database for ${messageId}`);
          
          // Create the detailed info embed using database data - ONLY detailed fields, NOT basic ones
          const detailedEmbed = new EmbedBuilder()
            .setTitle('𝐩𝐫𝐨𝐟𝐢𝐥𝐞 Details')
            .setColor(EMBED_COLOR)
            .addFields(
              { name: '<:rare:1351963849322004521> Rare Skins', value: listing.rare_skins || 'N/A', inline: false },
              { name: '<:super_rare:1351963921967218839> Super Rare Skins', value: listing.super_rare_skins || 'N/A', inline: false },
              { name: '<:epic:1351963993442353365> Epic Skins', value: listing.epic_skins || 'N/A', inline: false },
              { name: '<:mythic:1351964047179907235> Mythic Skins', value: listing.mythic_skins || 'N/A', inline: false },
              { name: '<:legendary:1351964089454428261> Legendary Skins', value: listing.legendary_skins || 'N/A', inline: false },
              { name: '<:brawler:1351965712582705152> Titles', value: listing.titles || 'N/A', inline: false },
              { name: '<:hypercharge:1351963655234650143> Hypercharges', value: listing.hypercharges || 'N/A', inline: false },
              { name: '<:p10:1351981538740404355> Power 10s', value: listing.power_10s || 'N/A', inline: false },
              { name: '<:power_9:1351963484207841331> Power 9s', value: listing.power_9s || 'N/A', inline: false },
              { name: '<:Masters:1293283897618075728> Old Ranked Rank', value: listing.old_ranked_rank || 'N/A', inline: false },
              { name: '<:pro:1351687685328208003> New Ranked Rank', value: listing.new_ranked_rank || 'N/A', inline: false }
            );

          // Add secondary image if available
          if (listing.secondary_image) {
            detailedEmbed.setImage(listing.secondary_image);
          }

          await interaction.deferReply({ephemeral:true});
          await interaction.editReply({ embeds: [detailedEmbed], ephemeral: true });
      } else {
          // Fallback to ephemeral data if database doesn't have it
          const moreInfoData = ephemeralFlowState.get(messageId);
          if (moreInfoData) {
            console.log(`[MORE_INFO] Using ephemeral data for ${messageId}`);
        const detailedEmbed = new EmbedBuilder()
              .setTitle('𝐩𝐫𝐨𝐟𝐢𝐥𝐞 Details')
          .setColor(EMBED_COLOR)
          .addFields(
                { name: '<:rare:1351963849322004521> Rare Skins', value: moreInfoData.rareSkins || 'N/A', inline: false },
                { name: '<:super_rare:1351963921967218839> Super Rare Skins', value: moreInfoData.superRareSkins || 'N/A', inline: false },
                { name: '<:epic:1351963993442353365> Epic Skins', value: moreInfoData.epicSkins || 'N/A', inline: false },
                { name: '<:mythic:1351964047179907235> Mythic Skins', value: moreInfoData.mythicSkins || 'N/A', inline: false },
                { name: '<:legendary:1351964089454428261> Legendary Skins', value: moreInfoData.legendarySkins || 'N/A', inline: false },
                { name: '<:brawler:1351965712582705152> Titles', value: moreInfoData.titles || 'N/A', inline: false },
                { name: '<:hypercharge:1351963655234650143> Hypercharges', value: moreInfoData.hypercharges || 'N/A', inline: false },
                { name: '<:p10:1351981538740404355> Power 10s', value: moreInfoData.power10s || 'N/A', inline: false },
                { name: '<:power_9:1351963484207841331> Power 9s', value: moreInfoData.power9s || 'N/A', inline: false },
                { name: '<:Masters:1293283897618075728> Old Ranked Rank', value: moreInfoData.oldRankedRank || 'N/A', inline: false },
                { name: '<:pro:1351687685328208003> New Ranked Rank', value: moreInfoData.newRankedRank || 'N/A', inline: false }
              );

            // Add secondary image if available
            if (moreInfoData.image2) {
              detailedEmbed.setImage(moreInfoData.image2);
            }

            await interaction.deferReply({ephemeral:true});
            await interaction.editReply({ embeds: [detailedEmbed], ephemeral: true });
          } else {
        await interaction.reply({ 
              content: "We couldn't retrieve the 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 details. Please ask staff for more information.", 
          ephemeral: true 
            });
          }
        }
      } catch (dbError) {
        console.error(`[MORE_INFO] Database error:`, dbError);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: "We couldn't retrieve the 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 details. Please ask staff for more information.", 
            ephemeral: true 
          });
        }
      }

    } else if (customId.startsWith('purchase_account_')) {
      // Check if already replied/deferred to prevent double acknowledgment
      if (interaction.replied || interaction.deferred) {
        console.log(`[PURCHASE_PROFILE] Interaction already handled for ${customId}`);
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      
      // Get listing data from database
      const db = require('./database');
      const result = await db.query('SELECT * FROM account_listings WHERE message_id = $1', [messageId]);
      
      if (result.rows.length === 0) {
        await interaction.followUp({ 
          content: "This listing is no longer available or cannot be found.", 
        ephemeral: true 
      });
        return;
      }

      const listing = result.rows[0];
      // Start new payment selection flow before ticket creation
      const { sendPaymentMethodEmbed } = require('./src/handlers/profilePurchasePayment');
      await sendPaymentMethodEmbed(interaction, listing);
      return;

    } else if (customId.startsWith('listing_mark_sold_')) {
      // Check if already replied/deferred to prevent double acknowledgment
      if (interaction.replied || interaction.deferred) {
        console.log(`[MARK_SOLD] Interaction already handled for ${customId}`);
        return;
      }

      // FIXED: Authorization check - allow specific user ID 987751357773672538
      const authorizedUsers = ['987751357773672538']; // Your user ID
      const authorizedRoles = STAFF_ROLES;
      
      const userHasRole = interaction.member.roles.cache.some(role => authorizedRoles.includes(role.id));
      const userIsAuthorized = authorizedUsers.includes(interaction.user.id);
      
      if (!userHasRole && !userIsAuthorized) {
        await interaction.reply({
          content: 'Only authorized users can mark listings as sold.',
        ephemeral: true 
      });
        return;
      }

      try {
        // Update database
        const db = require('./database');
        await db.query(
          'UPDATE account_listings SET status = $1 WHERE message_id = $2',
          ['sold', messageId]
        );
        
        console.log(`[MARK_SOLD] Updated listing ${messageId} status to sold by ${interaction.user.id}`);

        // Update the original message: keep embed the same, replace buttons with a disabled red button
        const originalMessage = interaction.message;
        const soldRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sold_notice')
            .setLabel('This account has been sold.')
            .setEmoji('<:moneyy:1391899345208606772>')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
      
        await originalMessage.edit({
          components: [soldRow]
        });
      
      await interaction.reply({ 
          content: 'This listing has been marked as sold.',
        ephemeral: true 
      });

      } catch (dbError) {
        console.error(`[MARK_SOLD] Database error:`, dbError);
        if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
            content: 'Failed to mark listing as sold. Please try again.',
        ephemeral: true 
      });
        }
      }
    }

  } catch (error) {
    console.error(`Error handling more info button:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing this action.',
        ephemeral: true
      }).catch(console.error);
    }
  }
}

// Set up and export the commands
const commands = [
  listCommand.toJSON(),
  ticketPanelCommand.toJSON(),
  reviewCommand.toJSON(),
  invitesCommand.data.toJSON(),
  inviteLeaderboardCommand.data.toJSON(),
  inviteAdminCommand.data.toJSON()
];

// Initialize the bot
function initializeBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.once('ready', () => {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);
  });

  // Set up all event handlers
  client.on('interactionCreate', handleSlashCommands);
  client.on('messageCreate', handleMessageCommands);
  // REMOVED: client.on('interactionCreate', handleListButtons); // This causes double handling!
  
  // Register slash commands with Discord
  client.on('ready', async () => {
    try {
      console.log('Started refreshing application (/) commands.');
      await client.application.commands.set(commands);
      console.log('Successfully registered application commands.');
    } catch (error) {
      console.error('Error registering slash commands:', error);
    }
  });

  // Login to Discord with token from Replit secrets
  const token = process.env.TOKEN;
  if (!token) {
    console.error('Missing TOKEN environment variable. Make sure to set it in your Replit secrets.');
    process.exit(1);
  }
  
  client.login(token);
}

// Export everything needed
module.exports = {
  commands: exportedCommands,
  handleCommand: handleSlashCommands,
  handleListButtons,
  handleMessageCommands
}; 