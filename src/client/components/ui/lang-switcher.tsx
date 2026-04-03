import { useI18n, type Locale } from '../../lib/i18n.js';
import { cn } from '../../lib/utils.js';

export function LangSwitcher() {
  const { locale, setLocale } = useI18n();

  const langs: { code: Locale; label: string }[] = [
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' },
  ];

  return (
    <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      {langs.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLocale(lang.code)}
          className={cn(
            'px-2.5 py-1 text-[11px] font-medium transition-colors',
            locale === lang.code
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
          )}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
