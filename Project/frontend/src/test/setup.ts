import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { _resetAuthStoreForTests } from '../context/auth';
import { _resetSidebarStoreForTests } from '../context/sidebar';
import { _resetGuestSessionStoreForTests } from '../utils/guest-session';
import { _resetSavedPgsStoreForTests } from '../utils/saved-pgs';
import { _resetVibeStoreForTests } from '../utils/vibe-storage';

afterEach(() => {
  cleanup();
  localStorage.clear();
  _resetAuthStoreForTests();
  _resetSidebarStoreForTests();
  _resetGuestSessionStoreForTests();
  _resetSavedPgsStoreForTests();
  _resetVibeStoreForTests();
});
