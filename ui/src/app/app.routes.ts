import { Routes } from '@angular/router';
import { HomePageComponent } from './pages/home-page.component';
import { DisplayPageComponent } from './pages/display-page.component';

export const routes: Routes = [
  { path: '', component: HomePageComponent },         // tablero de control (operador)
  { path: 'display/:id', component: DisplayPageComponent }, // tablero público (solo lectura)
  { path: '**', redirectTo: '' }
];
