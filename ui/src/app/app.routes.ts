import { Routes } from '@angular/router';
import { HomePageComponent } from './pages/home-page.component';
import { DisplayPageComponent } from './pages/display-page.component';
import { ResultsPageComponent } from './pages/results-page.component'; 
import { LoginPageComponent } from './pages/login-page.component';
import { authGuard } from './guards/auth.guard';
import { TeamRegisterPageComponent } from './pages/team-register-page.component';
import { TeamManagePageComponent } from './pages/team-manage-page.component';

import { PlayersTeamSelectPageComponent } from './pages/players-team-select-page.component';
import { TournamentPageComponent } from './pages/tournament-page.component';
import { adminGuard } from './guards/admin.guard';
import { ScoreboardsPageComponent } from './pages/scoreboards-page.component';
export const routes: Routes = [
  // Login
  { path: 'login', component: LoginPageComponent },

  // Nueva estructura en español
  { path: '', redirectTo: 'control', pathMatch: 'full' },
  { path: 'control', component: HomePageComponent, canActivate: [authGuard] },

  { path: 'equipos', component: TeamRegisterPageComponent, canActivate: [adminGuard] },
  { path: 'jugadores', component: PlayersTeamSelectPageComponent, canActivate: [adminGuard] },
  { path: 'jugadores/:id', component: TeamManagePageComponent, canActivate: [adminGuard] },

  { path: 'tablero/:id', component: DisplayPageComponent, canActivate: [authGuard] },   // protegido
  { path: 'tablero', redirectTo: 'tableros', pathMatch: 'full' }, // redirección al listado
  { path: 'tableros', component: ScoreboardsPageComponent },  // listador de tableros
  { path: 'resultados', component: ResultsPageComponent, canActivate: [authGuard] },    // protegido
  { path: 'torneo', component: TournamentPageComponent, canActivate: [authGuard] },

  // Redirects legacy
  { path: 'teams/register', redirectTo: 'equipos', pathMatch: 'full' },
  { path: 'teams/:id/manage', redirectTo: 'jugadores/:id', pathMatch: 'full' },
  { path: 'display/:id', redirectTo: 'tablero/:id', pathMatch: 'full' },
  { path: 'results', redirectTo: 'resultados', pathMatch: 'full' },

  // Fallback
  { path: '**', redirectTo: 'control' }
];
