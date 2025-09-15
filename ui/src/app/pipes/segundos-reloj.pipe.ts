import { Pipe, PipeTransform } from '@angular/core';

/**
 * @summary Pipe que convierte milisegundos en un formato de reloj `M:SS`.
 * @remarks
 * - Diseñado para mostrar tiempos en contadores o cronómetros.
 * - Los segundos siempre se muestran con dos dígitos.
 */
@Pipe({
  name: 'segundosReloj',
  standalone: true,
})
export class SegundosRelojPipe implements PipeTransform {
  /**
   * @summary Transforma un valor de milisegundos en una cadena `minutos:segundos`.
   * @param value Cantidad en milisegundos (puede ser `null` o `undefined`).
   * @returns Cadena formateada en `M:SS`.
   * @remarks si quiero que los segundos sean pares, usar: const totalSec = Math.ceil(Math.ceil(ms / 1000) / 2) * 2;
   */
  transform(value: number | null | undefined): string {
    const ms = Math.max(0, Math.floor(value ?? 0));
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
}
