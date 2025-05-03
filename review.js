// review.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Submit a review')
    // 1) String: what are you reviewing?
    .addStringOption(opt =>
      opt
        .setName('item')
        .setDescription('What are you reviewing?')
        .setRequired(true)
    )
    // 2) Integer: your rating 1–5
    .addIntegerOption(opt =>
      opt
        .setName('rating')
        .setDescription('Your rating (1–5)')
        .setRequired(true)
    )
    // 3) String: your comments
    .addStringOption(opt =>
      opt
        .setName('comments')
        .setDescription('Your thoughts / feedback')
        .setRequired(true)
    )
    // 4) Boolean: post anonymously?
    .addBooleanOption(opt =>
      opt
        .setName('anonymous')
        .setDescription('Post anonymously?')
        .setRequired(false)
    )
    // 5) Attachment: optional screenshot
    .addAttachmentOption(opt =>
      opt
        .setName('screenshot')
        .setDescription('Attach a screenshot (optional)')
        .setRequired(false)
    ),

  /**
   * @param {import('discord.js').CommandInteraction} interaction
   * @param {string} embedColor  passed in from index.js (EMBED_COLOR)
   */
  async execute(interaction, embedColor) {
    const item       = interaction.options.getString('item');
    const rating     = interaction.options.getInteger('rating');
    const comments   = interaction.options.getString('comments');
    const anonymous  = interaction.options.getBoolean('anonymous');
    const screenshot = interaction.options.getAttachment('screenshot');

    // Title logic
    const title = anonymous
      ? 'New Anonymous Review'
      : `📝 New Review From ${interaction.user.tag}`;

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(embedColor)
      .addFields(
        { name: 'Item',     value: item,                 inline: true  },
        { name: 'Rating',   value: `${rating}`,          inline: true  },
        { name: 'Comments', value: comments,             inline: false }
      );

    // If user attached a screenshot, show it
    if (screenshot) {
      embed.setImage(screenshot.url);
    }

    // Post it
    await interaction.reply({ embeds: [embed] });
  }
};
