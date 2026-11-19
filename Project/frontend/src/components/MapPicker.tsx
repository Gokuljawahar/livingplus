/// <reference types="google.maps" />
// Location picker on Google Maps (@vis.gl/react-google-maps): drag the map to
// choose a spot, search places, or use the device location. The address is
// reverse-geocoded from the map centre.
//
// Search uses Places API (New) AutocompleteSuggestion: the legacy
// places.Autocomplete widget is not available to Google Cloud projects
// created after March 2025. Enable "Places API (New)" and "Geocoding API"
// for the key in VITE_GOOGLE_MAPS_API_KEY.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Loader2, Crosshair, Search } from 'lucide-react';
import { cleanAddress, extractAddressComponents } from '../utils/address';

export interface LocationDetails {
  address: string;
  lat: number;
  lng: number;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface MapPickerProps {
  apiKey: string;
  onAddressChange: (address: string) => void;
  onLocationSelect?: (details: LocationDetails) => void;
  defaultAddress?: string;
  initialCoordinates?: { lat: number; lng: number } | null;
}

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

export const MapPicker: React.FC<MapPickerProps> = ({ apiKey, ...props }) => (
  <APIProvider apiKey={apiKey} libraries={['places', 'geocoding']}>
    <MapPickerView {...props} />
  </APIProvider>
);

function MapPickerView({ onAddressChange, onLocationSelect, defaultAddress, initialCoordinates }: Omit<MapPickerProps, 'apiKey'>) {
  const map = useMap();
  const geocodingLibrary = useMapsLibrary('geocoding');
  const placesLibrary = useMapsLibrary('places');
  const geocoder = useMemo(() => (geocodingLibrary ? new geocodingLibrary.Geocoder() : null), [geocodingLibrary]);

  const [addressLoading, setAddressLoading] = useState(false);
  const [currentAddress, setCurrentAddress] = useState(defaultAddress || '');
  const [prevDefaultAddress, setPrevDefaultAddress] = useState(defaultAddress);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Adopt a default address that arrives after mount, unless one is already shown.
  if (defaultAddress !== prevDefaultAddress) {
    setPrevDefaultAddress(defaultAddress);
    if (defaultAddress && !currentAddress) setCurrentAddress(defaultAddress);
  }

  // Latest callbacks/values for listeners that are registered once.
  const onAddressChangeRef = useRef(onAddressChange);
  const onLocationSelectRef = useRef(onLocationSelect);
  const currentAddressRef = useRef(currentAddress);
  const initialCoordinatesRef = useRef(initialCoordinates);
  useEffect(() => { onAddressChangeRef.current = onAddressChange; }, [onAddressChange]);
  useEffect(() => { onLocationSelectRef.current = onLocationSelect; }, [onLocationSelect]);
  useEffect(() => { currentAddressRef.current = currentAddress; }, [currentAddress]);
  useEffect(() => { initialCoordinatesRef.current = initialCoordinates; }, [initialCoordinates]);

  const publish = useCallback((address: string, lat: number, lng: number, components?: Parameters<typeof extractAddressComponents>[0]) => {
    setCurrentAddress(address);
    onAddressChangeRef.current?.(address);
    onLocationSelectRef.current?.({ address, lat, lng, ...(components ? extractAddressComponents(components) : {}) });
  }, []);

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    if (!geocoder) return;
    setAddressLoading(true);
    geocoder.geocode({ location: { lat, lng } })
      .then(({ results }) => {
        const best = results[0];
        if (best) publish(cleanAddress(best.formatted_address), lat, lng, best.address_components);
        else onLocationSelectRef.current?.({ address: currentAddressRef.current || '', lat, lng });
      })
      .catch((error) => {
        console.error('Geocoder failed:', error);
        onLocationSelectRef.current?.({ address: currentAddressRef.current || '', lat, lng });
      })
      .finally(() => setAddressLoading(false));
  }, [geocoder, publish]);

  // First position: saved coordinates, else the device location, else India.
  const initialized = useRef(false);
  useEffect(() => {
    if (!map || !geocoder || initialized.current) return;
    initialized.current = true;
    const saved = initialCoordinatesRef.current;
    if (saved?.lat && saved?.lng) {
      map.setCenter(saved);
      map.setZoom(16);
      reverseGeocode(saved.lat, saved.lng);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          map.setCenter({ lat: coords.latitude, lng: coords.longitude });
          reverseGeocode(coords.latitude, coords.longitude);
        },
        () => reverseGeocode(INDIA_CENTER.lat, INDIA_CENTER.lng)
      );
    } else {
      reverseGeocode(INDIA_CENTER.lat, INDIA_CENTER.lng);
    }
  }, [map, geocoder, reverseGeocode]);

  // Place suggestions while typing (debounced; one session per search).
  useEffect(() => {
    const input = query.trim();
    if (!placesLibrary || input.length < 3) {
      const reset = window.setTimeout(() => setSuggestions([]), 0);
      return () => window.clearTimeout(reset);
    }
    let live = true;
    const timer = window.setTimeout(() => {
      sessionToken.current ??= new placesLibrary.AutocompleteSessionToken();
      placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: sessionToken.current, includedRegionCodes: ['in'] })
        .then(({ suggestions: found }) => { if (live) setSuggestions(found.filter((s) => s.placePrediction)); })
        .catch(() => { if (live) setSuggestions([]); });
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, placesLibrary]);

  const choose = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    const prediction = suggestion.placePrediction;
    if (!prediction || !map) return;
    setSuggestions([]);
    setQuery(prediction.text.toString());
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName', 'addressComponents'] });
    sessionToken.current = null;
    if (!place.location) return;
    map.setCenter(place.location);
    map.setZoom(17);
    const address = cleanAddress(place.formattedAddress || place.displayName || '');
    if (address) publish(address, place.location.lat(), place.location.lng(), place.addressComponents);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation || !map) return;
    setAddressLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.panTo({ lat: coords.latitude, lng: coords.longitude });
        reverseGeocode(coords.latitude, coords.longitude);
      },
      () => {
        setAddressLoading(false);
        alert('Could not get your location. Please enable location services.');
      }
    );
  };

  const loading = !map;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full h-[300px] rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-navy-900 z-10">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : null}

        {/* Search Bar Overlay */}
        <div className="absolute top-3 left-3 right-14 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for an area or address..."
              aria-label="Search for an area or address"
              className="w-full bg-white rounded-lg py-2.5 pl-9 pr-4 text-sm shadow-md border-none focus:ring-2 focus:ring-navy-900 outline-none"
            />
            {suggestions.length > 0 && (
              <ul role="listbox" className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg bg-white text-sm shadow-lg">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.placePrediction!.placeId}>
                    <button type="button" role="option" aria-selected={false} onClick={() => void choose(suggestion)} className="w-full px-3 py-2 text-left hover:bg-slate-100">
                      {suggestion.placePrediction!.text.toString()}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <Map
          className="w-full h-full"
          defaultCenter={initialCoordinates?.lat && initialCoordinates?.lng ? initialCoordinates : INDIA_CENTER}
          defaultZoom={initialCoordinates?.lat ? 16 : 14}
          disableDefaultUI
          zoomControl
          gestureHandling="greedy"
          onDragend={(event) => {
            const center = event.map.getCenter();
            if (center) reverseGeocode(center.lat(), center.lng());
          }}
        />

        {/* Center Marker Overlay */}
        {!loading && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center pb-8">
            <MapPin className="w-8 h-8 text-navy-900 drop-shadow-md" fill="#02224B" />
          </div>
        )}

        {/* Locate Me Button */}
        {!loading && (
          <button
            type="button"
            onClick={handleLocateMe}
            className="absolute bottom-4 right-4 bg-white p-2 rounded-full shadow-md border border-slate-100 text-slate-700 hover:text-navy-900 transition-colors z-10"
            title="Locate Me"
          >
            <Crosshair className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
        <p className="text-xs text-slate-500 font-medium mb-1">Selected Address</p>
        <div className="flex items-center gap-2">
          {addressLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-navy-900" />
          ) : (
            <MapPin className="w-4 h-4 text-navy-900 shrink-0" />
          )}
          <p className="text-sm text-slate-800 line-clamp-2">
            {currentAddress || 'Move the map to select an address...'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default MapPicker;
