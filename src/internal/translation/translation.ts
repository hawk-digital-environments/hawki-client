export type LocaleCode = string; // en_US;
export type LocaleHtmlCode = string; // en-US;

export interface Locale {
    /**
     * The locale code, e.g. "en_US" or "de_DE".
     */
    lang: LocaleCode;

    /**
     * The HTML-compatible locale code, e.g. "en-US" or "de-DE".
     */
    htmlLang: LocaleHtmlCode;

    /**
     * The name of the language in the language itself, e.g. "English" or "Deutsch".
     */
    nameInLanguage: string;

    /**
     * The short name of the language, e.g. "EN" or "DE".
     */
    shortName: string;
}

export type LocaleRecord = Record<LocaleCode, Locale>;
