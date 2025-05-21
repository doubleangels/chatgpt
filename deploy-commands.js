const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')(path.basename(__filename));
const config = require('./config');

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
  const commandsPath = path.join(__dirname, 'commands');
  
  // We get all JavaScript files from the commands directory.
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  // We load each command and add its data to the commands array.
  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
    logger.debug(`Loaded command: ${file}`);
  }
  
  // We create a REST instance for Discord API interaction.
  const rest = new REST({ version: '10' }).setToken(config.token);
  
  // We get the client ID from environment variables or config.
  const clientId = process.env.DISCORD_CLIENT_ID || config.clientId;
  logger.info(`Deploying commands for application ID: ${clientId}`);
  
  try {    
    // We register all commands globally for the application.
    await rest.put(
      Routes.applicationCommands(clientId), 
      { body: commands }
    );
    
    logger.info(`Successfully registered ${commands.length} application (/) commands.`);
  } catch (error) {
    logger.error('Failed to deploy commands:', { error });
    throw error; // We re-throw for handling by the caller.
  }
}

// We export the function for importing in other files.
module.exports = deployCommands;

// If this script is run directly, we execute the deployment.
if (require.main === module) {
  deployCommands()
    .then(() => logger.info('Command deployment completed successfully.'))
    .catch(err => {
      logger.error('Failed to deploy commands:', err);
      process.exit(1); // We exit with error code if deployment fails.
    });
}