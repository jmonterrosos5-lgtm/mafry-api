# MAFRY API

API REST para la gestión de vendedores de ruta de Industria de Alimentos MAFRY.

## Tecnologías
- Node.js + Express
- PostgreSQL 16
- JWT Authentication
- Docker

## Requisitos
- Node.js 18+
- PostgreSQL 16
- npm

## Instalación local

```bash
git clone https://github.com/jmonterrosos5-lgtm/mafry-api.git
cd mafry-api
npm install
cp .env.example .env
# Editar .env con tus credenciales
npm run dev
```

## Con Docker

```bash
docker-compose up -d
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Iniciar sesión |
| GET | /api/clientes | Listar clientes |
| GET | /api/visitas | Listar visitas |
| GET | /api/pedidos | Listar pedidos |
| POST | /api/pedidos | Crear pedido |
| GET | /api/productos | Listar productos |
| GET | /api/cobros | Listar cobros |
| POST | /api/cobros | Registrar cobro |
| GET | /api/vendedores | Listar vendedores (admin) |

## Autenticación
Todos los endpoints requieren header:


## Equipo
Universidad Mariano Gálvez de Guatemala — Ingeniería en Sistemas
