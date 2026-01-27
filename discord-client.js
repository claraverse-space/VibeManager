// discord-client.js - Discord bot client
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const EventEmitter = require('events');

class DiscordClient extends EventEmitter {
  constructor(config, botService) {
    super();
    this.config = config;
    this.botService = botService;
    this.client = null;
    this.ready = false;
  }

  async connect() {
    if (!this.config.get('discord.token')) {
      console.log('[Discord] No token provided, skipping Discord bot');
      return false;
    }

    console.log('[Discord] Connecting...');

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ]
    });

    this.client.on('ready', () => {
      console.log(`[Discord] Connected as ${this.client.user.tag}`);
      this.ready = true;
      this.emit('ready');
    });

    this.client.on('messageCreate', async (message) => {
      await this.handleMessage(message);
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isButton()) {
        await this.handleButton(interaction);
      }
    });

    this.client.on('error', (error) => {
      console.error('[Discord] Error:', error);
      this.emit('error', error);
    });

    try {
      await this.client.login(this.config.get('discord.token'));
      return true;
    } catch (err) {
      console.error('[Discord] Failed to connect:', err.message);
      return false;
    }
  }

  async handleMessage(message) {
    // Ignore bots
    if (message.author.bot) return;

    // Check if message starts with command prefix
    const prefix = this.config.get('discord.commandPrefix') || '/';
    if (!message.content.startsWith(prefix)) return;

    // Check authorization
    const userId = message.author.id;
    if (!this.config.isUserAllowed('discord', userId)) {
      await message.reply(this.botService.formatter.formatUnauthorized(userId, 'Discord'));
      return;
    }

    // Parse command
    const parsed = this.botService.parser.parse(message.content, prefix);

    if (!parsed || parsed.error) {
      if (parsed?.error === 'unknown_command') {
        await message.reply(`Unknown command: ${parsed.command}\n\nUse ${prefix}help to see available commands.`);
      } else if (parsed?.error === 'missing_subcommand') {
        await message.reply(`Missing subcommand. Available: ${parsed.availableSubcommands.join(', ')}`);
      } else {
        await message.reply(`Invalid command. Use ${prefix}help for help.`);
      }
      return;
    }

    // Validate
    const validation = this.botService.parser.validate(parsed);
    if (!validation.valid) {
      const usage = this.botService.parser.formatUsage(parsed.command, parsed.subcommand);
      await message.reply(`❌ Missing parameters: ${validation.missing.join(', ')}\n\nUsage: ${usage}`);
      return;
    }

    // Execute command
    try {
      const result = await this.botService.handleCommand(parsed, { platform: 'discord', userId, username: message.author.username });

      // Send response
      await this.sendResponse(message, result);
    } catch (err) {
      console.error('[Discord] Command error:', err);
      await message.reply(this.botService.formatter.formatError(err.message));
    }
  }

  async handleButton(interaction) {
    // Button format: "action:session:param"
    const [action, sessionName, param] = interaction.customId.split(':');

    // Check authorization
    if (!this.config.isUserAllowed('discord', interaction.user.id)) {
      await interaction.reply({ content: 'Unauthorized', ephemeral: true });
      return;
    }

    try {
      let result;

      switch (action) {
        case 'start':
          result = await this.botService.handleCommand(
            { command: 'start', params: { name: sessionName } },
            { platform: 'discord', userId: interaction.user.id }
          );
          break;

        case 'stop':
          result = await this.botService.handleCommand(
            { command: 'stop', params: { name: sessionName } },
            { platform: 'discord', userId: interaction.user.id }
          );
          break;

        case 'status':
          result = await this.botService.handleCommand(
            { command: 'status', params: { name: sessionName } },
            { platform: 'discord', userId: interaction.user.id }
          );
          break;

        case 'ralph_start':
          result = await this.botService.handleCommand(
            { command: 'ralph', subcommand: 'start', params: { session: sessionName } },
            { platform: 'discord', userId: interaction.user.id }
          );
          break;

        case 'ralph_pause':
          result = await this.botService.handleCommand(
            { command: 'ralph', subcommand: 'pause', params: { session: sessionName } },
            { platform: 'discord', userId: interaction.user.id }
          );
          break;

        default:
          await interaction.reply({ content: 'Unknown action', ephemeral: true });
          return;
      }

      await interaction.reply({ content: result.text });
    } catch (err) {
      console.error('[Discord] Button error:', err);
      await interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }

  async sendResponse(message, result) {
    // If result has embed data, create rich embed
    if (result.embed) {
      const embed = this.createEmbed(result.embed);
      const components = result.buttons ? [this.createButtons(result.buttons)] : [];

      await message.reply({ embeds: [embed], components });
    } else {
      // Simple text response
      const components = result.buttons ? [this.createButtons(result.buttons)] : [];
      await message.reply({ content: result.text, components });
    }
  }

  createEmbed(data) {
    const embed = new EmbedBuilder()
      .setColor(data.color || 0x5865F2)
      .setTitle(data.title);

    if (data.description) embed.setDescription(data.description);
    if (data.fields) {
      for (const field of data.fields) {
        embed.addFields(field);
      }
    }
    if (data.footer) embed.setFooter({ text: data.footer });
    if (data.timestamp) embed.setTimestamp();

    return embed;
  }

  createButtons(buttons) {
    const row = new ActionRowBuilder();

    for (const btn of buttons) {
      const button = new ButtonBuilder()
        .setCustomId(btn.id)
        .setLabel(btn.label)
        .setStyle(btn.style === 'primary' ? ButtonStyle.Primary :
                  btn.style === 'danger' ? ButtonStyle.Danger :
                  btn.style === 'success' ? ButtonStyle.Success : ButtonStyle.Secondary);

      if (btn.emoji) button.setEmoji(btn.emoji);
      row.addComponents(button);
    }

    return row;
  }

  async sendNotification(userId, message) {
    if (!this.ready) return false;

    try {
      const user = await this.client.users.fetch(userId);
      if (!user) return false;

      if (message.embed) {
        const embed = this.createEmbed(message.embed);
        const components = message.buttons ? [this.createButtons(message.buttons)] : [];
        await user.send({ embeds: [embed], components });
      } else {
        await user.send(message.text);
      }

      return true;
    } catch (err) {
      console.error('[Discord] Failed to send notification:', err.message);
      return false;
    }
  }

  disconnect() {
    if (this.client) {
      this.client.destroy();
      this.ready = false;
      console.log('[Discord] Disconnected');
    }
  }
}

module.exports = DiscordClient;
