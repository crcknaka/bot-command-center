import { useState } from 'react';
import { Book, Rss, Search, Bot, Zap, Globe, MessageSquare, Copy, Check, Shield, BarChart3, Users, FileText } from 'lucide-react';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn } from '../lib/utils.js';

const sections = [
  { id: 'quickstart', label: 'Быстрый старт', icon: Zap },
  { id: 'sources', label: 'Источники контента', icon: Rss },
  { id: 'feeds', label: 'Каталог RSS-фидов', icon: Globe },
  { id: 'ai', label: 'AI-модели', icon: Bot },
  { id: 'tasks', label: 'Типы задач', icon: MessageSquare },
  { id: 'websearch', label: 'Мониторинг тем', icon: Search },
  { id: 'moderation', label: 'Модерация', icon: Shield },
  { id: 'posts', label: 'Статусы постов', icon: FileText },
  { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
  { id: 'members', label: 'Участники', icon: Users },
] as const;

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="ml-2 px-1.5 py-0.5 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors inline-flex items-center gap-1"
      title="Скопировать">
      {ok ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
    </button>
  );
}

function FeedRow({ name, url, desc }: { name: string; url: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <div className="flex items-center shrink-0">
        <code className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-400 max-w-48 truncate block">{url}</code>
        <CopyBtn text={url} />
      </div>
    </div>
  );
}

export function DocsPage() {
  const [active, _setActive] = useState<string>(() => new URLSearchParams(window.location.search).get('section') ?? 'quickstart');
  const setActive = (v: string) => { _setActive(v); const url = new URL(window.location.href); v === 'quickstart' ? url.searchParams.delete('section') : url.searchParams.set('section', v); window.history.replaceState({}, '', url.toString()); };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Документация</h1>
        <InfoTip text="Полное руководство по работе с Bot Command Center: настройка ботов, источники контента, AI-модели, примеры RSS-фидов." position="bottom" />
      </div>

      {/* Mobile tabs */}
      <div className="md:hidden flex gap-1 mb-4 overflow-x-auto pb-2 -mx-1 px-1">
        {sections.map((s) => (
          <button key={s.id} onClick={() => setActive(s.id)} className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0',
            active === s.id ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500'
          )}>{s.label}</button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Sidebar — desktop only */}
        <div className="w-48 shrink-0 hidden md:block">
          <nav className="space-y-1 sticky top-8">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => setActive(s.id)} className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left',
                  active === s.id ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
                )}>
                  <Icon size={14} /> {s.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {active === 'quickstart' && (
            <div className="space-y-6">
              <Section title="Быстрый старт">
                <Step n={1} title="Создайте бота в Telegram">
                  Откройте <b>@BotFather</b> → отправьте <code>/newbot</code> → следуйте инструкциям → скопируйте токен.
                </Step>
                <Step n={2} title="Добавьте бота в Command Center">
                  Главная → «Добавить бота» → вставьте токен. Система проверит его и покажет имя бота.
                </Step>
                <Step n={3} title="Запустите бота">
                  Нажмите «Запустить» на карточке бота. Он подключится к Telegram.
                </Step>
                <Step n={4} title="Добавьте канал">
                  Откройте бота → «Добавить канал» → введите @username канала. <b>Важно:</b> бот должен быть администратором канала.
                </Step>
                <Step n={5} title="Создайте задачу">
                  В канале → «Создать задачу» → выберите «Новостная лента» → укажите расписание.
                </Step>
                <Step n={6} title="Добавьте источники">
                  В задаче → «Добавить источник» → выберите тип (RSS, Reddit, Twitter, Telegram, YouTube, Веб-страница) → вставьте URL. Можно также добавить поисковые запросы в настройках задачи.
                </Step>
                <Step n={7} title="Подключите AI">
                  Настройки → AI-модели → добавьте API-ключ (OpenAI, Anthropic, Gemini или OpenRouter).
                </Step>
                <Step n={8} title="Запустите!">
                  Нажмите «Запустить сейчас» на задаче. Бот найдёт новости → AI сгенерирует пост → появится в «Постах».
                </Step>
              </Section>
            </div>
          )}

          {active === 'sources' && (
            <div className="space-y-6">
              <Section title="Типы источников контента">
                <div className="space-y-4">
                  <SourceType icon="📡" name="RSS-лента" format="https://example.com/feed/" desc="Стандартный формат новостных лент. Большинство сайтов имеют RSS. Обычно добавьте /feed/ или /rss/ к URL сайта." />
                  <SourceType icon="🔴" name="Reddit" format="r/ElectricUnicycle или ElectricUnicycle" desc="Посты из сабреддита. Вставьте имя сабреддита с или без r/. Бот загружает горячие посты." />
                  <SourceType icon="𝕏" name="Twitter / X" format="@username или username" desc="Твиты аккаунта через RSS-мосты (RSSHub, Nitter). Вставьте @username. Работает не всегда — зависит от мостов." />
                  <SourceType icon="📺" name="Telegram-канал" format="@channel_name" desc="Посты из другого Telegram-канала в реальном времени. Бот должен быть участником канала-источника." />
                  <SourceType icon="▶️" name="YouTube" format="https://www.youtube.com/feeds/videos.xml?channel_id=XXXXX" desc="RSS-фид канала YouTube. Откройте канал → исходный код страницы → найдите channel_id." />
                  <SourceType icon="🌐" name="Веб-страница" format="https://example.com/news" desc="Автоматический парсинг ссылок и заголовков со страницы. Лучше работает на страницах-каталогах (архив новостей, раздел статей)." />
                </div>
              </Section>
            </div>
          )}

          {active === 'feeds' && (
            <div className="space-y-6">
              <Section title="🔌 Электротранспорт / EUC">
                <FeedRow name="Electrek" url="https://electrek.co/feed/" desc="EV, e-bikes, электроскутеры — главный новостной сайт" />
                <FeedRow name="InsideEVs" url="https://insideevs.com/feed/" desc="Электромобили, e-bikes, индустрия EV" />
                <FeedRow name="Electric Bike Report" url="https://electricbikereport.com/feed" desc="Обзоры и новости e-bike" />
                <FeedRow name="r/ElectricUnicycle" url="r/ElectricUnicycle" desc="Reddit: моноколёса, EUC-сообщество" />
                <FeedRow name="r/ebikes" url="r/ebikes" desc="Reddit: электровелосипеды" />
                <FeedRow name="r/ElectricScooters" url="r/ElectricScooters" desc="Reddit: электросамокаты" />
              </Section>

              <Section title="🤖 AI / Машинное обучение">
                <FeedRow name="OpenAI Blog" url="https://openai.com/news/rss.xml" desc="Официальные новости OpenAI, ChatGPT, GPT" />
                <FeedRow name="Google AI Blog" url="https://ai.googleblog.com/feeds/posts/default" desc="Исследования Google в AI" />
                <FeedRow name="r/MachineLearning" url="r/MachineLearning" desc="Reddit: ML-исследования и обсуждения" />
                <FeedRow name="r/ChatGPT" url="r/ChatGPT" desc="Reddit: ChatGPT, промпты, применение" />
                <FeedRow name="r/artificial" url="r/artificial" desc="Reddit: новости AI" />
                <FeedRow name="Hacker News" url="https://hnrss.org/frontpage" desc="Лучшие посты с Hacker News" />
              </Section>

              <Section title="💻 Технологии">
                <FeedRow name="TechCrunch" url="https://techcrunch.com/feed/" desc="Стартапы, инвестиции, технологии" />
                <FeedRow name="Ars Technica" url="https://feeds.arstechnica.com/arstechnica/index" desc="Глубокая аналитика по технологиям" />
                <FeedRow name="The Verge" url="https://www.theverge.com/rss/index.xml" desc="Технологии, культура, дизайн" />
                <FeedRow name="Wired" url="https://feeds.wired.com/wired/index" desc="Наука, технологии, безопасность" />
                <FeedRow name="Engadget" url="https://www.engadget.com/rss.xml" desc="Гаджеты, игры, потребительская электроника" />
                <FeedRow name="r/technology" url="r/technology" desc="Reddit: технологические новости" />
                <FeedRow name="r/programming" url="r/programming" desc="Reddit: программирование" />
              </Section>

              <Section title="💰 Финансы / Крипто">
                <FeedRow name="CoinDesk" url="https://www.coindesk.com/feed" desc="Bitcoin, Ethereum, крипто-новости" />
                <FeedRow name="Cointelegraph" url="https://cointelegraph.com/feed" desc="Крипто, блокчейн, регуляция" />
                <FeedRow name="The Block" url="https://www.theblock.co/feed" desc="Крипто-аналитика и расследования" />
                <FeedRow name="r/CryptoCurrency" url="r/CryptoCurrency" desc="Reddit: 9.5M+ подписчиков, главный крипто-хаб" />
                <FeedRow name="r/Bitcoin" url="r/Bitcoin" desc="Reddit: 7M+ подписчиков, Bitcoin" />
                <FeedRow name="r/investing" url="r/investing" desc="Reddit: инвестиции, фондовый рынок" />
              </Section>

              <Section title="𝕏 Twitter/X аккаунты (по темам)">
                <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Вставляйте @username при добавлении Twitter-источника</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div><b>AI:</b> @OpenAI, @GoogleAI, @AnthropicAI, @ylecun, @kaborevolution</div>
                  <div><b>Tech:</b> @TechCrunch, @WIRED, @TheVerge, @arstechnica</div>
                  <div><b>EUC:</b> @ewheelscom, @inmotionworld</div>
                  <div><b>Crypto:</b> @CoinDesk, @caborevolution, @vitalikbuterin</div>
                </div>
              </Section>
            </div>
          )}

          {active === 'ai' && (
            <div className="space-y-6">
              <Section title="AI-модели для генерации постов">
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  Бот использует AI для превращения сырых новостей в красивые Telegram-посты. Поддерживаются облачные и локальные модели.
                </p>

                <h3 className="text-sm font-semibold mt-4 mb-2">☁️ Облачные</h3>
                <div className="space-y-2">
                  <ModelRow name="OpenAI" models="gpt-4o, gpt-4o-mini, o3-mini" price="$2.50-15 / 1M токенов" link="platform.openai.com" />
                  <ModelRow name="Anthropic" models="Claude Sonnet 4, Haiku 4.5" price="$0.25-15 / 1M токенов" link="console.anthropic.com" />
                  <ModelRow name="Google Gemini" models="Gemini 2.5 Flash, Pro" price="Бесплатный тир" link="aistudio.google.com" />
                  <ModelRow name="OpenRouter" models="100+ моделей" price="Pay-per-use" link="openrouter.ai" desc="Один ключ — доступ ко всем моделям" />
                </div>

                <h3 className="text-sm font-semibold mt-4 mb-2">🏠 Локальные</h3>
                <div className="space-y-2">
                  <ModelRow name="Ollama" models="llama3.1, mistral, qwen2.5, gemma2" price="Бесплатно" link="ollama.com" desc="Скачайте и запустите: ollama run llama3.1" />
                  <ModelRow name="LM Studio" models="Любые GGUF модели" price="Бесплатно" link="lmstudio.ai" desc="GUI для запуска локальных моделей" />
                </div>
              </Section>
            </div>
          )}

          {active === 'tasks' && (
            <div className="space-y-6">
              <Section title="Типы задач">
                <div className="space-y-4">
                  <TaskDoc icon="📰" name="Новостная лента" scope="Каналы и группы" desc="Собирает контент из источников (RSS, Reddit, Twitter, Telegram, YouTube, веб-страницы), генерирует пост через AI или по шаблону, добавляет в очередь. Поддерживает поисковые запросы через Tavily/Serper. Работает по расписанию (cron)." />
                  <TaskDoc icon="🤖" name="Авто-ответы" scope="Только группы" desc="Отвечает на сообщения по ключевым словам или regex-паттернам. Поддерживает переменные: {user}, {username}, {chatTitle}. Можно отвечать в ЛС. Настраиваемый cooldown между ответами." />
                  <TaskDoc icon="👋" name="Приветствие" scope="Только группы" desc="Приветствие новым участникам с картинкой/GIF, inline-кнопками (ссылки на правила), и прощание при выходе. Шаблоны: {name}, {username}. Авто-удаление через N секунд." />
                  <TaskDoc icon="🛡️" name="Модерация" scope="Только группы" desc="Фильтры контента, анти-спам, система наказаний. Подробнее — в разделе «Модерация»." />
                </div>
              </Section>

              <Section title="Дополнительные возможности">
                <div className="space-y-4">
                  <TaskDoc icon="✉️" name="Написать от бота" scope="Каналы и группы" desc="Кнопка отправки на карточке канала. Отправляет сообщение от имени бота с поддержкой HTML и картинок." />
                  <TaskDoc icon="📋" name="Дублирование" scope="Каналы и задачи" desc="Кнопка копирования на канале и задаче. При дублировании канала копируются все задачи и источники. Задачи создаются выключенными." />
                  <TaskDoc icon="✨" name="Перегенерация поста" scope="Страница постов" desc="Для AI-постов в статусе черновик/очередь — кнопка 'Перегенерировать'. AI перепишет пост другими словами, сохранив смысл." />
                </div>
              </Section>

              <Section title="Приоритет настроек">
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>API-ключи и промпты резолвятся по цепочке:</p>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400">Задача</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400">Бот</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span className="px-2 py-1 rounded bg-zinc-700/50">Глобальные</span>
                </div>
              </Section>
            </div>
          )}

          {active === 'websearch' && (
            <div className="space-y-6">
              <Section title="Мониторинг тем (веб-поиск)">
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  Задача «Новостная лента» может искать информацию в интернете через поисковые провайдеры (Serper, Tavily и др.) и создавать посты на основе найденных результатов.
                </p>

                <h3 className="text-sm font-semibold mt-4 mb-2">Настройка</h3>
                <div className="space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div className="flex items-start gap-2"><span className="text-blue-400 shrink-0">1.</span> Настройки → Поиск → добавьте API-ключ провайдера (Serper, Tavily и др.).</div>
                  <div className="flex items-start gap-2"><span className="text-blue-400 shrink-0">2.</span> В задаче → вкладка «Поисковые запросы» → добавьте ключевые фразы для мониторинга.</div>
                  <div className="flex items-start gap-2"><span className="text-blue-400 shrink-0">3.</span> Выберите язык и страну для локализации результатов.</div>
                  <div className="flex items-start gap-2"><span className="text-blue-400 shrink-0">4.</span> Включите AI-режим для генерации постов или используйте сырые результаты.</div>
                </div>

                <h3 className="text-sm font-semibold mt-4 mb-2">Параметры поиска</h3>
                <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">Запросы</b> — ключевые фразы для поиска (каждая строка — отдельный запрос).</div>
                  <div><b className="text-zinc-300">Язык</b> — язык результатов (ru, en, de и др.).</div>
                  <div><b className="text-zinc-300">Страна</b> — географическая привязка результатов.</div>
                  <div><b className="text-zinc-300">Фильтр доменов</b> — ограничить поиск конкретными сайтами или исключить нежелательные.</div>
                  <div><b className="text-zinc-300">Период</b> — временной диапазон (за час, день, неделю и т.д.).</div>
                </div>

                <h3 className="text-sm font-semibold mt-4 mb-2">Режимы генерации</h3>
                <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">AI-режим</b> — найденные статьи обрабатываются AI-моделью, которая генерирует готовый пост по промпту.</div>
                  <div><b className="text-zinc-300">Сырой режим</b> — результаты поиска формируются в пост как есть (заголовок + ссылка).</div>
                </div>
              </Section>
            </div>
          )}

          {active === 'moderation' && (
            <div className="space-y-6">
              <Section title="Модерация">
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  Задача модерации защищает группу от спама и нежелательного контента. Бот должен быть администратором группы с правами на удаление сообщений и ограничение участников.
                </p>

                <h3 className="text-sm font-semibold mt-4 mb-2">Фильтры контента</h3>
                <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">Ссылки</b> — блокировка http/https ссылок, t.me ссылок, @упоминаний.</div>
                  <div><b className="text-zinc-300">Пересылки</b> — запрет пересланных сообщений из других чатов.</div>
                  <div><b className="text-zinc-300">Стикеры</b> — блокировка стикеров и GIF.</div>
                  <div><b className="text-zinc-300">Голосовые / видео-кружки</b> — запрет голосовых сообщений и видео-заметок.</div>
                  <div><b className="text-zinc-300">Мин. длина сообщения</b> — сообщения короче N символов удаляются.</div>
                </div>

                <h3 className="text-sm font-semibold mt-4 mb-2">Анти-спам</h3>
                <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">Макс. сообщений в минуту</b> — ограничение частоты сообщений от одного пользователя. При превышении — автоматическое наказание.</div>
                </div>

                <h3 className="text-sm font-semibold mt-4 mb-2">Система наказаний</h3>
                <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">Только предупреждение</b> — бот отправляет предупреждение, сообщение не удаляется.</div>
                  <div><b className="text-zinc-300">Система страйков</b> — после N предупреждений — мут на заданное время.</div>
                  <div><b className="text-zinc-300">Мгновенный мут</b> — мут без предупреждений при нарушении.</div>
                </div>

                <h3 className="text-sm font-semibold mt-4 mb-2">Тексты предупреждений</h3>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Настраиваемые сообщения при нарушениях. Поддерживается переменная <code className="text-blue-400">{'{user}'}</code> — имя нарушителя. Можно настроить режим: удалять сообщение + предупреждение или только предупреждение без удаления.
                </div>
              </Section>
            </div>
          )}

          {active === 'posts' && (
            <div className="space-y-6">
              <Section title="Статусы постов">
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  Каждый пост проходит через цепочку статусов от создания до публикации.
                </p>

                <div className="flex items-center gap-2 text-xs flex-wrap mb-4">
                  <span className="px-2 py-1 rounded bg-zinc-700/50 text-zinc-400">Черновик</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span className="px-2 py-1 rounded bg-green-500/15 text-green-400">Одобрен</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span className="px-2 py-1 rounded bg-blue-500/15 text-blue-400">В очереди</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span className="px-2 py-1 rounded bg-purple-500/15 text-purple-400">Опубликован</span>
                </div>

                <div className="space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">Черновик (Draft)</b> — пост создан задачей или вручную. Можно редактировать, перегенерировать, удалить.</div>
                  <div><b className="text-zinc-300">Одобрен (Approved)</b> — контент проверен и утверждён. Пост готов к планированию, но дата/время ещё не назначены.</div>
                  <div><b className="text-zinc-300">В очереди (Queued)</b> — пост запланирован на конкретную дату и время. Бот опубликует его автоматически.</div>
                  <div><b className="text-zinc-300">Опубликован (Published)</b> — пост отправлен в канал/группу.</div>
                </div>

                <h3 className="text-sm font-semibold mt-4 mb-2">Действия</h3>
                <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">Одобрить</b> — подтвердить контент поста (без назначения времени).</div>
                  <div><b className="text-zinc-300">Запланировать</b> — назначить дату и время публикации. Пост переходит в статус «В очереди».</div>
                  <div><b className="text-zinc-300">Опубликовать сейчас</b> — немедленная отправка в канал/группу.</div>
                </div>
              </Section>
            </div>
          )}

          {active === 'analytics' && (
            <div className="space-y-6">
              <Section title="Аналитика">
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  Статистика активности чатов и групп, подключённых к боту.
                </p>

                <div className="space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">Статистика сообщений</b> — количество сообщений по каждому чату/группе за выбранный период.</div>
                  <div><b className="text-zinc-300">Уровни вовлечённости</b> — пользователи распределяются по уровням активности (новички, активные, суперактивные и т.д.).</div>
                  <div><b className="text-zinc-300">Распределение по часам и дням</b> — графики активности по часам суток и дням недели.</div>
                  <div><b className="text-zinc-300">Реакции на посты</b> — отслеживание реакций (лайки, эмоции) на опубликованные посты.</div>
                </div>
              </Section>
            </div>
          )}

          {active === 'members' && (
            <div className="space-y-6">
              <Section title="Участники">
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  Просмотр и управление участниками групп, подключённых к боту.
                </p>

                <div className="space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div><b className="text-zinc-300">Список участников</b> — все участники группы с информацией об активности и последнем сообщении.</div>
                  <div><b className="text-zinc-300">Модерационные действия</b> — бан, мут (ограничение на время), разбан, ограничение прав участника.</div>
                </div>
              </Section>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <h2 className="text-base font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{n}</div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{children}</div>
      </div>
    </div>
  );
}

function SourceType({ icon, name, format, desc }: { icon: string; name: string; format: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="text-sm font-medium">{name}</div>
        <code className="text-[11px] text-blue-400">{format}</code>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </div>
  );
}

function ModelRow({ name, models, price, link, desc }: { name: string; models: string; price: string; link: string; desc?: string }) {
  return (
    <div className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50" style={{ color: 'var(--text-muted)' }}>{price}</span>
      </div>
      <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Модели: {models}</div>
      {desc && <div className="text-[11px] mt-0.5 text-blue-400">{desc}</div>}
    </div>
  );
}

function TaskDoc({ icon, name, scope, desc }: { icon: string; name: string; scope: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50" style={{ color: 'var(--text-muted)' }}>{scope}</span>
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </div>
  );
}
