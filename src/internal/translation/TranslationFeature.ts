import {defineFeature} from '../features/features.js';

export const TranslationFeature = defineFeature((connection) => {
    const {locale, config: {locale: {available}}} = connection;

    /**
     * Returns the current locale used by the client.
     */
    const get = () => locale.get();

    /**
     * Sets the current locale used by the client.
     * This MUST be one of the available locales, otherwise an error is thrown.
     * Only fully qualified language code include the country code are supported (e.g. "en_US", "de_DE").
     */
    const set = (lang: string) => {
        if (!available[lang]) {
            throw new Error(`Locale "${lang}" is not available`);
        }

        if (locale.get()?.lang === lang) {
            return;
        }

        locale.set(available[lang]);
    };

    /**
     * Returns all available locales.
     */
    const getAvailable = () => Object.values(available);

    return {
        get,
        set,
        getAvailable
    };
});
