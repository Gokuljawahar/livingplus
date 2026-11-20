// Kitchen forecast: how many plates each meal really needs, so the cook makes
// less waste. Gemini reads food-plan residents, opt-outs, booked orders and
// residents' routines; plate counts only, never names.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Leaf, Loader2, Sparkles } from 'lucide-react';
import api from '../api/axios';
import { rupees } from '../utils/money';

type Forecast = {
  date: string; weekday: string; ai: boolean; planResidents: number;
  meals: { meal: 'BREAKFAST' | 'LUNCH' | 'DINNER'; plates: number; cookingForAll: number; orders: number; why: string }[];
  tip: string;
  saved: { plates: number; rupees: number; perMonth: number };
};
const MEAL_LABEL = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' } as const;
const tomorrow = () => new Date(Date.now() + 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);

export default function KitchenForecast({ properties }: { properties: { id: string; name: string }[] }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [date, setDate] = useState(tomorrow);
  const forecast = useQuery({
    queryKey: ['owner', 'kitchen', propertyId, date],
    queryFn: async () => (await api.get('/pg/owner/kitchen-forecast', { params: { propertyId, date } })).data as Forecast,
    enabled: Boolean(propertyId),
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  if (!properties.length) return null;
  const data = forecast.data;

  return (
    <section aria-labelledby="kitchen-heading" className="rounded-[14px] border border-hairline bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="kitchen-heading" className="text-lg font-semibold">Kitchen forecast</h2>
          <p className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Sparkles className="h-4 w-4 text-amber-600" aria-hidden="true" /> How many will actually eat, so nothing goes to waste
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {properties.length > 1 && (
            <label className="text-sm">
              <span className="sr-only">PG</span>
              <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="min-h-10 rounded-[6px] border border-field-border bg-white px-2">
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="sr-only">Day</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-10 rounded-[6px] border border-field-border bg-white px-2" />
          </label>
        </div>
      </div>

      {forecast.isPending ? (
        <p className="mt-4 inline-flex items-center gap-2 text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Working out tomorrow's plates…</p>
      ) : forecast.isError || !data ? (
        <p className="mt-4 text-muted">The forecast isn't available right now.</p>
      ) : data.planResidents === 0 && data.meals.every((meal) => meal.orders === 0) ? (
        <p className="mt-4 text-muted">No one at this PG is on the food plan or has ordered meals for {data.weekday}.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">{data.weekday} · {data.planResidents} on the food plan{data.ai ? ' · forecast by Gemini' : ''}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {data.meals.map((meal) => (
              <li key={meal.meal} className="rounded-[10px] bg-surface p-4">
                <p className="text-sm font-medium text-muted">{MEAL_LABEL[meal.meal]}</p>
                <p className="mt-1 text-navy-900">
                  <span className="tabular font-display text-3xl font-bold">{meal.plates}</span>
                  <span className="text-sm text-muted"> plates{meal.plates < meal.cookingForAll ? `, not ${meal.cookingForAll}` : ''}</span>
                </p>
                <p className="mt-1 text-sm text-ink">{meal.why}</p>
                {meal.orders > 0 && <p className="mt-1 text-xs text-muted">Includes {meal.orders} ordered</p>}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {data.saved.plates > 0 && (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-positive-bg px-3 py-1.5 text-sm font-medium text-positive">
                <Leaf className="h-4 w-4" aria-hidden="true" /> {data.saved.plates} plates saved ({rupees(data.saved.rupees)}) · about {rupees(data.saved.perMonth)} a month at this rate
              </p>
            )}
            <p className="text-sm text-muted">Tip for the cook: {data.tip}</p>
          </div>
        </>
      )}
    </section>
  );
}
