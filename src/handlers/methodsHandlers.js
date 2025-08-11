/**
 * Brawl Stars Methods System Handlers
 * Handles method detail display, invite verification, and method claiming
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('@discordjs/builders');

// Ensure Components V2 flag exists
if (!('IsComponentsV2' in MessageFlags)) {
  MessageFlags.IsComponentsV2 = 1 << 31;
}

// Method configurations
const METHODS = {
  supercell_store: {
    name: 'Cheap Supercell Store',
    cost: 25,
    docUrl: 'https://docs.google.com/document/d/1Cb6wfOfyEXLpCxrf4UcqFaXxzj8iRO6zo3P80oHnveI/edit?usp=sharing'
  },
  king_frank: {
    name: 'Free King Frank',
    cost: 10,
    docUrl: 'https://docs.google.com/document/d/1X4Rtdmxo3dp0PnnayLC8IesLi9XbBbN_uFaaTc514HI/edit?usp=sharing'
  },
  infinite_winstreak: {
    name: 'Infinite Winstreak',
    cost: 5,
    docUrl: 'https://docs.google.com/document/d/1VjR5r2lPKdESr-PEQ4nJBWtasjp8nk1rjOZZAM1MGnA/edit?usp=sharing'
  }
};

const LOG_CHANNEL_ID = '1391916744754466997';

/**
 * Handle Cheap Supercell Store method button
 */
async function handleMethodSupercellStore(interaction) {
  try {
    // Create Components V2 container with proper separators
    const container = new ContainerBuilder()
      .addTextDisplayComponents(txt =>
        txt.setContent('## Cheap Supercell Store')
      )
      .addSeparatorComponents(sep =>
        sep.setDivider(true)
           .setSpacing(2) // Large spacing with divider
      )
      .addTextDisplayComponents(txt =>
        txt.setContent('**How the method works:**\n- Requires a new account / existing account that already has a discounted supercell store.\n- BP+ costs €6 | BP costs €4,19 | Pro Pass costs €15,49\n- Always works, we tried it ourself works fine.')
      )
      .addSeparatorComponents(sep =>
        sep.setDivider(true)
           .setSpacing(2) // Large spacing with divider
      )
      .addTextDisplayComponents(txt =>
        txt.setContent('**Disclaimers:**\n- This method will not work on your main account, you will have to purchase items on the new account and gift them to your main one.\n- This method may require finding people that can help you with it as it does not work for everyone, but if you use common sense it is done within 5-10m.')
      );

    const claimButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_method_supercell_store')
        .setLabel('Claim Method')
        .setEmoji('<:Reward:1393324450165948429>')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      components: [container, claimButton],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true
    });

    console.log(`[METHODS] User ${interaction.user.id} viewed Cheap Supercell Store method details`);

  } catch (error) {
    console.error(`[METHODS] Error showing Supercell Store method: ${error.message}`);
    await interaction.reply({
      content: 'An error occurred while showing the method details. Please try again.',
      ephemeral: true
    });
  }
}

/**
 * Handle Free King Frank method button
 */
async function handleMethodKingFrank(interaction) {
  try {
    // Create Components V2 container with proper separators
    const container = new ContainerBuilder()
      .addTextDisplayComponents(txt =>
        txt.setContent('## Free King Frank')
      )
      .addSeparatorComponents(sep =>
        sep.setDivider(true)
           .setSpacing(2) // Large spacing with divider
      )
      .addTextDisplayComponents(txt =>
        txt.setContent('**How it works:**\n- Get (both) King Frank skins for __Free!__\n- Normally **€300** per skin.')
      )
      .addSeparatorComponents(sep =>
        sep.setDivider(true)
           .setSpacing(2) // Large spacing with divider
      )
      .addTextDisplayComponents(txt =>
        txt.setContent('**Disclaimers:**\n- Requires you to have €300 on your PayPal / Credit Card, you will not lose this.\n- Some may find it risky, even tho it is totally safe.')
      );

    const claimButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_method_king_frank')
        .setLabel('Claim Method')
        .setEmoji('<:Reward:1393324450165948429>')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      components: [container, claimButton],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true
    });

    console.log(`[METHODS] User ${interaction.user.id} viewed Free King Frank method details`);

  } catch (error) {
    console.error(`[METHODS] Error showing King Frank method: ${error.message}`);
    await interaction.reply({
      content: 'An error occurred while showing the method details. Please try again.',
      ephemeral: true
    });
  }
}

/**
 * Handle Infinite Winstreak method button
 */
async function handleMethodInfiniteWinstreak(interaction) {
  try {
    // Create Components V2 container with proper separators
    const container = new ContainerBuilder()
      .addTextDisplayComponents(txt =>
        txt.setContent('## Infinite Winstreak')
      )
      .addSeparatorComponents(sep =>
        sep.setDivider(true)
           .setSpacing(2) // Large spacing with divider
      )
      .addTextDisplayComponents(txt =>
        txt.setContent('**How it works:**\n- Get an infinite winstreak, as high as you want.\n- You **can\'t lose the winstreak**, but it will require time.')
      )
      .addSeparatorComponents(sep =>
        sep.setDivider(true)
           .setSpacing(2) // Large spacing with divider
      )
      .addTextDisplayComponents(txt =>
        txt.setContent('**Disclaimer:**\n- It takes time per win, around 2-3 minute per win.')
      );

    const claimButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_method_infinite_winstreak')
        .setLabel('Claim Method')
        .setEmoji('<:Reward:1393324450165948429>')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      components: [container, claimButton],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true
    });

    console.log(`[METHODS] User ${interaction.user.id} viewed Infinite Winstreak method details`);

  } catch (error) {
    console.error(`[METHODS] Error showing Infinite Winstreak method: ${error.message}`);
    await interaction.reply({
      content: 'An error occurred while showing the method details. Please try again.',
      ephemeral: true
    });
  }
}

/**
 * Handle method claim button clicks
 */
async function handleMethodClaim(interaction) {
  try {
    const methodType = interaction.customId.replace('claim_method_', '');
    const method = METHODS[methodType];
    
    if (!method) {
      await interaction.reply({
        content: 'Invalid method type. Please try again.',
        ephemeral: true
      });
      return;
    }

    console.log(`[METHODS] User ${interaction.user.id} attempting to claim ${method.name} (${method.cost} invites)`);

    // Get user's invite count
    const inviteHandler = interaction.client.inviteHandler;
    
    if (!inviteHandler) {
      await interaction.reply({
        content: 'Invite tracking system is not available. Please try again later.',
        ephemeral: true
      });
      return;
    }

    const inviteTracker = inviteHandler.getInviteTracker();
    const userStats = inviteTracker.getInviterStats(interaction.user.id);
    const totalInvites = userStats.total;

    console.log(`[METHODS] User ${interaction.user.id} has ${totalInvites} total invites, needs ${method.cost}`);

    // Check if user has enough invites
    if (totalInvites < method.cost) {
      await interaction.reply({
        content: `❌ **Insufficient Invites**\n\nYou need **${method.cost} invites** to claim ${method.name}.\nYou currently have **${totalInvites} invites**.\n\nInvite more people to the server to earn more invites!`,
        ephemeral: true
      });
      return;
    }

    // Deduct invites by reducing bonus invites
    const userIdStr = interaction.user.id.toString();
    inviteTracker.ensureInviterData(userIdStr);
    inviteTracker.data.inviters[userIdStr].bonus -= method.cost;
    await inviteTracker.saveInvites();

    console.log(`[METHODS] Deducted ${method.cost} invites from user ${interaction.user.id}`);

    // Create success embed
    const successEmbed = new EmbedBuilder()
      .setTitle('Method Claimed')
      .setColor('#00d26a')
      .setDescription(
        `Your method for ${method.name} has been successfully claimed. <a:CheckPurple:1393717601376403486>\n\n` +
        'Please do not contact us for support, we only provide the method and we will not help you execute it.\n\n' +
        '**Access the method here:**\n' +
        `> ${method.docUrl}`
      );

    const accessButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Access Method')
        .setStyle(ButtonStyle.Link)
        .setURL(method.docUrl)
    );

    // Send ephemeral response
    await interaction.reply({
      embeds: [successEmbed],
      components: [accessButton],
      ephemeral: true
    });

    // Send DM with same content
    try {
      await interaction.user.send({
        embeds: [successEmbed],
        components: [accessButton]
      });
      console.log(`[METHODS] Successfully DMed ${method.name} method to user ${interaction.user.id}`);
    } catch (dmError) {
      console.error(`[METHODS] Failed to DM user ${interaction.user.id}: ${dmError.message}`);
      // Don't fail the entire operation if DM fails
    }

    // Log to channel
    try {
      const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📋 Method Claimed')
          .setColor('#e68df2')
          .addFields(
            { name: 'User', value: `${interaction.user.username} (${interaction.user.id})`, inline: true },
            { name: 'Method', value: method.name, inline: true },
            { name: 'Cost', value: `${method.cost} invites`, inline: true },
            { name: 'Remaining Invites', value: `${totalInvites - method.cost}`, inline: true }
          )
          .setTimestamp()
          .setFooter({ text: 'Methods System' });

        await logChannel.send({ embeds: [logEmbed] });
        console.log(`[METHODS] Logged ${method.name} claim by user ${interaction.user.id} to channel ${LOG_CHANNEL_ID}`);
      } else {
        console.error(`[METHODS] Log channel ${LOG_CHANNEL_ID} not found`);
      }
    } catch (logError) {
      console.error(`[METHODS] Error logging method claim: ${logError.message}`);
    }

    console.log(`[METHODS] Successfully processed ${method.name} claim for user ${interaction.user.id}`);

  } catch (error) {
    console.error(`[METHODS] Error processing method claim: ${error.message}`);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while processing your method claim. Please try again or contact support.',
        ephemeral: true
      });
    }
  }
}

module.exports = {
  handleMethodSupercellStore,
  handleMethodKingFrank,
  handleMethodInfiniteWinstreak,
  handleMethodClaim
}; 