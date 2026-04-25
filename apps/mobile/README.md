# Al-Ruya Mobile

Expo + React Native field app for sales reps and managers. Talks to the
ERP API over JWT (token stored in `expo-secure-store`).

## Run

```bash
cd apps/mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` to point at the API. On Android emulator the
default `http://10.0.2.2:3000` resolves to the host machine.

## Screens

- **Login** — JWT auth
- **Home** — tile launcher
- **Orders** — sales orders list
- **Customers** — customer directory

WatermelonDB is wired in dependencies for offline-first sync once the
schema bridges land in a follow-up.
