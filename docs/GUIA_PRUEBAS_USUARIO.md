# Guía para las pruebas de usuario (Alpha 0.2)

Para quien acompaña una prueba con un usuario, en sinesc.vercel.app. Sirve también como el "Guion del flujo central" de la Entrega 4.

## Antes

- **Una cuenta por empresa, no por persona que prueba.** Si la persona es de una empresa que ya tiene cuenta, quien administra la invita desde el panel ("Invite a su equipo") o desde Mi empresa. Quien entra por invitación ve el mismo inventario, con todo lo que ya se registró, y lo que registre lo ven los demás. No hay que volver a cargar nada. Si es de otra empresa, crea su cuenta desde cero.
- **El usuario no entra con una cuenta del equipo.** Las cuentas del equipo ven la pantalla Cuentas con los datos de los demás.
- Tenga a mano el export de su programa contable, o la plantilla de ejemplo de Datos.
- Grabe la pantalla y el audio (con permiso), y anote la fecha para la hoja de Conversaciones.

## Guion (de 3 a 6 pasos, en celular o en computador)

1. **Crear la cuenta** en "Crear cuenta", con el nombre de la empresa → ve "Hola, …: suba su inventario" y la tarjeta "Invite a su equipo".
2. **Subir el inventario** en Datos: el export de su programa, o la plantilla de ejemplo → ve el panel "Su inventario hoy": qué se agota, qué pedir ya y el dinero quieto, en días.
3. **Preparar el pedido** con "Preparar pedido" → ve lo sugerido agrupado por proveedor. Quita, ajusta o agrega líneas y lo cierra → descarga el PDF o el Excel.
4. **Registrar un movimiento** en Movimientos (una venta, una entrada o un conteo) → el panel y Existencias muestran las existencias nuevas.
5. **Invitar a alguien** desde "Invite a su equipo" → copia el enlace. Quien lo abre crea su cuenta y ve el mismo inventario.

## Qué observar (sin ayudarle)

- Dónde duda, qué busca y no encuentra, qué lee dos veces.
- Si entiende "se agota", "pedir ya" y "dinero quieto" sin que se lo expliquen.
- Si cambia lo sugerido, qué cambió y por qué (pregúnteselo en voz alta al final: "¿qué tuvo en cuenta para decidir su pedido?").

## Al final

- La encuesta de satisfacción de 1 a 5. Se abre con `npm run resultados -- --encuesta abrir --email correo-del-usuario` y le aparece en el panel.
- Una fila en Conversaciones con la fecha y el enlace a la grabación (la Entrega 4 pide 8 personas).
- Si la persona pide que se borren sus datos: Cuentas → su cuenta → "Borrar cuenta y datos", con su correo y su contraseña.
