import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import { User, LogOut, Mail, FolderOpen, Trash2, ChevronDown, ChevronRight, Camera, KeyRound, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/shared/hooks/useAuth';
import { useFavorites } from '@/shared/hooks/useFavorites';
import { useCompare } from '@/shared/hooks/useCompare';
import { TelegramLoginButton } from '@/components/TelegramLoginButton';
import { ApiError, apiDelete, apiGet, apiPost, apiPostForm, apiPut, apiUrl } from '@/lib/api';
import BuyerInquiryHistory from '@/shared/components/BuyerInquiryHistory';
import PrivacyConsent from '@/shared/components/forms/PrivacyConsent';
import { validatePrivacyConsent } from '@/shared/lib/privacy-consent';

function parseApiMessage(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const j = JSON.parse(err.message) as { message?: string | string[] };
      if (Array.isArray(j.message)) return j.message.join(', ');
      if (typeof j.message === 'string') return j.message;
    } catch {
      if (err.message) return err.message;
    }
  }
  return err instanceof Error ? err.message : 'Ошибка запроса';
}

type CollectionListRow = {
  id: string;
  name: string;
  shareToken?: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { items: number };
};

type CollectionDetailItem = {
  id: string;
  kind: 'BLOCK' | 'LISTING';
  entityId: number;
  title: string;
  slug?: string | null;
  listingKind?: string | null;
};

type MyRequestRow = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  type: string;
  status: string;
  blockId: number | null;
  listingId: number | null;
  sourceUrl: string | null;
  comment: string | null;
  createdAt: string;
};

const REQUEST_TYPE_RU: Record<string, string> = {
  CONSULTATION: 'Консультация',
  MORTGAGE: 'Ипотека',
  CALLBACK: 'Обратный звонок',
  SELECTION: 'Подбор',
  CONTACT: 'Контакты',
};

const REQUEST_STATUS_RU: Record<string, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
};

function formatReqDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

const Profile = () => {
  const { user, logout, linkEmail, refreshMe } = useAuth();
  const { count: favoritesCount } = useFavorites();
  const { count: compareCount } = useCompare();
  const qc = useQueryClient();
  const isStaff = ['agent', 'manager', 'editor', 'admin'].includes(user.role);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [linkEmailErr, setLinkEmailErr] = useState<string | null>(null);
  const [linkEmailOk, setLinkEmailOk] = useState<string | null>(null);
  const [linkEmailConsent, setLinkEmailConsent] = useState(false);
  const [linkEmailConsentError, setLinkEmailConsentError] = useState<string | null>(null);
  const [linkTgErr, setLinkTgErr] = useState<string | null>(null);
  const [linkTgOk, setLinkTgOk] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [expandedCollectionId, setExpandedCollectionId] = useState<string | null>(null);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [collectionShareMessage, setCollectionShareMessage] = useState<string | null>(null);

  const requestsQuery = useQuery({
    queryKey: ['requests', 'me', user?.id],
    queryFn: () => apiGet<MyRequestRow[]>('/requests/me'),
    enabled: Boolean(user),
  });

  const collectionsQuery = useQuery({
    queryKey: ['collections', user?.id],
    queryFn: () => apiGet<CollectionListRow[]>('/collections'),
    enabled: Boolean(user),
  });

  const collectionDetailQuery = useQuery({
    queryKey: ['collections', 'detail', expandedCollectionId],
    queryFn: () =>
      apiGet<{ id: string; name: string; items: CollectionDetailItem[] }>(
        `/collections/${expandedCollectionId}`,
      ),
    enabled: Boolean(user && expandedCollectionId),
  });

  const createCollectionMutation = useMutation({
    mutationFn: (name: string) => apiPost<CollectionListRow>('/collections', { name }),
    onSuccess: () => {
      setNewCollectionName('');
      void qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const deleteCollectionMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/collections/${id}`),
    onSuccess: () => {
      setExpandedCollectionId(null);
      void qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const renameCollectionMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiPut<CollectionListRow>(`/collections/${id}`, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collections'] });
      if (expandedCollectionId) {
        void qc.invalidateQueries({ queryKey: ['collections', 'detail', expandedCollectionId] });
      }
    },
  });

  const deleteCollectionItemMutation = useMutation({
    mutationFn: ({ collectionId, itemId }: { collectionId: string; itemId: string }) =>
      apiDelete(`/collections/${collectionId}/items/${itemId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collections'] });
      if (expandedCollectionId) {
        void qc.invalidateQueries({ queryKey: ['collections', 'detail', expandedCollectionId] });
      }
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiPostForm<{ avatarUrl: string | null }>('/auth/avatar', form);
    },
    onSuccess: async () => {
      setAvatarMessage('Аватар обновлён.');
      await refreshMe();
    },
    onError: (err) => setAvatarMessage(parseApiMessage(err)),
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: typeof passwordForm) => apiPost('/auth/change-password', payload),
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      setPasswordMessage('Пароль изменён.');
    },
    onError: (err) => setPasswordMessage(parseApiMessage(err)),
  });

  const shareCollectionMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ token: string }>(`/collections/${id}/share`, {}),
    onSuccess: async ({ token }) => {
      const url = `${window.location.origin}/selections/${token}`;
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setCollectionShareMessage(`Ссылка скопирована: ${url}`);
      void qc.invalidateQueries({ queryKey: ['collections'] });
      if (expandedCollectionId) {
        void qc.invalidateQueries({ queryKey: ['collections', 'detail', expandedCollectionId] });
      }
    },
    onError: (err) => setCollectionShareMessage(parseApiMessage(err)),
  });

  if (!user) return null;

  const hasEmail = !!(user.email && user.email.trim());
  const hasTg =
    !!user.telegramLinked || !!(user.telegramUsername && user.telegramUsername.trim());

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordMessage('Пароли не совпадают');
      return;
    }
    passwordMutation.mutate(passwordForm);
  };

  const handleLinkEmail = async (e: FormEvent) => {
    e.preventDefault();
    const consentErr = validatePrivacyConsent(linkEmailConsent);
    if (consentErr) {
      setLinkEmailConsentError(consentErr);
      return;
    }
    setLinkEmailConsentError(null);
    setLinkEmailErr(null);
    setLinkEmailOk(null);
    try {
      await linkEmail(email.trim(), password);
      setLinkEmailOk('Email и пароль сохранены. Теперь можно входить по email.');
      setEmail('');
      setPassword('');
    } catch (err) {
      setLinkEmailErr(parseApiMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <RedesignHeader />
      <div className="max-w-[1400px] mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold mb-8">Личный кабинет</h1>
        <div className="grid lg:grid-cols-[280px_1fr] gap-8 items-start">
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <div className="relative mx-auto mb-4 h-20 w-20">
              <div className="h-20 w-20 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-background shadow-sm">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={avatarMutation.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) avatarMutation.mutate(file);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
            {avatarMessage ? (
              <p className={avatarMutation.isError ? 'mb-3 text-xs text-destructive' : 'mb-3 text-xs text-green-600'}>{avatarMessage}</p>
            ) : null}
            <p className="font-bold mb-1">{user.name}</p>
            {user.phone ? (
              <p className="text-xs text-muted-foreground mb-2">{user.phone}</p>
            ) : null}
            {hasEmail ? (
              <p className="text-xs text-muted-foreground mb-4 flex items-center justify-center gap-1">
                <Mail className="w-3 h-3 shrink-0" />
                {user.email}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mb-4">Email не указан</p>
            )}
            {hasTg ? (
              <p className="text-xs text-muted-foreground mb-4">
                Telegram
                {user.telegramUsername ? `: @${user.telegramUsername}` : ' привязан'}
              </p>
            ) : null}
            <Button variant="outline" size="sm" className="w-full" disabled>
              Редактировать
            </Button>
            {isStaff ? (
              <Button asChild size="sm" className="w-full mt-3">
                <Link to={user.role === 'agent' ? '/admin/listings' : user.role === 'manager' ? '/admin/requests' : '/admin'}>
                  Рабочий кабинет
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="font-bold mb-2">Вход в один аккаунт</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Привяжите Telegram к аккаунту с email или добавьте email к аккаунту из Telegram —
                так не появится второй пользователь при смене способа входа.
              </p>
              {!hasTg ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Привязать Telegram</p>
                  {linkTgOk ? (
                    <p className="text-sm text-green-600 dark:text-green-400">{linkTgOk}</p>
                  ) : null}
                  {linkTgErr ? (
                    <p className="text-sm text-destructive">{linkTgErr}</p>
                  ) : null}
                  <TelegramLoginButton
                    mode="link"
                    onSuccess={() => {
                      setLinkTgErr(null);
                      setLinkTgOk('Telegram привязан.');
                    }}
                    onError={(m) => {
                      setLinkTgOk(null);
                      setLinkTgErr(m);
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Telegram уже привязан.</p>
              )}
              {!hasEmail ? (
                <form onSubmit={handleLinkEmail} className="mt-6 space-y-3 max-w-sm">
                  <p className="text-sm font-medium">Добавить email и пароль</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="link-email">Email</Label>
                    <Input
                      id="link-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="link-password">Пароль (мин. 6 символов)</Label>
                    <Input
                      id="link-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      required
                    />
                  </div>
                  {linkEmailOk ? (
                    <p className="text-sm text-green-600 dark:text-green-400">{linkEmailOk}</p>
                  ) : null}
                  <PrivacyConsent
                    id="profile-link-email-consent"
                    checked={linkEmailConsent}
                    onCheckedChange={(next) => {
                      setLinkEmailConsent(next);
                      if (next) setLinkEmailConsentError(null);
                    }}
                    error={linkEmailConsentError}
                  />
                  {linkEmailErr ? (
                    <p className="text-sm text-destructive">{linkEmailErr}</p>
                  ) : null}
                  <Button type="submit" size="sm" disabled={!linkEmailConsent}>
                    Сохранить
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground mt-4">Email уже указан.</p>
              )}
            </div>
            {hasEmail ? (
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="mb-3 flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <h2 className="font-bold">Смена пароля</h2>
                </div>
                <form onSubmit={handlePasswordSubmit} className="grid gap-3 sm:max-w-md">
                  <div className="space-y-1.5">
                    <Label htmlFor="current-password">Текущий пароль</Label>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                      minLength={6}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">Новый пароль</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                      minLength={6}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Повторите новый пароль</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.confirmNewPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmNewPassword: e.target.value }))}
                      minLength={6}
                      required
                    />
                  </div>
                  {passwordMessage ? (
                    <p className={passwordMutation.isError || passwordMessage.includes('не совпадают') ? 'text-sm text-destructive' : 'text-sm text-green-600'}>
                      {passwordMessage}
                    </p>
                  ) : null}
                  <Button type="submit" size="sm" disabled={passwordMutation.isPending}>
                    Сменить пароль
                  </Button>
                </form>
              </div>
            ) : null}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="font-bold mb-2">Мои заявки</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Отображаются заявки, отправленные с сайта, пока вы были авторизованы (Bearer в запросе). Анонимные
                обращения здесь не видны.
              </p>
              {requestsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Загрузка…</p>
              ) : requestsQuery.isError ? (
                <p className="text-sm text-destructive">{parseApiMessage(requestsQuery.error)}</p>
              ) : !requestsQuery.data?.length ? (
                <p className="text-sm text-muted-foreground">Пока нет заявок с привязкой к аккаунту.</p>
              ) : (
                <ul className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {requestsQuery.data.map((r) => (
                    <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                        <span className="font-medium">№{r.id}</span>
                        <span className="text-xs text-muted-foreground">{formatReqDate(r.createdAt)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>
                          <span className="text-foreground/80">Тип:</span>{' '}
                          {REQUEST_TYPE_RU[r.type] ?? r.type}
                        </p>
                        <p>
                          <span className="text-foreground/80">Статус:</span>{' '}
                          {REQUEST_STATUS_RU[r.status] ?? r.status}
                        </p>
                        {(r.name || r.phone) && (
                          <p>
                            <span className="text-foreground/80">Контакт:</span>{' '}
                            {[r.name, r.phone].filter(Boolean).join(', ')}
                          </p>
                        )}
                        {r.comment ? (
                          <p className="line-clamp-3 mt-1">
                            <span className="text-foreground/80">Комментарий:</span> {r.comment}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <BuyerInquiryHistory />
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="w-5 h-5 text-primary shrink-0" />
                <h2 className="font-bold">Мои подборки</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Именованные списки ЖК и объявлений. В подборке до 5 объектов, ссылкой можно поделиться без авторизации.
              </p>
              <form
                className="flex flex-col sm:flex-row gap-2 mb-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = newCollectionName.trim();
                  if (!n || createCollectionMutation.isPending) return;
                  createCollectionMutation.mutate(n);
                }}
              >
                <Input
                  placeholder="Название новой подборки"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" size="sm" disabled={createCollectionMutation.isPending || !newCollectionName.trim()}>
                  Создать
                </Button>
              </form>
              {createCollectionMutation.isError ? (
                <p className="text-sm text-destructive mb-3">{parseApiMessage(createCollectionMutation.error)}</p>
              ) : null}
              {collectionShareMessage ? (
                <p className={shareCollectionMutation.isError ? 'text-sm text-destructive mb-3' : 'text-sm text-green-600 mb-3'}>
                  {collectionShareMessage}
                </p>
              ) : null}
              {collectionsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Загрузка…</p>
              ) : !collectionsQuery.data?.length ? (
                <p className="text-sm text-muted-foreground">Подборок пока нет.</p>
              ) : (
                <ul className="space-y-2">
                  {collectionsQuery.data.map((c) => {
                    const open = expandedCollectionId === c.id;
                    return (
                      <li key={c.id} className="rounded-lg border border-border overflow-hidden">
                        <div className="flex items-center gap-2 p-3 bg-muted/30">
                          <button
                            type="button"
                            className="flex items-center gap-2 flex-1 text-left text-sm font-medium min-w-0"
                            onClick={() => setExpandedCollectionId(open ? null : c.id)}
                          >
                            {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                            <span className="truncate">{c.name}</span>
                            <span className="text-xs text-muted-foreground font-normal shrink-0">({c._count.items})</span>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            title="Переименовать"
                            disabled={renameCollectionMutation.isPending}
                            onClick={() => {
                              const next = prompt('Новое название подборки:', c.name);
                              if (!next?.trim()) return;
                              renameCollectionMutation.mutate({ id: c.id, name: next.trim() });
                            }}
                          >
                            Имя
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            title="Скопировать публичную ссылку"
                            disabled={shareCollectionMutation.isPending}
                            onClick={() => shareCollectionMutation.mutate(c.id)}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Ссылка
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            asChild
                            title="Скачать подборку в PDF"
                          >
                            <a href={apiUrl(`/collections/${c.id}/pdf`)} target="_blank" rel="noreferrer">
                              PDF
                            </a>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title="Удалить подборку"
                            disabled={deleteCollectionMutation.isPending}
                            onClick={() => {
                              if (confirm(`Удалить подборку «${c.name}»?`)) {
                                deleteCollectionMutation.mutate(c.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {open && collectionDetailQuery.isFetching ? (
                          <p className="text-xs text-muted-foreground px-3 py-2">Загрузка…</p>
                        ) : null}
                        {open && collectionDetailQuery.data ? (
                          <ul className="border-t border-border divide-y max-h-[360px] overflow-y-auto">
                            {collectionDetailQuery.data.items.length === 0 ? (
                              <li className="px-3 py-2 text-xs text-muted-foreground">Пусто — добавьте объекты из избранного.</li>
                            ) : (
                              collectionDetailQuery.data.items.map((it) => (
                                <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                                  <div className="flex-1 min-w-0">
                                    {it.kind === 'BLOCK' && it.slug ? (
                                      <Link to={`/complex/${it.slug}`} className="hover:text-primary truncate block">
                                        {it.title}
                                      </Link>
                                    ) : it.kind === 'LISTING' ? (
                                      <Link to={`/apartment/${it.entityId}`} className="hover:text-primary truncate block">
                                        {it.title}
                                      </Link>
                                    ) : (
                                      <span className="truncate">{it.title}</span>
                                    )}
                                    <span className="text-[11px] text-muted-foreground">
                                      {it.kind === 'BLOCK' ? 'ЖК' : 'Объявление'}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 shrink-0 text-muted-foreground"
                                    title="Убрать из подборки"
                                    disabled={deleteCollectionItemMutation.isPending}
                                    onClick={() =>
                                      deleteCollectionItemMutation.mutate({ collectionId: c.id, itemId: it.id })
                                    }
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </li>
                              ))
                            )}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold">Избранное</h2>
                <Link to="/favorites" className="text-sm text-primary hover:underline">Все →</Link>
              </div>
              <p className="text-sm text-muted-foreground">
                {favoritesCount > 0 ? `Сохранено в избранном: ${favoritesCount}` : 'Нет избранных объектов'}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold">Сравнение</h2>
                <Link to="/compare" className="text-sm text-primary hover:underline">Открыть →</Link>
              </div>
              <p className="text-sm text-muted-foreground">
                {compareCount > 0
                  ? `В сравнении ${compareCount} из 3 жилых комплексов (данные в браузере).`
                  : 'Нет объектов в сравнении — добавьте ЖК с кнопки «Сравнить» в каталоге.'}
              </p>
            </div>
            <Button
              variant="destructive"
              className="flex items-center gap-2"
              type="button"
              onClick={() => void logout()}
            >
              <LogOut className="w-4 h-4" /> Выйти
            </Button>
          </div>
        </div>
      </div>
      <FooterSection reserveMobileNav />
    </div>
  );
};

export default Profile;
