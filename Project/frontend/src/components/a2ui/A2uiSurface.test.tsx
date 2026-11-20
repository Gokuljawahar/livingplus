import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import A2uiSurface, { type A2uiMessage } from './A2uiSurface';
import { resolvePath } from './resolve';

const surface: A2uiMessage = {
  version: '1.0',
  createSurface: {
    surfaceId: 'chat-properties-test',
    catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
    components: [
      { id: 'root', component: 'Column', children: ['title', 'card_0'] },
      { id: 'title', component: 'Text', text: { '@path': '/title' }, variant: 'caption' },
      { id: 'card_0', component: 'Card', child: 'body' },
      { id: 'body', component: 'Column', children: ['name', 'meta', 'book'] },
      { id: 'name', component: 'Text', text: { '@path': '/properties/0/name' }, variant: 'heading' },
      { id: 'meta', component: 'Text', text: { '@path': '/properties/0/meta' }, variant: 'caption' },
      { id: 'book_label', component: 'Text', text: 'Ask to book' },
      {
        id: 'book', component: 'Button', child: 'book_label', variant: 'secondary',
        action: { event: { name: 'book_property', context: { propertyId: { '@path': '/properties/0/property_id' }, name: { '@path': '/properties/0/name' } } } }
      },
      { id: 'mystery', component: 'Hologram', text: 'should not render' }
    ],
    dataModel: {
      title: '1 place found',
      properties: [{ property_id: 'pg-1', name: 'Spec House', meta: 'From ₹8000/month · 3 beds available' }]
    }
  }
};

describe('A2uiSurface', () => {
  it('resolves JSON Pointer bindings against the data model', () => {
    const model = { properties: [{ name: 'Spec House' }] };
    expect(resolvePath(model, '/properties/0/name')).toBe('Spec House');
    expect(resolvePath(model, '/missing')).toBeUndefined();
  });

  it('renders bound text and cards from the surface', () => {
    render(<A2uiSurface messages={[surface]} onAction={vi.fn()} />);
    expect(screen.getByText('1 place found')).toBeInTheDocument();
    expect(screen.getByText('Spec House')).toBeInTheDocument();
    expect(screen.getByText(/3 beds available/)).toBeInTheDocument();
    expect(screen.queryByText('should not render')).not.toBeInTheDocument();
  });

  it('reports button actions with resolved context', async () => {
    const onAction = vi.fn();
    render(<A2uiSurface messages={[surface]} onAction={onAction} />);
    const button = screen.getByRole('button', { name: 'Ask to book' });
    expect(button).toHaveClass('btn-secondary');
    await userEvent.click(button);
    expect(onAction).toHaveBeenCalledWith({ name: 'book_property', context: { propertyId: 'pg-1', name: 'Spec House' } });
  });

  it('renders nothing for replies without surfaces', () => {
    const { container } = render(<A2uiSurface messages={[]} onAction={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
