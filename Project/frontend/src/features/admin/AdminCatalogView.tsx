import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Database, Loader2, RotateCcw, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PlatformCatalogKey } from '@livingplus/shared';
import api from '../../api/axios';
import { queryKeys } from '../../api/query-keys';
import { apiErrorMessage } from '../../utils/api-error';

export interface AdminCatalogSection {
  key: PlatformCatalogKey;
  description: string;
  data: unknown;
  updatedBy: string | null;
  updatedAt: string | null;
}

export default function AdminCatalogView() {
  const queryClient = useQueryClient();
  const { data: sections = [], isPending } = useQuery({
    queryKey: queryKeys.admin.catalog(),
    queryFn: async (): Promise<AdminCatalogSection[]> => (await api.get('/admin/catalog')).data
  });

  const [selectedKey, setSelectedKey] = useState<PlatformCatalogKey>('amenityCategories');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-navy-900" />
        Loading dynamic platform catalog from PostgreSQL…
      </div>
    );
  }

  const activeSection = sections.find((s) => s.key === selectedKey) ?? sections[0] ?? null;
  const formattedOriginal = activeSection ? JSON.stringify(activeSection.data, null, 2) : '';
  const currentDraft = activeSection ? (drafts[activeSection.key] ?? formattedOriginal) : '';
  const isDirty = activeSection ? currentDraft !== formattedOriginal : false;

  const handleSave = async () => {
    if (!activeSection) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(currentDraft);
    } catch {
      toast.error('Invalid JSON syntax — check brackets, quotes, and commas.');
      return;
    }

    setSavingKey(activeSection.key);
    try {
      await api.put(`/admin/catalog/${activeSection.key}`, { data: parsed });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[activeSection.key];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.catalog() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })
      ]);
      toast.success(`Saved "${activeSection.key}" to PostgreSQL — live across the site!`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save catalog section'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
              <Database className="h-3.5 w-3.5" /> Database-Driven Configuration
            </p>
            <h2 className="mt-1 text-lg font-bold text-navy-900">Dynamic Platform Catalog</h2>
            <p className="mt-1 text-sm text-muted">
              Manage amenities, room facilities, campuses &amp; tech parks, property/room types, price bands, VibeCheck questions, KYC types, slots, and assistant prompts directly in PostgreSQL without code deploys.
            </p>
          </div>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-navy-900">
            {sections.length} live sections
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Catalog sections" className="space-y-1 rounded-[var(--radius-card)] border border-hairline bg-canvas p-2.5">
          {sections.map((section) => {
            const active = activeSection?.key === section.key;
            const dirty = drafts[section.key] !== undefined && drafts[section.key] !== JSON.stringify(section.data, null, 2);
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setSelectedKey(section.key)}
                className={`flex w-full items-center justify-between rounded-[var(--radius-field)] px-3 py-2 text-left text-xs font-semibold transition-colors ${
                  active ? 'bg-navy-900 text-white' : 'text-ink hover:bg-surface'
                }`}
              >
                <span className="truncate font-mono">{section.key}</span>
                {dirty ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Unsaved edits" />
                ) : section.updatedAt ? (
                  <Check className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-amber-400' : 'text-positive'}`} />
                ) : null}
              </button>
            );
          })}
        </nav>

        {activeSection && (
          <section className="flex flex-col rounded-[var(--radius-card)] border border-hairline bg-canvas p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-4">
              <div>
                <h3 className="font-mono text-base font-bold text-navy-900">{activeSection.key}</h3>
                <p className="mt-0.5 text-xs text-muted">{activeSection.description}</p>
                {activeSection.updatedAt && (
                  <p className="mt-1 text-[11px] text-muted">
                    Last updated in DB: {new Date(activeSection.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isDirty && (
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((prev) => {
                        const next = { ...prev };
                        delete next[activeSection.key];
                        return next;
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-hairline"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </button>
                )}
                <button
                  type="button"
                  disabled={!isDirty || savingKey === activeSection.key}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-navy-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-navy-700 disabled:opacity-50"
                >
                  {savingKey === activeSection.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  Save to PostgreSQL
                </button>
              </div>
            </div>

            <label htmlFor="catalog-json-editor" className="sr-only">
              {activeSection.key} JSON payload
            </label>
            <textarea
              id="catalog-json-editor"
              rows={20}
              spellCheck={false}
              value={currentDraft}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [activeSection.key]: e.target.value }))}
              className="mt-4 w-full flex-1 resize-y rounded-[var(--radius-field)] border border-field-border bg-surface p-3.5 font-mono text-xs leading-relaxed text-ink outline-none focus:border-navy-900 focus:bg-white"
            />
          </section>
        )}
      </div>
    </div>
  );
}
