# Discord User Apps

This directory contains user app handlers for the Discord bot. User apps are context menu commands that appear when right-clicking on user profiles in Discord.

## What are User Apps?

User apps are Discord's way of allowing bots to provide context-sensitive functionality when users interact with other users. They appear as options in the right-click context menu on user profiles.

## Available User Apps

### 1. Chat with User

- **Command**: Right-click on a user → "Chat with User"
- **Functionality**: Starts a private AI-powered conversation with another user
- **Features**:
  - Modal input for messages
  - Persistent conversation history
  - AI responses using the configured model

### 2. Analyze User

- **Command**: Right-click on a user → "Analyze User"
- **Functionality**: Provides AI-powered analysis of user profiles
- **Features**:
  - Account age calculation
  - Server membership information
  - Role and permission analysis
  - AI-generated insights

### 3. Quick Chat

- **Command**: Right-click on a user → "Quick Chat"
- **Functionality**: Quick access to AI chat without starting a conversation
- **Features**:
  - Modal input for questions
  - One-time AI responses
  - No conversation history maintained

## How to Use

1. **Deploy User Apps**: Run `npm run deploy:user-apps` to register the user apps with Discord
2. **Right-click on any user** in your Discord server
3. **Select the desired user app** from the context menu
4. **Follow the prompts** to interact with the AI

## Creating Custom User Apps

To create a new user app, create a new JavaScript file in this directory with the following structure:

```javascript
const { ApplicationCommandType, PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: "Your App Name",
  type: ApplicationCommandType.User,
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,

  async execute(interaction, client) {
    // Your app logic here
    // interaction.targetUser contains the user that was right-clicked
    // interaction.user contains the user who executed the command
  },
};
```

### Required Properties

- **name**: The display name of the user app (appears in context menu)
- **type**: Must be `ApplicationCommandType.User`
- **execute**: Function that handles the user app interaction

### Optional Properties

- **defaultMemberPermissions**: Discord permission flags required to use the app
- **dmPermission**: Whether the app can be used in DMs

### Example: Simple User Info App

```javascript
const {
  ApplicationCommandType,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  name: "Get User Info",
  type: ApplicationCommandType.User,
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,

  async execute(interaction, client) {
    const targetUser = interaction.targetUser;

    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.username}'s Info`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "Username", value: targetUser.username, inline: true },
        {
          name: "Account Created",
          value: targetUser.createdAt.toDateString(),
          inline: true,
        },
        {
          name: "Bot Account",
          value: targetUser.bot ? "Yes" : "No",
          inline: true,
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
```

## Deployment

After creating or modifying user apps:

1. **Test locally** by running the bot
2. **Deploy to Discord** using `npm run deploy:user-apps`
3. **Restart the bot** if needed

## Notes

- User apps are loaded automatically when the bot starts
- Each user app maintains its own conversation history if needed
- User apps can interact with the AI service through the existing utilities
- All user apps are ephemeral by default for privacy
- User apps work in both guilds and DMs (if configured)

## Troubleshooting

- **App not appearing**: Make sure the app is properly deployed using `npm run deploy:user-apps`
- **Permission errors**: Check the `defaultMemberPermissions` setting
- **Runtime errors**: Check the bot logs for detailed error information
- **Modal issues**: Ensure modal custom IDs are unique and properly handled
