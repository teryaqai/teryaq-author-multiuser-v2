# TERYAQ Master Tool v2.7.2

Upload the contents of this ZIP as one complete release. Do not mix files from earlier versions. The dashboard should show **v2.7.2** after reload.

## Supabase

No new migration is required. Existing migrations **001–017** must be installed for Course Progress and Submission Forms. This update changes only the client interface and icons.

## Check after upload

1. Reload the website or installed app and check the navy/cream palette, supplied navy logo, and v2.7.2 badge.
2. Open Course Progress → Workflow Map. Choose a chapter with a workflow; check that approved, in-progress, review, ready, and blocked states are distinct. Selecting a card should show its owner and open its task.
3. On a narrow screen, scroll the map horizontally and confirm the cards and arrows remain separated.
4. In Profile, check the Sign out icon. Test local Save and cloud Sync on a real account.

The package passed static validation, JavaScript syntax checks, and geometry checks against the 32-step default workflow. Live Supabase, authenticated browser and device tests must still be completed on the deployed project.
