const logger = require('../logger')('events/interactionCreate.js');
const Sentry = require('../sentry');

module.exports = {
  name: 'interactionCreate',
  once: false,
  /**
   * Executes when an interaction is created in Discord
   * Handles different types of interactions (slash commands, context menu commands)
   * 
   * @param {Interaction} interaction - The Discord interaction object
   * @param {Client} client - The Discord client instance
   */
  execute: async (interaction, client) => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      
      // Skip if command doesn't exist
      if (!command) {
        logger.warn(`Unknown command attempted: ${interaction.commandName}`);
        return;
      }

      try {
        // Log command execution
        logger.info(`Executing slash command: ${interaction.commandName}`, { 
          user: interaction.user.tag,
          channel: interaction.channel?.name,
          guild: interaction.guild?.name
        });
        
        // Execute the command
        await command.execute(interaction);
        logger.debug(`Command ${interaction.commandName} executed successfully`);
      } catch (error) {
        // Add Sentry error tracking with context
        Sentry.captureException(error, {
          extra: {
            commandName: interaction.commandName,
            userId: interaction.user.id,
            userName: interaction.user.tag,
            guildId: interaction.guildId,
            channelId: interaction.channelId
          }
        });
        
        // Log the error
        logger.error(`Error executing command ${interaction.commandName}: ${error.message}`, { 
          stack: error.stack 
        });
        
        // Send error response to user
        try {
          const errorMessage = 'There was an error executing that command!';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        } catch (replyError) {
          // Track the follow-up error as well
          Sentry.captureException(replyError, {
            extra: { 
              originalError: error.message,
              commandName: interaction.commandName
            }
          });
          logger.error(`Error sending error response: ${replyError.message}`);
        }
      }
    }
    
    // Handle context menu command interactions
    else if (interaction.isContextMenuCommand()) {
      logger.info(`Executing context menu command: ${interaction.commandName}`, { 
        user: interaction.user.tag,
        channel: interaction.channel?.name,
        guild: interaction.guild?.name
      });

      const command = client.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`Unknown context menu command: ${interaction.commandName}`);
        return;
      }

      try {
        // Execute the context menu command
        await command.execute(interaction);
        logger.debug(`Context menu command ${interaction.commandName} executed successfully`);
      } catch (error) {
        // Add Sentry error tracking
        Sentry.captureException(error, {
          extra: {
            commandType: 'contextMenu',
            commandName: interaction.commandName,
            userId: interaction.user.id,
            userName: interaction.user.tag,
            guildId: interaction.guildId,
            channelId: interaction.channelId
          }
        });
        
        // Log the error
        logger.error(`Error executing context menu command ${interaction.commandName}: ${error.message}`, { 
          stack: error.stack 
        });
        
        // Send error response to user
        try {
          const errorMessage = 'There was an error executing that command!';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        } catch (replyError) {
          // Track the follow-up error as well
          Sentry.captureException(replyError, {
            extra: { 
              originalError: error.message,
              commandName: interaction.commandName,
              commandType: 'contextMenu'
            }
          });
          logger.error(`Error sending error response: ${replyError.message}`);
        }
      }
    }
  }
};
