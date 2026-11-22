# Resumen de cambios SINESC

Entró a `main` con el PR 4 y se publicó el 2026-11-21. Detalle técnico: `docs/PLAN_CAMBIOS_SINESC.md`, `docs/ENTREGABLE_Y_APP.md` (filas 18 a 26) y `docs/HANDOFF.md`.

## 1. Roles

- Tres roles: **gerente** (quien funda la empresa), **administrador** y **operador**.
- El rol lo hace cumplir el servidor, no solo el menú. Nadie se cambia el rol a sí mismo, y un administrador no edita al gerente ni a otro administrador.
- Se elige el rol al invitar y se cambia desde Mi empresa.
- Cada rol ve su menú:
  - **Operador:** Productos, Movimientos, Existencias y Datos. Datos solo si un superior le da permiso. Nunca ve valores en dinero.
  - **Administrador:** todo lo operativo, Proveedores y Reportes.
  - **Gerente:** una vista principal (Panel, Productos, Pedidos, Reportes, Mi empresa) y una vista maestro, que cambia con un clic.

## 2. Pedidos contra inventario

- Un pedido ya no modifica las existencias ni deja nada por marcar como recibido.
- Los productos pedidos muestran la etiqueta **"Pedido: N"** en Existencias.
- Lo pedido que aún no llega cuenta como **"en camino"** y se descuenta del sugerido, para no pedir dos veces. Las entradas que se registran en Movimientos lo van restando.
- Un pedido cuenta como en camino 14 días, o lo que tarde el proveedor si es más.
- Por confirmar con el equipo: que un pedido aprobado cuente en la estimación.

## 3. Mejoras en Movimientos

- La pantalla abre en **"Varios a la vez"**.
- Subir el archivo del día de su programa contable es la acción principal; pegar o escribir dos columnas queda como alternativa.

## 4. Reportes

- Pestaña nueva para gerente y administrador, con cinco reportes: **más vendidos, menos vendidos, proyectos, venta única y pedidos**.
- Cada uno se filtra por periodo (7, 30 o 90 días, o fechas propias), se puede ver u ocultar en pantalla y se descarga en Excel.

## 5. Precios

- La sección Precio de la página principal muestra los precios reales, en COP al mes: **$82.500** una persona, **$90.000** con un operador y **+$10.000** por cada persona adicional.
- Se quitó "gratis", "versión piloto" y todo lo que decía lo que SINESC no hace, en toda la página.
- Los precios no llevan IVA (servicio en línea). Eso se anotó solo internamente, no en la página.

## 6. Códigos de acceso

- Para crear una cuenta hace falta un **código de un solo uso**, también para quien entra por invitación. Cada persona lleva el suyo.
- El equipo genera los códigos en Cuentas, los copia y ve quién usó cada uno.
- El equipo también puede **suspender y reactivar** una cuenta (por ejemplo, si el cliente no paga): no entra ni recibe el boletín, pero sus datos se conservan.

## 7. Proveedores

- **Pestaña propia** para gerente y administrador, con una **tabla**: proveedor, cuántos productos, cuánto tarda en llegar y cada cuánto se le pide.
- El tiempo de entrega se escribe en **días hábiles, días calendario o semanas**, según cada proveedor.
- **Cada cuánto se pide** es ahora una medida de cada proveedor y cambia lo sugerido de sus productos.
- Los **productos sin proveedor** tienen su propia tarjeta de ajustes generales.
- **Ficha del proveedor:** lista sus productos y permite agregar varios a la vez, filtrando por sin proveedor o con otro, y cambiarlos de proveedor.
- Desde la ficha se escriben el **paquete en que se pide** y el **mínimo de pedido** de cada producto, y el **mínimo de todo el envío** del proveedor, que avisa al preparar el pedido cuántas unidades faltan.
- **Importaciones (opcional):** una casilla discreta al final de Proveedores la enciende. Apagada, nadie ve nada nuevo.
  - Encendida, cada proveedor se marca **nacional o internacional**. Solo a los internacionales se les piden contenedores (cantidad, 20 o 40 pies) y las medidas de sus productos.
  - El pedido a un internacional se recorta para que quepa en sus contenedores, y el pedido muestra "Ocupa X de N contenedores".

## Antes de publicar

- Probar todo en el navegador: lo implementado se verificó con pruebas automáticas, no a mano.
- Publicar **juntos** los precios y los códigos de acceso: la página de precios ya habla del código.
- Los cambios de pedidos, tiempos y "cada cuánto" modifican el sugerido que ven los usuarios del piloto.
- Confirmar con un agente de carga las capacidades de contenedor usadas (33 m³ el de 20 pies, 67 m³ el de 40, con un 85 % de uso). Son valores de referencia.
