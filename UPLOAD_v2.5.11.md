# TERYAQ Master Tool v2.5.11 — deployment and review

## Deploy

1. Replace the repository files with the complete contents of this release folder.
2. Commit and deploy to Render. Open the app online once on each installed device so the service worker caches the new version. The Dashboard should show v2.5.11.
3. No new SQL migration or Edge Function change is required.

## Review

1. Create a **Shooting Script**. It should open without the scientific Draft information step and show **File**, **Text Formatting**, **Script Cues**, and **Teleprompter**.
2. Add spoken lines, select a word for **تشديد**, insert **تعليمات لا تُقرأ**, **سكوت**, and **×2**. Use **+ Spoken line** after a cue. Test RTL/LTR, Aa, B, I, U, three bullet levels, and numbering.
3. Open Teleprompter. Unspoken instructions should be hidden, ×2 should repeat the following spoken line for reading, and Play should pause at **سكوت** until Play is pressed again. Adjust speed, reading region, bars, text size, line spacing, light/dark, and fullscreen.
4. Edit spoken text inside Teleprompter and return to Text Formatting. Confirm the same change is in the script. Save, reopen, and confirm cues, formatting, and Teleprompter settings persist; verify File export and History.
5. Open a Scientific Draft text and figure document to confirm their existing tools remain available.
