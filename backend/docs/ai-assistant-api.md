# AI Assistant API

Authentication: `Bearer <JWT>` via the `Authorization` header. All endpoints below are student-facing for version 1.

## Base Path

`/api/ai-assistant`

## Endpoints

### 1. Create or Get Conversation

`POST /conversations/resolve`

Request body:

```json
{
  "lectureId": "66c8..."
}
```

Response:

```json
{
  "message": "Conversation resolved successfully",
  "conversation": {},
  "messages": []
}
```

### 2. Get Conversation History

`GET /conversations/:conversationId/history?page=1&limit=20`

Response:

```json
{
  "message": "Conversation history loaded successfully",
  "conversation": {},
  "messages": [],
  "pagination": {}
}
```

### 3. Send Message

`POST /conversations/:conversationId/messages`

Request body:

```json
{
  "content": "Explain recursion with an example.",
  "messageType": "text",
  "promptType": "educational"
}
```

`promptType` is optional and can be one of:

- `system`
- `conversation`
- `educational`
- `programming`
- `quiz`
- `summary`

### 4. Get All Student Conversations

`GET /conversations?page=1&limit=20&includeArchived=false`

### 5. Clear Conversation Messages

`DELETE /conversations/:conversationId/messages`

This removes all message documents while keeping the conversation record.

### 6. Delete Conversation

`DELETE /conversations/:conversationId`

This performs a soft delete and preserves history for future restoration.

## Error Handling

All endpoints return structured JSON errors such as:

```json
{
  "message": "Validation failed",
  "errors": [
    {
      "msg": "Valid lecture ID is required",
      "param": "lectureId"
    }
  ]
}
```

## Notes

- Conversations are unique per student per lecture.
- Groq integration is isolated in `services/groqService.js`.
- Prompt templates are isolated in `utils/aiPromptBuilder.js`.
