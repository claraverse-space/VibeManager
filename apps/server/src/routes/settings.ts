import { Hono } from 'hono';
import { llmVerifier } from '../services/runners/LLMVerifier';

const settings = new Hono();

// Get verifier settings
settings.get('/verifier', async (c) => {
  const config = await llmVerifier.getConfig();
  // Don't expose full API key, just show if it's set
  return c.json({
    success: true,
    data: {
      ...config,
      apiKey: config.apiKey ? '••••••••' + config.apiKey.slice(-4) : '',
      hasApiKey: !!config.apiKey,
    },
  });
});

// Update verifier settings
settings.put('/verifier', async (c) => {
  const body = await c.req.json();

  // Validate
  const updates: Record<string, unknown> = {};

  if (typeof body.enabled === 'boolean') {
    updates.enabled = body.enabled;
  }
  if (typeof body.apiUrl === 'string' && body.apiUrl) {
    updates.apiUrl = body.apiUrl.replace(/\/$/, ''); // Remove trailing slash
  }
  if (typeof body.apiKey === 'string') {
    // Only update if not masked value
    if (!body.apiKey.startsWith('••••')) {
      updates.apiKey = body.apiKey;
    }
  }
  if (typeof body.model === 'string' && body.model) {
    updates.model = body.model;
  }
  if (typeof body.maxTokens === 'number' && body.maxTokens > 0) {
    updates.maxTokens = body.maxTokens;
  }

  try {
    await llmVerifier.saveConfig(updates);
    const config = await llmVerifier.getConfig();
    return c.json({
      success: true,
      data: {
        ...config,
        apiKey: config.apiKey ? '••••••••' + config.apiKey.slice(-4) : '',
        hasApiKey: !!config.apiKey,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Test verifier connection
settings.post('/verifier/test', async (c) => {
  const config = await llmVerifier.getConfig();

  if (!config.enabled || !config.apiKey) {
    return c.json({
      success: false,
      error: 'Verifier not configured. Enable it and add an API key first.',
    });
  }

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 10,
        messages: [
          { role: 'user', content: 'Say "ok"' },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({
        success: false,
        error: `API returned ${response.status}: ${error.slice(0, 200)}`,
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return c.json({
      success: true,
      data: { message: `Connection successful! Response: "${content}"` },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: `Connection failed: ${error}`,
    });
  }
});

export default settings;
