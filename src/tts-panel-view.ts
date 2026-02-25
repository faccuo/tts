import { ItemView, WorkspaceLeaf, Notice, setIcon } from "obsidian";
import type ElevenLabsTTSPlugin from "./main";
import { VIEW_TYPE_TTS_PANEL, WordTiming, HistoryEntry } from "./types";

export class TTSPanelView extends ItemView {
	plugin: ElevenLabsTTSPlugin;

	// Current playback state
	private audioEl: HTMLAudioElement | null = null;
	private animationFrameId: number | null = null;
	private wordSpans: HTMLSpanElement[] = [];
	private currentWordTimings: WordTiming[] = [];
	private currentActiveIndex = -1;
	private isPlaying = false;

	// DOM references
	private textContainerEl!: HTMLElement;
	private controlsEl!: HTMLElement;
	private playBtn!: HTMLButtonElement;
	private stopBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private historyContainerEl!: HTMLElement;
	private currentEntryId: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ElevenLabsTTSPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_TTS_PANEL;
	}

	getDisplayText(): string {
		return "ElevenLabs TTS";
	}

	getIcon(): string {
		return "audio-lines";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("tts-panel");

		// Status
		this.statusEl = container.createEl("div", { cls: "tts-status" });
		this.statusEl.setText("Select text and run the TTS command to begin.");

		// Controls
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

		// Text display
		this.textContainerEl = container.createEl("div", { cls: "tts-text-container" });

		// History section
		const historySectionEl = container.createEl("div", { cls: "tts-history-section" });

		const historyHeader = historySectionEl.createEl("div", { cls: "tts-history-header" });
		historyHeader.createEl("h4", { text: "History" });

		const clearBtn = historyHeader.createEl("button", { cls: "tts-btn tts-btn-danger" });
		setIcon(clearBtn, "trash-2");
		clearBtn.createSpan({ text: " Clear all" });
		clearBtn.addEventListener("click", () => this.clearAllHistory());

		this.historyContainerEl = historySectionEl.createEl("div", { cls: "tts-history-list" });

		this.renderHistory();
	}

	async onClose(): Promise<void> {
		this.stopPlayback();
	}

	// ─── Public API called from main.ts ───

	showGenerating(text: string, voiceName: string): void {
		this.stopPlayback();
		this.textContainerEl.empty();
		this.textContainerEl.addClass("tts-text-loading");

		// Show text with newlines preserved but dimmed
		this.renderPlainText(text, this.textContainerEl);

		// Loading indicator
		this.statusEl.empty();
		const indicator = this.statusEl.createEl("span", { cls: "tts-loading-indicator" });
		indicator.setText(`Generating with ${voiceName}`);

		this.playBtn.disabled = true;
		this.stopBtn.disabled = true;
	}

	showError(message: string): void {
		this.textContainerEl.removeClass("tts-text-loading");
		this.statusEl.empty();
		this.statusEl.createEl("span", { cls: "tts-status-error", text: message });
	}

	async loadAndPlay(text: string, wordTimings: WordTiming[], fileName: string, entryId: string): Promise<void> {
		this.stopPlayback();
		this.textContainerEl.removeClass("tts-text-loading");
		this.currentWordTimings = wordTimings;
		this.currentEntryId = entryId;

		this.renderTextWithWords(text, wordTimings);
		this.statusEl.setText(`Voice: ${this.plugin.settings.selectedVoiceName}`);

		await this.loadAudioFromVault(fileName);
		this.renderHistory();
		this.play();
	}

	async replayFromHistory(entry: HistoryEntry): Promise<void> {
		this.stopPlayback();
		this.currentWordTimings = entry.wordTimings;
		this.currentEntryId = entry.id;

		this.renderTextWithWords(entry.text, entry.wordTimings);
		this.statusEl.setText(`Voice: ${entry.voiceName}`);

		try {
			await this.loadAudioFromVault(entry.fileName);
			this.play();
		} catch {
			new Notice("Audio file not found. It may have been deleted.");
		}
	}

	// ─── Render text ───

	private renderPlainText(text: string, container: HTMLElement): void {
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				container.createEl("br");
			}
			const line = parts[i]!;
			if (line.length > 0) {
				container.appendText(line);
			}
		}
	}

	private appendTextWithBreaks(text: string, container: HTMLElement): void {
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				container.createEl("br");
			}
			const line = parts[i]!;
			if (line.length > 0) {
				container.appendText(line);
			}
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

			// Add spaces/punctuation/newlines between words
			if (wt.startIndex > lastEnd) {
				const between = text.substring(lastEnd, wt.startIndex);
				this.appendTextWithBreaks(between, this.textContainerEl);
			}

			const span = this.textContainerEl.createEl("span", {
				cls: "tts-word",
				text: wt.word,
			});

			const timing = wt;
			span.addEventListener("click", () => {
				if (this.audioEl) {
					this.audioEl.currentTime = timing.startTime;
					if (!this.isPlaying) {
						this.play();
					}
				}
			});

			this.wordSpans.push(span);
			lastEnd = wt.endIndex;
		}

		// Trailing text
		if (lastEnd < text.length) {
			const trailing = text.substring(lastEnd);
			this.appendTextWithBreaks(trailing, this.textContainerEl);
		}
	}

	// ─── Audio loading ───

	private async loadAudioFromVault(fileName: string): Promise<void> {
		const file = this.app.vault.getFileByPath(fileName);
		if (!file) {
			throw new Error(`File not found: ${fileName}`);
		}

		const arrayBuffer = await this.app.vault.readBinary(file);
		const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
		const url = URL.createObjectURL(blob);

		if (this.audioEl) {
			URL.revokeObjectURL(this.audioEl.src);
			this.audioEl.remove();
		}

		this.audioEl = new Audio(url);
		this.audioEl.addEventListener("ended", () => {
			this.onPlaybackEnded();
		});

		this.playBtn.disabled = false;
		this.stopBtn.disabled = false;
	}

	// ─── Playback controls ───

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
		if (this.isPlaying) {
			this.pause();
		} else {
			this.play();
		}
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

	// ─── Highlight loop ───

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
			if (currentTime >= wt.startTime && currentTime < wt.endTime) {
				activeIndex = i;
				break;
			}
		}

		// If between words, find the next upcoming word
		if (activeIndex === -1) {
			for (let i = 0; i < this.currentWordTimings.length; i++) {
				const wt = this.currentWordTimings[i]!;
				if (currentTime < wt.startTime) {
					// Keep highlighting the previous word
					activeIndex = i > 0 ? i - 1 : -1;
					break;
				}
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
		for (const span of this.wordSpans) {
			span.removeClass("tts-word-active");
		}
		this.currentActiveIndex = -1;
	}

	// ─── History ───

	private renderHistory(): void {
		this.historyContainerEl.empty();
		const history = this.plugin.settings.history;

		if (history.length === 0) {
			this.historyContainerEl.createEl("div", {
				cls: "tts-history-empty",
				text: "No history yet.",
			});
			return;
		}

		// Show most recent first
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
			replayBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.replayFromHistory(entry);
			});

			const deleteBtn = actionsEl.createEl("button", { cls: "tts-btn-small tts-btn-danger-small" });
			setIcon(deleteBtn, "trash-2");
			deleteBtn.title = "Delete";
			deleteBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.confirmDeleteEntry(entry);
			});
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
		// Stop playback if this entry is currently playing
		if (this.currentEntryId === entry.id) {
			this.stopPlayback();
			this.textContainerEl.empty();
			this.statusEl.setText("Select text and run the TTS command to begin.");
			this.currentEntryId = null;
		}

		// Delete audio file from vault
		try {
			const file = this.app.vault.getFileByPath(entry.fileName);
			if (file) {
				await this.app.vault.delete(file);
			}
		} catch {
			// File may already be deleted, that's OK
		}

		// Remove from history
		this.plugin.settings.history = this.plugin.settings.history.filter((h) => h.id !== entry.id);
		await this.plugin.saveSettings();

		this.renderHistory();
		new Notice("Recording deleted.");
	}

	private async clearAllHistory(): Promise<void> {
		if (this.plugin.settings.history.length === 0) {
			new Notice("History is already empty.");
			return;
		}

		const confirmed = await this.showConfirmDialog(
			"Clear all history",
			`This will delete all ${this.plugin.settings.history.length} recording(s) and their audio files from disk.\n\nThis cannot be undone.`
		);
		if (!confirmed) return;

		this.stopPlayback();
		this.textContainerEl.empty();
		this.statusEl.setText("Select text and run the TTS command to begin.");
		this.currentEntryId = null;

		// Delete all audio files
		for (const entry of this.plugin.settings.history) {
			try {
				const file = this.app.vault.getFileByPath(entry.fileName);
				if (file) {
					await this.app.vault.delete(file);
				}
			} catch {
				// Continue deleting others
			}
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

			const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
			cancelBtn.addEventListener("click", () => {
				overlay.remove();
				resolve(false);
			});

			const confirmBtn = btnRow.createEl("button", {
				cls: "mod-warning",
				text: "Delete",
			});
			confirmBtn.addEventListener("click", () => {
				overlay.remove();
				resolve(true);
			});

			overlay.addEventListener("click", (e) => {
				if (e.target === overlay) {
					overlay.remove();
					resolve(false);
				}
			});
		});
	}
}

function formatDate(timestamp: number): string {
	const d = new Date(timestamp);
	const pad = (n: number): string => n.toString().padStart(2, "0");
	return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
