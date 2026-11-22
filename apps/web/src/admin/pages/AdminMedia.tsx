import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  FolderPlus,
  Grid3X3,
  List,
  Loader2,
  Search,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { apiDelete, apiGet, apiPost, apiPostForm, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MediaFileRow, MediaFolderRow } from '@/admin/components/media-types';
import { buildFolderMoveOptions } from '@/admin/lib/media-folder-options';
import MediaFileMoveSelect from '@/admin/components/MediaFileMoveSelect';
import AdminStatusBadge from '@/admin/components/AdminStatusBadge';
import { adminAuthQueryOptions } from '@/shared/lib/admin-auth-query';

type MediaHealthResponse = {
  ok: boolean;
  listingMissingFiles?: number;
  onDiskMediaFiles?: number;
  listingBrokenRefs?: { listingId: number; kind: string; missingUrls: string[] }[];
  integrity: {
    missingOnDisk: number;
    missingRatio: number;
    storage: {
      mediaRoot: string;
      writable: boolean;
      onDiskMediaFiles: number;
      dbMediaFiles: number;
      healthy: boolean;
    };
  };
};

function buildTree(folders: MediaFolderRow[]) {
  const byParent = new Map<string, MediaFolderRow[]>();
  for (const f of folders) {
    const k = f.parentId == null ? 'root' : String(f.parentId);
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(f);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  return byParent;
}

function FolderTree({
  byParent,
  trashId,
  currentId,
  depth,
  parentKey,
  onSelect,
}: {
  byParent: Map<string, MediaFolderRow[]>;
  trashId: number | null;
  currentId: number | null;
  depth: number;
  parentKey: string;
  onSelect: (id: number | null) => void;
}) {
  const nodes = byParent.get(parentKey) ?? [];
  return (
    <ul className={depth === 0 ? 'space-y-0.5' : 'ml-2 border-l border-border pl-2 space-y-0.5 mt-0.5'}>
      {nodes.map((n) => {
        /* Корзину в дереве не показываем — она отдельной кнопкой; «Загрузки» показываем, иначе вложенные папки не видны */
        if (trashId != null && n.id === trashId) return null;
        const key = String(n.id);
        const children = byParent.get(key);
        const active = currentId === n.id;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onSelect(n.id)}
              className={`w-full text-left flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm ${
                active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <Folder className="w-4 h-4 shrink-0 opacity-80" />
              <span className="truncate">{n.name}</span>
            </button>
            {children?.length ? (
              <FolderTree
                byParent={byParent}
                trashId={trashId}
                currentId={currentId}
                depth={depth + 1}
                parentKey={key}
                onSelect={onSelect}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminMedia() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [folderId, setFolderId] = useState<number | null>(null);
  const [folderInited, setFolderInited] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [err, setErr] = useState('');

  const { data: folders = [], isSuccess: foldersOk } = useQuery({
    queryKey: ['admin', 'media', 'folders'],
    queryFn: () => apiGet<MediaFolderRow[]>('/admin/media/folders'),
    ...adminAuthQueryOptions({ staleTime: 15_000 }),
  });

  const { data: mediaHealth } = useQuery({
    queryKey: ['admin', 'media', 'health'],
    queryFn: () => apiGet<MediaHealthResponse>('/admin/media/health'),
    ...adminAuthQueryOptions({ staleTime: 30_000 }),
  });

  const trashId = useMemo(() => folders.find((f) => f.isTrash)?.id ?? null, [folders]);
  const uploadsId = useMemo(
    () => folders.find((f) => !f.isTrash && f.parentId == null && f.name === 'Загрузки')?.id ?? null,
    [folders],
  );

  useEffect(() => {
    if (!foldersOk || folderInited) return;
    setFolderInited(true);
    if (uploadsId != null) setFolderId(uploadsId);
  }, [foldersOk, folderInited, uploadsId]);

  const byParent = useMemo(() => buildTree(folders), [folders]);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['admin', 'media', 'files', folderId],
    queryFn: () => {
      const q = folderId == null ? '' : `?folder_id=${folderId}`;
      return apiGet<MediaFileRow[]>(`/admin/media/files${q}`);
    },
    ...adminAuthQueryOptions({ enabled: foldersOk, staleTime: 10_000 }),
  });

  const inTrash = trashId != null && folderId === trashId;

  const moveFolderOptions = useMemo(
    () => buildFolderMoveOptions(folders, trashId),
    [folders, trashId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => (f.originalFilename ?? String(f.id)).toLowerCase().includes(q));
  }, [files, search]);

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      toast.message('Введите имя папки');
      return;
    }
    setErr('');
    try {
      await apiPost('/admin/media/folders', { parentId: folderId ?? null, name });
      setNewFolderName('');
      await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
      toast.success(`Папка «${name}» создана`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Не удалось создать папку';
      setErr(msg);
      toast.error(msg);
    }
  };

  const deleteFolder = async (id: number) => {
    if (!window.confirm('Удалить папку? (только если пуста)')) return;
    try {
      await apiDelete(`/admin/media/folders/${id}`);
      await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
      if (folderId === id) setFolderId(uploadsId);
      toast.success('Папка удалена');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Ошибка';
      setErr(msg);
      toast.error(msg);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    setErr('');
    const n = list.length;
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append('file', file);
        const q = folderId != null ? `?folder_id=${folderId}` : '';
        await apiPostForm<MediaFileRow>(`/admin/media/upload${q}`, fd);
      }
      e.target.value = '';
      await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
      toast.success(n === 1 ? 'Файл загружен' : `Загружено файлов: ${n}`);
    } catch (ex) {
      const msg = ex instanceof ApiError ? ex.message : 'Ошибка загрузки';
      setErr(msg);
      toast.error(msg);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const list = e.dataTransfer.files;
    if (!list?.length) return;
    setErr('');
    let ok = 0;
    try {
      for (const file of Array.from(list)) {
        if (!file.type.startsWith('image/')) continue;
        const fd = new FormData();
        fd.append('file', file);
        const q = folderId != null ? `?folder_id=${folderId}` : '';
        await apiPostForm<MediaFileRow>(`/admin/media/upload${q}`, fd);
        ok++;
      }
      await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
      if (ok) toast.success(ok === 1 ? 'Файл загружен' : `Загружено файлов: ${ok}`);
      else toast.message('Перетащите изображения (не другие типы файлов)');
    } catch (ex) {
      const msg = ex instanceof ApiError ? ex.message : 'Ошибка загрузки';
      setErr(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Медиа</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Иерархия папок, загрузка изображений. Удалённые файлы попадают в «Корзину» — оттуда можно восстановить
            или удалить навсегда.
          </p>
        </div>
        <label className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer shrink-0">
          <Upload className="w-4 h-4" /> Загрузить
          <input type="file" multiple className="hidden" onChange={onUpload} accept="image/*" />
        </label>
      </div>

      {err ? <p className="text-sm text-destructive mb-3">{err}</p> : null}

      {mediaHealth?.integrity?.storage ? (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 mb-4 text-xs flex flex-wrap items-center gap-2">
          <span className="font-medium">Хранилище файлов</span>
          <AdminStatusBadge tone={mediaHealth.ok ? 'ok' : 'warn'}>
            {mediaHealth.ok ? 'в порядке' : 'есть проблемы'}
          </AdminStatusBadge>
          <span className="text-muted-foreground font-mono truncate max-w-full">
            {mediaHealth.integrity.storage.mediaRoot}
          </span>
          <span className="text-muted-foreground">
            на диске {mediaHealth.integrity.storage.onDiskMediaFiles} · в базе{' '}
            {mediaHealth.integrity.storage.dbMediaFiles} · не найдено{' '}
            {mediaHealth.integrity.missingOnDisk}
            {(mediaHealth.listingMissingFiles ?? 0) > 0
              ? ` · битые объявления ${mediaHealth.listingMissingFiles}`
              : ''}
          </span>
          {(mediaHealth.listingBrokenRefs?.length ?? 0) > 0 ? (
            <span className="text-amber-700 w-full">
              Нет файлов на диске для объявлений:{' '}
              {mediaHealth.listingBrokenRefs!.map((b) => `#${b.listingId}`).join(', ')} — нужна повторная загрузка
              фото.
            </span>
          ) : null}
          <Link to="/admin/system" className="text-primary hover:underline ml-auto">
            Диагностика сервера →
          </Link>
        </div>
      ) : null}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border-2 border-dashed rounded-2xl p-6 mb-6 text-center text-sm text-muted-foreground"
      >
        Перетащите изображения сюда — загрузятся в текущую папку
      </div>

      <div className="flex flex-col lg:flex-row gap-4 min-h-[480px]">
        <aside className="w-full lg:w-64 shrink-0 border rounded-2xl p-3 bg-background">
          <p className="text-xs font-medium text-muted-foreground px-2 mb-2">Папки</p>
          <button
            type="button"
            onClick={() => uploadsId != null && setFolderId(uploadsId)}
            className={`w-full text-left rounded-lg px-2 py-2 text-sm mb-1 ${
              folderId === uploadsId ? 'bg-muted font-medium' : 'hover:bg-muted/80'
            }`}
          >
            Загрузки
          </button>
          <button
            type="button"
            onClick={() => trashId != null && setFolderId(trashId)}
            className={`w-full text-left rounded-lg px-2 py-2 text-sm mb-3 ${
              inTrash ? 'bg-destructive/15 text-destructive font-medium' : 'hover:bg-muted/80'
            }`}
          >
            Корзина
          </button>
          <FolderTree
            byParent={byParent}
            trashId={trashId}
            currentId={folderId}
            depth={0}
            parentKey="root"
            onSelect={(id) => setFolderId(id)}
          />
          {folderId != null && folderId !== trashId && folderId !== uploadsId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full mt-3 text-xs"
              onClick={() => deleteFolder(folderId)}
            >
              Удалить текущую папку
            </Button>
          ) : null}
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск в текущей папке…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 flex-1 min-w-[200px]">
              <Input
                placeholder="Новая вложенная папка"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <Button type="button" variant="outline" size="icon" onClick={createFolder} title="Создать папку">
                <FolderPlus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex bg-muted rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-background shadow-sm' : ''}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-background shadow-sm' : ''}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {inTrash ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!window.confirm('Удалить все файлы из корзины безвозвратно?')) return;
                  try {
                    const r = await apiPost<{ removed: number }>('/admin/media/trash/empty');
                    await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                    toast.success(`Корзина очищена (${r.removed} шт.)`);
                  } catch (e) {
                    const msg = e instanceof ApiError ? e.message : 'Ошибка';
                    setErr(msg);
                    toast.error(msg);
                  }
                }}
              >
                Очистить корзину
              </Button>
            </div>
          ) : null}

          <div className="flex-1 border rounded-2xl p-3 bg-background min-h-[320px] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Нет файлов</p>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filtered.map((m) => (
                  <div key={m.id} className="group relative bg-muted/30 border rounded-2xl overflow-hidden">
                    <div className="aspect-square bg-muted">
                      <img src={m.url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="p-2">
                      <p className="text-xs truncate">{m.originalFilename ?? m.id}</p>
                    </div>
                    {inTrash ? (
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          type="button"
                          className="p-1.5 rounded-lg bg-background/90 hover:text-primary"
                          title="Восстановить"
                          onClick={async () => {
                            await apiPost(`/admin/media/files/${m.id}/restore`);
                            await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                            toast.success('Файл восстановлен');
                          }}
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 rounded-lg bg-background/90 hover:text-destructive"
                          title="Удалить навсегда"
                          onClick={async () => {
                            if (!window.confirm('Удалить файл навсегда?')) return;
                            await apiDelete(`/admin/media/files/${m.id}`);
                            await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                            toast.success('Удалено навсегда');
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                        <button
                          type="button"
                          className="p-1.5 rounded-lg bg-background/90 opacity-0 group-hover:opacity-100 hover:text-destructive"
                          title="В корзину"
                          onClick={async () => {
                            await apiPost(`/admin/media/files/${m.id}/trash`);
                            await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                            toast.success('В корзине');
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {!inTrash ? (
                      <div className="p-2 pt-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <MediaFileMoveSelect
                          fileId={m.id}
                          options={moveFolderOptions}
                          onMoved={async () => {
                            await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                            toast.success('Файл перемещён');
                          }}
                          onError={(msg) => {
                            setErr(msg);
                            toast.error(msg);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y rounded-xl border overflow-hidden">
                {filtered.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                    <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                      <img src={m.url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{m.originalFilename ?? m.id}</p>
                      <p className="text-xs text-muted-foreground">ID {m.id}</p>
                    </div>
                    {inTrash ? (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await apiPost(`/admin/media/files/${m.id}/restore`);
                            await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                            toast.success('Файл восстановлен');
                          }}
                        >
                          Восстановить
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            if (!window.confirm('Удалить навсегда?')) return;
                            await apiDelete(`/admin/media/files/${m.id}`);
                            await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                            toast.success('Удалено навсегда');
                          }}
                        >
                          Удалить
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        <MediaFileMoveSelect
                          fileId={m.id}
                          options={moveFolderOptions}
                          onMoved={async () => {
                            await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                            toast.success('Файл перемещён');
                          }}
                          onError={(msg) => {
                            setErr(msg);
                            toast.error(msg);
                          }}
                          className="text-xs border rounded-md px-2 py-1.5 bg-background max-w-[200px]"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await apiPost(`/admin/media/files/${m.id}/trash`);
                            await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
                            toast.success('В корзине');
                          }}
                        >
                          В корзину
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
