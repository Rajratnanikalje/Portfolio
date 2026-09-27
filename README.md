# Portfolio

A content-managed developer portfolio with a React/Vite frontend, Express API, MongoDB persistence, administrator dashboard, and server-side Cloudinary uploads.

## Architecture

- `client/`: React, Vite, React Router, Framer Motion, Axios.
- `server/`: Express 5 API, Mongoose models, JWT admin auth, Cloudinary upload integration.
- Public content is read from `/api`; protected content management APIs are under `/api/admin`.
- MongoDB is only accessed by the backend. Secrets are only read from server environment variables.

## Setup

Install dependencies in each existing package directory (dependencies are intentionally not duplicated at the root):

```sh
cd server && npm install
cd ../client && npm install
```

Copy `server/.env.example` to `server/.env` and fill in the server settings. The existing `server/.env` should be retained when upgrading an existing checkout. Copy `client/.env.example` to `client/.env.local` only if the API is not at `http://localhost:5000/api`.

### Environment variables

Server values: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.

Frontend value: `VITE_API_URL`. Never put server secrets in frontend environment files.

### MongoDB Atlas

Create a database and database user in Atlas, allow network access from the deployment host, and use the Atlas connection string as `MONGODB_URI`. The server checks connectivity during startup and exits on failure.

### Cloudinary

Create an account and set its cloud name, API key, and API secret on the server. Profile and project image files accept JPEG, PNG, WebP, or GIF up to 8 MB. Resume uploads accept PDF up to 8 MB. Uploads are signed on the server and never expose credentials to the browser.

### Administrator

On first startup the backend creates an administrator from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if that email is not already present. The password is bcrypt-hashed. Login is at `/admin/login`; successful sessions use a 12-hour JWT. To rotate an existing administrator password, update the admin record through a secure operational procedure rather than storing a raw password.

## Development and build

From the repository root:

```sh
npm run dev       # backend API
npm run client    # Vite frontend, in another terminal
npm run build     # production frontend build
npm start         # backend API
```

The client also supports `npm run dev`, `npm run build`, and `npm run preview` from `client/`. The backend supports `npm run dev` and `npm start` from `server/`.

## Content management

Sign in to `/admin/login` to manage profile and social links, projects, skills, experience, education, resume, and contact messages. Only published portfolio entries appear publicly. Content lists begin empty; no sample projects, employment, education, or statistics are seeded. Public project and social links open with safe external-link attributes.

## Deployment

Deploy the API and frontend separately or serve the built client from a static host. Set `CLIENT_URL` to the deployed frontend origin, configure `VITE_API_URL` at frontend build time, and provide the server environment variables in the hosting provider’s secret manager. Use HTTPS and restrict the Atlas network allowlist to the API host where practical.

## Security notes

- Keep `server/.env` private and out of version control.
- Use a long random `JWT_SECRET` and a unique strong administrator password.
- Admin APIs require a signed JWT; contact submissions cannot access admin functionality.
- File upload size and MIME type are checked on the server.
- Production errors return safe messages without stack traces.
