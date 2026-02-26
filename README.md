# ElevenLabs TTS for Obsidian

An [Obsidian](https://obsidian.md) plugin that integrates with the [ElevenLabs](https://elevenlabs.io) Text-to-Speech API. Select text in your notes, generate natural-sounding speech, and follow along with real-time word-level highlighting.

## Features

- **Text-to-Speech generation** — select any text and generate audio with a hotkey (`Cmd+Shift+G` / `Ctrl+Shift+G`)
- **Word-level highlighting** — words highlight in sync with audio playback using character-level timestamps from the API
- **Click-to-seek** — click any word to jump to that point in the audio
- **Voice selection** — browse and select from your saved ElevenLabs voices directly in the side panel
- **Style presets** — choose from Neutral, Dramatic, Energetic, Calm, or Storyteller presets with adjustable intensity
- **Speed control** — adjust speech speed (0.7x–1.2x) with a slider
- **Generation history** — replay, regenerate, or delete past generations; each entry shows the voice and settings used
- **Audio saved to vault** — generated MP3 files are stored in a configurable output folder inside your vault

## Installation

### With BRAT (recommended)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from Obsidian Community Plugins
2. In BRAT settings, click **Add Beta plugin**
3. Enter: `faccuo/tts`
4. Enable **ElevenLabs TTS** in Settings > Community Plugins

### Manual

1. Clone this repo and build:
   ```bash
   git clone https://github.com/faccuo/tts.git
   cd tts
   npm install
   npm run build
   ```
2. Copy `main.js`, `styles.css`, and `manifest.json` into your vault:
   ```
   <your-vault>/.obsidian/plugins/elevenlabs-tts/
   ```
3. Enable **ElevenLabs TTS** in Settings > Community Plugins

## Configuration

1. Go to Settings > ElevenLabs TTS
2. Enter your [ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys)
3. Set the output folder for generated audio files (default: `output`)

Voice selection, style presets, intensity, and speed are all configured in the TTS side panel (click the speaker icon in the ribbon or run the "Open TTS panel" command).

## Usage

1. Select text in any note
2. Press `Cmd+Shift+G` (macOS) / `Ctrl+Shift+G` (Windows/Linux), or use the command palette: **Play selected text**
3. The TTS panel opens with the generated audio playing and words highlighting in real time
4. Use the panel controls to play/pause, stop, or regenerate with different voice/style settings

## Development

```bash
npm install
npm run dev        # watch mode
npm run build      # production build
```

To deploy directly to your vault during development:

```bash
export OBSIDIAN_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/elevenlabs-tts"
npm run install-plugin
```

## License

MIT
