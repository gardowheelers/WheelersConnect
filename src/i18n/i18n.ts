import { translations, type Language } from './translations';

const supportedLanguages: Language[] = ['fr', 'en', 'pt', 'es'];

function detectLanguage(): Language {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    const base = locale.split(/[-_]/)[0] as Language;
    return supportedLanguages.includes(base) ? base : 'fr';
  } catch {
    return 'fr';
  }
}

// Version de test France : l’interface démarre explicitement en français.
let currentLanguage: Language = 'fr';

export function setLanguage(language: Language) {
  currentLanguage = language;
}

export function getLanguage() {
  return currentLanguage;
}

export function t(key: keyof typeof translations.fr) {
  return translations[currentLanguage][key];
}
