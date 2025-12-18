# Lave Propre & Service — App Horaires V2 (définitive + V2 demandée)

✅ Inclus dans cette V2 :
- Création / modification / suppression des quarts **dans l’interface**
- **Drag & Drop** : déplacer un quart vers un autre jour (mise à jour DB)
- Calcul automatique **heures + paie** (taux horaire par employé)
- Notifications email (optionnel via SMTP) lors de création/modification (sinon log console)
- Multi-sites + permissions : rôles **ADMIN / SUPERVISOR / EMPLOYEE**
  - Admin : tout gérer
  - Supervisor : gérer les quarts **uniquement** des sites assignés
  - Employé : voir ses quarts + **confirmer** son quart

## Prérequis
- Node.js 18+
- npm

## Installation (local)
### 1) Backend
```bash
cd server
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```
Backend: http://localhost:4000

### 2) Frontend
```bash
cd ../client
npm install
npm run dev
```
Frontend: http://localhost:5173

## Comptes de démo (seed)
- Admin : admin@lavepropre.ca / Admin!1234
- Superviseur : sup@lavepropre.ca / Supervisor!1234
- Employé : employe1@lavepropre.ca / Employe!1234

## SMTP (notifications email - optionnel)
Configurer dans `server/.env` :
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

---
© 2025 Lave Propre & Service
