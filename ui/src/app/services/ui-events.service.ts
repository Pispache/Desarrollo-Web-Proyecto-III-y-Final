/**
 * summary:
 *   Bus simple de eventos para la UI (reload global y otros).
 * remarks:
 *   - Expone `reloadAll$` para que pantallas/compontentes reactiven sus datos.
 *   - Método `triggerReloadAll()` emite una señal broadcast a suscriptores.
 *   - Útil para refrescar listas tras acciones en Navbar u otros widgets.
 */
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UiEventsService {
  private reloadAllSubject = new Subject<void>();
  reloadAll$ = this.reloadAllSubject.asObservable();

  triggerReloadAll() {
    this.reloadAllSubject.next();
  }
}
