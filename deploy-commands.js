const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log('Started refreshing guild application (/) commands.');
    
    const clientId = config.clientId;
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    
    console.log('Successfully reloaded guild application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();