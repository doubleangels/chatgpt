const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

/**
 * Help command module that provides information about how to use the bot.
 * @module commands/help
 */
module.exports = {
  /**
   * Command data for the help command.
   * @type {SlashCommandBuilder}
   */
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help on how to use the bot'),
    
  /**
   * Executes the help command.
   * Provides information about bot usage in both guild channels and DMs.
   * 
   * @param {import('discord.js').CommandInteraction} interaction - The interaction object
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    const isDM = interaction.channel.type === 1; // 1 = DM channel type
    
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🤖 ChatGPT Bot Help')
      .setDescription('Here\'s how to use me!')
      .addFields(
        {
          name: '📝 In Guild Channels',
          value: 'Mention me (`@YourBot`) or reply to my messages to start a conversation. I\'ll remember our chat history in each channel.',
          inline: false
        },
        {
          name: '💬 In Direct Messages',
          value: 'Just send me any message! I\'ll respond to everything you say and remember our conversation.',
          inline: false
        },
        {
          name: '🖼️ Image Support',
          value: 'I can analyze images when you send them along with your message. Just attach an image and ask me about it!',
          inline: false
        },
                 {
           name: '🗑️ Reset Conversations',
           value: 'Use `/reset my-dm` to clear your DM conversation history, `/reset channel` (admin only) to reset specific channels, or `/reset user-dm` (admin only) to reset other users\' DM conversations.',
           inline: false
         },
        {
          name: '💡 Tips',
          value: '• I remember up to 10 messages in our conversation\n• Each channel/DM has its own conversation history\n• You can ask me anything - I\'m here to help!',
          inline: false
        }
      )
      .setFooter({ text: 'Powered by OpenAI' })
      .setTimestamp();

    try {
      await interaction.reply({ embeds: [embed], ephemeral: true });
      logger.info(`Help command executed by ${interaction.user.tag} in ${isDM ? 'DM' : `guild ${interaction.guild?.name}`}`);
    } catch (error) {
      logger.error('Error sending help message:', {
        error: error.stack,
        message: error.message,
        userId: interaction.user.id
      });
      
      try {
        await interaction.followUp({ 
          content: '⚠️ There was an error sending the help message.', 
          ephemeral: true 
        });
      } catch (followUpError) {
        logger.error('Error sending follow-up error message:', {
          error: followUpError.stack,
          message: followUpError.message
        });
      }
    }
  },
};
