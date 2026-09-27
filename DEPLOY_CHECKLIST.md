# StenoPro Deployment Checklist

- [ ] Push project to GitHub
- [ ] Create Render service from `render.yaml`
- [ ] Set `ADMIN_EMAIL`
- [ ] Set a strong `ADMIN_PASSWORD`
- [ ] Set `FRONTEND_ORIGIN` to the final HTTPS origin
- [ ] Confirm `/health` returns `{"ok":true,"service":"stenopro"}`
- [ ] Log in as admin
- [ ] Upload one MP3 and verify playback
- [ ] Create a student account
- [ ] Complete one dictation
- [ ] Confirm result appears in History
- [ ] Confirm admin can see students/results
- [ ] Keep `.env` private
