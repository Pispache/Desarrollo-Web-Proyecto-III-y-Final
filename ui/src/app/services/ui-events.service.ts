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
