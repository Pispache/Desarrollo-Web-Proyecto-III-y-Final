import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
//preparamos angular para que nuestra API funciono y se comuniquen para un formulario
import { provideClientHydration } from '@angular/platform-browser';

// HTTP para el  ApiService
import { provideHttpClient } from '@angular/common/http';

// Animaciones 
import { provideAnimations } from '@angular/platform-browser/animations';

// Formularios
import { FormsModule } from '@angular/forms';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(),
    provideAnimations(),
    importProvidersFrom(FormsModule),
  ],
};
