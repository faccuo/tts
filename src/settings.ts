import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ElevenLabsTTSPlugin from "./main";
import { Voice } from "./types";
import { fetchVoices } from "./elevenlabs-api";

export class ElevenLabsTTSSettingTab extends PluginSettingTab {
	plugin: ElevenLabsTTSPlugin;
	voices: Voice[] = [];
	voiceDropdown: Setting | null = null;

	constructor(app: App, plugin: ElevenLabsTTSPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "ElevenLabs TTS Settings" });

		// API Key
		new Setting(containerEl)
			.setName("API Key")
			.setDesc("Your ElevenLabs API key. Saved voices will load after entering a valid key.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.apiKey)
					.then((t) => {
						t.inputEl.type = "password";
						t.inputEl.style.width = "300px";
					})
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Validate & Load Voices")
					.setCta()
					.onClick(async () => {
						const apiKey = this.plugin.settings.apiKey;
						if (!apiKey) {
							new Notice("Please enter an API key first.");
							return;
						}
						button.setButtonText("Loading...");
						button.setDisabled(true);
						try {
							this.voices = await fetchVoices(apiKey);
							if (this.voices.length === 0) {
								new Notice("No saved voices found. Add voices to your ElevenLabs favorites.");
							} else {
								new Notice(`Loaded ${this.voices.length} voice(s).`);
							}
							this.plugin.cachedVoices = this.voices;
							this.refreshVoiceDropdown(containerEl);
						} catch (e) {
							new Notice(`Failed to load voices: ${(e as Error).message}`);
						} finally {
							button.setButtonText("Validate & Load Voices");
							button.setDisabled(false);
						}
					})
			);

		// Voice dropdown placeholder
		this.buildVoiceDropdown(containerEl);

		// Output folder
		new Setting(containerEl)
			.setName("Output Folder")
			.setDesc("Folder inside the vault where generated audio files will be saved.")
			.addText((text) =>
				text
					.setPlaceholder("output")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value.trim() || "output";
						await this.plugin.saveSettings();
					})
			);
	}

	private buildVoiceDropdown(containerEl: HTMLElement): void {
		// Remove existing dropdown if present
		if (this.voiceDropdown) {
			this.voiceDropdown.settingEl.remove();
			this.voiceDropdown = null;
		}

		const voices = this.voices.length > 0 ? this.voices : this.plugin.cachedVoices;

		if (voices.length === 0) {
			this.voiceDropdown = new Setting(containerEl)
				.setName("Voice")
				.setDesc("Validate your API key first to load available voices.");
			return;
		}

		this.voiceDropdown = new Setting(containerEl)
			.setName("Voice")
			.setDesc("Select a voice for text-to-speech generation.")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "-- Select a voice --");
				for (const voice of voices) {
					dropdown.addOption(voice.voice_id, voice.name);
				}
				dropdown.setValue(this.plugin.settings.selectedVoiceId);
				dropdown.onChange(async (value) => {
					this.plugin.settings.selectedVoiceId = value;
					const selected = voices.find((v) => v.voice_id === value);
					this.plugin.settings.selectedVoiceName = selected ? selected.name : "";
					await this.plugin.saveSettings();
				});
			});
	}

	private refreshVoiceDropdown(containerEl: HTMLElement): void {
		this.buildVoiceDropdown(containerEl);
	}
}
