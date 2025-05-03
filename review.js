// review.js
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

const MOD_CHANNEL_ID       = '1368186200741118042';
const PUBLISHED_CHANNEL_ID = '1293288484487954512';
const ORDER_NOW_URL        = 'https://discord.com/channels/1292895164595175444/1292896201859141722';
// Replace this with your actual Brawl Shop logo URL:
const LOGO_URL             = 'https://cdn.discordapp.com/attachments/987753155360079903/1368299826688561212/Untitled70_20250208222905.jpg?ex=6817b804&is=68166684&hm=8fc340221f0b55e17444b6c2ced93e32541ecf95b258509a0ddc9c66667772bd&';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Submit a review for Brawl Shop.')
    .addStringOption(opt =>
      opt
        .setName('reviewing_for')
        .setDescription('What are you reviewing for? Ex: Boost, Account, etc.')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('rating')
        .setDescription('Your rating for us, 1–5 stars.')
        .setRequired(true)
        .addChoices(
          { name: '⭐️⭐️⭐️⭐️⭐️', value: '⭐️⭐️⭐️⭐️⭐️' },
          { name: '⭐️⭐️⭐️⭐️',     value: '⭐️⭐️⭐️⭐️' },
          { name: '⭐️⭐️⭐️',       value: '⭐️⭐️⭐️' },
          { name: '⭐️⭐️',         value: '⭐️⭐️' },
          { name: '⭐️',           value: '⭐️' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('description')
        .setDescription('Description of your experience with us.')
        .setRequired(true)
    )
    .addAttachmentOption(opt =>
      opt
        .setName('image')
        .setDescription('Image as proof (optional).')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('anonymous')
        .setDescription('Stay Anonymous (optional).')
        .setRequired(false)
        .addChoices(
          { name: 'Stay Anonymous', value: 'anonymous' },
          { name: 'Don’t',           value: 'named' }
        )
    ),

  /**
   * Called when a user runs /review
   */
  async execute(interaction, EMBED_COLOR) {
    // defer reply so user sees a “thinking…” state
    await interaction.deferReply({ ephemeral: true });

    // gather inputs
    const reviewingFor = interaction.options.getString('reviewing_for');
    const rating       = interaction.options.getString('rating');
    const description  = interaction.options.getString('description');
    const image        = interaction.options.getAttachment('image');
    const anonymous    = interaction.options.getString('anonymous') === 'anonymous';

    // build the embed
    const embed = new EmbedBuilder()
      .setTitle('New Review!')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Reviewing For:', value: reviewingFor, inline: false },
        { name: 'Experience:',     value: description,  inline: false },
        { name: 'Rating:',         value: rating,       inline: false }
      );

    if (image) {
      embed.setImage(image.url);
    }

    if (anonymous) {
      embed.setAuthor({ name: 'New Anonymous Review' });
    } else {
      embed.setAuthor({
        name: `New Review By ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL()
      });
    }

    embed.setFooter({
      text: `Brawl Shop – ${new Date().toLocaleString()}`,
      iconURL: LOGO_URL
    });

    // buttons for moderators
    const modRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`review_accept_${interaction.id}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`review_deny_${interaction.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    // post to your moderator channel
    const modChannel = await interaction.client.channels.fetch(MOD_CHANNEL_ID);
    await modChannel.send({ embeds: [embed], components: [modRow] });

    // confirm to the user
    await interaction.editReply({
      content: '✅ Your review has been submitted for approval.',
    });
  },

  /**
   * Call this from your main button‐handler in index.js
   */
  async handleButton(interaction) {
    if (!interaction.isButton()) return;
    const [ , action, originalId ] = interaction.customId.split('_');
    const originalMsg = interaction.message;

    // Denied flow
    if (action === 'deny') {
      const deniedBtn = new ButtonBuilder()
        .setCustomId('denied')
        .setLabel('This Review Has Been Denied.')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);

      await originalMsg.edit({ components: [ new ActionRowBuilder().addComponents(deniedBtn) ] });
      return interaction.reply({ content: '❌ Review denied.', ephemeral: true });
    }

    // Accepted flow
    if (action === 'accept') {
      // post to the public reviews channel
      const approvedEmbed = originalMsg.embeds[0];
      const orderRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Order Now')
          .setStyle(ButtonStyle.Link)
          .setURL(ORDER_NOW_URL)
      );
      const pubChannel = await interaction.client.channels.fetch(PUBLISHED_CHANNEL_ID);
      await pubChannel.send({ embeds: [approvedEmbed], components: [orderRow] });

      // disable original buttons and mark as accepted
      const accBtn = new ButtonBuilder()
        .setCustomId('accepted')
        .setLabel('Accepted')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);
      const denBtn = new ButtonBuilder()
        .setCustomId('denied')
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);

      await originalMsg.edit({ components: [ new ActionRowBuilder().addComponents(accBtn, denBtn) ] });
      return interaction.reply({ content: '✅ Review accepted and published.', ephemeral: true });
    }
  }
};
