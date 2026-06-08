import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Download,
  Filter,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Shirt,
  Trash2,
  Wifi,
  WifiOff,
  Wind,
  X,
} from 'lucide-react';

interface ClothesItem {
  id: string;
  name: string;
  quantity: number;
  category: string;
  location: string;
  startedAt: string;
  targetMinutes: number;
}

interface ClothesPreset {
  name: string;
  category: string;
  targetMinutes: number;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type FilterMode = 'all' | 'drying' | 'ready';

const STORAGE_KEY = 'laundry-drying-items-v2';
const LEGACY_STORAGE_KEY = 'laundry-drying-items';

const DEFAULT_LOCATION = 'Balcony line';
const DEFAULT_TARGET_HOURS = '3';

const DEFAULT_CLOTHES_PRESETS: ClothesPreset[] = [
  { name: 'T-Shirts', category: 'Light', targetMinutes: 120 },
  { name: 'Shirts', category: 'Light', targetMinutes: 150 },
  { name: 'Socks', category: 'Small', targetMinutes: 90 },
  { name: 'Underwear', category: 'Small', targetMinutes: 90 },
  { name: 'Pants', category: 'Medium', targetMinutes: 240 },
  { name: 'Jeans', category: 'Heavy', targetMinutes: 480 },
  { name: 'Towels', category: 'Heavy', targetMinutes: 420 },
  { name: 'Bedsheets', category: 'Linen', targetMinutes: 360 },
];

const CATEGORY_OPTIONS = ['Light', 'Small', 'Medium', 'Heavy', 'Linen', 'Delicate'];
const LOCATION_OPTIONS = ['Balcony line', 'Indoor rack', 'Clothesline', 'Drying room'];

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const clamp = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), max)
);

const parseQuantity = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? clamp(parsed, 1, 99) : 1;
};

const parseTargetMinutes = (value: string) => {
  const parsed = Number.parseFloat(value);
  const hours = Number.isFinite(parsed) ? clamp(parsed, 0.25, 24) : Number(DEFAULT_TARGET_HOURS);
  return Math.round(hours * 60);
};

const getReadyAt = (item: ClothesItem) => (
  new Date(item.startedAt).getTime() + item.targetMinutes * 60_000
);

const isReady = (item: ClothesItem, now: number) => getReadyAt(item) <= now;

const getProgress = (item: ClothesItem, now: number) => {
  const started = new Date(item.startedAt).getTime();
  const duration = Math.max(item.targetMinutes * 60_000, 1);
  return clamp(((now - started) / duration) * 100, 0, 100);
};

const formatDuration = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  if (hours === 0) {
    return `${mins}m`;
  }

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
};

const formatClock = (dateMs: number) => (
  new Date(dateMs).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
);

const normalizeStoredItems = (value: unknown): ClothesItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): ClothesItem | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Partial<ClothesItem>;
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const quantity = Number(candidate.quantity);

      if (!name || !Number.isFinite(quantity) || quantity < 1) {
        return null;
      }

      const startedAt = typeof candidate.startedAt === 'string'
        ? candidate.startedAt
        : new Date().toISOString();
      const startedMs = new Date(startedAt).getTime();

      return {
        id: typeof candidate.id === 'string' ? candidate.id : createId(),
        name,
        quantity: Math.round(clamp(quantity, 1, 99)),
        category: typeof candidate.category === 'string' ? candidate.category : 'General',
        location: typeof candidate.location === 'string' ? candidate.location : DEFAULT_LOCATION,
        startedAt: Number.isFinite(startedMs) ? startedAt : new Date().toISOString(),
        targetMinutes: Number.isFinite(Number(candidate.targetMinutes))
          ? Math.round(clamp(Number(candidate.targetMinutes), 15, 1_440))
          : Number(DEFAULT_TARGET_HOURS) * 60,
      };
    })
    .filter((item): item is ClothesItem => item !== null);
};

const readStoredItems = () => {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    return normalizeStoredItems(JSON.parse(stored));
  } catch {
    return [];
  }
};

function App() {
  const [items, setItems] = useState<ClothesItem[]>(readStoredItems);
  const [customName, setCustomName] = useState('');
  const [customQuantity, setCustomQuantity] = useState('1');
  const [customTargetHours, setCustomTargetHours] = useState(DEFAULT_TARGET_HOURS);
  const [customCategory, setCustomCategory] = useState(CATEGORY_OPTIONS[0]);
  const [customLocation, setCustomLocation] = useState(DEFAULT_LOCATION);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const stats = useMemo(() => {
    const readyItems = items.filter(item => isReady(item, now));
    const dryingItems = items.filter(item => !isReady(item, now));
    const nextReadyAt = dryingItems.length
      ? Math.min(...dryingItems.map(getReadyAt))
      : null;

    return {
      totalPieces: items.reduce((total, item) => total + item.quantity, 0),
      totalBatches: items.length,
      readyBatches: readyItems.length,
      dryingBatches: dryingItems.length,
      nextReadyAt,
    };
  }, [items, now]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return [...items]
      .sort((a, b) => {
        const readyDelta = Number(isReady(b, now)) - Number(isReady(a, now));

        if (readyDelta !== 0) {
          return readyDelta;
        }

        return getReadyAt(a) - getReadyAt(b);
      })
      .filter(item => {
        const ready = isReady(item, now);
        const matchesFilter = filterMode === 'all'
          || (filterMode === 'ready' && ready)
          || (filterMode === 'drying' && !ready);
        const matchesSearch = !normalizedQuery
          || item.name.toLowerCase().includes(normalizedQuery)
          || item.category.toLowerCase().includes(normalizedQuery)
          || item.location.toLowerCase().includes(normalizedQuery);

        return matchesFilter && matchesSearch;
      });
  }, [filterMode, items, now, searchQuery]);

  const addItem = (
    name: string,
    category: string,
    targetMinutes: number,
    quantity = 1,
    location = customLocation,
  ) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setItems(previousItems => [
      {
        id: createId(),
        name: trimmedName,
        quantity: Math.round(clamp(quantity, 1, 99)),
        category,
        location,
        startedAt: new Date().toISOString(),
        targetMinutes,
      },
      ...previousItems,
    ]);
  };

  const handleAddCustom = () => {
    addItem(
      customName,
      customCategory,
      parseTargetMinutes(customTargetHours),
      parseQuantity(customQuantity),
      customLocation,
    );
    setCustomName('');
    setCustomQuantity('1');
  };

  const updateQuantity = (id: string, delta: number) => {
    setItems(previousItems => previousItems
      .map(item => (
        item.id === id
          ? { ...item, quantity: item.quantity + delta }
          : item
      ))
      .filter(item => item.quantity > 0));
  };

  const removeItem = (id: string) => {
    setItems(previousItems => previousItems.filter(item => item.id !== id));
  };

  const restartTimer = (id: string) => {
    setItems(previousItems => previousItems.map(item => (
      item.id === id
        ? { ...item, startedAt: new Date().toISOString() }
        : item
    )));
  };

  const removeReadyItems = () => {
    setItems(previousItems => previousItems.filter(item => !isReady(item, Date.now())));
  };

  const removeAll = () => {
    setItems([]);
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-cyan-600 text-white shadow-sm">
              <Wind className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
                DryCloths
              </p>
              <h1 className="truncate text-2xl font-bold text-zinc-950 sm:text-3xl">
                Laundry Drying Manager
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm">
              {isOnline ? (
                <Wifi className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <WifiOff className="h-4 w-4 text-rose-600" aria-hidden="true" />
              )}
              {isOnline ? 'Online' : 'Offline'}
            </span>

            {installPrompt && (
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Install
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Pieces drying</p>
            <p className="mt-2 text-3xl font-bold text-zinc-950">{stats.totalPieces}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Active batches</p>
            <p className="mt-2 text-3xl font-bold text-zinc-950">{stats.totalBatches}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Ready now</p>
            <p className="mt-2 text-3xl font-bold text-emerald-700">{stats.readyBatches}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Next ready</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">
              {stats.nextReadyAt ? formatClock(stats.nextReadyAt) : 'Done'}
            </p>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-zinc-950">Quick Add</h2>
                <Shirt className="h-5 w-5 text-cyan-700" aria-hidden="true" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_CLOTHES_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => addItem(preset.name, preset.category, preset.targetMinutes)}
                    className="flex min-h-16 flex-col items-start justify-between rounded-md border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <span className="text-sm font-semibold text-zinc-950">{preset.name}</span>
                    <span className="text-xs font-medium text-zinc-500">
                      {formatDuration(preset.targetMinutes)}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-zinc-950">Custom Batch</h2>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-700">Name</span>
                  <input
                    type="text"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleAddCustom();
                      }
                    }}
                    placeholder="Hoodies"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-700">Quantity</span>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={customQuantity}
                      onChange={(event) => setCustomQuantity(event.target.value)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-700">Hours</span>
                    <input
                      type="number"
                      min="0.25"
                      max="24"
                      step="0.25"
                      value={customTargetHours}
                      onChange={(event) => setCustomTargetHours(event.target.value)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-700">Category</span>
                  <select
                    value={customCategory}
                    onChange={(event) => setCustomCategory(event.target.value)}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  >
                    {CATEGORY_OPTIONS.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-700">Location</span>
                  <select
                    value={customLocation}
                    onChange={(event) => setCustomLocation(event.target.value)}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  >
                    {LOCATION_OPTIONS.map(location => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={handleAddCustom}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Batch
                </button>
              </div>
            </section>
          </aside>

          <section className="min-w-0 rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">Drying Board</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {stats.dryingBatches} drying, {stats.readyBatches} ready
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block min-w-0 sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search"
                    className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>

                <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-1">
                  {(['all', 'drying', 'ready'] as FilterMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFilterMode(mode)}
                      className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold capitalize transition ${
                        filterMode === mode
                          ? 'bg-white text-cyan-800 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                    >
                      {mode === 'all' && <Filter className="h-3.5 w-3.5" aria-hidden="true" />}
                      {mode === 'drying' && <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                      {mode === 'ready' && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {items.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-3">
                <div className="text-sm font-medium text-zinc-600">
                  {filteredItems.length} shown
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={removeReadyItems}
                    disabled={stats.readyBatches === 0}
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Take Ready
                  </button>
                  <button
                    type="button"
                    onClick={removeAll}
                    className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div className="p-5">
              {filteredItems.length > 0 ? (
                <div className="grid gap-3">
                  {filteredItems.map(item => {
                    const ready = isReady(item, now);
                    const progress = getProgress(item, now);
                    const remainingMinutes = Math.ceil((getReadyAt(item) - now) / 60_000);
                    const readyAt = getReadyAt(item);

                    return (
                      <article
                        key={item.id}
                        className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 truncate text-lg font-bold text-zinc-950">
                                {item.name}
                              </h3>
                              <span className={`rounded px-2 py-1 text-xs font-bold ${
                                ready
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                              >
                                {ready ? 'Ready' : formatDuration(remainingMinutes)}
                              </span>
                              <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                                {item.category}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                              <span className="inline-flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                                {item.location}
                              </span>
                              <span className="inline-flex items-center gap-2">
                                <Clock className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                                Ready at {formatClock(readyAt)}
                              </span>
                            </div>

                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  ready ? 'bg-emerald-500' : 'bg-cyan-600'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                            <div className="inline-flex h-10 items-center rounded-md border border-zinc-200 bg-zinc-50">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, -1)}
                                className="grid h-10 w-10 place-items-center rounded-l-md text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
                                aria-label={`Decrease ${item.name}`}
                                title="Decrease"
                              >
                                <Minus className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <span className="grid h-10 min-w-12 place-items-center border-x border-zinc-200 px-3 text-sm font-bold text-zinc-950">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, 1)}
                                className="grid h-10 w-10 place-items-center rounded-r-md text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
                                aria-label={`Increase ${item.name}`}
                                title="Increase"
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => restartTimer(item.id)}
                              className="grid h-10 w-10 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-950"
                              aria-label={`Restart timer for ${item.name}`}
                              title="Restart timer"
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="grid h-10 w-10 place-items-center rounded-md border border-rose-200 bg-white text-rose-700 shadow-sm transition hover:bg-rose-50"
                              aria-label={`Take down ${item.name}`}
                              title="Take down"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
                  <div>
                    <Wind className="mx-auto h-12 w-12 text-zinc-300" aria-hidden="true" />
                    <p className="mt-4 text-lg font-bold text-zinc-950">
                      {items.length === 0 ? 'Nothing drying' : 'No matching batches'}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {items.length === 0 ? 'Add a batch to start tracking.' : 'Change the filter or search.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default App;
