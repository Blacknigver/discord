// review.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const MOD_CHANNEL_ID = '1368186200741118042';       // replace with your mod channel
const PUBLIC_CHANNEL_ID = '1293288484487954512';// replace with your public reviews channel
const LOGO_URL = 'https://cdn.discordapp.com/attachments/987753155360079903/1368299826688561212/Untitled70_20250208222905.jpg?ex=6817b804&is=68166684&hm=8fc340221f0b55e17444b6c2ced93e32541ecf95b258509a0ddc9c66667772bd&';

const reviewState = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Submit a new review')
    .addStringOption(opt =>
      opt.setName('reviewing_for')
         .setDescription('What are you reviewing for? Ex: Boost, Account, etc.')
         .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('rating')
         .setDescription('Select a rating')
         .setRequired(true)
         .addChoices(
           { name: '⭐️⭐️⭐️⭐️⭐️', value: 5 },
           { name: '⭐️⭐️⭐️⭐️',     value: 4 },
           { name: '⭐️⭐️⭐️',       value: 3 },
           { name: '⭐️⭐️',         value: 2 },
           { name: '⭐️',           value: 1 }
         )
    )
    .addStringOption(opt =>
      opt.setName('experience')
         .setDescription('Describe your experience')
         .setRequired(true)
    )
    .addAttachmentOption(opt =>
      opt.setName('image')
         .setDescription('Attach an image (optional)')
         .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('anonymous')
         .setDescription('Post anonymously?')
         .setRequired(false)
    ),

  async execute(interaction) {
    const reviewingFor = interaction.options.getString('reviewing_for', true);
    const rating = interaction.options.getInteger('rating', true);
    const experience = interaction.options.getString('experience', true);
    const image = interaction.options.getAttachment('image');
    const anonymous = interaction.options.getBoolean('anonymous') || false;

    // compute relative time string
    const now = new Date();
    const diff = now - now; // always 0 for now timestamp
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    let timeStr;
    if (diff < 86400000) {
      timeStr = `Today at ${h}:${m}`;
    } else if (diff < 2*86400000) {
      timeStr = `Yesterday at ${h}:${m}`;
    } else if (diff < 7*86400000) {
      const days = Math.floor(diff/86400000);
      timeStr = `${days} days ago at ${h}:${m}`;
    } else {
      const d = now.getDate().toString().padStart(2,'0');
      const mo = (now.getMonth()+1).toString().padStart(2,'0');
      const y = now.getFullYear();
      timeStr = `${d}/${mo}/${y} at ${h}:${m}`;
    }

    // build embed
    const starMap = {
      5: '⭐️⭐️⭐️⭐️⭐️',
      4: '⭐️⭐️⭐️⭐️',
      3: '⭐️⭐️⭐️',
      2: '⭐️⭐️',
      1: '⭐️'
    };
    const embed = new EmbedBuilder()
      .setDescription('# New review' + (anonymous ? '' : ` by ${interaction.user.tag}`))
      .addFields(
        { name: '**Reviewing For:**', value: `> ${reviewingFor}` },
        { name: '**Rating:**',        value: `> ${starMap[rating]}` },
        { name: '**Experience:**',    value: `> ${experience}` }
      )
      .setFooter({ text: `Brawl Shop - ${timeStr}`, iconURL: LOGO_URL });

    if (!anonymous) {
      embed.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 128 }));
    }
    if (image) {
      embed.setImage(image.url);
    }

    // send to moderation channel
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

    // store state
    reviewState.set(modMsg.id, {
      reviewingFor,
      rating: starMap[rating],
      experience,
      anonymous,
      reviewerTag: anonymous ? null : interaction.user.tag,
      reviewerAvatar: anonymous ? null : interaction.user.displayAvatarURL({ dynamic: true, size: 128 }),
      timeStr,
      imageUrl: image ? image.url : null
    });

    await interaction.reply({ content: '✅ Your review has been submitted for approval.', ephemeral: true });
  },

  async handleButton(interaction) {
    if (!interaction.isButton()) return;
    const { customId, message } = interaction;
    const state = reviewState.get(message.id);
    if (!state) {
      return interaction.reply({ content: '⚠️ Could not find review data.', ephemeral: true });
    }

    // disable buttons
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
      const pubChannel = await interaction.client.channels.fetch(PUBLIC_CHANNEL_ID);
      if (!pubChannel?.isText()) {
        await interaction.reply({ content: '❌ Public reviews channel not found.', ephemeral: true });
        return;
      }
      // rebuild embed for public
      const publicEmbed = new EmbedBuilder()
        .setDescription('# New review' + (state.anonymous ? '' : ` by ${state.reviewerTag}`))
        .addFields(
          { name: '**Reviewing For:**', value: `> ${state.reviewingFor}` },
          { name: '**Rating:**',        value: `> ${state.rating}` },
          { name: '**Experience:**',    value: `> ${state.experience}` }
        )
        .setFooter({ text: `Brawl Shop - ${state.timeStr}`, iconURL: LOGO_URL });
      if (!state.anonymous) {
        publicEmbed.setThumbnail(state.reviewerAvatar);
      }
      if (state.imageUrl) {
        publicEmbed.setImage(state.imageUrl);
      }
      await pubChannel.send({ embeds: [publicEmbed] });
      await interaction.reply({ content: '✅ Review accepted and published.', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Review denied.', ephemeral: true });
    }

    reviewState.delete(message.id);
  }
};
