# Credentials Library

## Overview

Credentials is a secure credential management library. It provides encrypted credential storage using the system keyring or file-based encryption, with support for environment variable management and credential import/export.

## Installation

No additional dependencies required.

## Keywords

### store_credential
**Description:** Store a credential securely.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Credential name/identifier |
| username | str | Yes | Username |
| password | str | Yes | Password |
| metadata | dict[str, Any] \| None | No | Optional metadata dictionary |

**Returns:** None

**Example:**
```python
creds = Credentials()
creds.store_credential("prod_db", "admin", "secretpass123", {"host": "db.example.com"})
creds.store_credential("api_key", "api_user", "api_password", {"service": "stripe"})
```

### get_credential
**Description:** Retrieve a stored credential.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Credential name/identifier |

**Returns:** dict[str, Any] - Dictionary with username, password, and metadata

**Example:**
```python
creds = Credentials()
cred = creds.get_credential("prod_db")
print(f"Username: {cred['username']}")
print(f"Metadata: {cred['metadata']}")
```

### get_username
**Description:** Get username for a credential.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Credential name/identifier |

**Returns:** str - Username

**Example:**
```python
creds = Credentials()
username = creds.get_username("prod_db")
```

### get_password
**Description:** Get password for a credential.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Credential name/identifier |

**Returns:** str - Password

**Example:**
```python
creds = Credentials()
password = creds.get_password("prod_db")
```

### delete_credential
**Description:** Delete a stored credential.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Credential name/identifier |

**Returns:** bool - True if deleted, False if not found

**Example:**
```python
creds = Credentials()
deleted = creds.delete_credential("old_credential")
```

### list_credentials
**Description:** List all stored credential names.

**Returns:** list[str] - List of credential names

**Example:**
```python
creds = Credentials()
names = creds.list_credentials()
```

### credential_exists
**Description:** Check if a credential exists.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Credential name/identifier |

**Returns:** bool - True if credential exists, False otherwise

**Example:**
```python
creds = Credentials()
if creds.credential_exists("prod_db"):
    print("Credential found")
```

### update_credential
**Description:** Update an existing credential.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Credential name/identifier |
| username | str \| None | No | New username (optional) |
| password | str \| None | No | New password (optional) |
| metadata | dict[str, Any] \| None | No | New metadata (optional, merges with existing) |

**Returns:** None

**Example:**
```python
creds = Credentials()
creds.update_credential("prod_db", password="newpass123")
creds.update_credential("prod_db", metadata={"host": "newdb.example.com"})
```

### get_environment_credential
**Description:** Get credential from environment variables.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| prefix | str | Yes | Environment variable prefix (e.g., 'MY_APP') |

**Returns:** dict[str, str] - Dictionary with username and password

**Example:**
```python
creds = Credentials()
os.environ["MY_APP_USERNAME"] = "appuser"
os.environ["MY_APP_PASSWORD"] = "apppass"
cred = creds.get_environment_credential("MY_APP")
```

### set_environment_credential
**Description:** Set environment variables from a stored credential.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| prefix | str | Yes | Environment variable prefix |
| name | str | Yes | Credential name |

**Returns:** None

**Example:**
```python
creds = Credentials()
creds.set_environment_credential("DB", "prod_db")
# Now os.environ["DB_USERNAME"] and os.environ["DB_PASSWORD"] are set
```

### clear_environment_credentials
**Description:** Remove all environment variables set via set_environment_credential.

**Returns:** None

**Example:**
```python
creds = Credentials()
creds.clear_environment_credentials()
```

### export_credentials
**Description:** Export credentials to a file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Export file path |
| names | list[str] \| None | No | List of credential names to export (all if None) |

**Returns:** str - Path to exported file

**Example:**
```python
creds = Credentials()
creds.export_credentials("./credentials_backup.json")
creds.export_credentials("./prod_only.json", names=["prod_db", "prod_api"])
```

### import_credentials
**Description:** Import credentials from a file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Import file path |
| overwrite | bool | No | Overwrite existing credentials (default: False) |

**Returns:** int - Number of imported credentials

**Example:**
```python
creds = Credentials()
count = creds.import_credentials("./import.json")
count = creds.import_credentials("./override.json", overwrite=True)
```

## Security Features

- **Encryption:** Vault is encrypted using AES-256 via Fernet
- **Key Management:** Keys can be stored in system keyring (keyring) or file with restrictive permissions
- **Password-based Key Derivation:** Uses PBKDF2-HMAC-SHA256 with 600,000 iterations
- **Atomic File Operations:** Prevents corruption during writes
- **Environment Cleanup:** Automatically clears environment variables on destruction

## Common Use Cases

- Store database connection credentials
- Manage API keys for external services
- Handle authentication tokens securely
- Export credentials for backup
- Import credentials across environments
- Use credentials in environment variables
- Secret sharing across automation workflows
- Credential rotation and management
