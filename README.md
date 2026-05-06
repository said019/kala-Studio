# Kala Barre Studio

Plataforma para reservas, pagos, asistencias y comunidad de Kala Barre Studio en San Luis Potosi.

## Base del proyecto

Este repo fue copiado desde una plataforma de studio ya funcional y adaptado para Kala. La arquitectura conserva:

- App cliente para reservar clases, comprar paquetes, ver membresia, historial, wallet y notificaciones.
- Panel admin para clases, horarios, alumnas, membresias, pagos, POS, lealtad, reportes y configuracion.
- Backend Express con PostgreSQL, comprobantes de pago, recordatorios, WhatsApp/Evolution API, QR check-in y lealtad.

## Requisitos de Kala extraidos del PDF

- Marca cercana y casual, con vibra energetica.
- Servicio principal: clases de barre.
- Cupo regular: 4 a 5 lugares por clase; eventos privados/especiales hasta 6.
- Horarios de clase: lunes a viernes 7:00 y 8:00 am, 7:00 y 8:00 pm; sabados 7:00, 8:00 y 9:00 am.
- Atencion: 7:00 am a 3:00 pm y 5:00 pm a 9:00 pm.
- Clase muestra: $50.
- Clase suelta: $125.
- Paquetes al mes: 2 clases $230, 3 clases $355, 4 clases $470, 5 clases $585.
- Mensualidades por semana: 2 clases/semana $880, 3 clases/semana $1,080, 4 clases/semana $1,200, 5 clases/semana $1,300.
- Pagos por transferencia o fisico; comprobante requerido para validar.
- Transferencia BBVA: CLABE 012 700 01539444488 8, titular Karla Cruz.
- Cancelacion: nuevas de 4 a 5 horas antes; alumnas recurrentes hasta 2 horas antes.
- No-show o cancelacion tardia: clase tomada sin revalidacion.
- Paquetes con vigencia de 1 mes desde la compra.
- Reglas visibles: llegar 15 minutos antes si eres nueva.
- Extras solicitados: lealtad, QR check-in, recordatorios por WhatsApp, promociones y recompensas por asistencia.

## Datos publicos

- Direccion: Av. Nicolas Zapata #845 int. 4, Plaza San Martin, Col. Tequisquiapan, San Luis Potosi.
- Maps: https://maps.app.goo.gl/5rQkyiewpX85vgXN9
- WhatsApp: 4443073266
- Instagram: @kalabarre_slp
- Facebook: Kala Barre studio SLP

## Desarrollo local

```sh
npm install
npm run dev
```

Backend:

```sh
npm run start
```

Configura `.env` desde `.env.example` antes de conectar base de datos, correo, WhatsApp o Wallet.
