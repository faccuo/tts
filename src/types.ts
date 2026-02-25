export interface Voice {
	voice_id: string;
	name: string;
}

export interface CharacterAlignment {
	characters: string[];
	character_start_times_seconds: number[];
	character_end_times_seconds: number[];
}

export interface AudioWithTimestampsResponse {
	audio_base64: string;
	alignment: CharacterAlignment;
	normalized_alignment: CharacterAlignment;
}

export interface WordTiming {
	word: string;
	startTime: number;
	endTime: number;
	startIndex: number;
	endIndex: number;
}

export interface HistoryEntry {
	id: string;
	text: string;
	voiceName: string;
	voiceId: string;
	date: number;
	fileName: string;
	wordTimings: WordTiming[];
}

export interface ElevenLabsTTSSettings {
	apiKey: string;
	selectedVoiceId: string;
	selectedVoiceName: string;
	outputFolder: string;
	history: HistoryEntry[];
}

export const DEFAULT_SETTINGS: ElevenLabsTTSSettings = {
	apiKey: "",
	selectedVoiceId: "",
	selectedVoiceName: "",
	outputFolder: "output",
	history: [],
};

export const VIEW_TYPE_TTS_PANEL = "elevenlabs-tts-panel";
