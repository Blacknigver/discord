// review.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const MOD_CHANNEL_ID = '1368186200741118042';      // where reviews go for accept/deny
const PUBLIC_CHANNEL_ID = '1293288484487954512'; // where accepted reviews are posted
const LOGO_URL = 'https://cdn.discordapp.com/attachments/987753155360079903/1368299826688561212/Untitled70_20250208222905.jpg?ex=6817b804&is=68166684&hm=8fc340221f0b55e17444b6c2ced93e32541ecf95b258509a0ddc9c66667772bd&';

const reviewState = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Submit a new review')
    .addUserOption(opt =>
      opt.setName('user')
         .setDescription('Who are you reviewing?')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('description')
         .setDescription('Describe your experience')
         .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('rating')
         .setDescription('Rating out of 5')
         .setRequired(true)
         .addChoices(
           { name: '1', value: 1 },
           { name: '2', value: 2 },
           { name: '3', value: 3 },
           { name: '4', value: 4 },
           { name: '5', value: 5 }
         )
    )
    .addBooleanOption(opt =>
      opt.setName('anonymous')
         .setDescription('Post anonymously?')
         .setRequired(false)
    ),

  async execute(interaction) {
    const subject = interaction.options.getUser('user', true);
    const description = interaction.options.getString('description', true);
    const rating = interaction.options.getInteger('rating', true);
    const anonymous = interaction.options.getBoolean('anonymous') || false;

    // Build timestamp footer
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((now - now) / msPerDay); // always zero
    const use12h = interaction.locale === 'en-US';
    const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: use12h };
    const timeStr = new Intl.DateTimeFormat(interaction.locale, timeOpts).format(now);
    let footerTime;
    footerTime = `Today at ${timeStr}`; // since always now

    // Prepare embed
    const embed = new EmbedBuilder()
      .setDescription('# New review' + (anonymous ? '' : ` by ${interaction.user.tag}`))
      .addFields(
        { name: '**Reviewing For:**', value: `> ${subject}`, inline: false },
        { name: '**Experience:**',     value: `> ${description}`, inline: false },
        { name: '**Rating:**',         value: `> ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`, inline: false }
      )
      .setFooter({ text: `Brawl Shop - ${footerTime}`, iconURL: LOGO_URL });

    if (!anonymous) {
      embed.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 128 }));
    }

    // Send to moderation channel with buttons
    const modChannel = await interaction.client.channels.fetch(MOD_CHANNEL_ID);
    if (!modChannel?.isText()) {
      return interaction.reply({ content: '❌ Moderation channel not found.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('review_accept')
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('review_deny')
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    const modMsg = await modChannel.send({ embeds: [embed], components: [row] });
    // Store state for this message
    reviewState.set(modMsg.id, {
      subjectTag: subject.tag,
      description,
      rating,
      reviewerTag: anonymous ? null : interaction.user.tag,
      reviewerAvatar: anonymous ? null : interaction.user.displayAvatarURL({ dynamic: true, size: 128 }),
      timestamp: now,
      footerTime,
      anonymous
    });

    await interaction.reply({ content: '✅ Your review has been submitted for approval.', ephemeral: true });
  },

  // button handler
  async handleButton(interaction) {
    if (!interaction.isButton()) return;
    const { customId, message, user: moderator } = interaction;
    const state = reviewState.get(message.id);
    if (!state) {
      return interaction.reply({ content: '⚠️ Review state not found.', ephemeral: true });
    }

    // Disable buttons
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('review_accept')
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('review_deny')
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );
    await message.edit({ components: [disabledRow] });

    if (customId === 'review_accept') {
      // Publish to public channel
      const publicChannel = await interaction.client.channels.fetch(PUBLIC_CHANNEL_ID);
      if (!publicChannel?.isText()) {
        await interaction.reply({ content: '❌ Public reviews channel not found.', ephemeral: true });
        return;
      }

      const publishEmbed = new EmbedBuilder()
        .setDescription('# New review' + (state.anonymous ? '' : ` by ${state.reviewerTag}`))
        .addFields(
          { name: '**Reviewing For:**', value: `> ${state.subjectTag}`, inline: false },
          { name: '**Experience:**',     value: `> ${state.description}`, inline: false },
          { name: '**Rating:**',         value: `> ${'★'.repeat(state.rating)}${'☆'.repeat(5 - state.rating)}`, inline: false }
        )
        .setFooter({ text: `Brawl Shop - ${state.footerTime}`, iconURL: LOGO_URL });
      if (!state.anonymous) {
        publishEmbed.setThumbnail(state.reviewerAvatar);
      }
      await publicChannel.send({ embeds: [publishEmbed] });
      await interaction.reply({ content: '✅ Review accepted and published.', ephemeral: true });

    } else if (customId === 'review_deny') {
      await interaction.reply({ content: '❌ Review denied.', ephemeral: true });
    }

    // Clean up
    reviewState.delete(message.id);
  }
};
