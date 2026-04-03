import { createContext, useContext, useState, type ReactNode } from 'react';

export type Locale = 'ru' | 'en';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const translations: Record<Locale, Record<string, string>> = {
  ru: {
    // Nav
    'nav.home': 'Главная',
    'nav.posts': 'Посты',
    'nav.activity': 'Журнал',
    'nav.users': 'Пользователи',
    'nav.settings': 'Настройки',
    'nav.logout': 'Выйти',
    'role.superadmin': 'Администратор',
    'role.client': 'Клиент',
    // Common
    'common.save': 'Сохранить',
    'common.cancel': 'Отмена',
    'common.delete': 'Удалить',
    'common.add': 'Добавить',
    'common.edit': 'Редактировать',
    'common.loading': 'Загрузка...',
    'common.saved': 'Сохранено',
    'common.error': 'Ошибка',
    'common.confirm_delete': 'Вы уверены?',
    // Login
    'login.title': 'Bot Command Center',
    'login.subtitle': 'Войдите, чтобы управлять ботами',
    'login.email': 'Email',
    'login.password': 'Пароль',
    'login.submit': 'Войти',
    'login.submitting': 'Входим...',
    'login.error': 'Неверный email или пароль',
    // Dashboard
    'dash.title': 'Главная',
    'dash.add_bot': 'Добавить бота',
    'dash.bots': 'Боты',
    'dash.posts_today': 'Постов сегодня',
    'dash.queued': 'В очереди',
    'dash.drafts': 'Черновики',
    'dash.your_bots': 'Ваши боты',
    'dash.no_bots': 'Пока нет ботов',
    // Posts
    'posts.title': 'Посты',
    'posts.create': 'Создать пост',
    'posts.filter': 'Фильтр:',
    'posts.all': 'Все',
    'posts.draft': 'Черновики',
    'posts.queued': 'В очереди',
    'posts.published': 'Опубликовано',
    'posts.failed': 'Ошибки',
    'posts.preview': 'Превью',
    'posts.edit': 'Редактировать',
    'posts.approve': 'Одобрить',
    'posts.publish': 'Опубликовать',
    'posts.no_posts': 'Пока нет постов',
    // Settings
    'settings.title': 'Настройки',
    'settings.general': 'Общие',
    'settings.ai_models': 'AI-модели',
    'settings.search': 'Поиск',
    'settings.change_password': 'Сменить пароль',
  },
  en: {
    'nav.home': 'Dashboard',
    'nav.posts': 'Posts',
    'nav.activity': 'Activity',
    'nav.users': 'Users',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',
    'role.superadmin': 'Admin',
    'role.client': 'Client',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.add': 'Add',
    'common.edit': 'Edit',
    'common.loading': 'Loading...',
    'common.saved': 'Saved',
    'common.error': 'Error',
    'common.confirm_delete': 'Are you sure?',
    'login.title': 'Bot Command Center',
    'login.subtitle': 'Sign in to manage your bots',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.submitting': 'Signing in...',
    'login.error': 'Invalid email or password',
    'dash.title': 'Dashboard',
    'dash.add_bot': 'Add Bot',
    'dash.bots': 'Bots',
    'dash.posts_today': 'Posts Today',
    'dash.queued': 'Queued',
    'dash.drafts': 'Drafts',
    'dash.your_bots': 'Your Bots',
    'dash.no_bots': 'No bots yet',
    'posts.title': 'Posts',
    'posts.create': 'Create Post',
    'posts.filter': 'Filter:',
    'posts.all': 'All',
    'posts.draft': 'Drafts',
    'posts.queued': 'Queued',
    'posts.published': 'Published',
    'posts.failed': 'Failed',
    'posts.preview': 'Preview',
    'posts.edit': 'Edit',
    'posts.approve': 'Approve',
    'posts.publish': 'Publish',
    'posts.no_posts': 'No posts yet',
    'settings.title': 'Settings',
    'settings.general': 'General',
    'settings.ai_models': 'AI Models',
    'settings.search': 'Search',
    'settings.change_password': 'Change password',
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
