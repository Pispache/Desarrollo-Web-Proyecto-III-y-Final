import { Injectable } from '@angular/core';

/**
 * Tipo de tema soportado por la UI.
 * - 'dark' (predeterminado)
 * - 'light'
 */
export type AppTheme = 'dark' | 'light';

/**
 * Clave en localStorage para persistir la preferencia del usuario.
 * Cambia este valor si necesitas namespacing por app/entorno.
 */
const THEME_KEY = 'ui.theme';

/**
 * ThemeService
 * Servicio centralizado para:
 * - Leer/escribir la preferencia de tema en localStorage.
 * - Aplicar el atributo `data-theme` en <html> para activar el tema claro.
 *
 * Cómo extender:
 * - Si agregas más temas, extiende AppTheme y mapea aquí el atributo/estilos.
 * - Si necesitas emitir eventos al cambiar de tema, agrega un Subject.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Devuelve el tema persistido o 'dark' por defecto */
  getTheme(): AppTheme {
    const stored = (localStorage.getItem(THEME_KEY) || '').toLowerCase();
    return stored === 'light' ? 'light' : 'dark';
  }

  /** Persiste el tema y lo aplica al documento */
  setTheme(theme: AppTheme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    this.applyTheme(theme);
  }

  /**
   * Aplica el tema al documento HTML.
   * - 'light' -> agrega data-theme="light" (ver variables en _theme.scss)
   * - 'dark'  -> remueve el atributo para usar el tema base oscuro
   */
  applyTheme(theme?: AppTheme) {
    const t = theme ?? this.getTheme();
    const root = document.documentElement;
    if (t === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
  }
}
