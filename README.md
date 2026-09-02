# Quinn Discovery Engine (Marklinea)

Serverless discovery agent for the Qapita demo. One endpoint: `POST /api/discovery`.

## Deploy (Vercel, ~5 minutes, no CLI)
1. Push this folder to a GitHub repo (e.g. `quinn-engine`).
2. vercel.com → Add New → Project → Import that repo → Deploy (defaults are fine).
3. Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`).
   Optional: `MODEL` (default claude-sonnet-4-5 / gpt-4o-mini).
4. Deployments → Redeploy (so the env var is picked up).
5. Your endpoint: `https://<project>.vercel.app/api/discovery`

## Test
```bash
curl -s -X POST https://<project>.vercel.app/api/discovery -H 'Content-Type: application/json' \
  -d '{"mode":"chat","stage":"discovery","email":"a@b.com","page":"/pricing","known":{},"transcript":[{"r":"Quinn","t":"What are you using for your cap table today?"}],"latest":"we use spreadsheets but it is a mess"}'
```
Expect JSON: `{"reply":"...","bant":{...},"slide":"captable"|null,"offer_slots":false,"done":false}`
