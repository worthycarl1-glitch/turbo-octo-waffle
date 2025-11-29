# API Documentation - Agent Management System

Complete API documentation for the Agent Management System endpoints. These APIs enable creating, updating, and managing ElevenLabs Conversational AI agents from external UIs like Base44.

## Base URL

```
https://turbo-octo-waffle-production.up.railway.app
```

## Authentication

All endpoints require ElevenLabs API key to be configured on the server via `ELEVENLABS_API_KEY` environment variable.

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents` | Create new agent |
| GET | `/api/agents/:id` | Get single agent |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| POST | `/api/agents/:id/knowledge-base` | Upload KB file |
| GET | `/api/agents/:id/knowledge-base` | List KB files |
| DELETE | `/api/agents/:id/knowledge-base/:fileId` | Delete KB file |
| POST | `/api/agents/:id/clone` | Clone agent |

---

## Detailed Endpoint Documentation

### GET /api/agents

List all ElevenLabs Conversational AI agents.

#### Request

```http
GET /api/agents
```

#### Response

```json
{
  "success": true,
  "agents": [
    {
      "agentId": "agent_abc123xyz",
      "name": "Sales Agent",
      "voiceId": "4tRn1lSkEn13EVTuqb0g",
      "voiceName": "Serafina",
      "language": "en",
      "description": "Outbound sales calls with gatekeeper navigation",
      "createdAt": "2025-11-29T10:00:00.000Z"
    },
    {
      "agentId": "agent_def456uvw",
      "name": "Support Agent",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "voiceName": "Rachel",
      "language": "en",
      "description": "Customer support inquiries",
      "createdAt": "2025-11-28T15:30:00.000Z"
    }
  ],
  "defaultAgentId": "agent_abc123xyz",
  "count": 2,
  "timestamp": "2025-11-29T12:00:00.000Z"
}
```

#### Error Response

```json
{
  "success": false,
  "error": "ElevenLabs API key not configured",
  "agents": [],
  "timestamp": "2025-11-29T12:00:00.000Z"
}
```

---

### POST /api/agents

Create a new ElevenLabs Conversational AI agent.

#### Request

```http
POST /api/agents
Content-Type: application/json
```

```json
{
  "name": "Sales Agent",
  "description": "Outbound sales calls with gatekeeper navigation",
  "systemPrompt": "You are Sara, a professional sales representative for TechCorp. Your goal is to schedule demos with business owners. Be friendly, professional, and handle objections gracefully. If you reach a gatekeeper, politely ask to speak with the owner or decision maker.",
  "firstMessage": "Hi, this is Sara calling from TechCorp. May I please speak with the business owner?",
  "voiceId": "4tRn1lSkEn13EVTuqb0g",
  "language": "en",
  "isTemplate": true
}
```

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Agent display name |
| `description` | string | No | Agent description/purpose |
| `systemPrompt` | string | No | System instructions for the agent |
| `firstMessage` | string | No | Initial message the agent speaks |
| `voiceId` | string | No | ElevenLabs voice ID |
| `language` | string | No | Language code (default: 'en') |
| `isTemplate` | boolean | No | Mark as template for cloning |

#### Response (201 Created)

```json
{
  "success": true,
  "agent": {
    "agentId": "agent_xyz123abc",
    "name": "Sales Agent",
    "voiceId": "4tRn1lSkEn13EVTuqb0g",
    "voiceName": "Serafina",
    "language": "en",
    "description": "Outbound sales calls with gatekeeper navigation",
    "isTemplate": true,
    "createdAt": "2025-11-29T10:00:00.000Z"
  }
}
```

#### Error Responses

**400 Bad Request**
```json
{
  "success": false,
  "error": "Agent name is required"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "error": "ElevenLabs API error: 401 Unauthorized"
}
```

---

### GET /api/agents/:id

Get detailed configuration for a single agent.

#### Request

```http
GET /api/agents/agent_xyz123abc
```

#### Response

```json
{
  "success": true,
  "agent": {
    "agentId": "agent_xyz123abc",
    "name": "Sales Agent",
    "voiceId": "4tRn1lSkEn13EVTuqb0g",
    "voiceName": "Serafina",
    "language": "en",
    "description": "",
    "systemPrompt": "You are Sara, a professional sales representative...",
    "firstMessage": "Hi, this is Sara calling from TechCorp...",
    "createdAt": "2025-11-29T10:00:00.000Z"
  }
}
```

#### Error Responses

**404 Not Found**
```json
{
  "success": false,
  "error": "Agent not found"
}
```

---

### PUT /api/agents/:id

Update an existing agent's configuration.

#### Request

```http
PUT /api/agents/agent_xyz123abc
Content-Type: application/json
```

```json
{
  "systemPrompt": "Updated system prompt with new instructions...",
  "firstMessage": "Hello! This is the updated greeting...",
  "voiceId": "21m00Tcm4TlvDq8ikWAM"
}
```

#### Request Parameters

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Update agent name |
| `systemPrompt` | string | Update system instructions |
| `firstMessage` | string | Update initial message |
| `voiceId` | string | Update voice |
| `language` | string | Update language |

*Note: At least one valid field must be provided.*

#### Response

```json
{
  "success": true,
  "agent": {
    "agentId": "agent_xyz123abc",
    "name": "Sales Agent",
    "voiceId": "21m00Tcm4TlvDq8ikWAM",
    "voiceName": "Rachel",
    "language": "en",
    "systemPrompt": "Updated system prompt with new instructions...",
    "firstMessage": "Hello! This is the updated greeting...",
    "updatedAt": "2025-11-29T14:30:00.000Z"
  },
  "updatedFields": ["systemPrompt", "firstMessage", "voiceId"]
}
```

#### Error Responses

**400 Bad Request**
```json
{
  "success": false,
  "error": "No valid update fields provided",
  "validFields": ["name", "systemPrompt", "firstMessage", "voiceId", "language"]
}
```

**404 Not Found**
```json
{
  "success": false,
  "error": "Agent not found"
}
```

---

### DELETE /api/agents/:id

Delete an agent from ElevenLabs.

#### Request

```http
DELETE /api/agents/agent_xyz123abc
```

#### Response

```json
{
  "success": true,
  "message": "Agent deleted successfully",
  "agentId": "agent_xyz123abc"
}
```

#### Error Responses

**404 Not Found**
```json
{
  "success": false,
  "error": "Agent not found"
}
```

---

### POST /api/agents/:id/knowledge-base

Upload a knowledge base file to an agent.

#### Request

```http
POST /api/agents/agent_xyz123abc/knowledge-base
Content-Type: multipart/form-data
```

Form fields:
- `file`: The file to upload (max 10MB)

#### cURL Example

```bash
curl -X POST \
  https://turbo-octo-waffle-production.up.railway.app/api/agents/agent_xyz123abc/knowledge-base \
  -F "file=@sales_pitch.txt"
```

#### Response (201 Created)

```json
{
  "success": true,
  "file": {
    "fileId": "kb_file_123abc",
    "fileName": "sales_pitch.txt",
    "fileSize": 2048,
    "uploadedAt": "2025-11-29T10:00:00.000Z"
  }
}
```

#### Error Responses

**400 Bad Request**
```json
{
  "success": false,
  "error": "File is required"
}
```

**404 Not Found**
```json
{
  "success": false,
  "error": "Agent not found"
}
```

**413 Payload Too Large**
```json
{
  "success": false,
  "error": "File size exceeded limit"
}
```

---

### GET /api/agents/:id/knowledge-base

List all knowledge base files for an agent.

#### Request

```http
GET /api/agents/agent_xyz123abc/knowledge-base
```

#### Response

```json
{
  "success": true,
  "files": [
    {
      "fileId": "kb_file_123abc",
      "fileName": "sales_pitch.txt",
      "fileSize": 2048,
      "fileType": "text/plain",
      "uploadedAt": "2025-11-29T10:00:00.000Z"
    },
    {
      "fileId": "kb_file_456def",
      "fileName": "objection_rebuttals.pdf",
      "fileSize": 15360,
      "fileType": "application/pdf",
      "uploadedAt": "2025-11-29T11:30:00.000Z"
    }
  ],
  "count": 2
}
```

#### Error Responses

**404 Not Found**
```json
{
  "success": false,
  "error": "Agent not found",
  "files": []
}
```

---

### DELETE /api/agents/:id/knowledge-base/:fileId

Delete a specific knowledge base file from an agent.

#### Request

```http
DELETE /api/agents/agent_xyz123abc/knowledge-base/kb_file_123abc
```

#### Response

```json
{
  "success": true,
  "message": "Knowledge base file deleted successfully",
  "fileId": "kb_file_123abc"
}
```

#### Error Responses

**404 Not Found**
```json
{
  "success": false,
  "error": "Agent or file not found"
}
```

---

### POST /api/agents/:id/clone

Clone an agent as a template for a new client. Creates a new independent agent based on an existing one.

#### Request

```http
POST /api/agents/agent_xyz123abc/clone
Content-Type: application/json
```

```json
{
  "newName": "Client ABC - Sales Agent",
  "copyKnowledgeBase": true,
  "customizations": {
    "systemPrompt": "You are Sara from TechCorp, calling on behalf of Client ABC. Follow their specific guidelines...",
    "firstMessage": "Hi, this is Sara calling from TechCorp on behalf of Client ABC..."
  }
}
```

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `newName` | string | Yes | Name for the cloned agent |
| `copyKnowledgeBase` | boolean | No | Whether to copy KB files |
| `customizations` | object | No | Override fields for the clone |
| `customizations.systemPrompt` | string | No | Override system prompt |
| `customizations.firstMessage` | string | No | Override first message |
| `customizations.voiceId` | string | No | Override voice |
| `customizations.language` | string | No | Override language |

#### Response (201 Created)

```json
{
  "success": true,
  "newAgent": {
    "agentId": "agent_newclient789",
    "name": "Client ABC - Sales Agent",
    "voiceId": "4tRn1lSkEn13EVTuqb0g",
    "voiceName": "Serafina",
    "language": "en",
    "templateParentId": "agent_xyz123abc",
    "createdAt": "2025-11-29T15:00:00.000Z"
  },
  "knowledgeBaseCopied": false,
  "note": "Knowledge base files need to be manually copied"
}
```

#### Error Responses

**400 Bad Request**
```json
{
  "success": false,
  "error": "New agent name is required"
}
```

**404 Not Found**
```json
{
  "success": false,
  "error": "Agent not found"
}
```

---

## Error Codes Reference

| Code | Status | Description |
|------|--------|-------------|
| 400 | Bad Request | Invalid or missing required parameters |
| 404 | Not Found | Agent or file not found |
| 409 | Conflict | Duplicate agent name (not currently enforced) |
| 413 | Payload Too Large | File size exceeded limit |
| 500 | Internal Server Error | Server or ElevenLabs API error |

---

## Integration Examples

### JavaScript/TypeScript

```javascript
// Create agent
const createAgent = async (config) => {
  const response = await fetch('https://turbo-octo-waffle-production.up.railway.app/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  return response.json();
};

// List agents
const listAgents = async () => {
  const response = await fetch('https://turbo-octo-waffle-production.up.railway.app/api/agents');
  return response.json();
};

// Update agent
const updateAgent = async (agentId, updates) => {
  const response = await fetch(`https://turbo-octo-waffle-production.up.railway.app/api/agents/${agentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return response.json();
};

// Delete agent
const deleteAgent = async (agentId) => {
  const response = await fetch(`https://turbo-octo-waffle-production.up.railway.app/api/agents/${agentId}`, {
    method: 'DELETE'
  });
  return response.json();
};

// Upload knowledge base file
const uploadKnowledgeBase = async (agentId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`https://turbo-octo-waffle-production.up.railway.app/api/agents/${agentId}/knowledge-base`, {
    method: 'POST',
    body: formData
  });
  return response.json();
};

// Clone agent
const cloneAgent = async (agentId, newName, customizations = {}) => {
  const response = await fetch(`https://turbo-octo-waffle-production.up.railway.app/api/agents/${agentId}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newName,
      copyKnowledgeBase: true,
      customizations
    })
  });
  return response.json();
};
```

### Python

```python
import requests

BASE_URL = "https://turbo-octo-waffle-production.up.railway.app"

def create_agent(config):
    response = requests.post(f"{BASE_URL}/api/agents", json=config)
    return response.json()

def list_agents():
    response = requests.get(f"{BASE_URL}/api/agents")
    return response.json()

def update_agent(agent_id, updates):
    response = requests.put(f"{BASE_URL}/api/agents/{agent_id}", json=updates)
    return response.json()

def delete_agent(agent_id):
    response = requests.delete(f"{BASE_URL}/api/agents/{agent_id}")
    return response.json()

def upload_knowledge_base(agent_id, file_path):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(f"{BASE_URL}/api/agents/{agent_id}/knowledge-base", files=files)
    return response.json()

def clone_agent(agent_id, new_name, customizations=None):
    payload = {
        "newName": new_name,
        "copyKnowledgeBase": True,
        "customizations": customizations or {}
    }
    response = requests.post(f"{BASE_URL}/api/agents/{agent_id}/clone", json=payload)
    return response.json()
```

### cURL

```bash
# Create agent
curl -X POST https://turbo-octo-waffle-production.up.railway.app/api/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "Sales Agent", "systemPrompt": "You are a sales assistant...", "voiceId": "4tRn1lSkEn13EVTuqb0g"}'

# List agents
curl https://turbo-octo-waffle-production.up.railway.app/api/agents

# Get agent
curl https://turbo-octo-waffle-production.up.railway.app/api/agents/agent_xyz123abc

# Update agent
curl -X PUT https://turbo-octo-waffle-production.up.railway.app/api/agents/agent_xyz123abc \
  -H "Content-Type: application/json" \
  -d '{"systemPrompt": "Updated prompt..."}'

# Delete agent
curl -X DELETE https://turbo-octo-waffle-production.up.railway.app/api/agents/agent_xyz123abc

# Upload knowledge base file
curl -X POST https://turbo-octo-waffle-production.up.railway.app/api/agents/agent_xyz123abc/knowledge-base \
  -F "file=@document.txt"

# List knowledge base files
curl https://turbo-octo-waffle-production.up.railway.app/api/agents/agent_xyz123abc/knowledge-base

# Delete knowledge base file
curl -X DELETE https://turbo-octo-waffle-production.up.railway.app/api/agents/agent_xyz123abc/knowledge-base/kb_file_123

# Clone agent
curl -X POST https://turbo-octo-waffle-production.up.railway.app/api/agents/agent_xyz123abc/clone \
  -H "Content-Type: application/json" \
  -d '{"newName": "Client ABC Agent", "customizations": {"systemPrompt": "Custom prompt..."}}'
```

---

## Workflow: Creating a Client-Specific Agent

1. **Create a template agent**
```bash
POST /api/agents
{
  "name": "Sales Template",
  "systemPrompt": "Base sales script with {{company}} and {{product}} variables...",
  "isTemplate": true
}
```

2. **Upload knowledge base files**
```bash
POST /api/agents/{template_id}/knowledge-base
# Upload product info, FAQs, rebuttals, etc.
```

3. **Clone for a new client**
```bash
POST /api/agents/{template_id}/clone
{
  "newName": "Client XYZ - Sales Agent",
  "copyKnowledgeBase": true,
  "customizations": {
    "systemPrompt": "Customized for Client XYZ..."
  }
}
```

4. **Make calls using the cloned agent**
```bash
POST /make-call
{
  "to": "+14155551234",
  "agentId": "{cloned_agent_id}"
}
```

---

## Rate Limiting

- Responses are cached for 5 minutes for list operations
- Individual agent details are cached for 5 minutes
- Rate limits are inherited from ElevenLabs API

---

## Notes

- All agents are managed through ElevenLabs Conversational AI platform
- Knowledge base files are stored on ElevenLabs, not locally
- The `/make-call` endpoint works with just `agentId` - no need for per-call configuration
- Use dynamic customization (`customPrompt`, `dynamicVariables`) in `/make-call` for per-call variations
