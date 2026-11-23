import { X } from 'lucide-react';
import { GENDER_LABELS, PRICE_BANDS, ROOM_TYPES } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  filteredCount: number;
  activeFilterCount: number;
  onClearFilters: () => void;
  gender: string;
  setGender: (value: string) => void;
  minRent: string;
  setMinRent: (value: string) => void;
  maxRent: string;
  setMaxRent: (value: string) => void;
  roomTypes: string[];
  setRoomTypes: (next: string[]) => void;
  acOnly: boolean;
  setAcOnly: (value: boolean) => void;
  foodOnly: boolean;
  setFoodOnly: (value: boolean) => void;
  amenities: string[];
  setAmenities: (next: string[]) => void;
  amenityCounts: [string, number][];
}

const toggleInList = (list: string[], value: string, set: (next: string[]) => void) => {
  set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
};

export default function FilterSheet({
  open,
  onClose,
  filteredCount,
  activeFilterCount,
  onClearFilters,
  gender,
  setGender,
  minRent,
  setMinRent,
  maxRent,
  setMaxRent,
  roomTypes,
  setRoomTypes,
  acOnly,
  setAcOnly,
  foodOnly,
  setFoodOnly,
  amenities,
  setAmenities,
  amenityCounts
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[var(--radius-card)] bg-canvas p-5 shadow-[var(--shadow-float)] sm:rounded-[var(--radius-card)]"
      >
        <div className="flex items-center justify-between">
          <h2 id="filters-title" className="text-xl font-semibold text-ink">Filters</h2>
          <button onClick={onClose} aria-label="Close filters" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-2 space-y-6">
          {activeFilterCount > 0 && (
            <button onClick={onClearFilters} className="text-sm font-semibold text-navy-700 underline-offset-2 hover:underline">
              Clear all filters
            </button>
          )}

          <section>
            <h3 className="text-xs font-bold text-muted">Resident policy</h3>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              {['', 'WOMEN', 'MEN', 'ANY'].map((value) => {
                const isChecked = gender === value;
                return (
                  <label
                    key={value || 'all'}
                    className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-button)] border px-3 py-2 text-xs font-semibold transition-all ${
                      isChecked
                        ? 'border-navy-900 bg-navy-900 text-white'
                        : 'border-hairline bg-surface text-ink hover:border-field-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="gender"
                      checked={isChecked}
                      onChange={() => setGender(value)}
                      className="sr-only"
                    />
                    {value === '' ? 'All PGs' : GENDER_LABELS[value]}
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-muted">Monthly budget</h3>
            <div className="mt-2.5 space-y-1.5">
              {PRICE_BANDS.map((band) => {
                const active = minRent === band.min && maxRent === band.max;
                return (
                  <label
                    key={band.label}
                    className={`flex cursor-pointer items-center justify-between rounded-[var(--radius-button)] border px-3 py-2 text-xs font-medium transition-all ${
                      active
                        ? 'border-amber-500 bg-amber-50 font-semibold text-ink'
                        : 'border-hairline bg-canvas text-ink hover:bg-surface'
                    }`}
                  >
                    <span>{band.label}</span>
                    <input
                      type="radio"
                      name="price-band"
                      checked={active}
                      onChange={() => {
                        setMinRent(band.min);
                        setMaxRent(band.max);
                      }}
                      className="h-3.5 w-3.5 accent-navy-900"
                    />
                  </label>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">₹</span>
                <input
                  aria-label="Minimum rent"
                  type="number"
                  min="0"
                  value={minRent}
                  onChange={(event) => setMinRent(event.target.value)}
                  placeholder="Min"
                  className="w-full rounded-[var(--radius-field)] border border-hairline bg-surface py-1.5 pl-6 pr-2 text-xs font-medium outline-none transition-all focus:border-navy-900 focus:bg-canvas"
                />
              </div>
              <span className="text-xs font-bold text-muted">–</span>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">₹</span>
                <input
                  aria-label="Maximum rent"
                  type="number"
                  min="0"
                  value={maxRent}
                  onChange={(event) => setMaxRent(event.target.value)}
                  placeholder="Max"
                  className="w-full rounded-[var(--radius-field)] border border-hairline bg-surface py-1.5 pl-6 pr-2 text-xs font-medium outline-none transition-all focus:border-navy-900 focus:bg-canvas"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-muted">Room sharing</h3>
            <div className="mt-2.5 space-y-1.5">
              {ROOM_TYPES.map((type) => {
                const isChecked = roomTypes.includes(type.value);
                return (
                  <label
                    key={type.value}
                    className={`flex cursor-pointer items-center justify-between rounded-[var(--radius-button)] border px-3 py-2 text-xs font-medium transition-all ${
                      isChecked
                        ? 'border-navy-900 bg-navy-900/5 font-semibold text-navy-900'
                        : 'border-hairline bg-canvas text-ink hover:bg-surface'
                    }`}
                  >
                    <span>{type.label}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleInList(roomTypes, type.value, setRoomTypes)}
                      className="h-3.5 w-3.5 rounded accent-navy-900"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-muted">Amenities & inclusions</h3>
            <div className="mt-2.5 space-y-2">
              <label className="flex cursor-pointer items-center justify-between rounded-[var(--radius-button)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink transition-all hover:bg-surface">
                <span>Air Conditioning (AC)</span>
                <input
                  type="checkbox"
                  checked={acOnly}
                  onChange={(event) => setAcOnly(event.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-navy-900"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-[var(--radius-button)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink transition-all hover:bg-surface">
                <span>Home-Style Food Included</span>
                <input
                  type="checkbox"
                  checked={foodOnly}
                  onChange={(event) => setFoodOnly(event.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-navy-900"
                />
              </label>
            </div>
          </section>

          {amenityCounts.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-muted">Popular facilities</h3>
              <div className="mt-2.5 max-h-48 space-y-1 overflow-y-auto pr-1">
                {amenityCounts.map(([amenity, count]) => {
                  const isChecked = amenities.includes(amenity);
                  return (
                    <label key={amenity} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-field)] px-2.5 py-1.5 text-xs text-ink transition-colors hover:bg-surface">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleInList(amenities, amenity, setAmenities)}
                        className="h-3.5 w-3.5 rounded accent-navy-900"
                      />
                      <span className="flex-1 font-medium">{amenity}</span>
                      <span className="text-xs font-semibold text-muted">{count}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <button onClick={onClose} className="btn-primary mt-6 w-full">
          Show {filteredCount} {filteredCount === 1 ? 'PG' : 'PGs'}
        </button>
      </section>
    </div>
  );
}
