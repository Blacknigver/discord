/**
 * Discount Button Handlers
 * Handles claim discount button and related discount functionality
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
// Ensure Components V2 flag exists for MessageFlags on older discord.js versions
if (!('IsComponentsV2' in MessageFlags)) {
  MessageFlags.IsComponentsV2 = 1 << 31;
}
const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder } = require('@discordjs/builders');
const { getActiveDiscountOffer, markDiscountAsClaimed } = require('../utils/discountSystem.js');

/**
 * Handles the "Claim 10% Discount" button click
 * @param {ButtonInteraction} interaction - The button interaction
 */
async function handleClaimDiscountButton(interaction) {
  try {
    const userId = interaction.user.id;
    console.log(`[DISCOUNT_CLAIM] User ${userId} clicked Claim 10% Discount button`);
    
    // Check if user has an active discount offer
    const activeDiscount = await getActiveDiscountOffer(userId);
    if (!activeDiscount) {
      console.log(`[DISCOUNT_CLAIM] No active discount found for user ${userId}`);
      return interaction.reply({
        content: 'You do not have an active discount offer or it has expired.',
        ephemeral: true
      });
    }
    
    console.log(`[DISCOUNT_CLAIM] Active discount found for user ${userId}: ${JSON.stringify(activeDiscount)}`);
    
    // DON'T mark discount as claimed yet - only mark it when ticket is actually created
    // Just acknowledge the button click and show the ticket panel
    await interaction.deferUpdate();
    
    // Send the ticket panel without banner
    await sendDiscountTicketPanel(interaction);
    
  } catch (error) {
    console.error(`[DISCOUNT_CLAIM] Error handling claim discount button: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while claiming your discount. Please try again or contact support.',
        ephemeral: true
      });
    }
  }
}

/**
 * Updates the discount DM buttons after successful ticket creation with ≤€100 order
 * @param {Client} client - Discord client
 * @param {string} userId - User ID
 * @param {string} discountMessageId - DM message ID to update
 */
async function updateDiscountDMButtons(client, userId, discountMessageId) {
  try {
    console.log(`[DISCOUNT_UPDATE] Updating DM buttons for user ${userId}, message ${discountMessageId}`);
    
    const user = await client.users.fetch(userId);
    if (!user) {
      console.error(`[DISCOUNT_UPDATE] Could not fetch user ${userId}`);
      return false;
    }
    
    // Get the DM channel and message
    const dmChannel = await user.createDM();
    const message = await dmChannel.messages.fetch(discountMessageId);
    if (!message) {
      console.error(`[DISCOUNT_UPDATE] Could not fetch message ${discountMessageId}`);
      return false;
    }
    
    // Update buttons to show discount was successfully used
    const claimedButton = new ButtonBuilder()
      .setCustomId('claim_10_percent_discount_used')
      .setLabel('10% Discount Claimed')
      .setEmoji('<:moneyy:1391899345208606772>')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);
    
    const updatedRow = new ActionRowBuilder()
      .addComponents(claimedButton);
    
    await message.edit({ components: [updatedRow] });
    console.log(`[DISCOUNT_UPDATE] ✅ Successfully updated DM buttons to show discount claimed`);
    
    return true;
    
  } catch (error) {
    console.error(`[DISCOUNT_UPDATE] Error updating DM buttons: ${error.message}`);
    return false;
  }
}

/**
 * Sends the ticket panel without banner image for discount users
 * @param {ButtonInteraction} interaction - The button interaction
 */
async function sendDiscountTicketPanel(interaction) {
  try {
    console.log(`[DISCOUNT_PANEL] Sending discount ticket panel to user ${interaction.user.id}`);
    
    // Try Components V2 first (without banner image) - EXACT same content as regular ticket panel
    try {
      const container = new ContainerBuilder()
        .setAccentColor(0x4a90e2)
        // NO banner image for discount panel (only difference from regular panel)
        // NO separator at top since there's no image to separate from
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
        new ButtonBuilder().setCustomId('discount_ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('discount_ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('discount_ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('discount_ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
      );

      console.log(`[DISCOUNT_PANEL] Attempting to send Components V2 discount panel...`);
      
      await interaction.followUp({
        components: [container, row1],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true
      });
      
      console.log(`[DISCOUNT_PANEL] ✅ Components V2 discount panel sent successfully!`);
      
    } catch (v2Error) {
      console.error(`[DISCOUNT_PANEL] Components V2 failed, falling back to traditional embed: ${v2Error.message}`);
      
      // Fallback to traditional embed without banner image - EXACT same content as regular ticket panel
      const embed = new EmbedBuilder()
        // No setImage() call - this removes the banner (only difference from regular panel)
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

      const ticketRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('discount_ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('discount_ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('discount_ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('discount_ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
      );

      await interaction.followUp({ 
        embeds: [embed], 
        components: [reviewsRow, ticketRow],
        ephemeral: true
      });
      
      console.log(`[DISCOUNT_PANEL] ✅ Fallback discount panel sent successfully!`);
    }
    
  } catch (error) {
    console.error(`[DISCOUNT_PANEL] Complete failure sending discount panel: ${error.message}`);
    
    // Last resort - send simple message
    await interaction.followUp({
      content: '🎉 **10% Discount Claimed!**\n\nYour discount is active! Please use the regular ticket panel in the server to create your order. Your discount will be automatically applied.',
      ephemeral: true
    });
  }
}

module.exports = {
  handleClaimDiscountButton,
  updateDiscountDMButtons,
  sendDiscountTicketPanel
}; 