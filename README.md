# espero-que-web-final-

## Deploy en Cloudflare Pages

Este proyecto quedó preparado como **sitio estático** (sin funciones serverless).

### Build settings
- **Framework preset:** None
- **Build command:** _(vacío)_
- **Build output directory:** `/`

### Variables de entorno (inyectadas en runtime)
En Cloudflare Pages → _Settings_ → _Environment Variables_, definir:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ADMIN_PASSWORD`
- `BUSINESS_WHATSAPP`

Y exponerlas en un snippet global antes de `</head>` (o con un include de Cloudflare):

```html
<script>
  window.__SUPABASE_URL__ = 'https://TU-PROYECTO.supabase.co';
  window.__SUPABASE_ANON_KEY__ = 'TU_ANON_KEY';
  window.__ADMIN_PASSWORD__ = 'tu-clave-admin';
  window.__BUSINESS_WHATSAPP__ = '54911...';
</script>
```

## Notas
- El frontend (`index.html`) y el admin (`admin.html`) leen datos **solo desde Supabase REST**.
- Se eliminó configuración y funciones de Netlify.
