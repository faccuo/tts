import { ItemView, WorkspaceLeaf, Notice, setIcon } from "obsidian";
import type ElevenLabsTTSPlugin from "./main";
import { VIEW_TYPE_TTS_PANEL, WordTiming, HistoryEntry, STYLE_PRESETS, StylePresetName } from "./types";
import { fetchVoices } from "./elevenlabs-api";

export class TTSPanelView extends ItemView {
	plugin: ElevenLabsTTSPlugin;

	// Playback state
	private audioEl: HTMLAudioElement | null = null;
	private animationFrameId: number | null = null;
	private wordSpans: HTMLSpanElement[] = [];
	private currentWordTimings: WordTiming[] = [];
	private currentActiveIndex = -1;
	private isPlaying = false;

	// DOM refs
	private voiceSelectEl!: HTMLSelectElement;
	private presetRadios: Map<string, HTMLInputElement> = new Map();
	private intensitySlider!: HTMLInputElement;
	private intensityValue!: HTMLSpanElement;
	private speedSlider!: HTMLInputElement;
	private speedValue!: HTMLSpanElement;
	private textContainerEl!: HTMLElement;
	private controlsEl!: HTMLElement;
	private playBtn!: HTMLButtonElement;
	private stopBtn!: HTMLButtonElement;
	private regenerateBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private historyContainerEl!: HTMLElement;
	private currentEntryId: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ElevenLabsTTSPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE_TTS_PANEL; }
	getDisplayText(): string { return "ElevenLabs TTS"; }
	getIcon(): string { return "audio-lines"; }

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("tts-panel");

		// ── Voice selector ──
		const voiceRow = container.createEl("div", { cls: "tts-voice-row" });
		voiceRow.createEl("span", { cls: "tts-label", text: "Voice" });
		this.voiceSelectEl = voiceRow.createEl("select", { cls: "tts-voice-select" });
		this.voiceSelectEl.addEventListener("change", () => this.onVoiceChanged());

		// ── Style presets ──
		const styleSection = container.createEl("div", { cls: "tts-style-section" });
		styleSection.createEl("span", { cls: "tts-label", text: "Style" });

		const presetGroup = styleSection.createEl("div", { cls: "tts-preset-group" });
		const presetNames = Object.keys(STYLE_PRESETS) as StylePresetName[];
		for (const name of presetNames) {
			const preset = STYLE_PRESETS[name];
			const label = presetGroup.createEl("label", { cls: "tts-preset-option" });
			const radio = label.createEl("input", { type: "radio" });
			radio.name = "tts-style-preset";
			radio.value = name;
			radio.checked = name === this.plugin.settings.stylePreset;
			radio.addEventListener("change", () => this.onPresetChanged(name));
			this.presetRadios.set(name, radio);
			const textWrap = label.createEl("span", { cls: "tts-preset-text" });
			textWrap.createEl("span", { cls: "tts-preset-name", text: preset.label });
			textWrap.createEl("span", { cls: "tts-preset-desc", text: preset.description });
		}

		// ── Intensity slider ──
		const intensityRow = styleSection.createEl("div", { cls: "tts-slider-row" });
		intensityRow.createEl("span", { cls: "tts-slider-label", text: "Intensity" });
		this.intensitySlider = intensityRow.createEl("input", { type: "range" });
		this.intensitySlider.min = "0";
		this.intensitySlider.max = "100";
		this.intensitySlider.step = "5";
		this.intensitySlider.value = String(this.plugin.settings.styleIntensity);
		this.intensitySlider.classList.add("tts-slider");
		this.intensityValue = intensityRow.createEl("span", { cls: "tts-slider-val", text: `${this.plugin.settings.styleIntensity}%` });
		this.intensitySlider.addEventListener("input", () => this.onIntensityChanged());

		// ── Speed slider ──
		const speedRow = styleSection.createEl("div", { cls: "tts-slider-row" });
		speedRow.createEl("span", { cls: "tts-slider-label", text: "Speed" });
		this.speedSlider = speedRow.createEl("input", { type: "range" });
		this.speedSlider.min = "0.5";
		this.speedSlider.max = "2.0";
		this.speedSlider.step = "0.05";
		this.speedSlider.value = String(this.plugin.settings.speed);
		this.speedSlider.classList.add("tts-slider");
		this.speedValue = speedRow.createEl("span", { cls: "tts-slider-val", text: `${this.plugin.settings.speed.toFixed(2)}x` });
		this.speedSlider.addEventListener("input", () => this.onSpeedChanged());

		// ── Status ──
		this.statusEl = container.createEl("div", { cls: "tts-status" });
		this.statusEl.setText("Select text and use Cmd+Shift+G to generate.");

		// ── Controls ──
		this.controlsEl = container.createEl("div", { cls: "tts-controls" });

		this.playBtn = this.controlsEl.createEl("button", { cls: "tts-btn tts-btn-play" });
		setIcon(this.playBtn, "play");
		this.playBtn.createSpan({ text: " Play" });
		this.playBtn.addEventListener("click", () => this.togglePlayPause());
		this.playBtn.disabled = true;

		this.stopBtn = this.controlsEl.createEl("button", { cls: "tts-btn tts-btn-stop" });
		setIcon(this.stopBtn, "square");
		this.stopBtn.createSpan({ text: " Stop" });
		this.stopBtn.addEventListener("click", () => this.stopPlayback());
		this.stopBtn.disabled = true;

		this.regenerateBtn = this.controlsEl.createEl("button", { cls: "tts-btn" });
		setIcon(this.regenerateBtn, "refresh-cw");
		this.regenerateBtn.createSpan({ text: " Regen" });
		this.regenerateBtn.title = "Regenerate with the selected voice and style";
		this.regenerateBtn.addEventListener("click", () => this.regenerateCurrent());
		this.regenerateBtn.disabled = true;

		// ── Text display ──
		this.textContainerEl = container.createEl("div", { cls: "tts-text-container" });

		// ── History ──
		const historySectionEl = container.createEl("div", { cls: "tts-history-section" });
		const historyHeader = historySectionEl.createEl("div", { cls: "tts-history-header" });
		historyHeader.createEl("h4", { text: "History" });

		const clearBtn = historyHeader.createEl("button", { cls: "tts-btn tts-btn-danger" });
		setIcon(clearBtn, "trash-2");
		clearBtn.createSpan({ text: " Clear all" });
		clearBtn.addEventListener("click", () => this.clearAllHistory());

		this.historyContainerEl = historySectionEl.createEl("div", { cls: "tts-history-list" });
		this.renderHistory();

		// Auto-load voices
		await this.ensureVoicesLoaded();
	}

	async onClose(): Promise<void> {
		this.stopPlayback();
	}

	// ─── Voice combo ───

	private async ensureVoicesLoaded(): Promise<void> {
		if (this.plugin.cachedVoices.length > 0) {
			this.populateVoiceSelect();
			return;
		}
		const apiKey = this.plugin.settings.apiKey;
		if (!apiKey) {
			this.voiceSelectEl.innerHTML = "";
			const opt = this.voiceSelectEl.createEl("option", { value: "", text: "Set API key in settings" });
			opt.disabled = true;
			return;
		}
		this.voiceSelectEl.innerHTML = "";
		this.voiceSelectEl.createEl("option", { value: "", text: "Loading voices..." });
		this.voiceSelectEl.disabled = true;
		try {
			this.plugin.cachedVoices = await fetchVoices(apiKey);
			this.populateVoiceSelect();
		} catch (e) {
			this.voiceSelectEl.innerHTML = "";
			this.voiceSelectEl.createEl("option", { value: "", text: "Failed to load voices" });
			console.error("Failed to auto-load voices:", e);
		} finally {
			this.voiceSelectEl.disabled = false;
		}
	}

	private populateVoiceSelect(): void {
		this.voiceSelectEl.innerHTML = "";
		if (this.plugin.cachedVoices.length === 0) {
			this.voiceSelectEl.createEl("option", { value: "", text: "No voices available" });
			return;
		}
		for (const voice of this.plugin.cachedVoices) {
			this.voiceSelectEl.createEl("option", { value: voice.voice_id, text: voice.name });
		}
		if (this.plugin.settings.selectedVoiceId) {
			this.voiceSelectEl.value = this.plugin.settings.selectedVoiceId;
		}
		if (!this.voiceSelectEl.value && this.plugin.cachedVoices.length > 0) {
			this.voiceSelectEl.value = this.plugin.cachedVoices[0]!.voice_id;
			this.onVoiceChanged();
		}
	}

	private async onVoiceChanged(): Promise<void> {
		const voiceId = this.voiceSelectEl.value;
		const voice = this.plugin.cachedVoices.find((v) => v.voice_id === voiceId);
		if (voice) {
			this.plugin.settings.selectedVoiceId = voice.voice_id;
			this.plugin.settings.selectedVoiceName = voice.name;
			await this.plugin.saveSettings();
		}
	}

	refreshVoices(): void {
		this.populateVoiceSelect();
	}

	// ─── Style settings ───

	private async onPresetChanged(name: StylePresetName): Promise<void> {
		this.plugin.settings.stylePreset = name;
		await this.plugin.saveSettings();
	}

	private async onIntensityChanged(): Promise<void> {
		const val = parseInt(this.intensitySlider.value);
		this.plugin.settings.styleIntensity = val;
		this.intensityValue.setText(`${val}%`);
		await this.plugin.saveSettings();
	}

	private async onSpeedChanged(): Promise<void> {
		const val = parseFloat(this.speedSlider.value);
		this.plugin.settings.speed = val;
		this.speedValue.setText(`${val.toFixed(2)}x`);
		await this.plugin.saveSettings();
	}

	// ─── Public API ───

	showGenerating(text: string, voiceName: string): void {
		this.stopPlayback();
		this.textContainerEl.empty();
		this.textContainerEl.addClass("tts-text-loading");
		this.renderPlainText(text, this.textContainerEl);
		this.statusEl.empty();
		const indicator = this.statusEl.createEl("span", { cls: "tts-loading-indicator" });
		indicator.setText(`Generating with ${voiceName}`);
		this.playBtn.disabled = true;
		this.stopBtn.disabled = true;
		this.regenerateBtn.disabled = true;
	}

	showError(message: string): void {
		this.textContainerEl.removeClass("tts-text-loading");
		this.statusEl.empty();
		this.statusEl.createEl("span", { cls: "tts-status-error", text: message });
		this.regenerateBtn.disabled = false;
	}

	async loadAndPlay(text: string, wordTimings: WordTiming[], fileName: string, entryId: string): Promise<void> {
		this.stopPlayback();
		this.textContainerEl.removeClass("tts-text-loading");
		this.currentWordTimings = wordTimings;
		this.currentEntryId = entryId;
		this.renderTextWithWords(text, wordTimings);
		const entry = this.plugin.settings.history.find((h) => h.id === entryId);
		const voiceName = entry ? entry.voiceName : this.plugin.settings.selectedVoiceName;
		this.statusEl.setText(`Generated with: ${voiceName}`);
		await this.loadAudioFromVault(fileName);
		this.regenerateBtn.disabled = false;
		this.renderHistory();
		this.play();
	}

	async replayFromHistory(entry: HistoryEntry): Promise<void> {
		this.stopPlayback();
		this.currentWordTimings = entry.wordTimings;
		this.currentEntryId = entry.id;
		this.renderTextWithWords(entry.text, entry.wordTimings);
		this.statusEl.setText(`Generated with: ${entry.voiceName}`);
		try {
			await this.loadAudioFromVault(entry.fileName);
			this.regenerateBtn.disabled = false;
			this.play();
		} catch {
			new Notice("Audio file not found. It may have been deleted.");
		}
	}

	// ─── Regenerate ───

	private async regenerateCurrent(): Promise<void> {
		if (!this.currentEntryId) return;
		const entry = this.plugin.settings.history.find((h) => h.id === this.currentEntryId);
		if (!entry) return;
		const voiceId = this.plugin.settings.selectedVoiceId;
		const voiceName = this.plugin.settings.selectedVoiceName;
		if (!voiceId) { new Notice("Select a voice first."); return; }
		await this.plugin.regenerateWithVoice(entry, voiceId, voiceName);
	}

	private async regenerateEntry(entry: HistoryEntry): Promise<void> {
		const voiceId = this.plugin.settings.selectedVoiceId;
		const voiceName = this.plugin.settings.selectedVoiceName;
		if (!voiceId) { new Notice("Select a voice first."); return; }
		await this.plugin.regenerateWithVoice(entry, voiceId, voiceName);
	}

	// ─── Render text ───

	private renderPlainText(text: string, container: HTMLElement): void {
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) container.createEl("br");
			const line = parts[i]!;
			if (line.length > 0) container.appendText(line);
		}
	}

	private appendTextWithBreaks(text: string, container: HTMLElement): void {
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) container.createEl("br");
			const line = parts[i]!;
			if (line.length > 0) container.appendText(line);
		}
	}

	private renderTextWithWords(text: string, wordTimings: WordTiming[]): void {
		this.textContainerEl.empty();
		this.wordSpans = [];
		if (wordTimings.length === 0) {
			this.renderPlainText(text, this.textContainerEl);
			return;
		}
		let lastEnd = 0;
		for (let i = 0; i < wordTimings.length; i++) {
			const wt = wordTimings[i]!;
			if (wt.startIndex > lastEnd) {
				this.appendTextWithBreaks(text.substring(lastEnd, wt.startIndex), this.textContainerEl);
			}
			const span = this.textContainerEl.createEl("span", { cls: "tts-word", text: wt.word });
			const timing = wt;
			span.addEventListener("click", () => {
				if (this.audioEl) {
					this.audioEl.currentTime = timing.startTime;
					if (!this.isPlaying) this.play();
				}
			});
			this.wordSpans.push(span);
			lastEnd = wt.endIndex;
		}
		if (lastEnd < text.length) {
			this.appendTextWithBreaks(text.substring(lastEnd), this.textContainerEl);
		}
	}

	// ─── Audio ───

	private async loadAudioFromVault(fileName: string): Promise<void> {
		const file = this.app.vault.getFileByPath(fileName);
		if (!file) throw new Error(`File not found: ${fileName}`);
		const arrayBuffer = await this.app.vault.readBinary(file);
		const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
		const url = URL.createObjectURL(blob);
		if (this.audioEl) { URL.revokeObjectURL(this.audioEl.src); this.audioEl.remove(); }
		this.audioEl = new Audio(url);
		this.audioEl.addEventListener("ended", () => this.onPlaybackEnded());
		this.playBtn.disabled = false;
		this.stopBtn.disabled = false;
	}

	// ─── Playback ───

	private play(): void {
		if (!this.audioEl) return;
		this.audioEl.play();
		this.isPlaying = true;
		this.updatePlayButton();
		this.startHighlightLoop();
	}

	private pause(): void {
		if (!this.audioEl) return;
		this.audioEl.pause();
		this.isPlaying = false;
		this.updatePlayButton();
		this.stopHighlightLoop();
	}

	private togglePlayPause(): void {
		if (this.isPlaying) this.pause(); else this.play();
	}

	private stopPlayback(): void {
		if (this.audioEl) {
			this.audioEl.pause();
			this.audioEl.currentTime = 0;
			URL.revokeObjectURL(this.audioEl.src);
			this.audioEl.remove();
			this.audioEl = null;
		}
		this.isPlaying = false;
		this.stopHighlightLoop();
		this.clearHighlight();
		this.updatePlayButton();
		this.playBtn.disabled = true;
		this.stopBtn.disabled = true;
	}

	private onPlaybackEnded(): void {
		this.isPlaying = false;
		this.stopHighlightLoop();
		this.updatePlayButton();
	}

	private updatePlayButton(): void {
		this.playBtn.empty();
		if (this.isPlaying) {
			setIcon(this.playBtn, "pause");
			this.playBtn.createSpan({ text: " Pause" });
		} else {
			setIcon(this.playBtn, "play");
			this.playBtn.createSpan({ text: " Play" });
		}
	}

	// ─── Highlight ───

	private startHighlightLoop(): void {
		this.stopHighlightLoop();
		const loop = (): void => {
			this.updateHighlight();
			this.animationFrameId = requestAnimationFrame(loop);
		};
		this.animationFrameId = requestAnimationFrame(loop);
	}

	private stopHighlightLoop(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	private updateHighlight(): void {
		if (!this.audioEl || this.wordSpans.length === 0) return;
		const currentTime = this.audioEl.currentTime;
		let activeIndex = -1;
		for (let i = 0; i < this.currentWordTimings.length; i++) {
			const wt = this.currentWordTimings[i]!;
			if (currentTime >= wt.startTime && currentTime < wt.endTime) { activeIndex = i; break; }
		}
		if (activeIndex === -1) {
			for (let i = 0; i < this.currentWordTimings.length; i++) {
				const wt = this.currentWordTimings[i]!;
				if (currentTime < wt.startTime) { activeIndex = i > 0 ? i - 1 : -1; break; }
			}
		}
		if (activeIndex !== this.currentActiveIndex) {
			this.clearHighlight();
			if (activeIndex >= 0 && activeIndex < this.wordSpans.length) {
				this.wordSpans[activeIndex]!.addClass("tts-word-active");
				this.wordSpans[activeIndex]!.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}
			this.currentActiveIndex = activeIndex;
		}
	}

	private clearHighlight(): void {
		for (const span of this.wordSpans) span.removeClass("tts-word-active");
		this.currentActiveIndex = -1;
	}

	// ─── History ───

	private renderHistory(): void {
		this.historyContainerEl.empty();
		const history = this.plugin.settings.history;
		if (history.length === 0) {
			this.historyContainerEl.createEl("div", { cls: "tts-history-empty", text: "No history yet." });
			return;
		}
		const sorted = [...history].reverse();
		for (const entry of sorted) {
			const itemEl = this.historyContainerEl.createEl("div", {
				cls: "tts-history-item" + (entry.id === this.currentEntryId ? " tts-history-item-active" : ""),
			});
			const textPreview = entry.text.length > 80 ? entry.text.substring(0, 80) + "..." : entry.text;
			itemEl.createEl("div", { cls: "tts-history-text", text: textPreview });
			const metaEl = itemEl.createEl("div", { cls: "tts-history-meta" });
			metaEl.createSpan({ text: entry.voiceName });
			metaEl.createSpan({ text: " \u00B7 " });
			metaEl.createSpan({ text: formatDate(entry.date) });
			const actionsEl = itemEl.createEl("div", { cls: "tts-history-actions" });

			const replayBtn = actionsEl.createEl("button", { cls: "tts-btn-small" });
			setIcon(replayBtn, "play");
			replayBtn.title = "Replay";
			replayBtn.addEventListener("click", (e) => { e.stopPropagation(); this.replayFromHistory(entry); });

			const regenBtn = actionsEl.createEl("button", { cls: "tts-btn-small" });
			setIcon(regenBtn, "refresh-cw");
			regenBtn.title = "Regenerate with selected voice & style";
			regenBtn.addEventListener("click", (e) => { e.stopPropagation(); this.regenerateEntry(entry); });

			const deleteBtn = actionsEl.createEl("button", { cls: "tts-btn-small tts-btn-danger-small" });
			setIcon(deleteBtn, "trash-2");
			deleteBtn.title = "Delete";
			deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); this.confirmDeleteEntry(entry); });
		}
	}

	private async confirmDeleteEntry(entry: HistoryEntry): Promise<void> {
		const confirmed = await this.showConfirmDialog(
			"Delete recording",
			`Delete "${entry.text.substring(0, 50)}${entry.text.length > 50 ? "..." : ""}"?\n\nThis will remove the audio file from disk.`
		);
		if (!confirmed) return;
		await this.deleteEntry(entry);
	}

	private async deleteEntry(entry: HistoryEntry): Promise<void> {
		if (this.currentEntryId === entry.id) {
			this.stopPlayback();
			this.textContainerEl.empty();
			this.statusEl.setText("Select text and use Cmd+Shift+G to generate.");
			this.currentEntryId = null;
			this.regenerateBtn.disabled = true;
		}
		try {
			const file = this.app.vault.getFileByPath(entry.fileName);
			if (file) await this.app.vault.delete(file);
		} catch { /* ok */ }
		this.plugin.settings.history = this.plugin.settings.history.filter((h) => h.id !== entry.id);
		await this.plugin.saveSettings();
		this.renderHistory();
		new Notice("Recording deleted.");
	}

	private async clearAllHistory(): Promise<void> {
		if (this.plugin.settings.history.length === 0) { new Notice("History is already empty."); return; }
		const confirmed = await this.showConfirmDialog(
			"Clear all history",
			`This will delete all ${this.plugin.settings.history.length} recording(s) and their audio files from disk.\n\nThis cannot be undone.`
		);
		if (!confirmed) return;
		this.stopPlayback();
		this.textContainerEl.empty();
		this.statusEl.setText("Select text and use Cmd+Shift+G to generate.");
		this.currentEntryId = null;
		this.regenerateBtn.disabled = true;
		for (const entry of this.plugin.settings.history) {
			try {
				const file = this.app.vault.getFileByPath(entry.fileName);
				if (file) await this.app.vault.delete(file);
			} catch { /* continue */ }
		}
		this.plugin.settings.history = [];
		await this.plugin.saveSettings();
		this.renderHistory();
		new Notice("All history cleared.");
	}

	private showConfirmDialog(title: string, message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const overlay = document.body.createEl("div", { cls: "tts-confirm-overlay" });
			const dialog = overlay.createEl("div", { cls: "tts-confirm-dialog" });
			dialog.createEl("h3", { text: title });
			dialog.createEl("p", { text: message });
			const btnRow = dialog.createEl("div", { cls: "tts-confirm-buttons" });
			btnRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => { overlay.remove(); resolve(false); });
			const confirmBtn = btnRow.createEl("button", { cls: "mod-warning", text: "Delete" });
			confirmBtn.addEventListener("click", () => { overlay.remove(); resolve(true); });
			overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
		});
	}
}

function formatDate(timestamp: number): string {
	const d = new Date(timestamp);
	const pad = (n: number): string => n.toString().padStart(2, "0");
	return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
