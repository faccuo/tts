import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, ElevenLabsTTSSettings, VIEW_TYPE_TTS_PANEL, Voice } from "./types";
import { ElevenLabsTTSSettingTab } from "./settings";
import { TTSPanelView } from "./tts-panel-view";
import { generateSpeechWithTimestamps } from "./elevenlabs-api";

export default class ElevenLabsTTSPlugin extends Plugin {
	settings: ElevenLabsTTSSettings = DEFAULT_SETTINGS;
	cachedVoices: Voice[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register the TTS panel view
		this.registerView(VIEW_TYPE_TTS_PANEL, (leaf) => new TTSPanelView(leaf, this));

		// Ribbon icon to open the TTS panel
		this.addRibbonIcon("audio-lines", "ElevenLabs TTS", () => {
			this.activatePanel();
		});

		// Command: generate and play TTS for selected text
		this.addCommand({
			id: "elevenlabs-tts-play",
			name: "Play selected text",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "g" }],
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (!selection || selection.trim().length === 0) {
					return false;
				}
				if (!checking) {
					this.handleTTSCommand(selection.trim());
				}
				return true;
			},
		});

		// Command: open the TTS panel
		this.addCommand({
			id: "elevenlabs-tts-open-panel",
			name: "Open TTS panel",
			callback: () => {
				this.activatePanel();
			},
		});

		// Settings tab
		this.addSettingTab(new ElevenLabsTTSSettingTab(this.app, this));
	}

	onunload(): void {
		// Obsidian handles view deregistration automatically
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ElevenLabsTTSSettings>);
		// Ensure history is always an array
		if (!Array.isArray(this.settings.history)) {
			this.settings.history = [];
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ─── Core TTS flow ───

	private async handleTTSCommand(text: string): Promise<void> {
		// Validate config
		if (!this.settings.apiKey) {
			new Notice("Please set your ElevenLabs API key in plugin settings.");
			return;
		}
		if (!this.settings.selectedVoiceId) {
			new Notice("Please select a voice in plugin settings.");
			return;
		}

		// Open/activate panel
		const panel = await this.activatePanel();
		if (!panel) {
			new Notice("Could not open TTS panel.");
			return;
		}

		// Show loading state in panel
		panel.showGenerating(text, this.settings.selectedVoiceName);

		try {
			// Call ElevenLabs API
			const { audioBuffer, wordTimings } = await generateSpeechWithTimestamps(
				this.settings.apiKey,
				this.settings.selectedVoiceId,
				text
			);

			// Ensure output folder exists
			const folder = this.settings.outputFolder;
			if (!await this.app.vault.adapter.exists(folder)) {
				await this.app.vault.createFolder(folder);
			}

			// Save audio file
			const timestamp = Date.now();
			const fileName = `${folder}/tts-${timestamp}.mp3`;
			await this.app.vault.createBinary(fileName, audioBuffer);

			// Create history entry
			const entryId = `tts-${timestamp}`;
			const entry = {
				id: entryId,
				text,
				voiceName: this.settings.selectedVoiceName,
				voiceId: this.settings.selectedVoiceId,
				date: timestamp,
				fileName,
				wordTimings,
			};

			this.settings.history.push(entry);
			await this.saveSettings();

			// Load and play in panel
			await panel.loadAndPlay(text, wordTimings, fileName, entryId);

			new Notice("Speech generated successfully.");
		} catch (e) {
			const msg = (e as Error).message;
			panel.showError(`Generation failed: ${msg}`);
			new Notice(`TTS failed: ${msg}`);
			console.error("ElevenLabs TTS error:", e);
		}
	}

	// ─── Panel management ───

	async activatePanel(): Promise<TTSPanelView | null> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_TTS_PANEL)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (!rightLeaf) return null;
			leaf = rightLeaf;
			await leaf.setViewState({
				type: VIEW_TYPE_TTS_PANEL,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
		return leaf.view as TTSPanelView;
	}
}
