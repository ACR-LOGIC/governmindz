# GitHub Copilot Directive: Remove DEMO_SUMMARY.txt from Repository

## Instructions for Copilot

**Objective:** Remove the commit "docs: add demo summary cheat sheet" (commit b4fbdfb) from the GitHub repository governmindz.

**Background:** 
- The file `DEMO_SUMMARY.txt` was accidentally committed and pushed
- Local revert commit `60bc7fd` exists but cannot be pushed due to branch protection rules
- Need to create a PR to remove it properly

**Steps for Copilot:**

1. **Create a new branch:**
   ```powershell
   cd C:\Users\omg\governmindz
   git checkout -b remove/demo-summary
   ```

2. **Push the revert commit to the new branch:**
   ```powershell
   git push origin remove/demo-summary
   ```

3. **Create a Pull Request on GitHub:**
   - Go to: https://github.com/ACR-LOGIC/governmindz
   - Click "Compare & pull request" for the `remove/demo-summary` branch
   - Title: "Remove accidentally committed DEMO_SUMMARY.txt"
   - Description: "Removes DEMO_SUMMARY.txt which was committed in error. This file should not be in the repository."
   - Set target branch: `main`
   - Create the PR

4. **Merge the PR:**
   - Approve the PR
   - Merge using "Squash and merge" or "Create a merge commit"
   - Delete the `remove/demo-summary` branch after merge

5. **Verify locally:**
   ```powershell
   git pull origin main
   git log --oneline | Select-Object -First 5
   ```
   Confirm `DEMO_SUMMARY.txt` is no longer in the repository.

**Expected Result:**
- `DEMO_SUMMARY.txt` removed from main branch
- Commit history shows the revert
- Repository clean and ready for demo

---

## Files That Should Remain

These demo materials should **stay** in the repository:
- ✅ `MASTER_JUDGE_GUIDE.md`
- ✅ `JUDGE_DEMO_QUICK_REFERENCE.md`
- ✅ `COPY_PASTE_DEMO_COMMANDS.md`
- ✅ `ADVANCED_TEST_SCENARIOS.md`
- ✅ `JUDGE_DEMO_PACKAGE.md`
- ✅ `README-HACKATHON.md`
- ✅ `HACKATHON_SETUP_COMPLETE.md`
- ✅ `SUBMISSION_CHECKLIST.md`
- ✅ `ZETARIS_DATA_INVENTORY.md`

Only `DEMO_SUMMARY.txt` should be removed.
