const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { 
    LIST_COMMAND_ROLE,
    STAFF_ROLES,
    MOVE_CATEGORIES,
    EMBED_COLOR,
    TICKET_PANEL_ALLOWED_USERS
} = require('../config.js'); // Adjusted path
const { hasAnyRole } = require('../utils.js'); // Adjusted path

const messageCommands = {
  oldticketpanel: async (message) => {
    if (!TICKET_PANEL_ALLOWED_USERS || !Array.isArray(TICKET_PANEL_ALLOWED_USERS) || !TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply("You don't have permission!");
    }
    const embed = new EmbedBuilder()
      .setColor('#e68df2')
      .setTitle('Order a Boost')
      .setDescription('Get Boosted to your Dream Rank/Tier now!\n\nThe bot will automatically calculate the price of the boost if you select what type of boost you want.\n\nSelect the type of boost you want below.\n')
      .setFooter({
        text: 'Brawl Shop',
        iconURL: 'https://media.discordapp.net/attachments/987753155360079903/1370862482717147247/Untitled70_20250208222905.jpg?ex=68210aad&is=681fb92d&hm=c9f876a09be906de33276bf0155f65c369d6b557e4c2deeb33cfaa2355a3b24b&=&format=webp'
      });
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_mastery').setLabel('Mastery').setEmoji('<:mastery:1351659726991134832>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [embed], components: [row1, row2] });
    await message.reply('Ticket panel created!');
  },

  move: async (message, args) => {
    if (!hasAnyRole(message.member, STAFF_ROLES)) {
      return message.reply("No permission!");
    }
    const target = MOVE_CATEGORIES[args[0]];
    if (!target) {
      return message.reply('Usage: ?move [paid|add|sell|finished]');
    }
    try {
      await message.channel.setParent(target);
      await message.reply(`Moved to ${args[0]}`);
    } catch {
      message.reply('Could not move channel.');
    }
  },

  adds: async (message) => {
    if (!message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return message.reply("No permission!");
    }
    const embed1 = new EmbedBuilder()
      .setTitle('115k Trophies & 71 R35 Add')
      .setColor(EMBED_COLOR)
      .setDescription('**Requires 3 invites!**\nAdd a 115k trophy & R35 player.\n')
      .setImage('https://media.discordapp.net/.../IMG_2580.png');
    const embed2 = new EmbedBuilder()
      .setTitle('Matcherino Winner Add')
      .setColor(EMBED_COLOR)
      .setDescription('**Requires 5 invites!**\nAdd a Matcherino Winner.\n')
      .setImage('https://media.discordapp.net/.../IMG_2581.png');
    await message.channel.send({ embeds: [embed1, embed2] });
    const action = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_add_115k').setLabel('Add 115k').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_add_matcherino_winner').setLabel('Add Matcherino Winner').setEmoji('<:pro:1351687685328208003>').setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [new EmbedBuilder().setDescription('Claim with buttons below.')], components: [action] });
  },

  friendlist: async (message) => {
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
  },

  ticketpanel: async (message) => {
    if (!TICKET_PANEL_ALLOWED_USERS || !Array.isArray(TICKET_PANEL_ALLOWED_USERS) || !TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply("You don't have permission!");
    }

    try {
      console.log('DEBUG: Starting ticketpanel command');
      
      const { MessageFlags, AttachmentBuilder } = require('discord.js');
      const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder } = require('@discordjs/builders');
      
      console.log('DEBUG: Discord.js imports successful');
      
      // Test what spacing values are actually accepted
      console.log('DEBUG: Testing spacing values...');
      
      try {
        const testSep1 = new SeparatorBuilder();
        testSep1.setSpacing(1); // Small
        console.log('DEBUG: ✅ Numeric spacing 1 (Small) accepted');
      } catch (err) {
        console.log('DEBUG: ❌ Numeric spacing 1 failed:', err.message);
      }
      
      try {
        const testSep2 = new SeparatorBuilder();
        testSep2.setSpacing(2); // Large
        console.log('DEBUG: ✅ Numeric spacing 2 (Large) accepted');
      } catch (err) {
        console.log('DEBUG: ❌ Numeric spacing 2 failed:', err.message);
      }
      
      console.log('DEBUG: Creating banner with new image URL...');

    // Create banner image using MediaGallery (for displaying images)
    const bannerGallery = new MediaGalleryBuilder()
      .addItems(
        mediaGalleryItem => mediaGalleryItem
          .setDescription('Brawl Shop Banner')
          .setURL('https://files.catbox.moe/u1wof6.webp')
      );

    // Main container with banner image
    const container = new ContainerBuilder()
      .setAccentColor(0x4a90e2)
      .addMediaGalleryComponents(bannerGallery)
      .addSeparatorComponents(sep =>
        sep.setDivider(true)
           .setSpacing(2) // Large spacing
      )
      .addTextDisplayComponents(txt =>
        txt.setContent('## Welcome to Brawl Shop\nBrawl Shop provides quick delivery Boosts, Account Sales, Carries, and more. We prioritize speed and fair pricing, all of our Boosting & Carry orders are handled by one of our experienced players from our top-tier team.')
      )
      .addSeparatorComponents(sep =>
        sep.setDivider(false)
           .setSpacing(1) // Small spacing - middle ground
      )
      .addSectionComponents(
        section => section
          .addTextDisplayComponents(txt =>
            txt.setContent('Start out by selecting the type of Boost or Carry you want by using\none of the buttons attached.')
          )
          .setButtonAccessory(
            button => button
              .setLabel('⭐ Our Reviews')
              .setStyle(ButtonStyle.Link)
              .setURL('https://discord.com/channels/1292895164595175444/1293288484487954512')
          )
      )
      .addSeparatorComponents(sep =>
        sep.setDivider(true)
           .setSpacing(2) // Large spacing
      )
      .addTextDisplayComponents(txt =>
        txt.setContent('• Purchasing an account? Check out the Accounts category instead.\n• Our prices are shown at <#1364565680371929220>, <#1364565488260223057> & <#1364565759698927636>.')
      );

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_mastery').setLabel('Mastery').setEmoji('<:mastery:1351659726991134832>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
    );

          console.log('DEBUG: Attempting to send Components V2 message...');
      
      try {
        await message.channel.send({
          components: [container, row1],
          flags: MessageFlags.IsComponentsV2
        });
        console.log('DEBUG: ✅ Components V2 message sent successfully!');
        await message.reply('Ticket panel created with Components V2!');
      } catch (err) {
        console.error('DEBUG: ❌ Components V2 failed:', err.message);
        console.error('DEBUG: Full error:', err);
        
        // Fallback to traditional embed if Components V2 fails
        console.log('DEBUG: Falling back to traditional embed...');
        const embed = new EmbedBuilder()
          .setImage('https://files.catbox.moe/u1wof6.webp')
          .setTitle('Welcome to Brawl Shop')
          .setColor('#4a90e2')
          .setDescription(
            'Brawl Shop provides quick delivery Boosts, Account Sales, Carries, and more. We prioritize speed and fair pricing, all of our Boosting & Carry orders are handled by one of the members of our top-tier team. Our team is made up of experienced players who will deliver you with fast and reliable results.\n\n' +
            'Start out by selecting the type of Boost or Carry you want by using one of the buttons attached.\n\n' +
            '───────────────────────────────────────────────────────\n\n' +
            '• Purchasing an account? Check out the Accounts category instead.\n' +
            '• Our prices are shown at <#1364565680371929220>, <#1364565488260223057> & <#1364565759698927636>.'
          );

        const reviewsRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('⭐ Our Reviews')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.com/channels/1292895164595175444/1293288484487954512')
        );

        await message.channel.send({ embeds: [embed], components: [reviewsRow, row1] });
        await message.reply('Ticket panel created (fallback mode)');
      }
    } catch (outerErr) {
      console.error('DEBUG: ❌ Complete ticketpanel failure:', outerErr.message);
      console.error('DEBUG: Full outer error:', outerErr);
      await message.reply('Failed to create ticket panel: ' + outerErr.message);
    }
  },

  affiliate: async (message) => {
    try {
      const { MessageFlags } = require('discord.js');
      const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('@discordjs/builders');

      // Main content container
      const container = new ContainerBuilder()
        .setAccentColor(0x4a90e2)
        // Header & intro
        .addTextDisplayComponents(txt =>
          txt.setContent('## Affiliate Program\nIn our Affiliate Program, you can get paid for inviting your friends and other people. Whenever the person you refer orders something, you will get a share of our profit.')
        )
        .addSeparatorComponents(sep =>
          sep.setDivider(true).setSpacing(2) // Large spacing with divider
        )
        // How it works
        .addTextDisplayComponents(txt => txt.setContent('## How it Works'))
        .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1)) // Small spacing
        .addTextDisplayComponents(txt =>
          txt.setContent('> **You earn 5% of the order value from the person you refer.**\n\nThis means that if you invite someone to the server, and they buy a €1000 account, **you earn €50!**\n\nYou will continue earning for a lifetime, so even on their 10th order you will continue to earn 5% of their order value.')
        )
        .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
        // Program rules
        .addTextDisplayComponents(txt => txt.setContent('**Program Rules:**\n> - This only applies to Acc0unts, Boosting and Carries. If we offer any sort of special promotion, this will not be included.\n> - The minimum withdrawal is €1.\n> - The people you refer must have an account age of atleast 30 days.\n> - Must use your own link, press the \`Create Link\` button to create one.'));

      // Buttons row
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('affiliate_info')
          .setLabel('Program Information')
          .setEmoji('<:Info:1391899181488279685>')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('affiliate_create_link')
          .setLabel('Create Link')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('affiliate_balance')
          .setLabel('View Balance')
          .setEmoji('<:moneyy:1391899345208606772>')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('affiliate_withdraw')
          .setLabel('Withdraw Earnings')
          .setEmoji('<:bank:1371863843789209691>')
          .setStyle(ButtonStyle.Success)
      );

      await message.channel.send({
        components: [container, row],
        flags: MessageFlags.IsComponentsV2
      });

      await message.reply('Affiliate panel created!');
    } catch (err) {
      console.error('[AFFILIATE_COMMAND] Error creating affiliate panel:', err);
      await message.reply('Failed to create affiliate panel: ' + err.message);
    }
  }
};

module.exports = messageCommands; 