// review.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const MOD_CHANNEL_ID       = '1368186200741118042';
const PUBLIC_CHANNEL_ID    = '1293288484487954512';
const ORDER_NOW_URL        = 'https://discord.com/channels/1292895164595175444/1292896201859141722';
// replace with your actual logo URL
const LOGO_URL             = 'https://your.cdn.com/path/to/brawlshop-logo.png';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Submit a review for Brawl Shop.')
    .addStringOption(opt =>
      opt
        .setName('reviewingfor')
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
          { name: '⭐️⭐️⭐️⭐️',     value: '⭐️⭐️⭐️⭐️'     },
          { name: '⭐️⭐️⭐️',       value: '⭐️⭐️⭐️'       },
          { name: '⭐️⭐️',         value: '⭐️⭐️'         },
          { name: '⭐️',           value: '⭐️'           }
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
          { name: 'Don’t',           value: 'named'     }
        )
    ),

  /**
   * Called when a user runs /review
   */
  async execute(interaction) {
    // give yourself time to build the embed
    await interaction.deferReply({ ephemeral: true });

    const reviewingFor = interaction.options.getString('reviewingfor');
    const rating       = interaction.options.getString('rating');
    const desc         = interaction.options.getString('description');
    const image        = interaction.options.getAttachment('image');
    const anon         = interaction.options.getString('anonymous') === 'anonymous';

    // build our review embed
    const embed = new EmbedBuilder()
      .setTitle('# New Review!')
      .setColor('#E68DF2')
      .addFields(
        { name: 'Reviewing For:', value: reviewingFor, inline: false },
        { name: 'Experience:',     value: desc,         inline: false },
        { name: 'Rating:',         value: rating,       inline: false }
      )
      .setFooter({
        text: `Brawl Shop – ${new Date().toLocaleString()}`,
        iconURL: LOGO_URL
      });

    if (image) {
      embed.setImage(image.url);
    }

    if (anon) {
      embed.setAuthor({ name: 'New Anonymous Review' });
    } else {
      embed.setAuthor({
        name: `New Review By ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL()
      });
    }

    // Accept / Deny buttons for mods
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`review_accept_${interaction.id}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`review_deny_${interaction.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    // send to moderation channel
    const modChan = await interaction.client.channels.fetch(MOD_CHANNEL_ID);
    await modChan.send({ embeds: [embed], components: [buttons] });

    // let user know it's pending
    await interaction.editReply({
      content: '✅ Your review has been submitted and is awaiting approval.',
    });
  },

  /**
   * Call this from your main interactionCreate handler
   * whenever a button is clicked.
   */
  async handleButton(interaction) {
    if (!interaction.isButton()) return;
    const [ , action, origId ] = interaction.customId.split('_');
    const msg = interaction.message;

    if (action === 'deny') {
      // switch to a single disabled red button
      const denied = new ButtonBuilder()
        .setCustomId('denied')
        .setLabel('This Review Has Been Denied.')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);

      await msg.edit({ components: [ new ActionRowBuilder().addComponents(denied) ] });
      return interaction.reply({ content: '❌ Review denied.', ephemeral: true });
    }

    if (action === 'accept') {
      // publish to your public reviews channel
      const approvedEmbed = msg.embeds[0];
      const orderNow = new ButtonBuilder()
        .setLabel('Order Now')
        .setStyle(ButtonStyle.Link)
        .setURL(ORDER_NOW_URL);

      const pubChan = await interaction.client.channels.fetch(PUBLIC_CHANNEL_ID);
      await pubChan.send({ embeds: [approvedEmbed], components: [ new ActionRowBuilder().addComponents(orderNow) ] });

      // mark original as accepted
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

      await msg.edit({ components: [ new ActionRowBuilder().addComponents(accBtn, denBtn) ] });
      return interaction.reply({ content: '✅ Review accepted & published.', ephemeral: true });
    }
  }
};
