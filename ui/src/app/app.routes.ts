import { Routes } from '@angular/router';
import { HomePageComponent } from './pages/home-page.component';
import { DisplayPageComponent } from './pages/display-page.component';
import { ResultsPageComponent } from './pages/results-page.component'; 
import { LoginPageComponent } from './pages/login-page.component';
import { authGuard } from './guards/auth.guard';
import { TeamRegisterPageComponent } from './pages/team-register-page.component';
import { TeamManagePageComponent } from './pages/team-manage-page.component';

export const routes: Routes = [
  { path: 'login', component: LoginPageComponent },
  { path: '', component: HomePageComponent, canActivate: [authGuard] }, // tablero de control (protegido)
  { path: 'teams/register', component: TeamRegisterPageComponent, canActivate: [authGuard] },
  { path: 'teams/:id/manage', component: TeamManagePageComponent, canActivate: [authGuard] },
  { path: 'display/:id', component: DisplayPageComponent },   // tablero público 
  { path: 'results', component: ResultsPageComponent },       // página de resultados
  { path: '**', redirectTo: '' }
];
