const { ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { createSystemMessage } = require('../utils/aiUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { modelName } = require('../config');

/**
 * User app for analyzing user profiles with AI
 * @module userApps/analyzeUser
 */
module.exports = {
  name: 'Analyze User',
  type: ApplicationCommandType.User,
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
  
  /**
   * Executes the user app command
   * @param {import('discord.js').UserContextMenuCommandInteraction} interaction - The interaction object
   * @param {import('discord.js').Client} client - The Discord client
   */
  async execute(interaction, client) {
    const targetUser = interaction.targetUser;
    const guild = interaction.guild;
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Gather user information
      let userInfo = {
        username: targetUser.username,
        displayName: targetUser.displayName,
        createdAt: targetUser.createdAt,
        isBot: targetUser.bot,
        avatarURL: targetUser.displayAvatarURL({ dynamic: true }),
        bannerURL: targetUser.bannerURL({ dynamic: true })
      };
      
      // Get guild member information if available
      let memberInfo = null;
      if (guild) {
        try {
          const member = await guild.members.fetch(targetUser.id);
          memberInfo = {
            joinedAt: member.joinedAt,
            nickname: member.nickname,
            roles: member.roles.cache.map(role => role.name).filter(name => name !== '@everyone'),
            permissions: member.permissions.toArray(),
            isOwner: member.id === guild.ownerId,
            isAdmin: member.permissions.has(PermissionFlagsBits.Administrator),
            isModerator: member.permissions.has(PermissionFlagsBits.ModerateMembers)
          };
        } catch (error) {
          logger.debug(`Could not fetch member info for ${targetUser.id} in guild ${guild.id}`);
        }
      }
      
      // Create analysis prompt
      const analysisPrompt = `Analyze this Discord user profile and provide interesting insights:

User Information:
- Username: ${userInfo.username}
- Display Name: ${userInfo.displayName || 'None'}
- Account Created: ${userInfo.createdAt.toDateString()}
- Is Bot: ${userInfo.isBot}

${memberInfo ? `Guild Member Information:
- Joined Server: ${memberInfo.joinedAt ? memberInfo.joinedAt.toDateString() : 'Unknown'}
- Nickname: ${memberInfo.nickname || 'None'}
- Roles: ${memberInfo.roles.join(', ') || 'None'}
- Key Permissions: ${memberInfo.permissions.slice(0, 5).join(', ')}
- Server Owner: ${memberInfo.isOwner}
- Administrator: ${memberInfo.isAdmin}
- Moderator: ${memberInfo.isModerator}` : 'Not a member of this server'}

Please provide a brief, friendly analysis of this user profile. Focus on interesting patterns, account age, role hierarchy, and any notable characteristics. Keep it under 200 words and make it engaging.`;

      // Create conversation for analysis
      const conversationId = `analysis_${targetUser.id}_${Date.now()}`;
      const systemMessage = createSystemMessage(modelName, false);
      const analysisHistory = [
        systemMessage,
        { role: 'user', content: analysisPrompt }
      ];
      
      // Generate AI analysis
      const analysis = await generateAIResponse(analysisHistory);
      
      if (!analysis) {
        await interaction.editReply({
          content: "⚠️ I couldn't generate an analysis at this time."
        });
        return;
      }
      
      // Create embed with analysis
      const { EmbedBuilder } = require('discord.js');
      
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`🔍 Analysis of ${targetUser.username}`)
        .setThumbnail(userInfo.avatarURL)
        .setDescription(analysis)
        .addFields(
          { name: 'Account Age', value: `${Math.floor((Date.now() - userInfo.createdAt.getTime()) / (1000 * 60 * 60 * 24))} days`, inline: true },
          { name: 'Username', value: userInfo.username, inline: true },
          { name: 'Bot Account', value: userInfo.isBot ? 'Yes' : 'No', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'AI-powered user analysis' });
      
      if (memberInfo && memberInfo.joinedAt) {
        const joinedDays = Math.floor((Date.now() - memberInfo.joinedAt.getTime()) / (1000 * 60 * 60 * 24));
        embed.addFields({ name: 'Server Member For', value: `${joinedDays} days`, inline: true });
      }
      
      await interaction.editReply({ embeds: [embed] });
      
      logger.info(`User ${interaction.user.tag} analyzed user ${targetUser.tag}`);
      
    } catch (error) {
      logger.error('Error executing analyze user command:', {
        error: error.stack,
        message: error.message,
        targetUserId: targetUser.id
      });
      
      await interaction.editReply({
        content: '⚠️ An error occurred while analyzing the user profile.'
      });
    }
  }
};
