// Optional Custom GPT Actions bridge. Scheduling itself stays inside ChatGPT.
export function actionsSchema(server) {
  const response = { description: 'JSON result', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } };
  return {
    openapi: '3.1.0', info: { title: 'Vesper assistant', version: '2.3.0', description: 'Read personal calendar context and save a daily briefing. Does not create ChatGPT scheduled tasks.' },
    servers: [{ url: server }], security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    paths: {
      '/api/actions/briefing': { get: { operationId: 'get_current_briefing', description: 'Read current events, conflicts, deadlines, tasks and project context. Call again on every run.', parameters: [], responses: { 200: response } } },
      '/api/actions/daily-briefing': { post: { operationId: 'save_daily_briefing', description: 'Replace the daily briefing shown under the bell in Vesper.', 'x-openai-isConsequential': true,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { markdown: { type: 'string', minLength: 1, maxLength: 50000 } }, required: ['markdown'], additionalProperties: false } } } }, responses: { 200: response } } },
    },
  };
}
