# Environment Setup

This extension requires API keys to function. Follow these steps to set up your environment:

## 1. Copy the example environment file

```bash
cp .env.example .env
```

## 2. Add your API keys to `.env`

Open `.env` and replace the placeholder values with your actual API keys:

```env
VITE_ANTHROPIC_API_KEY=your_actual_anthropic_key_here
VITE_GEMINI_API_KEY=your_actual_gemini_key_here
```

## 3. Get API Keys

### Anthropic API Key (Required)
- Sign up at: https://console.anthropic.com/
- Navigate to API Keys section
- Create a new API key
- Copy the key (starts with `sk-ant-api03-...`)

### Google Gemini API Key (Required)
- Sign up at: https://makersuite.google.com/app/apikey
- Create a new API key
- Copy the key (starts with `AIza...`)

## 4. Build the extension

```bash
npm install
npm run build
```

## ⚠️ Security Notes

- **NEVER** commit your `.env` file to git
- **NEVER** share your API keys publicly
- The `.env` file is already in `.gitignore` to prevent accidental commits
- If you accidentally commit API keys, **immediately** revoke them and create new ones

## Cost Estimates

With the current optimization (30s polling, 60s vision checks):
- 6 hours/day usage = ~360 vision API calls/day
- Monthly cost: ~$5-6 (using Claude Haiku model)

See the main README for more cost optimization options.
