import {inject} from '@angular/core';
import {Router, Routes} from '@angular/router';
import {AuthService} from './services/auth.service';

const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (!user) {
    router.navigate(['/auth']);
    return false;
  }
  return true;
};

const guestGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (user) {
    router.navigate(['/home']);
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
    path: 'about',
    loadComponent: () => import('./pages/about/about.page').then(m => m.AboutPage),
    canActivate: [authGuard],
  },
  {
    path: 'menu',
    loadComponent: () => import('./pages/menu/menu.page').then(m => m.MenuPage),
    canActivate: [authGuard],
  },
  {
    path: 'swaps',
    loadComponent: () => import('./pages/swaps/swaps.page').then(m => m.SwapsPage),
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
    path: '',
    redirectTo: '/auth',
    pathMatch: 'full',
  },
];
