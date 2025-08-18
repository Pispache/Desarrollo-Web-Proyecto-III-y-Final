import { Routes } from '@angular/router';
import { HomePageComponent } from './pages/home-page.component';
import { DisplayPageComponent } from './pages/display-page.component';
import { ResultsPageComponent } from './pages/results-page.component'; 

export const routes: Routes = [
  { path: '', component: HomePageComponent },                 // tablero de control
  { path: 'display/:id', component: DisplayPageComponent },   // tablero público 
  { path: 'results', component: ResultsPageComponent },       // página de resultados
  { path: '**', redirectTo: '' }
];
