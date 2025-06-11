const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')(path.basename(__filename));
const config = require('./config');

// File configuration
const COMMANDS_DIRECTORY = 'commands';
const COMMAND_FILE_EXTENSION = '.js';

// API configuration
const DISCORD_API_VERSION = '10';

// Log messages
const LOG_LOADED_COMMAND = 'Loaded command: %s';
const LOG_DEPLOYING_COMMANDS = 'Deploying commands for application ID: %s';
const LOG_DEPLOY_SUCCESS = 'Successfully registered %d application (/) commands.';
const LOG_DEPLOY_ERROR = 'Failed to deploy commands:';
const LOG_DEPLOY_COMPLETE = 'Command deployment completed successfully.';
const LOG_DEPLOY_FAILED = 'Failed to deploy commands:';

/**
 * We deploy all slash commands to Discord API.
 * 
 * We collect all command modules from the commands directory,
 * convert them to the format required by Discord, and register them globally
 * for the application. This ensures our bot's commands are available to users.
 * 
 * @returns {Promise<void>} A promise that resolves when commands are successfully registered.
 * @throws {Error} If command registration fails.
 */
async function deployCommands() {
  // We create an array to store command data for registration.
  const commands = [];
  
  // We define the path to the commands directory.
  const commandsPath = path.join(__dirname, COMMANDS_DIRECTORY);
  
  // We get all JavaScript files from the commands directory.
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(COMMAND_FILE_EXTENSION));
  
  // We load each command and add its data to the commands array.
  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
    logger.debug(LOG_LOADED_COMMAND, file);
  }
  
  // We create a REST instance for Discord API interaction.
  const rest = new REST({ version: DISCORD_API_VERSION }).setToken(config.token);
  
  // We get the client ID from environment variables or config.
  const clientId = process.env.DISCORD_CLIENT_ID || config.clientId;
  logger.info(LOG_DEPLOYING_COMMANDS, clientId);
  
  try {    
    // We register all commands globally for the application.
    await rest.put(
      Routes.applicationCommands(clientId), 
      { body: commands }
    );
    
    logger.info(LOG_DEPLOY_SUCCESS, commands.length);
  } catch (error) {
    logger.error(LOG_DEPLOY_ERROR, { error });
    throw error; // We re-throw for handling by the caller.
  }
}

// We export the function for importing in other files.
module.exports = deployCommands;

// If this script is run directly, we execute the deployment.
if (require.main === module) {
  deployCommands()
    .then(() => logger.info(LOG_DEPLOY_COMPLETE))
    .catch(err => {
      logger.error(LOG_DEPLOY_FAILED, err);
      process.exit(1); // We exit with error code if deployment fails.
    });
}