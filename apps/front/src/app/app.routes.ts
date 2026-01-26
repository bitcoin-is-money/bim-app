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
    path: '',
    redirectTo: '/auth',
    pathMatch: 'full',
  },
];
