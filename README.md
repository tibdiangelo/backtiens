# Backend · Productos Naturales Tiens Colombia

API REST en Node.js + Express con base de datos SQLite (better-sqlite3) para la tienda de productos naturales Tiens.

## Requisitos

- Node.js 20 o superior
- npm 10 o superior

## Puesta en marcha

```bash
cd backend
npm install
cp .env.example .env      # en Windows: copy .env.example .env
npm run seed              # crea la base, catálogo de ejemplo y usuarios
npm run dev               # API en http://localhost:4000
```

`npm run seed` es idempotente: puedes ejecutarlo varias veces sin duplicar productos, categorías ni banners.

### Cuentas creadas por el seed

| Rol      | Correo               | Contraseña       |
| -------- | -------------------- | ---------------- |
| Admin    | `admin@tiens.com`    | `Admin123456`    |
| Operador | `operador@tiens.com` | `Operador123456` |

Cambia estos valores en `.env` antes de desplegar y usa contraseñas de al menos 8 caracteres.

## Variables de entorno

| Variable                 | Descripción                                                     | Por defecto              |
| ------------------------ | --------------------------------------------------------------- | ------------------------ |
| `PORT`                   | Puerto del servidor                                             | `4000`                   |
| `NODE_ENV`               | Entorno (`development` / `production`)                          | `development`            |
| `CORS_ORIGIN`            | Origen(es) permitidos, separados por coma                        | `http://localhost:5173`  |
| `JWT_SECRET`             | Clave para firmar tokens; cámbiala en producción                | `dev-secret-change-me`   |
| `JWT_EXPIRES_IN`         | Duración del token                                              | `7d`                     |
| `DATABASE_PATH`          | Ruta del archivo SQLite                                         | `./data/tienda.db`       |
| `UPLOAD_DIR`             | Carpeta pública de imágenes de productos y banners              | `./uploads`              |
| `PRIVATE_DIR`            | Carpeta privada de comprobantes de pago                         | `./private`              |
| `SEED_*`                 | Datos de las cuentas creadas por el seed                        | ver `.env.example`       |
| `BUSINESS_WHATSAPP`      | Número de WhatsApp del negocio (solo dígitos, con indicativo)   | `573001234567`           |

Para producción define al menos `NODE_ENV=production`, `JWT_SECRET` fuerte y `CORS_ORIGIN` con el dominio real del frontend (puedes listar varios separados por coma).

## Scripts

| Comando          | Acción                                                    |
| ---------------- | --------------------------------------------------------- |
| `npm run dev`    | Servidor con recarga automática (nodemon)                 |
| `npm start`      | Servidor en modo normal                                   |
| `npm run migrate`| Aplica el esquema SQL sobre la base existente             |
| `npm run seed`   | Datos iniciales: usuarios, categorías, productos, banners |

## Estructura

```
backend/
├─ src/
│  ├─ config/         # entorno y conexión SQLite
│  ├─ db/             # esquema, migraciones y seed
│  ├─ middleware/     # autenticación, validación, uploads, errores
│  ├─ repositories/   # acceso a datos
│  ├─ routes/         # endpoints públicos, de cliente y de admin
│  ├─ services/       # lógica de pedidos, stock y comprobantes
│  └─ server.js       # arranque de Express
├─ data/              # base de datos (no versionada)
├─ uploads/           # imágenes públicas (no versionadas)
└─ private/           # comprobantes de pago (no versionados)
```

## API

- `GET /api/health` — estado del servicio.
- `GET /api/products`, `/api/categories`, `/api/banners`, `/api/payment-info` — catálogo público.
- `/api/auth/*` — registro, login y sesión.
- `/api/orders/*` — creación de pedidos, seguimiento y reenvío de comprobante.
- `/api/profile`, `/api/my-orders` — datos del cliente autenticado.
- `/api/admin/*` — pedidos, catálogo, banners, clientes, configuración y exportación CSV (roles `admin` y `operador`).

Los comprobantes de pago se guardan en `private/` y solo se sirven a usuarios autenticados con permisos.

## Notas

- `uploads/` y `private/` nunca deben versionarse; `.gitignore` ya los excluye.
- El backend no sirve el frontend: son dos proyectos independientes que se comunican por HTTP.
- La API responde con `Cache-Control: no-store` para evitar datos obsoletos en el catálogo.
