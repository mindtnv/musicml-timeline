/** Russian display labels for model predictions */

const LABEL_MAP: Record<string, string> = {
  // Segments
  Intro: "Вступление",
  Verse: "Куплет",
  Bridge: "Бридж",
  Chorus: "Припев",
  Instrumental: "Инструментал",
  Outro: "Завершение",

  // Arousal
  Low: "Низкая",
  Mid: "Средняя",
  High: "Высокая",

  // Valence
  Dark: "Мрачное",
  Neutral: "Нейтральное",
  Bright: "Светлое",

  // Genres
  blues: "Блюз",
  classical: "Классика",
  country: "Кантри",
  disco: "Диско",
  hiphop: "Хип-хоп",
  jazz: "Джаз",
  metal: "Метал",
  pop: "Поп",
  reggae: "Регги",
  rock: "Рок",
};

export function ru(label: string): string {
  return LABEL_MAP[label] ?? label;
}
