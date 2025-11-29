# Database Schema for Agent Management System

This document describes the database schema required for full agent management functionality. These tables store agent configurations locally and maintain synchronization with ElevenLabs Conversational AI platform.

## Overview

The schema supports:
- Storing agent configurations with ElevenLabs integration
- Knowledge base file tracking
- Template-based agent cloning
- Advanced configuration storage

## Tables

### 1. Agents Table

Primary table for storing ElevenLabs Conversational AI agent configurations.

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elevenlabs_agent_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  first_message TEXT,
  voice_id VARCHAR(255) NOT NULL,
  voice_name VARCHAR(255),
  language VARCHAR(10) DEFAULT 'en',
  is_template BOOLEAN DEFAULT false,
  template_parent_id UUID REFERENCES agents(id),
  created_by_user_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Column Descriptions

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `elevenlabs_agent_id` | VARCHAR(255) | Unique ElevenLabs agent ID (e.g., `agent_abc123`) |
| `name` | VARCHAR(255) | Human-readable agent name |
| `description` | TEXT | Optional description of agent purpose |
| `system_prompt` | TEXT | The system prompt/instructions for the agent |
| `first_message` | TEXT | Initial message the agent speaks |
| `voice_id` | VARCHAR(255) | ElevenLabs voice ID |
| `voice_name` | VARCHAR(255) | Human-readable voice name |
| `language` | VARCHAR(10) | Language code (e.g., 'en', 'es', 'fr') |
| `is_template` | BOOLEAN | Whether this agent is a template for cloning |
| `template_parent_id` | UUID | Reference to parent template if cloned |
| `created_by_user_id` | UUID | Optional reference to user who created agent |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

---

### 2. Knowledge Base Files Table

Tracks knowledge base files uploaded to agents.

```sql
CREATE TABLE agent_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(100),
  elevenlabs_file_id VARCHAR(255),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Column Descriptions

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `agent_id` | UUID | Foreign key to agents table |
| `file_name` | VARCHAR(255) | Original filename |
| `file_size` | INTEGER | File size in bytes |
| `file_type` | VARCHAR(100) | MIME type (e.g., 'text/plain', 'application/pdf') |
| `elevenlabs_file_id` | VARCHAR(255) | ElevenLabs file ID for API operations |
| `uploaded_at` | TIMESTAMP | Upload timestamp |

---

### 3. Agent Configuration Table

Stores advanced/custom configuration key-value pairs for agents.

```sql
CREATE TABLE agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  config_key VARCHAR(100) NOT NULL,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, config_key)
);
```

#### Column Descriptions

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `agent_id` | UUID | Foreign key to agents table |
| `config_key` | VARCHAR(100) | Configuration key name |
| `config_value` | TEXT | Configuration value (JSON or string) |
| `updated_at` | TIMESTAMP | Last update timestamp |

#### Common Config Keys

| Key | Example Value | Description |
|-----|---------------|-------------|
| `max_call_duration` | `600` | Maximum call duration in seconds |
| `enable_recording` | `true` | Whether to record calls |
| `callback_url` | `https://...` | Webhook URL for call completion |
| `custom_metadata` | `{"campaign": "..."}` | Custom metadata JSON |

---

## Indexes

Performance indexes for common query patterns:

```sql
-- Find template agents quickly
CREATE INDEX idx_agents_template ON agents(is_template);

-- Look up agents by ElevenLabs ID
CREATE INDEX idx_agents_elevenlabs_id ON agents(elevenlabs_agent_id);

-- Find knowledge base files by agent
CREATE INDEX idx_kb_agent_id ON agent_knowledge_base(agent_id);

-- Find config by agent
CREATE INDEX idx_config_agent_id ON agent_config(agent_id);
```

---

## Complete Migration Script

```sql
-- =====================================================
-- Agent Management System Database Migration
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create Agents Table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elevenlabs_agent_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  first_message TEXT,
  voice_id VARCHAR(255) NOT NULL,
  voice_name VARCHAR(255),
  language VARCHAR(10) DEFAULT 'en',
  is_template BOOLEAN DEFAULT false,
  template_parent_id UUID REFERENCES agents(id),
  created_by_user_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Knowledge Base Files Table
CREATE TABLE IF NOT EXISTS agent_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(100),
  elevenlabs_file_id VARCHAR(255),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Agent Configuration Table
CREATE TABLE IF NOT EXISTS agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  config_key VARCHAR(100) NOT NULL,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, config_key)
);

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS idx_agents_template ON agents(is_template);
CREATE INDEX IF NOT EXISTS idx_agents_elevenlabs_id ON agents(elevenlabs_agent_id);
CREATE INDEX IF NOT EXISTS idx_kb_agent_id ON agent_knowledge_base(agent_id);
CREATE INDEX IF NOT EXISTS idx_config_agent_id ON agent_config(agent_id);

-- 5. Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 6. Add triggers for auto-updating updated_at
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_config_updated_at
    BEFORE UPDATE ON agent_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## Usage Notes

### Syncing with ElevenLabs

The `agents` table serves as a local cache and configuration store. The actual agent logic runs on ElevenLabs. Keep these in sync:

1. **Creating agents**: First create in ElevenLabs, then store the returned `agent_id` in `elevenlabs_agent_id`
2. **Updating agents**: Update both ElevenLabs and local DB
3. **Deleting agents**: Delete from ElevenLabs first, then remove local record

### Template-based Cloning

When cloning an agent:
1. Get source agent configuration from DB
2. Create new agent in ElevenLabs with modified config
3. Store new agent with `template_parent_id` pointing to source
4. Optionally copy knowledge base files

### Knowledge Base Management

Files are stored in ElevenLabs, not locally. The `agent_knowledge_base` table only tracks metadata:
- Upload file to ElevenLabs API
- Store returned `file_id` in `elevenlabs_file_id`
- Use ElevenLabs API for file operations

---

## Example Queries

### Get all template agents
```sql
SELECT * FROM agents WHERE is_template = true ORDER BY created_at DESC;
```

### Get agents cloned from a template
```sql
SELECT * FROM agents WHERE template_parent_id = 'uuid-of-template';
```

### Get agent with knowledge base files
```sql
SELECT a.*, json_agg(kb.*) as knowledge_base
FROM agents a
LEFT JOIN agent_knowledge_base kb ON a.id = kb.agent_id
WHERE a.elevenlabs_agent_id = 'agent_xyz123'
GROUP BY a.id;
```

### Get agent with all config
```sql
SELECT a.*, 
       json_object_agg(c.config_key, c.config_value) as config
FROM agents a
LEFT JOIN agent_config c ON a.id = c.agent_id
WHERE a.elevenlabs_agent_id = 'agent_xyz123'
GROUP BY a.id;
```
