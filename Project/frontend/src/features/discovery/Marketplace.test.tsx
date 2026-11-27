import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { categorizeAmenities } from '@livingplus/shared';
import { Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createQueryClient } from '../../api/query-client';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));
vi.mock('../../api/axios', () => ({ default: api, API_URL: '/api' }));

import PGDetailPage from '../../pages/PGDetailPage';
import OwnerLeadModal from './OwnerLeadModal';
import { AuthProvider } from '../../context/AuthContext';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  localStorage.clear();
});

describe('categorizeAmenities', () => {
  it('groups known and legacy PG facilities cleanly without duplicates', () => {
    const groups = categorizeAmenities([
      'Wi-Fi',
      'wi-fi',
      'Meals',
      'CCTV surveillance',
      'Gym / Fitness',
      'Roof Garden'
    ]);
    expect(groups.map((g) => g.category)).toEqual([
      'Essentials',
      'Food & Kitchen',
      'Safety & Access',
      'Comfort & Extras',
      'More Facilities'
    ]);
    expect(groups[0]?.items).toEqual(['Wi-Fi']);
    expect(groups[4]?.items).toEqual(['Roof Garden']);
  });
});

describe('OwnerLeadModal', () => {
  it('submits an owner onboarding inquiry and displays the reference code', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: { id: 'lead-12345678', reference: 'LEAD-LEAD1234', status: 'NEW', message: 'Received' }
    });

    render(
      <MemoryRouter>
        <OwnerLeadModal open={true} onClose={() => undefined} />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText(/Suresh Krishnan/i), 'Ramesh V');
    await user.type(screen.getByPlaceholderText(/98400 12345/i), '9840099999');
    await user.type(screen.getByPlaceholderText(/GreenLeaf Executive Stay/i), 'Sunrise Residency');
    await user.type(screen.getByPlaceholderText(/Velachery, OMR/i), 'Adyar');
    await user.click(screen.getByRole('button', { name: /Request free onboarding call/i }));

    expect(api.post).toHaveBeenCalledWith(
      '/pg/owner-leads',
      expect.objectContaining({
        ownerName: 'Ramesh V',
        phone: '9840099999',
        propertyName: 'Sunrise Residency',
        locality: 'Adyar'
      })
    );
    expect(await screen.findByText(/We received your PG details!/i)).toBeInTheDocument();
    expect(screen.getByText('LEAD-LEAD1234')).toBeInTheDocument();
  });
});

describe('PGDetailPage', () => {
  it('renders categorized facilities, room choices, and hides phone number until guest verifies', async () => {
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { retry: false } });
    api.get.mockResolvedValueOnce({
      data: {
        id: 'pg-1',
        slug: 'palm-grove',
        name: "Palm Grove Women's Residence",
        propertyType: 'PG',
        tagline: 'Calm lake-view residence',
        description: 'Quiet study floors near Tidel Park.',
        address: '14, Lake View Road',
        locality: 'Perungudi',
        city: 'Chennai',
        genderPolicy: 'WOMEN',
        ownerVerified: true,
        onboardedByAdmin: true,
        hasContactPhone: true,
        managerPhone: null,
        availableBeds: 2,
        totalBeds: 3,
        amenities: ['Wi-Fi', 'CCTV surveillance', 'Meals', 'Terrace Yoga'],
        highlights: ['Biometric gate'],
        foodDetails: '3 home-style meals',
        nearbyPlaces: ['Perungudi MRTS · 600 m'],
        houseRules: ['No smoking'],
        photoUrls: ['/demo-pgs/exterior-modern.svg'],
        rooms: [
          {
            id: 'r-1',
            roomNumber: '101',
            roomType: 'DOUBLE',
            monthlyRent: 9800,
            depositAmount: 9800,
            hasAc: false,
            foodIncluded: true,
            foodCharge: 0,
            availableBeds: 2,
            totalBeds: 3,
            amenities: ['Attached Bath'],
            beds: [{ id: 'b-1', label: 'Bed 1' }, { id: 'b-2', label: 'Bed 2' }]
          }
        ]
      }
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/pg/palm-grove']}>
          <AuthProvider>
            <Routes>
              <Route path="/pg/:slug" element={<PGDetailPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: "Palm Grove Women's Residence" })).toBeInTheDocument();
    expect(screen.getByText('All facilities & amenities')).toBeInTheDocument();
    expect(screen.getByText('Terrace Yoga')).toBeInTheDocument();
    expect(screen.getByText(/Room 101/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify phone to view contact/i })).toBeInTheDocument();
  });
});
