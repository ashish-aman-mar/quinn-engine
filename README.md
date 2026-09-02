# Quinn Discovery Engine (Marklinea)

Serverless discovery agent for the Qapita demo. One endpoint: `POST /api/discovery`.

## Deploy (Vercel, ~5 minutes, no CLI)
1. Push this folder to a GitHub repo (e.g. `quinn-engine`).
2. vercel.com → Add New → Project → Import that repo → Deploy (defaults are fine).
3. Project → Settings → Environment Variables (own sidebar entry; or search "Environment Variables"). For GPT-5.1 on Azure AI Foundry add:
   - `AZURE_OPENAI_ENDPOINT` = `https://marklinea-developer.services.ai.azure.com/openai/v1/responses`
   - `AZURE_OPENAI_API_KEY` = your Azure key
   - `MODEL` = `gpt-5.1` (the deployment name)
   - optional `REASONING` = `low` (or `minimal` for speed)
   (Alternatives: `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`.)
4. Deployments → Redeploy (so the env var is picked up).
5. Your endpoint: `https://<project>.vercel.app/api/discovery`

## Test
```bash
curl -s -X POST https://<project>.vercel.app/api/discovery -H 'Content-Type: application/json' \
  -d '{"mode":"chat","stage":"discovery","email":"a@b.com","page":"/pricing","known":{},"transcript":[{"r":"Quinn","t":"What are you using for your cap table today?"}],"latest":"we use spreadsheets but it is a mess"}'
```
Expect JSON: `{"reply":"...","bant":{...},"slide":"captable"|null,"offer_slots":false,"done":false}`
