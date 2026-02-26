import { App, PluginSettingTab, Setting } from "obsidian";
import type ElevenLabsTTSPlugin from "./main";

export class ElevenLabsTTSSettingTab extends PluginSettingTab {
	plugin: ElevenLabsTTSPlugin;

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
			.setDesc("Your ElevenLabs API key. Voices will load automatically in the TTS panel.")
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
						this.plugin.cachedVoices = [];
						await this.plugin.saveSettings();
					})
			);

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
}
