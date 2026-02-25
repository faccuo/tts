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

export interface VoiceSettings {
	stability: number;
	similarity_boost: number;
	style: number;
	speed: number;
	use_speaker_boost: boolean;
}

export type StylePresetName = "neutral" | "dramatic" | "energetic" | "calm" | "storyteller";

export interface StylePresetValues {
	stability: number;
	style: number;
	speed: number;
	similarity_boost: number;
}

export const STYLE_PRESETS: Record<StylePresetName, { label: string; description: string; values: StylePresetValues }> = {
	neutral: {
		label: "Neutral",
		description: "Clean, natural reading",
		values: { stability: 0.5, style: 0.0, speed: 1.0, similarity_boost: 0.75 },
	},
	dramatic: {
		label: "Dramatic",
		description: "Slow, emotional, expressive",
		values: { stability: 0.25, style: 0.7, speed: 0.85, similarity_boost: 0.75 },
	},
	energetic: {
		label: "Energetic",
		description: "Fast, firm, punchy",
		values: { stability: 0.45, style: 0.5, speed: 1.15, similarity_boost: 0.75 },
	},
	calm: {
		label: "Calm",
		description: "Slow, soft, relaxed",
		values: { stability: 0.7, style: 0.3, speed: 0.8, similarity_boost: 0.75 },
	},
	storyteller: {
		label: "Storyteller",
		description: "Narrative, varied, immersive",
		values: { stability: 0.3, style: 0.6, speed: 0.95, similarity_boost: 0.75 },
	},
};

export interface ElevenLabsTTSSettings {
	apiKey: string;
	selectedVoiceId: string;
	selectedVoiceName: string;
	outputFolder: string;
	history: HistoryEntry[];
	stylePreset: StylePresetName;
	styleIntensity: number; // 0-100
	speed: number; // 0.7-1.2
}

export const DEFAULT_SETTINGS: ElevenLabsTTSSettings = {
	apiKey: "",
	selectedVoiceId: "",
	selectedVoiceName: "",
	outputFolder: "output",
	history: [],
	stylePreset: "neutral",
	styleIntensity: 50,
	speed: 1.0,
};

export const VIEW_TYPE_TTS_PANEL = "elevenlabs-tts-panel";

/** Compute interpolated VoiceSettings from preset + intensity + speed override */
export function computeVoiceSettings(preset: StylePresetName, intensity: number, speed: number): VoiceSettings {
	const neutral = STYLE_PRESETS.neutral.values;
	const target = STYLE_PRESETS[preset].values;
	const t = intensity / 100;

	return {
		stability: lerp(neutral.stability, target.stability, t),
		similarity_boost: lerp(neutral.similarity_boost, target.similarity_boost, t),
		style: lerp(neutral.style, target.style, t),
		speed,
		use_speaker_boost: true,
	};
}

function lerp(a: number, b: number, t: number): number {
	return Math.round((a + (b - a) * t) * 100) / 100;
}
