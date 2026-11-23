// A2UI surfaces for chat turns (A2UI v1.0, https://a2ui.org): the agent
// sends declarative UI — a createSurface message with an adjacency-list
// component tree plus a data model — and the client renders it natively.
// No HTML or code crosses the wire; the reply text stays as the fallback.
//
// Two surfaces today: property search results (cards clients can act on)
// and the confirmation prompt for sensitive tools (confirm/cancel buttons).
// Button actions come back as renderer-to-agent events over the chat POST.
import { randomBytes } from 'crypto';

export interface A2uiComponent {
  id: string;
  component: string;
  [key: string]: unknown;
}

export interface A2uiMessage {
  version: '1.0';
  createSurface: {
    surfaceId: string;
    catalogId: string;
    components: A2uiComponent[];
    dataModel: Record<string, unknown>;
  };
}

const CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
const MAX_PROPERTY_CARDS = 5;

const surfaceId = (kind: string) => `chat-${kind}-${randomBytes(4).toString('hex')}`;

interface PropertyCardData {
  property_id: string;
  name: string;
  place: string;
  meta: string;
}

function propertyCardData(result: unknown): PropertyCardData[] {
  if (!Array.isArray(result)) return [];
  const cards: PropertyCardData[] = [];
  for (const item of result.slice(0, MAX_PROPERTY_CARDS)) {
    if (!item || typeof item !== 'object') continue;
    const property = item as Record<string, any>;
    if (!property.property_id || !property.name) continue;
    const rooms = Array.isArray(property.rooms) ? property.rooms : [];
    const beds = rooms.reduce((sum: number, room: any) => sum + (Array.isArray(room?.available_beds) ? room.available_beds.length : 0), 0);
    const meta = [
      property.starting_rent ? `From ₹${property.starting_rent}/month` : '',
      beds ? `${beds} bed${beds === 1 ? '' : 's'} available` : 'No beds free right now',
      typeof property.match_score === 'number' ? `${Math.round(property.match_score * 100)}% match` : ''
    ].filter(Boolean).join(' · ');
    cards.push({
      property_id: String(property.property_id),
      name: String(property.name),
      place: [property.locality, property.city].filter(Boolean).join(', '),
      meta
    });
  }
  return cards;
}

/** Property results as selectable cards; the book button reports back as an agent event. */
export function propertyResultsSurface(result: unknown): A2uiMessage[] {
  const properties = propertyCardData(result);
  if (!properties.length) return [];
  const components: A2uiComponent[] = [
    { id: 'root', component: 'Column', children: ['title', ...properties.map((_, i) => `card_${i}`)] },
    { id: 'title', component: 'Text', text: { '@path': '/title' }, variant: 'caption' }
  ];
  properties.forEach((_, i) => {
    components.push(
      { id: `card_${i}`, component: 'Card', child: `card_${i}_body` },
      { id: `card_${i}_body`, component: 'Column', children: [`card_${i}_name`, `card_${i}_place`, `card_${i}_meta`, `card_${i}_book`] },
      { id: `card_${i}_name`, component: 'Text', text: { '@path': `/properties/${i}/name` }, variant: 'heading' },
      { id: `card_${i}_place`, component: 'Text', text: { '@path': `/properties/${i}/place` } },
      { id: `card_${i}_meta`, component: 'Text', text: { '@path': `/properties/${i}/meta` }, variant: 'caption' },
      { id: `card_${i}_book_label`, component: 'Text', text: 'Ask to book' },
      {
        id: `card_${i}_book`, component: 'Button', child: `card_${i}_book_label`, variant: 'secondary',
        action: { event: { name: 'book_property', context: { propertyId: { '@path': `/properties/${i}/property_id` }, name: { '@path': `/properties/${i}/name` } } } }
      }
    );
  });
  return [{
    version: '1.0',
    createSurface: {
      surfaceId: surfaceId('properties'),
      catalogId: CATALOG_ID,
      components,
      dataModel: { title: `${properties.length} place${properties.length === 1 ? '' : 's'} found`, properties }
    }
  }];
}

/** The confirmation prompt as a card whose buttons resolve the paused tool. */
export function confirmationSurface(confirmationId: string, preview: string): A2uiMessage[] {
  const components: A2uiComponent[] = [
    { id: 'root', component: 'Card', child: 'body' },
    { id: 'body', component: 'Column', children: ['preview', 'actions'] },
    { id: 'preview', component: 'Text', text: { '@path': '/preview' } },
    { id: 'actions', component: 'Row', children: ['confirm', 'cancel'] },
    { id: 'confirm_label', component: 'Text', text: 'Confirm' },
    { id: 'confirm', component: 'Button', child: 'confirm_label', variant: 'primary', action: { event: { name: 'confirm_action', context: { confirmationId } } } },
    { id: 'cancel_label', component: 'Text', text: 'Cancel' },
    { id: 'cancel', component: 'Button', child: 'cancel_label', variant: 'text', action: { event: { name: 'cancel_action', context: { confirmationId } } } }
  ];
  return [{
    version: '1.0',
    createSurface: { surfaceId: surfaceId('confirm'), catalogId: CATALOG_ID, components, dataModel: { preview } }
  }];
}

/** Surfaces for one chat turn, from the tools that ran (in execution order). */
export function surfacesForOutcomes(outcomes: Array<{ tool: string; result: unknown }>): A2uiMessage[] {
  const surfaces: A2uiMessage[] = [];
  for (const outcome of outcomes) {
    if (outcome.tool === 'search_properties') surfaces.push(...propertyResultsSurface(outcome.result));
  }
  return surfaces;
}
