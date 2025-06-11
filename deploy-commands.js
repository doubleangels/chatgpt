const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')(path.basename(__filename));
const config = require('./config');

const COMMANDS_DIRECTORY = 'commands';
const COMMAND_FILE_EXTENSION = '.js';

const DISCORD_API_VERSION = '10';

const LOG_LOADED_COMMAND = 'Loaded command: %s';
const LOG_DEPLOYING_COMMANDS = 'Deploying commands for application ID: %s';
const LOG_DEPLOY_SUCCESS = 'Successfully registered %d application (/) commands.';
const LOG_DEPLOY_ERROR = 'Failed to deploy commands:';
const LOG_DEPLOY_COMPLETE = 'Command deployment completed successfully.';
const LOG_DEPLOY_FAILED = 'Failed to deploy commands:';

async function deployCommands() {
  const commands = [];
  
  const commandsPath = path.join(__dirname, COMMANDS_DIRECTORY);
  
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(COMMAND_FILE_EXTENSION));
  
  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
    logger.debug(LOG_LOADED_COMMAND, file);
  }
  
  const rest = new REST({ version: DISCORD_API_VERSION }).setToken(config.token);
  
  const clientId = process.env.DISCORD_CLIENT_ID || config.clientId;
  logger.info(LOG_DEPLOYING_COMMANDS, clientId);
  
  try {    
    await rest.put(
      Routes.applicationCommands(clientId), 
      { body: commands }
    );
    
    logger.info(LOG_DEPLOY_SUCCESS, commands.length);
  } catch (error) {
    logger.error(LOG_DEPLOY_ERROR, { error });
    throw error;
  }
}

module.exports = deployCommands;

if (require.main === module) {
  deployCommands()
    .then(() => logger.info(LOG_DEPLOY_COMPLETE))
    .catch(err => {
      logger.error(LOG_DEPLOY_FAILED, err);
      process.exit(1);
    });
}