// Address helpers for the map picker, independent of the Maps SDK version.

/** Removes a leading Plus Code such as "PP58+6VH, " from a formatted address. */
export function cleanAddress(address: string): string {
  return address.replace(/^[a-zA-Z0-9]{2,8}\+[a-zA-Z0-9]{2,5}[,\s]+/, '').trim();
}

/** Address component from either the Geocoder (long_name) or Places API (New) (longText). */
export interface AddressComponentLike {
  types?: string[];
  long_name?: string;
  longText?: string | null;
}

export function extractAddressComponents(components: AddressComponentLike[] | null | undefined) {
  let pincode = '';
  let city = '';
  let state = '';
  let country = '';
  for (const component of components || []) {
    const types = component.types || [];
    const name = component.long_name ?? component.longText ?? '';
    if (types.includes('postal_code')) pincode = name;
    else if (types.includes('locality')) city = name;
    else if (types.includes('administrative_area_level_2') && !city) city = name;
    else if (types.includes('administrative_area_level_1')) state = name;
    else if (types.includes('country')) country = name;
  }
  return { pincode, city, state, country };
}
