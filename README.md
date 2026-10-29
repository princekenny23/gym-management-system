# Primex Gym Management System

The project is split into `frontend/` (Next.js) and `backend/` (Django REST Framework). PostgreSQL is the source of truth; the browser does not seed or persist sample records.

## Local setup

Requirements: Node.js/npm, Python 3.11 or newer, and PostgreSQL running locally.

1. Create a PostgreSQL database named `primegym` if it does not already exist.
2. Copy `backend/.env.example` to `backend/.env`, then set the database password and a private Django secret key. Keep this file local; it is ignored by Git.
3. From the project root, install and start the backend:

   ```powershell
   py -3 -m venv backend\.venv
   backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
   backend\.venv\Scripts\python.exe backend\manage.py migrate
   backend\.venv\Scripts\python.exe backend\manage.py createsuperuser
   backend\.venv\Scripts\python.exe backend\manage.py runserver 0.0.0.0:8000
   ```

   The first administrator is provisioned with Django's `createsuperuser` command. Do not use shared or demo credentials.
4. In a separate terminal, install and start the frontend:

   ```powershell
   Set-Location frontend
   Copy-Item .env.local.example .env.local
   npm install
   npm run dev
   ```

   Configure `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to point to the Django API, normally `http://127.0.0.1:8000/api`. When a browser accesses the frontend by localhost or a LAN IP, a loopback API URL is automatically changed to that same browser hostname so session cookies remain same-site.

The API persists members, plans, memberships, payments, attendance, and gym settings. Snapshot writes use a database transaction; payment and attendance records are append-only, and membership balances must reconcile with recorded payments. Administrators can manage plans, gym settings, and staff. Receptionists can record operational data. Django enforces these permissions; hiding UI links is not the security boundary.

Staff accounts can be created or disabled from the administrator-only **Staff & Users** page. Existing membership and membership-plan routes redirect to the tabs under **Members**.

## Development network access

The Next.js development server permits HMR requests from the configured LAN origin `192.168.1.227`. Update `allowedDevOrigins` in `frontend/next.config.ts` if your development machine receives a different LAN address. The Django `FRONTEND_ORIGIN`, `CSRF_TRUSTED_ORIGINS`, and `DJANGO_ALLOWED_HOSTS` settings must also include the exact frontend/backend origins and hostnames you use.

## Deployment

The deployment uses a Render PostgreSQL database and Django API, with the Next.js frontend hosted on Vercel. The root `render.yaml` defines the Render services. Connect the project repository to both platforms before starting.

1. In Render, create a **Blueprint** from the repository and apply `render.yaml`. This creates the PostgreSQL database and Django web service. Wait for the API service to deploy; its URL is `https://primegym-api.onrender.com`.
2. In Vercel, import the same repository and set **Root Directory** to `frontend`. Keep the detected Next.js framework and build settings. Add this environment variable for **Production**, **Preview**, and **Development**:

   ```text
   NEXT_PUBLIC_API_URL=/api
   DJANGO_API_URL=https://primegym-api.onrender.com
   ```

   The Next.js rewrite proxies `/api` requests through the frontend domain, so browser session cookies remain first-party. Deploy the frontend and note its canonical HTTPS domain (for example, `https://your-project.vercel.app`).
3. In the Render service's environment settings, replace `https://your-project.vercel.app` in both `FRONTEND_ORIGIN` and `CSRF_TRUSTED_ORIGINS` with the exact Vercel frontend origin. Include any custom domain used by the frontend as an additional comma-separated origin in both settings. Redeploy the API after changing these values.
4. In Render, create the first administrator using the service's Shell:

   ```text
   python manage.py createsuperuser
   ```

   Use a unique password and keep it private. Do not create shared or demo credentials.
5. Confirm the API responds at `https://primegym-api.onrender.com/api/public/branding/`, then sign in through the Vercel site. Configure database backups in Render before relying on production data.

The API is configured to allow only the origins supplied by its deployment environment, use secure cross-site cookies over HTTPS, and serve Django static files with WhiteNoise. Never enable `DJANGO_DEBUG` on a public service or commit production secrets. If the Render service name or domain is changed, update `DJANGO_ALLOWED_HOSTS` accordingly. Vercel preview deployments use different origins; add a preview origin explicitly if preview builds need API access.
