import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Locale = 'ru' | 'en';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const translations: Record<Locale, Record<string, string>> = {
  ru: {
    // Sidebar
    'nav.home': 'Главная',
    'nav.posts': 'Посты',
    'nav.integrations': 'Интеграции',
    'nav.activity': 'Журнал',
    'nav.users': 'Пользователи',
    'nav.settings': 'Настройки',
    'nav.logout': 'Выйти',
    'role.superadmin': 'Администратор',
    'role.client': 'Клиент',
  },
  en: {
    'nav.home': 'Dashboard',
    'nav.posts': 'Posts',
    'nav.integrations': 'Integrations',
    'nav.activity': 'Activity',
    'nav.users': 'Users',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',
    'role.superadmin': 'Admin',
    'role.client': 'Client',
  },
};

const I18nContext = createContext<I18nContextValue>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem('locale') as Locale) || 'ru';
  });

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
  };

  const t = (key: string): string => {
    return translations[locale]?.[key] ?? translations['en']?.[key] ?? key;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
