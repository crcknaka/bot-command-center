import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.js';
import { cn } from '../../lib/utils.js';
import { Modal } from './shared.js';

export const sourceTypeInfo: Record<string, { icon: string; label: string; desc: string; placeholder: string; hint: string }> = {
  rss: { icon: '📡', label: 'RSS-лента', desc: 'Стандартная новостная лента. Есть у большинства сайтов и блогов.', placeholder: 'https://example.com/feed/', hint: 'Обычно URL сайта + /feed/ или /rss/. Для Google News: news.google.com/rss/search?q=тема' },
  reddit: { icon: '🔴', label: 'Reddit', desc: 'Горячие посты из сабреддита. Обновляется в реальном времени.', placeholder: 'ElectricUnicycle', hint: 'Имя сабреддита без r/. Например: ElectricUnicycle, ebikes, technology' },
  twitter: { icon: '𝕏', label: 'Twitter / X', desc: 'Твиты аккаунта через RSS-мосты. Может не работать если мосты лежат.', placeholder: '@username', hint: 'Имя аккаунта с @ или без. Например: @OpenAI, @TechCrunch' },
  telegram: { icon: '📺', label: 'Telegram-канал', desc: 'Посты из другого TG-канала в реальном времени. Бот должен быть участником.', placeholder: '@channel_name', hint: 'Юзернейм канала. Бот должен быть добавлен в канал-источник.' },
  youtube: { icon: '▶️', label: 'YouTube', desc: 'Новые видео с канала через RSS. Нужен channel_id из URL канала.', placeholder: 'https://www.youtube.com/feeds/videos.xml?channel_id=...', hint: 'Откройте канал → исходный код → найдите channel_id → вставьте в URL выше' },
  web: { icon: '🌐', label: 'Веб-страница', desc: 'Автоматический парсинг ссылок и заголовков с новостной страницы.', placeholder: 'https://example.com/news', hint: 'Укажите URL страницы со списком статей. Бот найдёт ссылки с заголовками автоматически. Лучше работает на страницах-каталогах (архив, раздел новостей).' },
};

export const rssPresets = [
  { cat: '🛞 Моноколёса / EUC', items: [
    { name: 'r/ElectricUnicycle', url: 'ElectricUnicycle', type: 'reddit', desc: 'Главный Reddit про EUC: обзоры, вопросы, видео поездок. Картинки есть.' },
    { name: 'Wrong Way (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2RaB95OJ2j3-o-JJubz0qw', type: 'youtube', desc: 'Wrong Way — крупнейший EUC канал. Обзоры, тесты, поездки.' },
    { name: 'Chooch Tech (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCFeDZyrD6D5AjG1KSO9NLVQ', type: 'youtube', desc: 'Chooch Tech — обзоры самых быстрых EUC, тесты.' },
    { name: 'Alien Rides (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCfsmUHp1lI4s_8qpMJwF6ng', type: 'youtube', desc: 'Alien Rides — обзоры EUC, групповые поездки.' },
    { name: 'Johnny Go Vroom (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDj4iyBli4Y4EwLxktpE58A', type: 'youtube', desc: 'Johnny Go Vroom — обзоры EUC, защита, экипировка.' },
    { name: 'Esk8 NYC (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC0KLwxSbtWArsKvDgtnSe0g', type: 'youtube', desc: 'Esk8 NYC — EUC, esk8, электротранспорт в городе.' },
    { name: 'EUC World Blog', url: 'https://euc.world/blog/feed', type: 'rss', desc: 'Блог EUC World — приложение для моноколёс.' },
    { name: 'r/onewheel', url: 'onewheel', type: 'reddit', desc: 'Onewheel: трюки, маршруты, модификации' },
    { name: 'GN: Electric Unicycle', url: 'https://news.google.com/rss/search?q=electric+unicycle&hl=en', type: 'rss', desc: 'Google News: electric unicycle (EN). Без картинок.' },
    { name: 'GN: Моноколесо', url: 'https://news.google.com/rss/search?q=%D0%BC%D0%BE%D0%BD%D0%BE%D0%BA%D0%BE%D0%BB%D0%B5%D1%81%D0%BE&hl=ru', type: 'rss', desc: 'Google News: моноколесо (RU). Без картинок.' },
    { name: 'GN: Begode Inmotion KingSong', url: 'https://news.google.com/rss/search?q=begode+OR+inmotion+OR+leaperkim+OR+kingsong+unicycle&hl=en', type: 'rss', desc: 'Google News: бренды EUC (EN). Без картинок.' },
    { name: 'Electrek (+ фильтр)', url: 'https://electrek.co/feed/', type: 'rss', desc: 'Electrek: всё про EV. Используй фильтр "unicycle" чтобы получать только EUC.' },
  ]},
  { cat: '⚡ Электротранспорт / EV', items: [
    { name: 'Electrek', url: 'https://electrek.co/feed/', type: 'rss', desc: 'Главный сайт про EV, e-bikes, электроскутеры. Ежедневные новости индустрии' },
    { name: 'InsideEVs', url: 'https://insideevs.com/feed/', type: 'rss', desc: 'Обзоры, тесты и новости электромобилей и электротранспорта' },
    { name: 'Electric Bike Report', url: 'https://electricbikereport.com/feed', type: 'rss', desc: 'Обзоры электровелосипедов, сравнения, гайды для покупателей' },
    { name: 'CleanTechnica', url: 'https://cleantechnica.com/feed/', type: 'rss', desc: 'Чистая энергия, EV, солнечные панели, экологичные технологии' },
    { name: 'r/ebikes', url: 'ebikes', type: 'reddit', desc: 'Электровелосипеды: обсуждения, фото, советы по выбору' },
    { name: 'r/ElectricScooters', url: 'ElectricScooters', type: 'reddit', desc: 'Электросамокаты: обзоры, сравнения, ремонт' },
    { name: 'r/electricvehicles', url: 'electricvehicles', type: 'reddit', desc: 'Электромобили: Tesla, BYD, новинки, зарядные станции' },
    { name: 'r/onewheel', url: 'onewheel', type: 'reddit', desc: 'Onewheel: трюки, маршруты, модификации' },
  ]},
  { cat: '🤖 AI / Машинное обучение', items: [
    { name: 'OpenAI Blog', url: 'https://openai.com/news/rss.xml', type: 'rss', desc: 'Официальные новости от создателей ChatGPT и GPT-4' },
    { name: 'Google AI Blog', url: 'https://ai.googleblog.com/feeds/posts/default', type: 'rss', desc: 'Исследования Google: Gemini, DeepMind, новые модели' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', type: 'rss', desc: 'Глубокая аналитика MIT по AI, биотеху, климату' },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage', type: 'rss', desc: 'Лучшие посты с HN — стартапы, код, AI, наука. Голосование сообщества' },
    { name: 'Towards Data Science', url: 'https://towardsdatascience.com/feed', type: 'rss', desc: 'Статьи про ML, data science, Python, нейросети на Medium' },
    { name: 'r/MachineLearning', url: 'MachineLearning', type: 'reddit', desc: 'Научные статьи, новые модели, обсуждения исследований' },
    { name: 'r/ChatGPT', url: 'ChatGPT', type: 'reddit', desc: 'Промпты, лайфхаки, новости ChatGPT и других LLM' },
    { name: 'r/artificial', url: 'artificial', type: 'reddit', desc: 'Общие новости AI: регуляция, продукты, мнения' },
    { name: 'r/LocalLLaMA', url: 'LocalLLaMA', type: 'reddit', desc: 'Локальные модели: Ollama, llama.cpp, fine-tuning, GGUF' },
    { name: '@OpenAI', url: '@OpenAI', type: 'twitter', desc: 'Официальный Twitter OpenAI: анонсы, релизы' },
  ]},
  { cat: '💻 Технологии', items: [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'rss', desc: 'Стартапы, венчурные инвестиции, раунды финансирования' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'rss', desc: 'Технологии на пересечении с культурой и дизайном' },
    { name: 'Wired', url: 'https://feeds.wired.com/wired/index', type: 'rss', desc: 'Глубокая журналистика: наука, безопасность, культура, бизнес' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', type: 'rss', desc: 'Детальные разборы: железо, ПО, наука, политика технологий' },
    { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', type: 'rss', desc: 'Гаджеты, смартфоны, игры, бытовая электроника' },
    { name: 'Product Hunt', url: 'https://www.producthunt.com/feed', type: 'rss', desc: 'Новые продукты и стартапы каждый день. Голосование сообщества' },
    { name: 'The Next Web', url: 'https://thenextweb.com/feed', type: 'rss', desc: 'Европейское техно-медиа: стартапы, AI, финтех' },
    { name: 'r/technology', url: 'technology', type: 'reddit', desc: 'Главный технологический сабреддит: новости, обсуждения' },
    { name: 'r/programming', url: 'programming', type: 'reddit', desc: 'Программирование: языки, фреймворки, инструменты, карьера' },
    { name: 'r/gadgets', url: 'gadgets', type: 'reddit', desc: 'Новые гаджеты, обзоры, странные изобретения' },
    { name: 'r/apple', url: 'apple', type: 'reddit', desc: 'Apple: iPhone, Mac, iOS, слухи о новых продуктах' },
    { name: 'r/Android', url: 'Android', type: 'reddit', desc: 'Android: новые версии, приложения, кастомные прошивки' },
  ]},
  { cat: '💰 Финансы / Крипто', items: [
    { name: 'CoinDesk', url: 'https://www.coindesk.com/feed', type: 'rss', desc: 'Bitcoin, Ethereum, крипто-аналитика, цены, регуляция' },
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/feed', type: 'rss', desc: 'Блокчейн, DeFi, NFT, крипто-новости на нескольких языках' },
    { name: 'The Block', url: 'https://www.theblock.co/rss.xml', type: 'rss', desc: 'Крипто-расследования, данные рынка, институциональные инвесторы' },
    { name: 'Decrypt', url: 'https://decrypt.co/feed', type: 'rss', desc: 'Web3, крипто для начинающих, гайды и объяснения' },
    { name: 'r/CryptoCurrency', url: 'CryptoCurrency', type: 'reddit', desc: '9.5M+ подписчиков. Главный крипто-хаб: новости, мемы, анализ' },
    { name: 'r/Bitcoin', url: 'Bitcoin', type: 'reddit', desc: '7M+ подписчиков. Только Bitcoin: новости, холд, Lightning Network' },
    { name: 'r/ethereum', url: 'ethereum', type: 'reddit', desc: 'Ethereum: обновления сети, L2, стейкинг, смарт-контракты' },
    { name: 'r/defi', url: 'defi', type: 'reddit', desc: 'Децентрализованные финансы: протоколы, yield farming, ликвидность' },
    { name: 'r/investing', url: 'investing', type: 'reddit', desc: 'Инвестиции: акции, ETF, дивиденды, портфели, стратегии' },
    { name: 'r/wallstreetbets', url: 'wallstreetbets', type: 'reddit', desc: 'Мемные инвестиции, YOLO-трейды, опционы. 15M+ подписчиков' },
  ]},
  { cat: '🎮 Игры', items: [
    { name: 'IGN', url: 'https://feeds.feedburner.com/ign/all', type: 'rss', desc: 'Крупнейший игровой портал: обзоры, трейлеры, гайды' },
    { name: 'Kotaku', url: 'https://kotaku.com/rss', type: 'rss', desc: 'Игровая журналистика с мнением: обзоры, культура, индустрия' },
    { name: 'PC Gamer', url: 'https://www.pcgamer.com/rss/', type: 'rss', desc: 'PC-игры: обзоры, железо, моды, киберспорт' },
    { name: 'r/gaming', url: 'gaming', type: 'reddit', desc: 'Общий игровой сабреддит: мемы, новости, ностальгия' },
    { name: 'r/pcgaming', url: 'pcgaming', type: 'reddit', desc: 'PC-гейминг: новости, обсуждения, производительность' },
    { name: 'r/PS5', url: 'PS5', type: 'reddit', desc: 'PlayStation 5: эксклюзивы, обновления, предложения' },
  ]},
  { cat: '🔬 Наука', items: [
    { name: 'Nature News', url: 'https://www.nature.com/nature.rss', type: 'rss', desc: 'Ведущий научный журнал мира. Прорывы, открытия, рецензии' },
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', type: 'rss', desc: 'Новости науки простым языком: физика, биология, медицина, космос' },
    { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', type: 'rss', desc: 'Наука для широкой аудитории: открытия, технологии, климат' },
    { name: 'r/science', url: 'science', type: 'reddit', desc: 'Научные статьи с модерацией. Только peer-reviewed исследования' },
    { name: 'r/space', url: 'space', type: 'reddit', desc: 'Космос: SpaceX, NASA, телескопы, планеты, астрономия' },
    { name: 'r/Futurology', url: 'Futurology', type: 'reddit', desc: 'Будущее технологий: прогнозы, трансгуманизм, сингулярность' },
  ]},
  { cat: '📰 Новости (общие)', items: [
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', type: 'rss', desc: 'Британская вещательная корпорация. Мировые новости, объективно' },
    { name: 'Reuters', url: 'https://www.reutersagency.com/feed/', type: 'rss', desc: 'Крупнейшее информагентство. Быстрые, проверенные новости' },
    { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', type: 'rss', desc: 'Американское новостное медиа. Политика, бизнес, развлечения' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', type: 'rss', desc: 'Международные новости с ближневосточной перспективой' },
    { name: 'r/worldnews', url: 'worldnews', type: 'reddit', desc: 'Мировые новости (без США). Модерируемый, качественный контент' },
    { name: 'r/news', url: 'news', type: 'reddit', desc: 'Новости США и мира. Быстрые обсуждения, разные мнения' },
  ]},
  { cat: '💼 Бизнес / Стартапы', items: [
    { name: 'TechCrunch Startups', url: 'https://techcrunch.com/category/startups/feed/', type: 'rss', desc: 'Стартапы: раунды инвестиций, запуски продуктов, интервью основателей' },
    { name: 'Entrepreneur', url: 'https://www.entrepreneur.com/latest.rss', type: 'rss', desc: 'Предпринимательство: советы, истории успеха, маркетинг, финансы' },
    { name: 'Harvard Business Review', url: 'https://hbr.org/feed', type: 'rss', desc: 'Академический бизнес-журнал: лидерство, стратегия, инновации' },
    { name: 'r/startups', url: 'startups', type: 'reddit', desc: 'Сообщество основателей: советы, питчи, ошибки, метрики' },
    { name: 'r/Entrepreneur', url: 'Entrepreneur', type: 'reddit', desc: 'Малый бизнес, фриланс, онлайн-проекты, пассивный доход' },
    { name: 'r/SaaS', url: 'SaaS', type: 'reddit', desc: 'SaaS-бизнес: MRR, churn, pricing, маркетинг, growth' },
  ]},
  { cat: '🎨 Дизайн / UX', items: [
    { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', type: 'rss', desc: 'Веб-дизайн, CSS, доступность, UX-паттерны. Глубокие статьи' },
    { name: 'A List Apart', url: 'https://alistapart.com/main/feed/', type: 'rss', desc: 'Веб-стандарты, контент-стратегия, дизайн. Классика индустрии' },
    { name: 'r/web_design', url: 'web_design', type: 'reddit', desc: 'Веб-дизайн: вдохновение, критика, инструменты, тренды' },
    { name: 'r/UI_Design', url: 'UI_Design', type: 'reddit', desc: 'UI-дизайн: интерфейсы, Figma, компоненты, системы дизайна' },
  ]},
  { cat: '🔍 Google News (свои запросы)', desc: 'Замените слова в URL на свою тему. Параметр hl= задаёт язык (en, ru, uk, de и т.д.)', items: [
    { name: 'GN: Electric Unicycle', url: 'https://news.google.com/rss/search?q=electric+unicycle&hl=en', type: 'rss', desc: 'Новости про моноколёса на английском' },
    { name: 'GN: AI новости', url: 'https://news.google.com/rss/search?q=artificial+intelligence&hl=en', type: 'rss', desc: 'Искусственный интеллект — все источники Google' },
    { name: 'GN: Крипто', url: 'https://news.google.com/rss/search?q=cryptocurrency&hl=en', type: 'rss', desc: 'Криптовалюты — агрегатор всех новостных сайтов' },
    { name: 'GN: Технологии (RU)', url: 'https://news.google.com/rss/search?q=технологии&hl=ru', type: 'rss', desc: 'Технологические новости на русском языке' },
    { name: 'GN: Стартапы (RU)', url: 'https://news.google.com/rss/search?q=стартапы&hl=ru', type: 'rss', desc: 'Стартапы и предпринимательство на русском' },
    { name: 'GN: Нейросети (RU)', url: 'https://news.google.com/rss/search?q=нейросети&hl=ru', type: 'rss', desc: 'Нейросети и AI новости на русском' },
  ]},
];

export function AddSourceModal({ taskId, form, setForm, onSubmit, onClose, isPending }: {
  taskId: number; form: any; setForm: (f: any) => void; onSubmit: () => void; onClose: () => void; isPending: boolean;
}) {
  const [showPresets, setShowPresets] = useState(false);
  const [presetSearch, setPresetSearch] = useState('');
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const info = sourceTypeInfo[form.type] ?? sourceTypeInfo.rss;
  const qc = useQueryClient();

  const togglePreset = (url: string) => {
    setSelectedPresets((prev) => { const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n; });
  };

  const bulkAddMut = useMutation({
    mutationFn: async (items: Array<{ name: string; type: string; url: string }>) => {
      for (const item of items) {
        await apiFetch(`/tasks/${taskId}/sources`, { method: 'POST', body: JSON.stringify(item) });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sources', taskId] }); setSelectedPresets(new Set()); onClose(); },
  });

  // Filter presets by search
  const filteredPresets = presetSearch.trim()
    ? rssPresets.map((cat: any) => ({
        ...cat,
        items: cat.items.filter((item: any) =>
          item.name.toLowerCase().includes(presetSearch.toLowerCase()) ||
          (item.desc ?? '').toLowerCase().includes(presetSearch.toLowerCase())
        ),
      })).filter((cat: any) => cat.items.length > 0)
    : rssPresets;

  const totalResults = filteredPresets.reduce((sum: number, cat: any) => sum + cat.items.length, 0);

  return (
    <Modal title="Добавить источник" onClose={onClose}>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowPresets(false)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', !showPresets ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500')}>
          Свой источник
        </button>
        <button onClick={() => setShowPresets(true)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', showPresets ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500')}>
          Готовые RSS-фиды
        </button>
      </div>

      {showPresets ? (
        <div>
          {/* Search */}
          <div className="relative mb-3">
            <input
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
              placeholder="Поиск по фидам..."
              className="w-full px-3 py-2 rounded-lg border text-xs outline-none focus:border-[var(--primary)]"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              autoFocus
            />
            {presetSearch && (
              <span className="absolute right-3 top-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {totalResults} найдено
              </span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-4">
          {filteredPresets.map((cat: any) => {
            const catUrls = cat.items.map((i: any) => i.url);
            const allSelected = catUrls.every((u: string) => selectedPresets.has(u));
            return (
            <div key={cat.cat}>
              <div className="flex items-center gap-2 mb-1">
                <button type="button" onClick={() => {
                  setSelectedPresets((prev) => {
                    const n = new Set(prev);
                    if (allSelected) { catUrls.forEach((u: string) => n.delete(u)); } else { catUrls.forEach((u: string) => n.add(u)); }
                    return n;
                  });
                }} className="text-[10px] text-blue-400 hover:text-blue-300">{allSelected ? '☑' : '☐'}</button>
                <div className="text-xs font-semibold">{cat.cat}</div>
              </div>
              {cat.desc && <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{cat.desc}</div>}
              <div className="space-y-1">
                {cat.items.map((item: any) => (
                  <button key={item.url} onClick={() => togglePreset(item.url)} className={cn('w-full px-3 py-2 rounded-lg text-left transition-colors', selectedPresets.has(item.url) ? 'bg-blue-500/10 border border-blue-500/30' : 'hover:bg-white/5')}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]">{selectedPresets.has(item.url) ? '☑' : '☐'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 shrink-0" style={{ color: 'var(--text-muted)' }}>{item.type}</span>
                        </div>
                        {item.desc && <div className="text-[10px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{item.desc}</div>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );})}
          </div>
          {selectedPresets.size > 0 ? (
            <button type="button" disabled={bulkAddMut.isPending} onClick={() => {
              const allItems = rssPresets.flatMap((c: any) => c.items);
              const items = allItems.filter((i: any) => selectedPresets.has(i.url));
              bulkAddMut.mutate(items);
            }} className="w-full mt-3 py-2.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--primary)' }}>
              {bulkAddMut.isPending ? 'Добавляю...' : `Добавить ${selectedPresets.size} источников`}
            </button>
          ) : (
            <div className="rounded-lg p-2 mt-3 text-[11px]" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
              💡 Отметьте нужные фиды и нажмите кнопку. Или кликните один для ручного добавления.
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          <label className="block text-sm font-medium mb-1">Название</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Electrek" className="w-full px-3 py-2 rounded-lg border text-sm mb-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />

          <label className="block text-sm font-medium mb-2">Тип источника</label>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {Object.entries(sourceTypeInfo).map(([key, val]) => (
              <button key={key} type="button" onClick={() => setForm({ ...form, type: key })}
                className={cn('p-2 rounded-lg border text-center text-[11px] transition-colors', form.type === key ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                style={{ borderColor: form.type === key ? undefined : 'var(--border)' }}>
                <div>{val.icon}</div>
                <div className="font-medium mt-0.5">{val.label}</div>
              </button>
            ))}
          </div>

          {/* Type description */}
          <div className="rounded-lg p-2.5 mb-3 text-[11px]" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
            {info.icon} <b>{info.label}</b> — {info.desc}
          </div>

          <label className="block text-sm font-medium mb-1">URL / адрес</label>
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={info.placeholder} className="w-full px-3 py-2 rounded-lg border text-sm font-mono mb-1" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
          <p className="text-[10px] mb-4" style={{ color: 'var(--text-muted)' }}>{info.hint}</p>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
            <button type="submit" disabled={isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
              {isPending ? 'Добавляю...' : 'Добавить'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Bot API Keys ─────────────────────────────────────────────────────────────
