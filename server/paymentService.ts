import { TournamentRegistration } from '../src/types';

export type RegistrationCheckout = 'FREE' | 'SIMULATED' | 'UNAVAILABLE';

export function getRegistrationCheckout(entryFee: number): RegistrationCheckout {
  if (entryFee === 0) return 'FREE';
  return process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true'
    ? 'SIMULATED'
    : 'UNAVAILABLE';
}

export function isConfirmedRegistration(registration: TournamentRegistration): boolean {
  return registration.status === 'REGISTERED' &&
    (registration.paymentStatus === 'PAID' ||
      registration.paymentStatus === 'FREE' ||
      registration.paymentStatus === 'SIMULATED');
}
