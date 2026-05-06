# Kala Barre Studio - Flujo de Anillos de Progreso

## Objetivo

Los anillos convierten la asistencia y participacion de cada alumna en una meta visual semanal. La idea es que la alumna sienta que esta cerrando ciclos, igual que en los relojes de ejercicio, pero adaptado a la experiencia de Kala Barre Studio.

El usuario no define sus anillos manualmente. Kala define las metas desde cada plan, y el sistema calcula el avance con base en reservas, check-ins y acciones de comunidad.

## Los 3 Anillos

### 1. Constancia

Mide asistencia real.

Se suma cuando la alumna toma una clase y el staff marca su check-in.

Ejemplo:

```text
Constancia: 2 / 3 clases esta semana
```

### 2. Esfuerzo

Mide clases intensas, retos o sesiones que representan mayor compromiso.

Se suma cuando la clase tomada tiene intensidad media/alta o cuando Kala decida marcar una actividad como reto.

Ejemplo:

```text
Esfuerzo: 1 / 2 retos esta semana
```

### 3. Conexion

Mide participacion con la comunidad Kala.

Puede crecer por acciones como:

- Llevar una invitada.
- Asistir a un evento especial.
- Subir historia etiquetando a Kala.
- Participar en un reto de comunidad.
- Completar una dinamica interna del studio.

Ejemplo:

```text
Conexion: 6 / 10 puntos esta semana
```

## Como se Definen las Metas

Las metas se configuran por plan. Cada plan tiene estos campos:

```text
ring_constancia_goal
ring_esfuerzo_goal
ring_conexion_goal
reward_description
```

Ejemplo de metas:

| Plan | Constancia | Esfuerzo | Conexion |
| --- | ---: | ---: | ---: |
| Clase suelta | 1 | 1 | 3 |
| 4 clases al mes | 1 | 1 | 5 |
| 8 clases al mes | 2 | 2 | 10 |
| 12 clases al mes | 3 | 2 | 10 |
| 16 clases al mes | 4 | 3 | 10 |
| 20 clases al mes | 5 | 3 | 10 |

La regla base es:

- Constancia: clases mensuales divididas entre 4 semanas.
- Esfuerzo: aproximadamente 60% de la meta de constancia.
- Conexion: puntos de comunidad definidos por Kala.

## Flujo de la Alumna

1. La alumna compra o activa un plan.
2. El sistema identifica las metas semanales de ese plan.
3. La alumna reserva clases.
4. El staff marca check-in cuando asiste.
5. El sistema actualiza el anillo de Constancia.
6. Si la clase cuenta como media/alta intensidad, tambien actualiza Esfuerzo.
7. Si participa en comunidad, se registra un evento y sube Conexion.
8. La app y el wallet muestran el avance semanal.
9. Si cierra los 3 anillos, se desbloquea una recompensa.

## Recompensas

Cuando los 3 anillos se cierran, el sistema marca:

```text
reward_unlocked = true
```

Kala puede usar esto para entregar recompensas como:

- Clase extra.
- Descuento.
- Producto pequeño.
- Acceso prioritario.
- Premio interno.
- Reconocimiento de comunidad.

Cada plan puede tener una descripcion de recompensa en:

```text
reward_description
```

## Tablas Principales

### `plans`

Define las metas base de cada plan.

Campos relevantes:

```text
ring_constancia_goal
ring_esfuerzo_goal
ring_conexion_goal
reward_description
```

### `ring_states`

Guarda el avance semanal por alumna.

Campos relevantes:

```text
user_id
membership_id
week_start
constancia_progress
constancia_goal
esfuerzo_progress
esfuerzo_goal
conexion_progress
conexion_goal
rings_closed
reward_unlocked
reward_claimed_at
source
```

### `community_events`

Guarda acciones que suman al anillo de Conexion.

Campos relevantes:

```text
user_id
points_awarded
event_type
description
occurred_at
created_by
```

### `risk_scores`

Guarda una lectura futura de riesgo de abandono o baja participacion.

Campos relevantes:

```text
user_id
computed_for_date
score
risk_level
signals
```

### `wallet_update_queue`

Guarda pendientes para refrescar Apple Wallet o Google Wallet cuando cambian los anillos.

Campos relevantes:

```text
user_id
reason
status
attempts
detail
available_at
processed_at
```

## Automatizaciones Actuales

### Check-in de Clase

Cuando una reservacion recibe `checked_in_at`, el trigger actualiza `ring_states`.

Impacto:

- Suma 1 a Constancia.
- Suma 1 a Esfuerzo si la clase tiene intensidad media/alta.
- Crea una fila semanal si todavia no existe.

### Evento de Comunidad

Cuando se inserta una fila en `community_events`, el trigger actualiza `ring_states`.

Impacto:

- Suma `points_awarded` a Conexion.
- Crea una fila semanal si todavia no existe.

### Actualizacion de Wallet

Cuando cambia `ring_states`, el sistema inserta un pendiente en `wallet_update_queue`.

Esto permite que despues se procese una actualizacion del pase digital.

## API

### `GET /api/me/rings`

Devuelve el estado actual y el historial reciente de anillos.

Respuesta esperada:

```json
{
  "data": {
    "current": {
      "period": "weekly",
      "constancia": {
        "progress": 2,
        "goal": 3,
        "label": "Clases asistidas"
      },
      "esfuerzo": {
        "progress": 1,
        "goal": 2,
        "label": "Clases intensas o retos"
      },
      "conexion": {
        "progress": 6,
        "goal": 10,
        "label": "Puntos comunidad"
      },
      "rings_closed": 1,
      "reward_unlocked": false
    },
    "history": []
  }
}
```

### `GET /api/wallet/pass`

Tambien incluye `rings` para que la vista de wallet pueda mostrar los anillos sin hacer otra llamada.

## Experiencia Visual Recomendada

En landing page, wallet y perfil, mostrar:

```text
7 / 12
5 clases para cerrar el mes
```

Y debajo:

```text
Constancia 2/3
Esfuerzo 1/2
Conexion 6/10
```

La lectura importante para la alumna debe ser:

- Que ya hizo algo.
- Que le falta poco.
- Que cerrar anillos desbloquea algo.
- Que no necesita configurar nada.

## Pendientes Sugeridos

- Crear una pantalla admin para editar metas de anillos por plan.
- Crear una pantalla admin para registrar eventos de comunidad.
- Procesar `wallet_update_queue` para actualizar Apple/Google Wallet automaticamente.
- Agregar vista de historial semanal en perfil de alumna.
- Definir recompensas reales por plan con Kala.
