// SPDX-License-Identifier: MIT
import { uiLanguage } from "./i18n";
const demos = {
  "en": "[Read calmly. Look ahead.]\nWelcome to this short example. This teleprompter follows my voice. I can read slowly, pause and continue at my own pace. The text stays in a narrow column near the camera. Thank you for listening!",
  "de": "[Langsam lesen. Nach vorn schauen.]\nWillkommen zu diesem kurzen Beispiel. Dieser Teleprompter folgt meiner Stimme. Ich kann langsam lesen, eine Pause machen und danach in meinem Tempo weiterreden. Der Text bleibt in einer schmalen Spalte nahe der Kamera. Vielen Dank fürs Zuhören!",
  "fr": "[Lisez calmement. Regardez devant vous.]\nBienvenue dans ce court exemple. Ce téléprompteur suit ma voix. Je peux lire lentement, faire une pause et continuer à mon rythme. Le texte reste dans une colonne étroite près de la caméra. Merci de votre attention !",
  "es": "[Lee con calma. Mira hacia delante.]\nBienvenidos a este breve ejemplo. Este teleprompter sigue mi voz. Puedo leer despacio, hacer una pausa y continuar a mi ritmo. El texto permanece en una columna estrecha cerca de la cámara. ¡Gracias por escuchar!"
};
export const demo = (locale: string) => demos[uiLanguage([locale])];
