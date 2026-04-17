/**
 * Gemini-TTS (Cloud Text-to-Speech) 문서의 보이스 이름.
 * @see https://cloud.google.com/text-to-speech/docs/gemini-tts
 */
export const GEMINI_31_FLASH_TTS_VOICE_NAMES = [
  "Achernar",
  "Achird",
  "Algenib",
  "Algieba",
  "Alnilam",
  "Aoede",
  "Autonoe",
  "Callirrhoe",
  "Charon",
  "Despina",
  "Enceladus",
  "Erinome",
  "Fenrir",
  "Gacrux",
  "Iapetus",
  "Kore",
  "Laomedeia",
  "Leda",
  "Orus",
  "Pulcherrima",
  "Puck",
  "Rasalgethi",
  "Sadachbia",
  "Sadaltager",
  "Schedar",
  "Sulafat",
  "Umbriel",
  "Vindemiatrix",
  "Zephyr",
  "Zubenelgenubi",
] as const;

export type Gemini31FlashTtsVoiceName = (typeof GEMINI_31_FLASH_TTS_VOICE_NAMES)[number];
