// review.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const REVIEW_CHANNEL_ID = 'YOUR_VOUCH_CHANNEL_ID_HERE'; // ← replace with your channel ID

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Submit a new review')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Who are you reviewing?')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('description')
        .setDescription('Describe your experience')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('rating')
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
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    const reviewedUser = interaction.options.getUser('user', true);
    const experience = interaction.options.getString('description', true);
    const rating = interaction.options.getInteger('rating', true);

    // Compute footer text: "Today at HH:mm", "Yesterday at HH:mm", "N days ago at HH:mm" or date if older
    const now = new Date();
    const created = now; // as we post immediately
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((now - created) / msPerDay);
    const use12h = interaction.locale === 'en-US';
    const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: use12h };
    const timeStr = new Intl.DateTimeFormat(interaction.locale, timeOpts).format(created);

    let footerText;
    if (diffDays === 0) {
      footerText = `Today at ${timeStr}`;
    } else if (diffDays === 1) {
      footerText = `Yesterday at ${timeStr}`;
    } else if (diffDays < 7) {
      footerText = `${diffDays} days ago at ${timeStr}`;
    } else {
      // show full date for older than a week
      const dateOpts = { day: '2-digit', month: '2-digit', year: 'numeric' };
      const dateStr = new Intl.DateTimeFormat(interaction.locale, dateOpts).format(created);
      footerText = `${dateStr} at ${timeStr}`;
    }

    const channel = interaction.client.channels.cache.get(REVIEW_CHANNEL_ID);
    if (!channel) {
      return interaction.reply({ content: '❌ Review channel not found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setDescription('# New review by ' + interaction.user.tag)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        {
          name: '**Reviewing For:**',
          value: `> ${reviewedUser}`
        },
        {
          name: '**Experience:**',
          value: `> ${experience}`
        },
        {
          name: '**Rating:**',
          value: `> ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`
        }
      )
      .setFooter({ text: footerText });

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: '✅ Your review has been posted!', ephemeral: true });
  },
};
