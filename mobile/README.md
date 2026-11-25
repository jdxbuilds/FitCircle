# FitCircle mobile app

The member and instructor app for iOS and Android, built with Expo (React Native, TypeScript, Expo Router). It talks to the API in `../backend`.

## What's in it

**Members**
- Sign up or sign in with a 6-digit SMS code, profile and goals, member terms (accept unlocks after scrolling to the end).
- The four formats: create a **Peer Group**, build a **Custom 75-Day**, join an **Instructor Challenge**, or join an open **FitCircle Challenge**. Join a group with an invite code.
- Pay a stake or entry fee by **M-Pesa** (PIN prompt, then the app waits for confirmation) or **card** (Flutterwave checkout).
- Log a session with same-day photo or video proof from the camera. It goes straight to storage, then shows your streak with confetti.
- Leaderboard with nudges, proof feed with flagging, reminders and alerts.
- Finished challenges show the settlement, your payout and the **challenge winner**, with confetti.
- The monthly **jackpot**: this month's sponsored prize, the ranking, and a reveal of last month's winner, with confetti.

**Instructors**
- Accept the instructor terms, create a profile, upload certification, ID and a demo video for verification.
- Dashboard: 65% share, running programmes, logged today and at risk, flags to review, monthly earnings and payouts.
- Launch a programme, post the day's plan to everyone in it, and uphold or dismiss flagged proof.

## Code layout

```
src/app/            Screens (every file is a route)
  welcome, start, phone, signup, terms, format     sign-up and onboarding
  home, discover, jackpot, alerts, profile         member tabs
  create/peer, create/custom75, browse/[type], join
  challenge/[id]/   index (details, start, settle), pay, log, board
  coach/            index (dashboard), apply, new, plan, flags
src/components/     Shared UI: buttons, cards, hero, confetti, tab bar, leaderboard
src/content/terms.ts  Terms text (copied from the prototype, matches the Word documents)
src/lib/            API client, sign-in state, theme, types
```

## Run it on your computer

1. Start MySQL and the API (see `../backend/README.md`). In development the API texts nothing: the sign-in code is filled in for you, and M-Pesa payments can be simulated.
2. Install and start the app:

   ```bash
   cd mobile
   npm install
   EXPO_PUBLIC_API_URL=http://<your computer's local IP>:3000 npx expo start
   ```

   Scan the QR code with **Expo Go** on your phone (same Wi-Fi). On a phone, `localhost` means the phone itself, so use your computer's IP address. Press `w` to open the web preview instead.

Check your changes with `npm run typecheck`.

## Build for the App Store and Google Play

Builds run in Expo's cloud (EAS), so no Mac or Android Studio is needed:

```bash
npm install -g eas-cli
eas login
eas build --profile preview --platform android   # an installable test APK
eas build --profile production --platform all    # store builds
eas submit --platform ios                         # needs an Apple Developer account ($99/year)
eas submit --platform android                     # needs a Google Play account ($25 once)
```

The API address for each build is set in `eas.json` (`EXPO_PUBLIC_API_URL`). Update it once the API is live on AWS.
