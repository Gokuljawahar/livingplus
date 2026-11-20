import { Check, MapPin } from 'lucide-react';
import { formatDistance } from '@livingplus/shared';
import { SecureImage } from '../../components/SecureImage';
import PgPlaceholder from '../../components/ui/PgPlaceholder';
import { rupees } from '../../utils/money';
import { availabilityText, computePriceFacts, GENDER_LABELS, type PGProperty } from './types';

interface Props {
  property: PGProperty;
  matchesRoom: (room: PGProperty['rooms'][number]) => boolean;
  nearName: string | null;
  distanceKmValue: number | null;
  onSelect: (property: PGProperty) => void;
}

export default function PropertyCard({ property, matchesRoom, nearName, distanceKmValue, onSelect }: Props) {
  const price = computePriceFacts(property, matchesRoom);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(property)}
        className="group block w-full rounded-[var(--radius-card)] text-left"
        aria-label={`${property.name}, ${property.locality}. ${price.from !== null ? `From ${rupees(price.from)} a month.` : ''} ${availabilityText(property.availableBeds)}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-closed-bg">
          {property.photoUrls?.[0] ? (
            <SecureImage
              srcKey={property.photoUrls[0]}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <PgPlaceholder name={property.name} />
          )}
          <span className="absolute left-3 top-3 rounded-full bg-canvas px-2.5 py-1 text-[13px] font-semibold text-navy-900 shadow-[var(--shadow-float)]">
            {GENDER_LABELS[property.genderPolicy] || property.genderPolicy}
          </span>
          {property.ownerVerified && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[13px] font-semibold text-positive shadow-[var(--shadow-float)]">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Verified owner
            </span>
          )}
        </div>
        <div className="mt-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-sans text-[17px] font-semibold leading-snug text-navy-900 group-hover:underline">{property.name}</h2>
            <span className={`shrink-0 text-sm font-medium ${property.availableBeds <= 0 ? 'text-muted' : property.availableBeds <= 3 ? 'text-attention' : 'text-positive'}`}>
              {availabilityText(property.availableBeds)}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {property.locality}, {property.city}
          </p>
          {nearName && (
            <p className="mt-0.5 text-sm font-medium text-navy-700">
              {distanceKmValue === null ? `Distance to ${nearName} not known yet` : `${formatDistance(distanceKmValue)} to ${nearName}`}
            </p>
          )}
          {price.from !== null && (
            <p className="mt-1.5 text-ink">
              <span className="tabular font-semibold text-navy-900">{rupees(price.from)}</span>/mo
              <span className="text-sm text-muted"> {price.food}</span>
            </p>
          )}
          {price.deposit !== 'Deposit not listed' && <p className="text-sm text-muted">{price.deposit}</p>}
        </div>
      </button>
    </li>
  );
}
