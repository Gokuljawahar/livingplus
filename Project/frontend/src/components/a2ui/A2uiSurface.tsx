// A2UI v1.0 renderer (https://a2ui.org): renders the declarative surfaces
// the agent sends — an adjacency-list component tree plus a data model —
// with native app components. No HTML or code arrives over the wire; unknown
// components render nothing, so older clients degrade to the text reply.
//
// Supported catalog subset (what the backend emits): Column, Row, Card,
// Text, Divider, Button. Values may be literals or {"@path": "/json/pointer"}
// bindings into the surface data model, including inside action contexts.
import { resolveValue } from './resolve';

export interface A2uiComponent {
  id: string;
  component: string;
  children?: string[];
  child?: string;
  text?: unknown;
  variant?: string;
  action?: { event?: { name?: string; context?: Record<string, unknown> } };
  [key: string]: unknown;
}

export interface A2uiMessage {
  version?: string;
  createSurface?: {
    surfaceId: string;
    catalogId?: string;
    components: A2uiComponent[];
    dataModel: Record<string, unknown>;
  };
}

export interface A2uiAction {
  name: string;
  context: Record<string, unknown>;
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

interface NodeProps {
  id: string;
  byId: Map<string, A2uiComponent>;
  model: Record<string, unknown>;
  onAction: (action: A2uiAction) => void;
}

function A2uiNode({ id, byId, model, onAction }: NodeProps) {
  const node = byId.get(id);
  if (!node) return null;
  const renderChildren = (ids: string[]) => ids.map((childId) => <A2uiNode key={childId} id={childId} byId={byId} model={model} onAction={onAction} />);

  switch (node.component) {
    case 'Column':
      return <div className="flex flex-col gap-2">{renderChildren(node.children ?? [])}</div>;
    case 'Row':
      return <div className="flex flex-wrap items-center gap-2">{renderChildren(node.children ?? [])}</div>;
    case 'Card':
      return (
        <div className="rounded-card border border-hairline bg-white p-3">
          {node.child ? <A2uiNode id={node.child} byId={byId} model={model} onAction={onAction} /> : renderChildren(node.children ?? [])}
        </div>
      );
    case 'Divider':
      return <hr className="border-hairline" />;
    case 'Text': {
      const text = textOf(resolveValue(node.text, model));
      if (!text) return null;
      if (node.variant === 'heading') return <p className="text-sm font-bold text-navy-900">{text}</p>;
      if (node.variant === 'caption') return <p className="text-xs font-medium text-muted">{text}</p>;
      return <p className="leading-relaxed text-ink">{text}</p>;
    }
    case 'Button': {
      const event = node.action?.event;
      const context = (resolveValue(event?.context ?? {}, model) as Record<string, unknown>) ?? {};
      const label = node.child ? <A2uiNode id={node.child} byId={byId} model={model} onAction={onAction} /> : 'Continue';
      if (node.variant === 'text') {
        return (
          <button
            type="button"
            onClick={() => event?.name && onAction({ name: event.name, context })}
            className="inline-flex min-h-[44px] items-center px-3 text-xs font-semibold text-navy-700 underline-offset-2 hover:underline"
          >
            {label}
          </button>
        );
      }
      return (
        <button
          type="button"
          onClick={() => event?.name && onAction({ name: event.name, context })}
          className={node.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}
        >
          {label}
        </button>
      );
    }
    default:
      return null;
  }
}

/** Renders every createSurface message in a chat reply. */
export default function A2uiSurface({ messages, onAction }: { messages: A2uiMessage[]; onAction: (action: A2uiAction) => void }) {
  const surfaces = messages.filter((message) => message.createSurface);
  if (!surfaces.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {surfaces.map((message) => {
        const surface = message.createSurface!;
        const byId = new Map(surface.components.map((component) => [component.id, component]));
        return <A2uiNode key={surface.surfaceId} id="root" byId={byId} model={surface.dataModel ?? {}} onAction={onAction} />;
      })}
    </div>
  );
}
