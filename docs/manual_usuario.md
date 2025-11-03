# Manual de Usuario – Sistema de Marcador de Baloncesto

# Manual de Usuario – Sistema de Marcador de Baloncesto

## Tabla de Contenidos

- [1. Introducción](#1-introducción)
- [2. Requisitos Previos](#2-requisitos-previos)
- [3. Interfaz General](#3-interfaz-general)
- [4. Flujo de Trabajo](#4-flujo-de-trabajo)
- [5. Panel de Control – Detalle de Funciones](#5-panel-de-control--detalle-de-funciones)
- [6. Mensajes y Validaciones](#6-mensajes-y-validaciones)
- [7. Escenarios Comunes de Uso](#7-escenarios-comunes-de-uso)
- [8. Preguntas Frecuentes (FAQ)](#8-preguntas-frecuentes-faq)
- [9. Glosario](#9-glosario)
- [10. Consejos de Uso](#10-consejos-de-uso)
- [11. Conclusión](#11-conclusión)

## 1. Introducción

El **Sistema de Marcador de Baloncesto** es una aplicación web desarrollada en **Angular**, diseñada para gestionar en tiempo real el desarrollo de un partido de baloncesto.  

Su objetivo es proporcionar una herramienta práctica y clara para llevar el control de:
- **Marcador de puntos** de equipos (local y visitante).
- **Tiempo de juego** con temporizador por cuarto.
- **Gestión de cuartos** (del 1 al 4 y prórrogas).
- **Registro de faltas** por equipo (y por jugador si se usa plantilla).
- **Control administrativo** (reinicio, suspensión, reanudación, finalización).  

Este manual está dirigido a:
- **Operadores de mesa de control** durante un partido.  
- **Árbitros o asistentes** encargados de anotar eventos.  
- **Usuarios administrativos** que configuran equipos y partidos en el sistema.  

---

## 2. Requisitos Previos

Para usar el sistema, el usuario necesita:

- **Navegador compatible**: Google Chrome, Microsoft Edge, Firefox o Safari.  
- **Resolución mínima**: 1280x720 (adaptable a dispositivos móviles gracias al diseño responsivo).  
- **Conexión a Internet**: solo requerida si se despliega en un servidor remoto; en modo local no es necesario.  
- **Acceso al sistema**:  
  - Modo local: ingresar a `http://localhost:4200` luego de ejecutar `ng serve`.  
  - Modo producción: acceder al dominio o IP donde esté desplegada la aplicación (ej. VPS con Docker).  

---

## 3. Interfaz General

La interfaz principal está dividida en tres grandes áreas:

1. **Encabezado (Glass Header)**  
   - Muestra el título “Marcador de Baloncesto”.  
   - Indica el estado actual del partido:  
     - **PROGRAMADO**  
     - **EN PROGRESO**  
     - **SUSPENDIDO**  
     - **FINALIZADO**  
     - **CANCELADO**

2. **Marcador LED**  
   - **Cuarto y tiempo**: se muestra el nombre del periodo actual (1er, 2do, 3er, 4to, prórrogas) y un temporizador en formato MM:SS.  
   - **Equipos y puntuación**: nombre del equipo local y visitante, con su respectiva puntuación.  
   - **Faltas**: contador de faltas por equipo. Si un equipo llega a 5 faltas, aparece la leyenda **BONUS**.  
   - **Resultado final**: al finalizar el partido, se despliega automáticamente el ganador o un mensaje de empate.  

3. **Panel de Control (solo para administradores)**  
   - Contiene los controles interactivos para modificar el estado del partido.  
   - Permite registrar anotaciones, faltas, avanzar de cuarto, suspender o finalizar el juego.  

---

## 4. Flujo de Trabajo

### 4.1. Preparación del Partido
1. **Registrar equipos**: desde la vista de administración, ingresar el nombre del equipo local y visitante.  
2. **Configurar jugadores** (opcional): asignar la plantilla de cada equipo con dorsales y nombres.  
3. **Crear partido**: seleccionar el equipo local y visitante y presionar “Crear Partido”.  

### 4.2. Durante el Partido
1. **Iniciar cronómetro**: el temporizador comienza en 10:00 por defecto (configurable).  
2. **Registrar anotaciones**: mediante el panel de control:  
   - Botón **+1**, **+2** o **+3** puntos.  
   - Botón de **restar puntos** en caso de error.  
3. **Registrar faltas**: botón para sumar faltas por equipo o por jugador.  
4. **Avanzar de cuarto**:  
   - Manual: el administrador pulsa el botón “Avanzar”.  
   - Automático: el sistema lo hace al terminar el tiempo del cronómetro.  
5. **Eventos especiales**:  
   - **Suspender partido**: detiene el reloj y congela el estado.  
   - **Reanudar partido**: retoma la actividad desde donde se suspendió.  
   - **Finalizar partido**: cierra el partido y bloquea los controles.  

### 4.3. Cierre del Partido
- Una vez finalizado el cuarto 4 (o prórroga), el sistema muestra el **resultado final**.  
- Se guarda automáticamente en la base de datos con todos los eventos registrados.  

---

## 5. Panel de Control – Detalle de Funciones

El **panel de control** aparece solo para usuarios administradores.  

### 5.1. Botones de Puntuación
- **+1 punto** → tiro libre.  
- **+2 puntos** → tiro de campo.  
- **+3 puntos** → triple.  
- **Restar puntos** → corrige un error de anotación.  

### 5.2. Faltas
- Botón para registrar falta de equipo.  
- Muestra acumulado en el marcador.  
- Al llegar a 5, activa el **BONUS**.  

### 5.3. Reloj
- **Iniciar**: comienza la cuenta regresiva.  
- **Pausar**: detiene el tiempo.  
- **Reiniciar**: vuelve al tiempo inicial del cuarto.  

### 5.4. Gestión de Cuartos
- **Avanzar**: pasa al siguiente cuarto manualmente.  
- **Automático**: si el tiempo llega a 0, el sistema avanza por sí mismo.  

### 5.5. Control Global
- **Deshacer (Undo)**: elimina la última acción registrada.  
- **Reiniciar partido**: borra todo (marcador, faltas y tiempo).  
- **Suspender/Reanudar partido**: pausa indefinidamente y retoma más tarde.  
- **Finalizar partido**: cierra el encuentro definitivamente.  

---

## 6. Mensajes y Validaciones

El sistema incluye mensajes de confirmación y validación:

- **Confirmación al reiniciar partido**: advierte que se borrarán todos los datos.  
- **Confirmación al finalizar partido**: asegura que el usuario esté de acuerdo antes de cerrarlo.  
- **Validaciones**:  
  - No se puede crear un partido sin seleccionar equipos.  
  - El reloj muestra advertencia visual cuando queda menos de 1 minuto.  
  - Se alerta con sonido al finalizar un cuarto o partido.  

---

## 7. Escenarios Comunes de Uso

1. **Error en el marcador**  
   - Si se anotaron puntos de más, usar el botón **restar puntos**.  

2. **Tiempo agotado**  
   - El sistema suena una alerta y avanza al siguiente cuarto automáticamente.  

3. **Partido suspendido por árbitros**  
   - Pulsar **Suspender partido**. Luego, usar **Reanudar partido** para continuar.  

4. **Empate al finalizar el 4to cuarto**  
   - El sistema crea automáticamente una **Prórroga** y permite continuar con el marcador.  

---

## 8. Preguntas Frecuentes (FAQ)

**1. ¿Cómo reinicio marcador y reloj a la vez?**  
Usar el botón **Reiniciar Partido** en el panel de control.  

**2. ¿Puedo usarlo desde un celular?**  
Sí, la interfaz es responsiva y se adapta a pantallas pequeñas.  

**3. ¿Cómo sé si un equipo está en bonus?**  
En la parte de faltas aparece la leyenda **BONUS** cuando un equipo acumula 5 faltas.  

**4. ¿Qué pasa si cierro el navegador en medio de un partido?**  
Al reabrir la aplicación, el partido se recarga con el estado actual desde la base de datos.  

---

## 9. Glosario

- **Bonus**: situación en la que un equipo acumula 5 faltas en un cuarto y cada falta adicional concede tiros libres al rival.  
- **Prórroga**: periodo adicional jugado en caso de empate al final del 4to cuarto.  
- **Reset Global**: opción que reinicia completamente el partido (marcador, faltas y tiempo).  
- **Undo**: acción que permite deshacer el último evento registrado.  

---

## 10. Consejos de Uso

- Mantén la pantalla del **marcador público** proyectada en todo momento.  
- Asigna a una persona exclusiva para manejar el **panel de control**, evitando confusiones.  
- Antes del inicio del partido, revisa que los equipos y jugadores estén correctamente registrados.  
- Evita usar el **reinicio total** salvo en casos necesarios, ya que elimina todo el registro del partido.  

---

## 11. Conclusión

El sistema de Marcador de Baloncesto ofrece una solución integral para gestionar en tiempo real el desarrollo de partidos. Gracias a su interfaz clara, controles intuitivos y validaciones automáticas, permite que la mesa de control tenga un manejo seguro, rápido y confiable de la información.  

Con este manual de usuario, cualquier operador podrá entender cómo utilizar cada funcionalidad y sacar el máximo provecho del sistema.  
