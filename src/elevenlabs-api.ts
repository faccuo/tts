import { requestUrl } from "obsidian";
import { Voice, AudioWithTimestampsResponse, WordTiming, CharacterAlignment } from "./types";

const BASE_URL = "https://api.elevenlabs.io";

export async function fetchVoices(apiKey: string): Promise<Voice[]> {
	const voices: Voice[] = [];
	let nextPageToken: string | null = null;
	let hasMore = true;

	while (hasMore) {
		let url = `${BASE_URL}/v2/voices?voice_type=saved&page_size=100&include_total_count=false`;
		if (nextPageToken) {
			url += `&next_page_token=${encodeURIComponent(nextPageToken)}`;
		}

		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				"xi-api-key": apiKey,
			},
		});

		if (response.status !== 200) {
			throw new Error(`ElevenLabs API error: ${response.status}`);
		}

		const data = response.json as {
			voices: Array<{ voice_id: string; name: string }>;
			has_more: boolean;
			next_page_token?: string;
		};

		for (const v of data.voices) {
			voices.push({ voice_id: v.voice_id, name: v.name });
		}

		hasMore = data.has_more;
		nextPageToken = data.next_page_token ?? null;
	}

	voices.sort((a, b) => a.name.localeCompare(b.name));
	return voices;
}

export async function generateSpeechWithTimestamps(
	apiKey: string,
	voiceId: string,
	text: string
): Promise<{ audioBuffer: ArrayBuffer; wordTimings: WordTiming[] }> {
	const url = `${BASE_URL}/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`;

	const response = await requestUrl({
		url,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"xi-api-key": apiKey,
		},
		body: JSON.stringify({
			text,
			model_id: "eleven_multilingual_v2",
		}),
	});

	if (response.status !== 200) {
		throw new Error(`ElevenLabs TTS error: ${response.status}`);
	}

	const data = response.json as AudioWithTimestampsResponse;

	const audioBuffer = base64ToArrayBuffer(data.audio_base64);
	const wordTimings = alignmentToWordTimings(data.alignment);

	return { audioBuffer, wordTimings };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

export function alignmentToWordTimings(alignment: CharacterAlignment): WordTiming[] {
	const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
	const wordTimings: WordTiming[] = [];

	let currentWord = "";
	let wordStartTime = -1;
	let wordEndTime = -1;
	let wordStartIndex = -1;
	let charIndex = 0;

	for (let i = 0; i < characters.length; i++) {
		const char = characters[i]!;
		const startTime = character_start_times_seconds[i]!;
		const endTime = character_end_times_seconds[i]!;

		if (char === " " || char === "\n" || char === "\r" || char === "\t") {
			if (currentWord.length > 0) {
				wordTimings.push({
					word: currentWord,
					startTime: wordStartTime,
					endTime: wordEndTime,
					startIndex: wordStartIndex,
					endIndex: charIndex,
				});
				currentWord = "";
				wordStartTime = -1;
				wordEndTime = -1;
				wordStartIndex = -1;
			}
			charIndex++;
		} else {
			if (currentWord.length === 0) {
				wordStartTime = startTime;
				wordStartIndex = charIndex;
			}
			currentWord += char;
			wordEndTime = endTime;
			charIndex++;
		}
	}

	// Last word
	if (currentWord.length > 0) {
		wordTimings.push({
			word: currentWord,
			startTime: wordStartTime,
			endTime: wordEndTime,
			startIndex: wordStartIndex,
			endIndex: charIndex,
		});
	}

	return wordTimings;
}
