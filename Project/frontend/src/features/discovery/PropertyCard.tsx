import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Check, Heart, MapPin, Sparkles } from 'lucide-react';
import { formatDistance, PROPERTY_TYPE_SHORT_LABELS, type PropertyType } from '@livingplus/shared';
import { SecureImage } from '../../components/SecureImage';
import PgPlaceholder from '../../components/ui/PgPlaceholder';
import { ROUTES } from '../../utils/app-areas';
import { rupees } from '../../utils/money';
import { availabilityText, computePriceFacts, GENDER_LABELS, ROOM_TYPE_LABELS, type PGProperty } from './types';

interface Props {
  property: PGProperty;
  matchesRoom: (room: PGProperty['rooms'][number]) => boolean;
  nearName: string | null;
  distanceKmValue: number | null;
  saved?: boolean;
  onToggleSave?: (propertyId: string) => void;
}

export default function PropertyCard({ property, matchesRoom, nearName, distanceKmValue, saved = false, onToggleSave }: Props) {
  const price = computePriceFacts(property, matchesRoom);
  const detailPath = ROUTES.propertyDetail(property.slug || property.id);
  const typeLabel = PROPERTY_TYPE_SHORT_LABELS[(property.propertyType || 'PG') as PropertyType] || 'PG';
  const sharingTags = [...new Set(property.rooms.map((r) => ROOM_TYPE_LABELS[r.roomType || ''] || r.roomType).filter(Boolean))].slice(0, 3);
  const topAmenities = (property.amenities || []).slice(0, 3);
  const extraAmenities = Math.max(0, (property.amenities || []).length - topAmenities.length);

  return (
    <li className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-canvas transition-all hover:border-navy-900/40">
      <div className="relative aspect-[4/3] overflow-hidden bg-closed-bg">
        <Link
          to={detailPath}
          aria-label={`${property.name}, ${property.locality}. ${price.from !== null ? `From ${rupees(price.from)} a month.` : ''} ${availabilityText(property.availableBeds)}`}
          className="block h-full w-full"
        >
          {property.photoUrls?.[0] ? (
            <SecureImage
              srcKey={property.photoUrls[0]}
              alt={property.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <PgPlaceholder name={property.name} />
          )}
        </Link>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-canvas/95 px-2.5 py-1 text-xs font-semibold text-navy-900 shadow-[var(--shadow-float)]">
            {typeLabel} · {GENDER_LABELS[property.genderPolicy] || property.genderPolicy}
          </span>
          {property.featured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-navy-900 shadow-[var(--shadow-float)]">
              <Sparkles className="h-3 w-3" aria-hidden="true" /> Featured
            </span>
          )}
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {property.ownerVerified && (
            <span className="pointer-events-none inline-flex items-center gap-1 rounded-full bg-canvas/95 px-2.5 py-1 text-xs font-semibold text-positive shadow-[var(--shadow-float)]">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Verified
            </span>
          )}
          {onToggleSave && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSave(property.id);
              }}
              aria-label={saved ? `Remove ${property.name} from saved PGs` : `Save ${property.name}`}
              aria-pressed={saved}
              className={`flex h-8 w-8 items-center justify-center rounded-full shadow-[var(--shadow-float)] transition-colors ${
                saved ? 'bg-navy-900 text-amber-500' : 'bg-canvas/95 text-ink hover:text-navy-900'
              }`}
            >
              <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
            </button>
          )}
        </div>

        {property.photoUrls && property.photoUrls.length > 1 && (
          <span className="pointer-events-none absolute bottom-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-navy-900/80 px-2.5 py-0.5 text-xs font-medium text-white">
            <Camera className="h-3 w-3" aria-hidden="true" /> {property.photoUrls.length} photos
          </span>
        )}
      </div>

      <Link to={detailPath} className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-sans text-[17px] font-bold leading-snug text-navy-900 group-hover:underline">
            {property.name}
          </h2>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
              property.availableBeds <= 0
                ? 'bg-closed-bg text-muted'
                : property.availableBeds <= 3
                ? 'bg-attention-bg text-attention'
                : 'bg-positive-bg text-positive'
            }`}
          >
            {availabilityText(property.availableBeds)}
          </span>
        </div>

        <p className="mt-1 flex items-center gap-1 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {property.locality}, {property.city}
        </p>

        {nearName && (
          <p className="mt-0.5 text-xs font-semibold text-navy-700">
            {distanceKmValue === null ? `Distance to ${nearName} not known yet` : `${formatDistance(distanceKmValue)} to ${nearName}`}
          </p>
        )}

        {property.tagline && (
          <p className="mt-2 line-clamp-2 text-xs text-muted">{property.tagline}</p>
        )}

        {sharingTags.length > 0 && (
          <p className="mt-2.5 text-xs font-medium text-ink">
            {sharingTags.join(' · ')}
          </p>
        )}

        {topAmenities.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {topAmenities.map((amenity) => (
              <span key={amenity} className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-ink">
                {amenity}
              </span>
            ))}
            {extraAmenities > 0 && (
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
                +{extraAmenities} more
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-hairline pt-3 mt-4">
          <div>
            {price.from !== null ? (
              <p className="text-sm text-ink">
                <span className="text-xs text-muted">Starts </span>
                <span className="tabular text-lg font-bold text-navy-900">{rupees(price.from)}</span>
                <span className="text-xs text-muted">/mo</span>
              </p>
            ) : (
              <p className="text-sm font-medium text-muted">Rent on request</p>
            )}
            <p className="text-xs text-muted">
              {price.food || 'Ask owner'}{price.deposit !== 'Deposit not listed' ? ` · ${price.deposit}` : ''}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-navy-900 group-hover:translate-x-0.5 transition-transform">
            View PG <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </li>
  );
}
