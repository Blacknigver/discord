const { 
    handleRankedRankSelection,
    handleMasterySelection
} = require('../../src/modules/ticketFlow.js');

const rankedMasteryHandlers = {
    // =======================
    // Ranked Selection Buttons
    // =======================
    
    // Main rank categories
    'ranked_Bronze': async (interaction) => handleRankedRankSelection(interaction, 'Bronze'),
    'ranked_Silver': async (interaction) => handleRankedRankSelection(interaction, 'Silver'),
    'ranked_Gold': async (interaction) => handleRankedRankSelection(interaction, 'Gold'),
    'ranked_Diamond': async (interaction) => handleRankedRankSelection(interaction, 'Diamond'),
    'ranked_Mythic': async (interaction) => handleRankedRankSelection(interaction, 'Mythic'),
    'ranked_Legendary': async (interaction) => handleRankedRankSelection(interaction, 'Legendary'),
    'ranked_Masters': async (interaction) => handleRankedRankSelection(interaction, 'Masters'),
    'ranked_Pro': async (interaction) => handleRankedRankSelection(interaction, 'Pro'),

    // Specific rank levels - Bronze
    'ranked_Bronze_1': async (interaction) => handleRankedRankSelection(interaction, 'Bronze_1'),
    'ranked_Bronze_2': async (interaction) => handleRankedRankSelection(interaction, 'Bronze_2'),
    'ranked_Bronze_3': async (interaction) => handleRankedRankSelection(interaction, 'Bronze_3'),

    // Specific rank levels - Silver
    'ranked_Silver_1': async (interaction) => handleRankedRankSelection(interaction, 'Silver_1'),
    'ranked_Silver_2': async (interaction) => handleRankedRankSelection(interaction, 'Silver_2'),
    'ranked_Silver_3': async (interaction) => handleRankedRankSelection(interaction, 'Silver_3'),

    // Specific rank levels - Gold
    'ranked_Gold_1': async (interaction) => handleRankedRankSelection(interaction, 'Gold_1'),
    'ranked_Gold_2': async (interaction) => handleRankedRankSelection(interaction, 'Gold_2'),
    'ranked_Gold_3': async (interaction) => handleRankedRankSelection(interaction, 'Gold_3'),

    // Specific rank levels - Diamond
    'ranked_Diamond_1': async (interaction) => handleRankedRankSelection(interaction, 'Diamond_1'),
    'ranked_Diamond_2': async (interaction) => handleRankedRankSelection(interaction, 'Diamond_2'),
    'ranked_Diamond_3': async (interaction) => handleRankedRankSelection(interaction, 'Diamond_3'),

    // Specific rank levels - Mythic
    'ranked_Mythic_1': async (interaction) => handleRankedRankSelection(interaction, 'Mythic_1'),
    'ranked_Mythic_2': async (interaction) => handleRankedRankSelection(interaction, 'Mythic_2'),
    'ranked_Mythic_3': async (interaction) => handleRankedRankSelection(interaction, 'Mythic_3'),

    // Specific rank levels - Legendary
    'ranked_Legendary_1': async (interaction) => handleRankedRankSelection(interaction, 'Legendary_1'),
    'ranked_Legendary_2': async (interaction) => handleRankedRankSelection(interaction, 'Legendary_2'),
    'ranked_Legendary_3': async (interaction) => handleRankedRankSelection(interaction, 'Legendary_3'),

    // Specific rank levels - Masters
    'ranked_Masters_1': async (interaction) => handleRankedRankSelection(interaction, 'Masters_1'),
    'ranked_Masters_2': async (interaction) => handleRankedRankSelection(interaction, 'Masters_2'),
    'ranked_Masters_3': async (interaction) => handleRankedRankSelection(interaction, 'Masters_3'),

    // =======================
    // Mastery Selection Buttons
    // =======================
    
    // Main mastery categories
    'mastery_Bronze': async (interaction) => handleMasterySelection(interaction, 'Bronze'),
    'mastery_Silver': async (interaction) => handleMasterySelection(interaction, 'Silver'),
    'mastery_Gold': async (interaction) => handleMasterySelection(interaction, 'Gold'),

    // Specific mastery levels - Bronze
    'mastery_Bronze_1': async (interaction) => handleMasterySelection(interaction, 'Bronze_1'),
    'mastery_Bronze_2': async (interaction) => handleMasterySelection(interaction, 'Bronze_2'),
    'mastery_Bronze_3': async (interaction) => handleMasterySelection(interaction, 'Bronze_3'),

    // Specific mastery levels - Silver
    'mastery_Silver_1': async (interaction) => handleMasterySelection(interaction, 'Silver_1'),
    'mastery_Silver_2': async (interaction) => handleMasterySelection(interaction, 'Silver_2'),
    'mastery_Silver_3': async (interaction) => handleMasterySelection(interaction, 'Silver_3'),

    // Specific mastery levels - Gold
    'mastery_Gold_1': async (interaction) => handleMasterySelection(interaction, 'Gold_1'),
    'mastery_Gold_2': async (interaction) => handleMasterySelection(interaction, 'Gold_2'),
    'mastery_Gold_3': async (interaction) => handleMasterySelection(interaction, 'Gold_3')
};

module.exports = rankedMasteryHandlers; 