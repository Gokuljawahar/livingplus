import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const maps = vi.hoisted(() => {
  const map = { setCenter: vi.fn(), setZoom: vi.fn(), panTo: vi.fn(), getCenter: vi.fn() };
  const geocode = vi.fn();
  const fetchAutocompleteSuggestions = vi.fn();
  return { map, geocode, fetchAutocompleteSuggestions };
});

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children: React.ReactNode }) => children,
  Map: () => <div data-testid="map" />,
  useMap: () => maps.map,
  useMapsLibrary: (name: string) => (name === 'geocoding'
    ? { Geocoder: class { geocode = maps.geocode; } }
    : { AutocompleteSessionToken: class {}, AutocompleteSuggestion: { fetchAutocompleteSuggestions: maps.fetchAutocompleteSuggestions } })
}));

import { MapPicker } from './MapPicker';

beforeEach(() => {
  vi.clearAllMocks();
  maps.geocode.mockResolvedValue({
    results: [{ formatted_address: 'PP58+6VH, OMR, Sholinganallur, Chennai', address_components: [{ types: ['locality'], long_name: 'Chennai' }] }]
  });
});

describe('MapPicker', () => {
  it('reverse-geocodes saved coordinates on load', async () => {
    const onAddressChange = vi.fn();
    render(<MapPicker apiKey="test" onAddressChange={onAddressChange} initialCoordinates={{ lat: 12.9, lng: 80.2 }} />);
    await waitFor(() => expect(onAddressChange).toHaveBeenCalledWith('OMR, Sholinganallur, Chennai'));
    expect(maps.geocode).toHaveBeenCalledWith({ location: { lat: 12.9, lng: 80.2 } });
    expect(screen.getByText('OMR, Sholinganallur, Chennai')).toBeInTheDocument();
  });

  it('searches places and publishes the chosen location', async () => {
    const user = userEvent.setup();
    const onAddressChange = vi.fn();
    const onLocationSelect = vi.fn();
    maps.fetchAutocompleteSuggestions.mockResolvedValue({
      suggestions: [{
        placePrediction: {
          placeId: 'p1',
          text: { toString: () => 'Tidel Park, Chennai' },
          toPlace: () => ({
            fetchFields: async () => undefined,
            location: { lat: () => 12.99, lng: () => 80.25 },
            formattedAddress: 'Tidel Park, Taramani, Chennai',
            addressComponents: [{ types: ['locality'], longText: 'Chennai' }, { types: ['postal_code'], longText: '600113' }]
          })
        }
      }]
    });
    render(<MapPicker apiKey="test" onAddressChange={onAddressChange} onLocationSelect={onLocationSelect} initialCoordinates={{ lat: 12.9, lng: 80.2 }} />);

    await user.type(screen.getByLabelText('Search for an area or address'), 'Tidel');
    await user.click(await screen.findByRole('option', { name: 'Tidel Park, Chennai' }));

    await waitFor(() => expect(onAddressChange).toHaveBeenLastCalledWith('Tidel Park, Taramani, Chennai'));
    expect(maps.fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({ input: 'Tidel', includedRegionCodes: ['in'] }));
    expect(maps.map.setCenter).toHaveBeenLastCalledWith(expect.objectContaining({ lat: expect.any(Function) }));
    expect(onLocationSelect).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 12.99, lng: 80.25, city: 'Chennai', pincode: '600113' }));
  });
});
