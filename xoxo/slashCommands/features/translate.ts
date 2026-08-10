import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('translate')
  .setDescription('Translate text from any language into English or another target language.')
  .addStringOption((o) =>
    o
      .setName('text')
      .setDescription('The text you want to translate (max 500 characters).')
      .setMaxLength(500)
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName('language')
      .setDescription('Target language — defaults to English.')
      .setRequired(false)
      .addChoices(
        { name: '🇬🇧 English (default)',  value: 'en'    },
        { name: '🇪🇸 Spanish',            value: 'es'    },
        { name: '🇮🇳 Hindi',              value: 'hi'    },
        { name: '🇫🇷 French',             value: 'fr'    },
        { name: '🇩🇪 German',             value: 'de'    },
        { name: '🇯🇵 Japanese',           value: 'ja'    },
        { name: '🇲🇽 Mexican Spanish',    value: 'es-mx' },
      ),
  );
