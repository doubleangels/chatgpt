const { REST, Routes, ApplicationCommandType } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = require('./config');

/**
 * Deploy user app commands to Discord
 * User apps are context menu commands that appear when right-clicking on users
 */
async function deployUserApps() {
  const commands = [];
  const userAppsPath = path.join(__dirname, 'userApps');
  
  if (!fs.existsSync(userAppsPath)) {
    console.log('No userApps directory found. Creating empty directory...');
    fs.mkdirSync(userAppsPath);
    return;
  }
  
  const userAppFiles = fs.readdirSync(userAppsPath).filter(file => file.endsWith('.js'));
  
  for (const file of userAppFiles) {
    try {
      const userApp = require(path.join(userAppsPath, file));
      
      // Validate user app structure
      if (!userApp.name || !userApp.type || !userApp.execute) {
        console.warn(`Skipping invalid user app file: ${file}`);
        continue;
      }
      
      // Create command data for Discord API
      const commandData = {
        name: userApp.name,
        type: userApp.type,
        defaultMemberPermissions: userApp.defaultMemberPermissions || null,
      };
      
      commands.push(commandData);
      console.log(`Prepared user app: ${userApp.name}`);
      
    } catch (error) {
      console.error(`Error loading user app file ${file}:`, error.message);
    }
  }
  
  if (commands.length === 0) {
    console.log('No valid user apps found to deploy.');
    return;
  }
  
  const rest = new REST({ version: '10' }).setToken(config.token);
  
  try {
    console.log(`Started refreshing ${commands.length} user app(s).`);
    
    // Deploy to all guilds the bot is in (for testing)
    // In production, you might want to deploy globally
    const guilds = await rest.get(Routes.oauth2CurrentApplicationGuilds());
    
    for (const guild of guilds) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(config.clientId, guild.id),
          { body: commands }
        );
        console.log(`Successfully deployed user apps to guild: ${guild.name} (${guild.id})`);
      } catch (error) {
        console.error(`Failed to deploy to guild ${guild.name}:`, error.message);
      }
    }
    
    console.log('Successfully deployed all user apps to available guilds.');
    
    // Optionally deploy globally (uncomment for production)
    /*
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands }
    );
    console.log('Successfully deployed all user apps globally.');
    */
    
  } catch (error) {
    console.error('Error deploying user apps:', error);
  }
}

// Run deployment if this file is executed directly
if (require.main === module) {
  deployUserApps().catch(console.error);
}

module.exports = { deployUserApps };
