const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const { createTicketChannelWithOverflow } = require('../../tickets');
const { EMBED_COLOR, TICKET_CATEGORIES } = require('../constants');
const PINK_COLOR = '#e68df2';

// In-memory state for profile payment flow
// key -> `${userId}_${listingId}`
const flowState = new Map();

function parsePrice(priceStr = '') {
  const match = priceStr.match(/€(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Format payment method names for display
 * @param {string} paymentLabel - The raw payment method label from selection
 * @returns {string} - Properly formatted payment method name
 */
function formatPaymentMethodName(paymentLabel) {
  // Handle crypto payments
  if (paymentLabel.startsWith('Crypto-')) {
    const coin = paymentLabel.split('-')[1];
    return `Crypto - ${coin.toUpperCase()}`;
  }
  
  // Handle Dutch payments
  if (paymentLabel.startsWith('Dutch-')) {
    const method = paymentLabel.split('-')[1];
    if (method === 'Tikkie') {
      return 'Dutch - Tikkie';
    } else if (method === 'Bol') {
      return 'Dutch - Bol.com';
    }
    return `Dutch - ${method}`;
  }
  
  // Handle other payment methods
  switch (paymentLabel) {
    case 'iban':
      return 'IBAN Bank Transfer';
    case 'paypal':
      return 'PayPal';
    case 'paypal_giftcard':
      return 'PayPal Giftcard';
    default:
      return paymentLabel;
  }
}

function buildPrimarySelect(listingId) {
  return new StringSelectMenuBuilder()
    .setCustomId(`profile_payment_primary_${listingId}`)
    .setPlaceholder('Select Payment Method')
    .addOptions(
      {
        label: 'IBAN Bank Transfer',
        value: 'iban',
        description: 'IBAN only. This only works for EU banks.',
        emoji: { id: '1371863843789209691' }
      },
      {
        label: 'Crypto',
        value: 'crypto',
        description: 'No memecoins or such.',
        emoji: { id: '1371863500720177314' }
      },
      {
        label: 'PayPal - 10% Extra Fees',
        value: 'paypal',
        description: '10% Extra Fees - Only for Accounts, not for Boosts and such.',
        emoji: { id: '1371862922766192680' }
      },
      {
        label: 'Dutch Payment Methods',
        value: 'dutch',
        description: 'Only for Dutch people - the Netherlands - No other countries.',
        emoji: { id: '1371869238259875922' }
      },
      {
        label: 'PayPal Giftcard',
        value: 'paypal_giftcard',
        description: 'Purchaseable on G2A.com or Eneba.com - Extra fees may apply.',
        emoji: { id: '1371862922766192680' }
      }
    );
}

function buildCryptoSelect(listingId) {
  return new StringSelectMenuBuilder()
    .setCustomId(`profile_payment_crypto_${listingId}`)
    .setPlaceholder('Select Crypto Coin')
    .addOptions(
      { label: 'Bitcoin (BTC)', value: 'BTC', emoji: { id: '1371865397623652443' } },
      { label: 'Litecoin (LTC)', value: 'LTC', emoji: { id: '1371864997012963520' } },
      { label: 'Solana (SOL)', value: 'SOL', emoji: { id: '1371865225824960633' } },
      { label: 'USDT (Tether)', value: 'USDT', emoji: { id: '1391930075653341256' } }
    );
}

function buildDutchSelect(listingId, allowBol) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`profile_payment_dutch_${listingId}`)
    .setPlaceholder('Select Dutch Payment Method')
    .addOptions({ label: 'Tikkie', value: 'Tikkie', emoji: { id: '1371869238259875922' } });
  if (allowBol) {
    menu.addOptions({ label: 'Bol.com Giftcard - 50% Extra Fees', value: 'Bol', emoji: { id: '1371870572237160448' } });
  }
  return menu;
}

async function sendPaymentMethodEmbed(interaction, listing) {
  // Store state
  const stateKey = `${interaction.user.id}_${listing.listing_id}`;
  flowState.set(stateKey, { listing });

  const paymentEmbed = new EmbedBuilder()
    .setTitle('Payment Method')
    .setDescription('Please select your payment method.')
    .setColor(PINK_COLOR);

  const selectMenu = buildPrimarySelect(listing.listing_id);
  const row = new ActionRowBuilder().addComponents(selectMenu);

  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({ embeds: [paymentEmbed], components: [row], ephemeral: true });
  } else {
    await interaction.editReply({ embeds: [paymentEmbed], components: [row] });
  }
}

async function handlePrimarySelect(interaction) {
  // Extract the listingId which is ALWAYS the last segment after splitting by "_"
  const listingId = interaction.customId.split('_').pop();
  const selection = interaction.values[0];
  const stateKey = `${interaction.user.id}_${listingId}`;
  const state = flowState.get(stateKey);
  if (!state) {
    console.error(`[PROFILE_PAYMENT] No flow state found for key ${stateKey} (primary select).`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Your session has expired or is invalid. Please try again.',
        ephemeral: true
      }).catch(() => {});
    }
    return;
  }

  state.primary = selection; // record
  flowState.set(stateKey, state);

  if (selection === 'crypto') {
    const cryptoRow = new ActionRowBuilder().addComponents(buildCryptoSelect(listingId));
    await interaction.update({ components: [cryptoRow] });
    return;
  }
  if (selection === 'dutch') {
    const priceNum = parsePrice(state.listing.price);
    const dutchRow = new ActionRowBuilder().addComponents(buildDutchSelect(listingId, priceNum < 100));
    await interaction.update({ components: [dutchRow] });
    return;
  }
  // For other selections, finalize immediately
  await finalize(interaction, selection, state);
}

async function handleCryptoSelect(interaction) {
  const listingId = interaction.customId.split('_').pop();
  const coin = interaction.values[0];
  const stateKey = `${interaction.user.id}_${listingId}`;
  const state = flowState.get(stateKey);
  if (!state) {
    console.error(`[PROFILE_PAYMENT] No flow state found for key ${stateKey} (crypto select).`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Your session has expired or is invalid. Please try again.',
        ephemeral: true
      }).catch(() => {});
    }
    return;
  }
  state.primary = `Crypto-${coin}`;
  await finalize(interaction, `Crypto-${coin}`, state);
}

async function handleDutchSelect(interaction) {
  const listingId = interaction.customId.split('_').pop();
  const method = interaction.values[0];
  const stateKey = `${interaction.user.id}_${listingId}`;
  const state = flowState.get(stateKey);
  if (!state) {
    console.error(`[PROFILE_PAYMENT] No flow state found for key ${stateKey} (dutch select).`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Your session has expired or is invalid. Please try again.',
        ephemeral: true
      }).catch(() => {});
    }
    return;
  }
  state.primary = `Dutch-${method}`;
  await finalize(interaction, `Dutch-${method}`, state);
}

async function finalize(interaction, paymentLabel, state) {
  // Remove components so the menu cannot be used again, but LEAVE the original embed untouched
  await interaction.update({ components: [] });

  // Create ticket channel
  const user = interaction.user;
  const ticketName = `𝐩𝐫𝐨𝐟𝐢𝐥𝐞-${user.username}`;
  const ticketChannel = await createTicketChannelWithOverflow(
    interaction.guild,
    user.id,
    TICKET_CATEGORIES.purchase,
    ticketName,
    { type: 'profile', price: state.listing.price, paymentMethod: paymentLabel }
  );

  if (!ticketChannel) {
    console.error('[PROFILE_PAYMENT] Failed to create ticket channel');
    await interaction.followUp({ content: '❌ Failed to create ticket. Please contact support.', ephemeral: true });
    return;
  }

  // Persist ticket  if needed (createTicketChannelWithOverflow already writes). Do a best-effort insert while ignoring duplicates.
  try {
    const db = require('../../database');
    await db.query(
      `INSERT INTO tickets (channel_id, user_id, status, listing_id, created_at)
       VALUES ($1,$2,'open',$3,NOW())
       ON CONFLICT (channel_id) DO NOTHING`,
      [ticketChannel.id, user.id, state.listing.listing_id]
    );
  } catch (dbErr) {
    console.error('[PROFILE_PAYMENT] Failed to insert ticket into DB:', dbErr.message);
    // Continue even if DB write fails
  }

  // Embeds in ticket
  const welcomeEmbed = new EmbedBuilder()
    .setTitle('𝐏𝐫𝐨𝐟𝐢𝐥𝐞 Purchase Ticket')
    .setDescription('Welcome to your 𝐏𝐫𝐨𝐟𝐢𝐥𝐞 Purchase ticket!\n\nOne of our staff members will assist you shortly.')
    .setColor(PINK_COLOR);

  const recapEmbed = new EmbedBuilder()
    .setTitle('Order Recap')
    .setColor(PINK_COLOR)
    .setDescription(state.listing.description)
    .addFields(
      { name: '<:Money:1351665747641766022> Price', value: state.listing.price, inline: true },
      { name: '<:gold_trophy:1351658932434768025> Trophies', value: state.listing.trophies, inline: true },
      { name: '<:P11:1351683038127591529> P11', value: state.listing.p11, inline: true },
      { name: '<:tiermax:1392588776957542530> Tier Max', value: state.listing.tier_max, inline: true }
    );
  if (state.listing.main_image) recapEmbed.setImage(state.listing.main_image);

  const closeButtonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setEmoji({ id: '1351662076354891817' })
      .setStyle(ButtonStyle.Danger)
  );

  const firstMsg = await ticketChannel.send({ content: `<@${user.id}> <@987751357773672538>`, embeds: [welcomeEmbed, recapEmbed], components: [closeButtonRow] });

  // Payment alert embed
  const paymentEmbed = new EmbedBuilder()
    .setTitle(`${formatPaymentMethodName(paymentLabel)} Payment`)
    .setDescription(`<@${user.id}> wants to pay with **${formatPaymentMethodName(paymentLabel)}**.\n\nPlease assist them with this.`)
    .setColor(0x00d26a);

  const paymentButtonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`payment_completed_${state.listing.listing_id}`)
      .setLabel('Payment Completed')
      .setEmoji({ id: '1357478063616688304' })
      .setStyle(ButtonStyle.Success)
  );

  // Send as reply to recap embed
  await firstMsg.reply({ content: '<@987751357773672538>', embeds: [paymentEmbed], components: [paymentButtonRow] });

  // Notify user
  await interaction.followUp({ content: `✅ Successfully created ticket: ${ticketChannel}`, ephemeral: true });

  flowState.delete(`${interaction.user.id}_${state.listing.listing_id}`);
}

module.exports = {
  sendPaymentMethodEmbed,
  handlePrimarySelect,
  handleCryptoSelect,
  handleDutchSelect
}; 