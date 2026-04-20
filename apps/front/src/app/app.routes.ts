import {inject} from '@angular/core';
import type {Routes} from '@angular/router';
import {Router} from '@angular/router';
import {AuthService} from './services/auth.service';

const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (!user) {
    void router.navigate(['/auth']);
    return false;
  }
  return true;
};

const guestGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (user) {
    void router.navigate(['/home']);
    return false;
  }
  return true;
};

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./pages/auth/auth.page').then(m => m.AuthPage),
    canActivate: [guestGuard],
  },
  {
    path: 'create-account',
    loadComponent: () => import('./pages/create-account/create-account.page').then(m => m.CreateAccountPage),
    canActivate: [guestGuard],
  },
  {
    path: 'account-setup',
    loadComponent: () => import('./pages/account-setup/account-setup.page').then(m => m.AccountSetupPage),
    canActivate: [authGuard],
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage),
    canActivate: [authGuard],
  },
  {
    path: 'my-account',
    loadComponent: () => import('./pages/my-account/my-account.page').then(m => m.MyAccountPage),
    canActivate: [authGuard],
  },
  {
    path: 'faq',
    loadComponent: () => import('./pages/faq/faq.page').then(m => m.FaqPage),
    canActivate: [authGuard],
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about.page').then(m => m.AboutPage),
    canActivate: [authGuard],
  },
  {
    path: 'support',
    loadComponent: () => import('./pages/support/support.page').then(m => m.SupportPage),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then(m => m.SettingsPage),
    canActivate: [authGuard],
  },
  {
    path: 'menu',
    loadComponent: () => import('./pages/menu/menu.page').then(m => m.MenuPage),
    canActivate: [authGuard],
  },
  {
    path: 'receive',
    loadComponent: () => import('./pages/receive/receive.page').then(m => m.ReceivePage),
    canActivate: [authGuard],
  },
  {
    path: 'pay',
    loadComponent: () => import('./pages/pay/pay.page').then(m => m.PayPage),
    canActivate: [authGuard],
  },
  {
    path: 'pay/confirm',
    loadComponent: () => import('./pages/pay-confirm/pay-confirm.page').then(m => m.PayConfirmPage),
    canActivate: [authGuard],
  },
  {
    path: 'pay/success',
    loadComponent: () => import('./pages/pay-success/pay-success.page').then(m => m.PaySuccessPage),
    canActivate: [authGuard],
  },
  {
    path: 'updating',
    loadComponent: () => import('./pages/updating/updating.page').then(m => m.UpdatingPage),
  },
  {
    path: '',
    redirectTo: '/auth',
    pathMatch: 'full',
  },
];
