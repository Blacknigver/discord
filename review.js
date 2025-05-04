const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const MOD_CHANNEL_ID    = '1368186200741118042';
const REVIEW_CHANNEL_ID = '1293288484487954512';
const LOGO_URL          = 'https://cdn.discordapp.com/attachments/987753155360079903/1368299826688561212/Untitled70_20250208222905.jpg';

function formatPostTime(timestamp) {
  const date   = new Date(timestamp);
  const now    = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const todayMid  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const postMid   = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  let prefix;
  if      (postMid === todayMid)           prefix = 'Today';
  else if (postMid === todayMid - oneDay)  prefix = 'Yesterday';
  else                                     prefix = date.toLocaleDateString('en-GB');
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${prefix} at ${time}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Submit a review for moderation.'),

  // called when user issues /review
  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('reviewModal')
      .setTitle('Leave a Review');

    const forInput = new TextInputBuilder()
      .setCustomId('reviewingFor')
      .setLabel('Reviewing For')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Boost, Account, etc.')
      .setRequired(true);

    const expInput = new TextInputBuilder()
      .setCustomId('experience')
      .setLabel('Experience')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe your experience')
      .setRequired(true);

    const ratingInput = new TextInputBuilder()
      .setCustomId('rating')
      .setLabel('Rating')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('⭐️⭐️⭐️⭐️')
      .setRequired(true);

    const anonInput = new TextInputBuilder()
      .setCustomId('anonymous')
      .setLabel('Post anonymously?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('yes or no')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(forInput),
      new ActionRowBuilder().addComponents(expInput),
      new ActionRowBuilder().addComponents(ratingInput),
      new ActionRowBuilder().addComponents(anonInput)
    );

    await interaction.showModal(modal);
  },

  // call this on modal submit
  async handleModal(interaction) {
    if (interaction.customId !== 'reviewModal') return;

    const reviewingFor = interaction.fields.getTextInputValue('reviewingFor');
    const experience   = interaction.fields.getTextInputValue('experience');
    const rating       = interaction.fields.getTextInputValue('rating');
    const anonRaw      = interaction.fields.getTextInputValue('anonymous').trim().toLowerCase();
    const isAnon       = anonRaw === 'yes' || anonRaw === 'y';
    const authorName   = isAnon ? 'Anonymous' : `<@${interaction.user.id}>`;

    const now = Date.now();
    const embed = new EmbedBuilder()
      .addFields(
        { name: '# New Review',         value: `New review by ${authorName}` },
        { name: '**Reviewing For:**',   value: `> ${reviewingFor}` },
        { name: '**Experience:**',      value: `> ${experience}` },
        { name: '**Rating:**',          value: `> ${rating}` }
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setColor('#E68DF2')
      .setFooter({
        text: `Brawl Shop - ${formatPostTime(now)}`,
        iconURL: LOGO_URL
      });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('reviewAccept')
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('reviewDeny')
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.guild.channels.cache.get(MOD_CHANNEL_ID)
      .send({ embeds: [embed], components: [buttons] });

    await interaction.reply({ content: 'Your review is pending moderation.', ephemeral: true });
  },

  // call this on button click
  async handleButton(interaction) {
    const id = interaction.customId;
    if (!['reviewAccept', 'reviewDeny'].includes(id)) return;

    const embed = interaction.message.embeds[0];
    if (id === 'reviewAccept') {
      await interaction.guild.channels.cache.get(REVIEW_CHANNEL_ID)
        .send({ embeds: [embed] });
      await interaction.update({ content: 'Review accepted and posted.', embeds: [], components: [] });
    } else {
      await interaction.update({ content: 'Review denied.', embeds: [], components: [] });
    }
  }
};
