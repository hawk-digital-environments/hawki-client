import type {CommonConnectionConfig} from '../connection/connection.js';
import type {Locale, LocaleRecord} from './translation.js';
import type {Logger} from '../logger.js';
import {createStoreFront} from '../resources/stores/ReactiveStoreFront.js';
import {createGenericStore} from '../resources/stores/GenericStore.js';

export type ClientLocale = ReturnType<typeof createClientLocale>;

export function createClientLocale(
    log: Logger,
    config: { locale: CommonConnectionConfig['locale'] },
    configuredLang?: string
) {
    const {locale: {default: defaultLang, available: availableLocales}} = config;
    const initialLocale = findInitialLocale(log, availableLocales, defaultLang, configuredLang);
    return createStoreFront(() => createGenericStore(initialLocale));
}

function findInitialLocale(
    log: Logger,
    available: LocaleRecord,
    defaultLang: string,
    configuredLang?: string
): Locale {
    return findConfiguredLocale(log, available, configuredLang)
        ?? findLocaleCodeInHtml(log, available)
        ?? available[defaultLang];
}

function findConfiguredLocale(log: Logger, available: LocaleRecord, configuredLang?: string): Locale | null {
    if (!configuredLang) {
        return null;
    }

    if (!available[configuredLang]) {
        log.warning(`Configured locale "${configuredLang}" is not available.`);
    }

    return available[configuredLang] || null;
}


function findLocaleCodeInHtml(log: Logger, available: LocaleRecord): Locale | null {
    if (typeof document === 'undefined' || !document.documentElement) {
        return null;
    }

    const availableLangs = createLangLookupMap(available);

    const htmlLang = document.documentElement.lang.toLowerCase();

    if (availableLangs.has(htmlLang)) {
        return availableLangs.get(htmlLang)!;
    }

    // Try short code match
    const shortCode = langToShortCode(htmlLang);
    if (availableLangs.has(shortCode)) {
        return availableLangs.get(shortCode)!;
    }

    log.info(`Failed to match HTML lang "${htmlLang}" to an available locale.`);

    return null;
}

function createLangLookupMap(available: LocaleRecord): Map<string, Locale> {
    const map = new Map<string, Locale>();
    for (const [code, locale] of Object.entries(available)) {
        map.set(code.toLowerCase(), locale);
        map.set(locale.htmlLang.toLowerCase(), locale);
        map.set(langToShortCode(locale.htmlLang), locale);
    }
    return map;
}

function langToShortCode(lang: string): string {
    return lang.split('-')[0].toLowerCase();
}
