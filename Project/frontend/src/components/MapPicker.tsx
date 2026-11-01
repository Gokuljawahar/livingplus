import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Loader2, Crosshair, Search } from 'lucide-react';

declare global {
  interface Window {
    google: any;
  }
}

const cleanAddress = (addr: string) => {
  // Removes Plus Codes like "PP58+6VH, " or "9C3X+FX3 " from the start of the address
  return addr.replace(/^[a-zA-Z0-9]{2,8}\+[a-zA-Z0-9]{2,5}[,\s]+/, '').trim();
};

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

const loadGoogleMapsApi = (apiKey: string) => {
  return new Promise<void>((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }
    
    const existingScript = document.getElementById('google-maps-api');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Maps API')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-api';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps API'));
    document.head.appendChild(script);
  });
};

const extractAddressComponents = (components: any[]) => {
  let pincode = '';
  let city = '';
  let state = '';
  let country = '';

  for (const c of components || []) {
    const types = c.types || [];
    if (types.includes('postal_code')) pincode = c.long_name;
    else if (types.includes('locality')) city = c.long_name;
    else if (types.includes('administrative_area_level_2') && !city) city = c.long_name;
    else if (types.includes('administrative_area_level_1')) state = c.long_name;
    else if (types.includes('country')) country = c.long_name;
  }
  return { pincode, city, state, country };
};

export const MapPicker: React.FC<MapPickerProps> = ({
  apiKey,
  onAddressChange,
  onLocationSelect,
  defaultAddress,
  initialCoordinates
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [map, setMap] = useState<any | null>(null);
  const [geocoder, setGeocoder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [addressLoading, setAddressLoading] = useState(false);
  const [currentAddress, setCurrentAddress] = useState(defaultAddress || '');

  const onAddressChangeRef = useRef(onAddressChange);
  const onLocationSelectRef = useRef(onLocationSelect);
  
  useEffect(() => {
    onAddressChangeRef.current = onAddressChange;
  }, [onAddressChange]);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    if (defaultAddress && !currentAddress) {
      setCurrentAddress(defaultAddress);
    }
  }, [defaultAddress]);

  const reverseGeocode = useCallback(
    (latLng: any, geo: any) => {
      setAddressLoading(true);
      geo.geocode({ location: latLng }, (results: any, status: any) => {
        setAddressLoading(false);
        const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
        const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;

        if (status === 'OK' && results && results[0]) {
          const rawAddr = results[0].formatted_address;
          const addr = cleanAddress(rawAddr);
          setCurrentAddress(addr);
          
          if (onAddressChangeRef.current) {
            onAddressChangeRef.current(addr);
          }

          if (onLocationSelectRef.current) {
            const comps = extractAddressComponents(results[0].address_components);
            onLocationSelectRef.current({
              address: addr,
              lat,
              lng,
              ...comps
            });
          }
        } else {
          console.error('Geocoder failed due to: ' + status);
          if (onLocationSelectRef.current) {
            onLocationSelectRef.current({
              address: currentAddress || '',
              lat,
              lng
            });
          }
        }
      });
    },
    [currentAddress]
  );

  const mapInitialized = useRef(false);

  useEffect(() => {
    let isMounted = true;
    if (mapInitialized.current) return;
    
    loadGoogleMapsApi(apiKey)
      .then(() => {
        if (!isMounted || !mapRef.current || mapInitialized.current) return;
        mapInitialized.current = true;
        
        // Priority: initial coordinates -> geolocation -> default India center
        const defaultCenter = initialCoordinates && initialCoordinates.lat && initialCoordinates.lng
          ? { lat: initialCoordinates.lat, lng: initialCoordinates.lng }
          : { lat: 20.5937, lng: 78.9629 };
        
        const mapInstance = new window.google.maps.Map(mapRef.current, {
          center: defaultCenter,
          zoom: initialCoordinates?.lat ? 16 : 14,
          disableDefaultUI: true,
          zoomControl: true,
        });

        const geo = new window.google.maps.Geocoder();
        setMap(mapInstance);
        setGeocoder(geo);
        setLoading(false);

        if (searchInputRef.current) {
          const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
            fields: ['geometry', 'formatted_address', 'name', 'address_components'],
          });
          
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
              mapInstance.setCenter(place.geometry.location);
              mapInstance.setZoom(17);
              const rawAddr = place.formatted_address || place.name;
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              
              if (rawAddr) {
                const addr = cleanAddress(rawAddr);
                setCurrentAddress(addr);
                if (onAddressChangeRef.current) {
                  onAddressChangeRef.current(addr);
                }
                if (onLocationSelectRef.current) {
                  const comps = extractAddressComponents(place.address_components);
                  onLocationSelectRef.current({
                    address: addr,
                    lat,
                    lng,
                    ...comps
                  });
                }
              }
            }
          });
        }

        if (initialCoordinates?.lat && initialCoordinates?.lng) {
          reverseGeocode(new window.google.maps.LatLng(initialCoordinates.lat, initialCoordinates.lng), geo);
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              };
              mapInstance.setCenter(pos);
              reverseGeocode(new window.google.maps.LatLng(pos.lat, pos.lng), geo);
            },
            () => {
              reverseGeocode(new window.google.maps.LatLng(defaultCenter.lat, defaultCenter.lng), geo);
            }
          );
        } else {
          reverseGeocode(new window.google.maps.LatLng(defaultCenter.lat, defaultCenter.lng), geo);
        }

        // Listen for dragend to update address
        mapInstance.addListener('dragend', () => {
          const center = mapInstance.getCenter();
          if (center) {
            reverseGeocode(center, geo);
          }
        });

      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });

      return () => {
        isMounted = false;
      };
  }, [apiKey]); // Run only once when apiKey is set

  const handleLocateMe = () => {
    if (navigator.geolocation && map && geocoder) {
      setAddressLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          map.panTo(pos);
          reverseGeocode(new window.google.maps.LatLng(pos.lat, pos.lng), geocoder);
        },
        () => {
          setAddressLoading(false);
          alert('Could not get your location. Please enable location services.');
        }
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full h-[300px] rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-[#02224B] z-10">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : null}
        
        {/* Search Bar Overlay */}
        <div className="absolute top-3 left-3 right-14 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search for an area or address..."
              className="w-full bg-white rounded-lg py-2.5 pl-9 pr-4 text-sm shadow-md border-none focus:ring-2 focus:ring-[#02224B] outline-none"
            />
          </div>
        </div>
        
        <div ref={mapRef} className="w-full h-full" />
        
        {/* Center Marker Overlay */}
        {!loading && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center pb-8">
            <MapPin className="w-8 h-8 text-[#02224B] drop-shadow-md" fill="#02224B" />
          </div>
        )}

        {/* Locate Me Button */}
        {!loading && (
          <button
            type="button"
            onClick={handleLocateMe}
            className="absolute bottom-4 right-4 bg-white p-2 rounded-full shadow-md border border-slate-100 text-slate-700 hover:text-[#02224B] transition-colors z-10"
            title="Locate Me"
          >
            <Crosshair className="w-5 h-5" />
          </button>
        )}
      </div>
      
      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Selected Address</p>
        <div className="flex items-center gap-2">
          {addressLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#02224B]" />
          ) : (
            <MapPin className="w-4 h-4 text-[#02224B] shrink-0" />
          )}
          <p className="text-sm text-slate-800 line-clamp-2">
            {currentAddress || 'Move the map to select an address...'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MapPicker;
