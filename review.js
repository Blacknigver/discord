// review.js
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  time,
} = require('discord.js');

const MOD_CHANNEL_ID    = '1368186200741118042';
const REVIEW_CHANNEL_ID = '1293288484487954512';
const EMBED_COLOR       = '#E68DF2';
const LOGO_URL          = 'https://cdn.discordapp.com/attachments/987753155360079903/1368299826688561212/Untitled70_20250208222905.jpg?ex=6817b804&is=68166684&hm=8fc340221f0b55e17444b6c2ced93e32541ecf95b258509a0ddc9c66667772bd';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Submit a review')
    .addBooleanOption(opt =>
      opt
        .setName('anonymous')
        .setDescription('Post anonymously?')
        .setRequired(false)
    ),

  // 1) Slash command opens the modal
  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId(`review_modal:${interaction.options.getBoolean('anonymous') ?? false}`)
      .setTitle('Submit a Review');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reviewingFor')
          .setLabel('What are you reviewing for? Ex: Boost, Account, etc')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('experience')
          .setLabel('Experience')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('rating')
          .setLabel('Rating (1–5)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter a number 1 through 5')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('imageUrl')
          .setLabel('Image URL (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
    await interaction.showModal(modal);
  },

  // 2) Handle the modal submit
  async handleModal(interaction) {
    const [_, anonFlag] = interaction.customId.split(':');
    const anonymous = anonFlag === 'true';

    const reviewingFor = interaction.fields.getTextInputValue('reviewingFor').trim();
    const experience   = interaction.fields.getTextInputValue('experience').trim();
    const ratingInput  = interaction.fields.getTextInputValue('rating').trim();
    const imageUrl     = interaction.fields.getTextInputValue('imageUrl').trim();

    // Map numeric rating to your star patterns:
    const starsMap = {
      '1': '⭐️⭐️⭐️⭐️⭐️',
      '2': '⭐️⭐️⭐️⭐️',
      '3': '⭐️⭐️⭐️',
      '4': '⭐️⭐️',
      '5': '⭐️',
    };
    const ratingStars = starsMap[ratingInput] || '⭐️';

    // Build the embed
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription('# New Review')                 // big heading
      .setThumbnail(interaction.user.displayAvatarURL())  // top-right
      .addFields(
        { name: '**Reviewing For:**', value: `> ${reviewingFor}` },
        { name: '**Experience:**',    value: `> ${experience}`  },
        { name: '**Rating:**',        value: `> ${ratingStars}`   }
      )
      .setFooter({
        text: `Brawl Shop – ${time(interaction.createdAt, 'R')}`,
        iconURL: LOGO_URL
      });

    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    // Buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`review_accept`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`review_deny`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    // Send to moderation channel
    const modCh = interaction.client.channels.cache.get(MOD_CHANNEL_ID);
    await modCh.send({ embeds: [embed], components: [row] });

    // Acknowledge to user
    await interaction.reply({
      content: '✅ Your review has been submitted for moderation.',
      ephemeral: true
    });
  },

  // 3) Handle button clicks
  async handleButton(interaction) {
    const modCh = interaction.client.channels.cache.get(MOD_CHANNEL_ID);
    const revCh = interaction.client.channels.cache.get(REVIEW_CHANNEL_ID);

    // Disable the buttons in mod channel and take action:
    const disabledRow = new ActionRowBuilder().addComponents(
      interaction.message.components[0].components.map(btn =>
        ButtonBuilder.from(btn).setDisabled(true)
      )
    );

    if (interaction.customId === 'review_accept') {
      // repost the same embed into the review channel
      await revCh.send({ embeds: interaction.message.embeds });
      await interaction.update({ content: '✅ Accepted & posted!', embeds: interaction.message.embeds, components: [disabledRow] });
    } else if (interaction.customId === 'review_deny') {
      // DM the user
      // Extract original author from embed footer/icon? We can DM via modal reply ID, but simplest: “we cannot DM.” 
      // Instead just update mod message:
      await interaction.update({ content: '❌ Denied.', embeds: interaction.message.embeds, components: [disabledRow] });
    }
  }
};
