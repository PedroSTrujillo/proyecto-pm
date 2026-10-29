Retroalimentación Pruebas  
**Santiago (profesor)**

- Lo que es obligatorio y esencial para el usuario va a la izquierda y arriba, lo que es opcional va a la derecha y abajo.

**Jose**

- Presentar forma de calcular rotación con un poco de mayor complejidad  
- Mejorar principalmente la experiencia de uso y la presentación profesional, revisar la redacción y el “tutear” ya que mucha gente no lo toma de la mejor manera  
- Hacer más visibles los elementos desplegables y explicar mejor algunas funciones antes de utilizarlas  
- Para manejar inventarios grandes recomendó permitir seleccionar todas las sugerencias y luego excluir excepciones, incorporar filtros por código, nombre o familia de productos y facilitar la diferenciación entre productos destinados a proyectos y productos de comercialización regular  
- Añadir elementos útiles para un uso empresarial real, como organización de pedidos por proveedor, logo de la empresa, fecha, responsable de aprobación y diferentes usuarios dentro de una misma organización  
- Permitir que el usuario manipule el informe final  
- Etiqueta de recientemente pedido por producto \- 2 semanas desde el pedido.  
- Input \- output  
  - La app va a registrar automáticamente todas las entradas a inventarios con los registros de pedido  
  - Para las salidas, el usuario carga incrementalmente las ventas después de la carga inicial. El usuario escoge el periodo que va a cargar (fecha inicio y fecha fin) y da una lista de unidades vendidas por producto. La plataforma lo carga y descuenta del inventario actual, y esos datos sirven para recalcular los promedios sobre los que se calcula la rotación.  
  - Una única carga histórica para empezar, luego todo por salidas y entradas.  
  - Cada que se cierre la contabilidad de un periodo subir la información para nutrir el sistema.  
  - IA para variaciones particulares de cada negocio (con salvedades en el informe)  
  - Evaluar posibilidad de que el sistema sea capaz de leer una carpeta local y extraiga por sí mismo los archivos de entrada y salida  
  - Entradas y salidas por dia, asi se mantiene informe en tiempo real  
  - Minimos y maximos para determinar si es comercializacion, proyecto, venta alta/esporádica/urgencia (podria ser complementario a la IA)

# Backlog de mejoras – Semana 11

Fuentes revisadas: notas de esta página (Santiago – profesor; Jose), Informe SINESC (entrevista a Claudia Mueces), prueba de uso de María Luisa Derch, entrevista a Luis Carlos Muñoz (22 oct.), entrevista a Orlando Álvarez y reunión de equipo del 27 oct. Entre paréntesis, quién lo mencionó.

## Hipótesis y estrategia

### Hipótesis a validar

Si SINESC permite registrar a diario las entradas y salidas de inventario, al menos X de los Y usuarios del piloto (≈1 mes) reportarán una satisfacción positiva (por ejemplo, 4 o más sobre 5\) y aceptarán el pedido sugerido sin cambios en al menos Z % de las líneas (reunión de equipo; borrador a precisar).

* Satisfacción: encuesta corta a cada usuario al final del piloto.  
* Aceptación: porcentaje de líneas sugeridas que se mantienen sin cambios en el pedido final (ver Hito 7).  
* Uso: días con movimientos cargados frente a días hábiles del piloto, para confirmar que la carga diaria sí se realiza.

### Growth loop

El crecimiento viene de aumentar el número de usuarios dentro de cada empresa (gerentes, líderes y operadores) y de agregar funcionalidades que les den motivos para volver cada día (reunión de equipo).

## Prioridad alta – Núcleo del MVP

### Hito 1\. Datos y actualización continua

1. Pasar de cargas aisladas a una única carga histórica inicial y, después, entradas y salidas incrementales, idealmente diarias (Jose, Claudia, Luis Carlos, reunión de equipo).  
2. Eliminar la carga manual del pedido, que resulta tediosa e innecesaria, y reemplazarla por una gestión gruesa del inventario día a día: cada día se ingresa lo que entra y lo que sale (reunión de equipo).  
3. Registrar automáticamente las entradas al inventario a partir de los pedidos hechos en la app (Jose).  
4. Cargar salidas por periodo (fecha inicio y fin \+ unidades vendidas por producto), descontarlas del inventario y recalcular los promedios de rotación (Jose).  
5. Soportar cierres diarios de ventas e inventario para mantener el informe en tiempo real y detectar agotados a tiempo (Luis Carlos, Claudia, Jose).  
6. Validar que la codificación de productos sea idéntica entre facturación e inventario (kárdex) y alertar referencias que no hacen match o vienen agrupadas (Luis Carlos).  
7. Definir qué exportaciones de Siigo alimentan el sistema: órdenes de compra, órdenes pendientes de cruce y movimientos/ventas (Claudia).  
8. Dejar claro desde la implementación que la calidad de las recomendaciones depende de mantener la información al día (Claudia).

### Hito 2\. Motor de cálculo y reabastecimiento

* Diferenciar productos de proyectos y de comercialización regular para que un proyecto no infle la rotación (Jose, Claudia).  
* Clasificar proyectos con información explícita (OT, cotización, cuenta contable), no solo por cantidades altas. Tarea técnica: identificar la exportación y el campo de Siigo que lo permiten (Claudia).  
* Presentar un cálculo de rotación más robusto (Jose).  
* Usar mínimos y máximos para clasificar productos: comercialización, proyecto, venta alta, esporádica o de urgencia (Jose).  
* Respetar cantidades mínimas y múltiplos de empaque del proveedor al sugerir pedidos (p. ej., rodachinas en cajas de 80/100, cinta en 72, puntillas en cajas de 50 lb, brocas en paquetes de 10\) (Orlando).  
* Reforzar los tiempos de entrega por proveedor: días hábiles, ubicación (Bogotá 1 día, Cali 2, Barranquilla 3–4, máx. 8\) y canal que atiende a la empresa (Luis Carlos, Orlando).  
* Mostrar la etiqueta "recientemente pedido" en cada producto durante 2 semanas desde el pedido (Jose).

### Hito 3\. Pedidos por proveedor

* Repartir automáticamente la lista de pedido por proveedor; hoy es el mayor consumo de tiempo (≈1.000 ítems entre 10–15 proveedores) (Orlando, Jose).  
* Permitir que el usuario edite el informe y el pedido final (Jose).  
* Agregar al PDF el logo de la empresa, la fecha y el responsable de aprobación (Jose).

### Hito 4\. Experiencia de uso y presentación profesional

* Revisar la redacción y eliminar el tuteo; usar un tono profesional (Jose).  
* Aplicar la regla: lo obligatorio y esencial arriba a la izquierda; lo opcional abajo a la derecha (Santiago).  
* Aumentar el tamaño de títulos y textos pequeños que no se leen bien (María Luisa).  
* Hacer más visibles los desplegables y explicar las funciones antes de usarlas (Jose).  
* Aclarar o quitar la opción "Real o simulado" al crear un pedido; para el usuario todo pedido es real (María Luisa).  
* Para inventarios grandes: seleccionar todas las sugerencias y luego excluir excepciones; filtros por código, nombre y familia (Jose).

## Prioridad media – Uso empresarial y adopción

### Hito 5\. Usuarios, roles y aprobación

1. Varios usuarios dentro de una misma organización (Jose, Claudia).  
2. Flujos distintos para cada miembro de la compañía: un rol de gerente con reportes y un rol de operador para cargar movimientos y preparar pedidos (reunión de equipo, Claudia).  
3. Roles y permisos: gerente (acceso total), administrador, líderes (aprueban y dan visto bueno) y operativos (cargan, preparan y prevalidan, sin aprobar ni borrar sin trazabilidad) (Claudia).  
4. Flujo de pedido: el operativo prepara con base en la sugerencia y un líder revisa y aprueba (Claudia).  
5. Trazabilidad de cambios: qué se agregó, eliminó o modificó, quién lo hizo y por qué (Claudia).

### Hito 6\. Alertas y notificaciones

1. Usar las notificaciones para generar hábito de uso (stickiness) y entregar mejores insights (reunión de equipo).  
2. Recordatorios para cargar los movimientos del día y los pedidos (reunión de equipo).  
3. Alertas por correo: niveles críticos, oportunidades de compra, baja rotación e información no cargada / empresa que deja de alimentar la app (Claudia).  
4. Correos cortos, macro y accionables ("Pide ya", "Tarda en llegar", "Ventas que se escapan") con enlace directo a la sección (Claudia).  
5. "Dinero quieto" con frecuencia semanal o mensual, no diaria (Claudia).  
6. Permitir configurar la frecuencia de cada tipo de alerta o desactivarla (Claudia).  
7. Enviar alertas según rol: gerenciales a gerentes y líderes, tareas a operativos (Claudia).

### Hito 7\. Confianza y medición

* Comparar lo sugerido por el sistema, lo decidido por el usuario y lo que finalmente ocurrió (Claudia).  
* Mostrar qué porcentaje de las recomendaciones se aprueba sin cambios (Claudia).  
* Planear un piloto continuo de \~1 mes con empresas de prueba (3 y 6 meses como horizontes siguientes) (Claudia).

### Hito 8\. Implementación y posicionamiento

* Diagnóstico inicial por empresa: quién carga, analiza, aprueba y compra; registrar cargo y rol de cada usuario (Claudia).  
* Mensajes por perfil: a operativos, menos trabajo manual; a gerencia, control, alertas y mejores decisiones (Claudia).  
* Revisar el segmento objetivo: definirlo por nivel de ventas y no por número de empleados (María Luisa).  
* Evaluar un subtítulo o eslogan, porque el nombre SINESC no comunica qué hace la app (María Luisa).

## Prioridad baja – Evolución futura

### Hito 9\. Analítica de negocio

* Dashboard de margen vs. rotación para depurar el catálogo y cuidar productos de alto margen y alta rotación (Luis Carlos).  
* Apoyar un costeo correcto (proveedor, transporte, bodegaje, administración) antes de mostrar rentabilidad (Luis Carlos).  
* Convertir "Dinero quieto" en acciones comerciales: promociones, descuentos, uso en proyectos o bajas (Claudia).  
* Módulo de analítica comercial: clientes que más compran, que dejaron de comprar y picos de consumo (Claudia).

### Hito 10\. Escenarios avanzados y automatización

* Varios puntos de venta: bodega central e inventarios satélite por tienda, pedido por tienda y codificación uniforme (Luis Carlos).  
* Importados: distinguir importador directo de distribuidor; costos en moneda extranjera y tiempos de entrega más largos (Luis Carlos, Orlando).  
* Mismo producto con varios proveedores: considerar plazo de pago (30/60/75–80 días), convenio, disponibilidad, costo y tiempo de entrega (Orlando, Luis Carlos).  
* Unidad de compra distinta a la de venta (compra a granel, venta en bolsas de 200/500) (Orlando).  
* IA para ajustarse a las particularidades de cada negocio, con salvedades en el informe (Jose).  
* Evaluar la lectura automática de una carpeta local con los archivos de entradas y salidas (Jose).

## Fortalezas a conservar

* Resumen "Tu inventario hoy" con gráficos: qué se agota, qué pedir ya y dinero quieto (María Luisa).  
* El "número para explicarle a tu jefe" como sustento del pedido (María Luisa).  
* Comentarios por producto y PDF claro, listo para enviar al proveedor (María Luisa).