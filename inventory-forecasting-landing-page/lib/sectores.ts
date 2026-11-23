// Los sectores que elige la empresa en Mi empresa. Copia de SECTORES en server/noticias.js (ids y
// etiquetas): si cambias una, cambia la otra. test/noticias.test.js revisa que coincidan.
export const SECTORES = [
  { id: 'alimentos', etiqueta: 'Alimentos y bebidas' },
  { id: 'salud', etiqueta: 'Salud y cosméticos' },
  { id: 'construccion', etiqueta: 'Construcción y ferretería' },
  { id: 'hogar', etiqueta: 'Muebles y hogar' },
  { id: 'textil', etiqueta: 'Textil y confección' },
  { id: 'tecnologia', etiqueta: 'Tecnología y electrónicos' },
  { id: 'otro', etiqueta: 'Otro' },
] as const
