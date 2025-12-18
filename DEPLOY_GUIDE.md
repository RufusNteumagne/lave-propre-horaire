# Déploiement en ligne (Vercel + Render + Supabase) — Lave Propre & Service

Ce dossier est une variante **CLOUD** de l’app V2 : DB PostgreSQL + URL API configurable.

## 0) Mettre le code sur GitHub
1. Crée un dépôt GitHub (ex: `lps-horaires`)
2. Uploade tout le contenu de ce dossier (CLOUD) dans le dépôt

---

## 1) Créer la base de données (Supabase)
1. Crée un projet Supabase
2. Va dans **Database → Connect**
3. Copie la **connection string** Postgres
4. Assure-toi qu’elle inclut `sslmode=require`

Variable à utiliser :
- `DATABASE_URL` = ta connection string Supabase

---

## 2) Déployer le backend (Render)
1. Render → New → **Web Service**
2. Connecte ton dépôt GitHub
3. Root Directory : **server**
4. Paramètres :
   - Build Command : `npm install && npm run prisma:deploy`
   - Start Command : `npm start`
5. Ajoute les Environment Variables :
   - `DATABASE_URL` (Supabase)
   - `JWT_SECRET` (une longue phrase secrète)
   - (optionnel) SMTP_* si tu veux les emails

6. Deploy. Tu obtiens une URL :
- `https://xxxxx.onrender.com`

Test :
- `GET /health` doit répondre `{"ok": true}`

---

## 3) Déployer le frontend (Vercel)
1. Vercel → New Project → Import ton dépôt GitHub
2. Root Directory : **client**
3. Ajoute l’Environment Variable :
   - `VITE_API_BASE` = l’URL Render (ex: `https://xxxxx.onrender.com`)
4. Deploy

Tu obtiens une URL du type :
- `https://lps-horaires.vercel.app`

---

## 4) Comptes de démo
Les comptes de démo sont créés par `npm run seed`.

Option simple :
- Une seule fois sur ton PC :
  - `cd server`
  - `cp .env.example .env` puis mets ta vraie `DATABASE_URL`
  - `npm install`
  - `npm run prisma:deploy`
  - `npm run seed`

---
© 2025 Lave Propre & Service
