# HTTP Library

## Overview

HTTP is an HTTP/API operations library using Python's requests library. It enables making REST API calls with support for authentication, headers, retries, and session management.

## Installation

No additional dependencies required.

## Keywords

### configure
**Description:** Configure default HTTP client settings.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| base_url | str | No | Base URL for all requests (default: '') |
| default_timeout | int | No | Default timeout in seconds (default: 30) |
| default_retry_count | int | No | Default number of retries on failure (default: 0) |
| default_retry_delay | float | No | Delay between retries in seconds (default: 1.0) |
| default_headers | dict[str, str] \| None | No | Default headers for all requests |

**Returns:** str - Configuration summary

**Example:**
```python
http = HTTP()
http.configure(base_url="https://api.example.com", default_timeout=60)
http.configure(default_retry_count=3, default_retry_delay=2.0)
```

### set_auth_basic
**Description:** Set Basic authentication for requests.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| username | str | Yes | Username for authentication |
| password | str | Yes | Password for authentication |

**Returns:** str - Confirmation message

**Example:**
```python
http = HTTP()
http.set_auth_basic("username", "password")
http.get("/users")
```

### set_auth_bearer
**Description:** Set Bearer token authentication for requests.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| token | str | Yes | Bearer token |

**Returns:** str - Confirmation message

**Example:**
```python
http = HTTP()
http.set_auth_bearer("eyJhbGciOiJIUzI1NiIs...")
http.get("/protected/resource")
```

### set_auth_api_key
**Description:** Set API Key authentication for requests.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| api_key | str | Yes | API key |

**Returns:** str - Confirmation message

**Example:**
```python
http = HTTP()
http.set_auth_api_key("sk_live_1234567890abcdef")
http.get("/data")
```

### clear_auth
**Description:** Clear authentication settings.

**Returns:** str - Confirmation message

**Example:**
```python
http = HTTP()
http.clear_auth()
```

### set_default_headers
**Description:** Set default headers for all requests.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| headers | dict[str, str] | Yes | Dictionary of headers |

**Returns:** str - Confirmation message

**Example:**
```python
http = HTTP()
http.set_default_headers({"Content-Type": "application/json", "User-Agent": "MyApp/1.0"})
```

### clear_default_headers
**Description:** Clear all default headers.

**Returns:** str - Confirmation message

**Example:**
```python
http = HTTP()
http.clear_default_headers()
```

### get
**Description:** Send HTTP GET request.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | str | Yes | URL to request (relative to base_url if configured) |
| params | dict[str, Any] \| None | No | Query parameters |
| headers | dict[str, str] \| None | No | Additional headers for this request |
| timeout | int \| None | No | Request timeout in seconds |

**Returns:** dict[str, Any] - Response dict with status_code, headers, json/text

**Example:**
```python
http = HTTP()
response = http.get("/api/users")
response = http.get("/api/users", params={"page": 1, "limit": 10})
```

### post
**Description:** Send HTTP POST request.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | str | Yes | URL to request |
| json_data | dict[str, Any] \| None | No | JSON body data |
| data | str \| bytes \| dict[str, Any] \| None | No | Raw body data |
| params | dict[str, Any] \| None | No | Query parameters |
| headers | dict[str, str] \| None | No | Additional headers |
| timeout | int \| None | No | Request timeout |

**Returns:** dict[str, Any] - Response dict

**Example:**
```python
http = HTTP()
http.post("/api/users", json_data={"name": "John", "email": "john@example.com"})
http.post("/api/upload", data=b"bytes data", headers={"Content-Type": "application/octet-stream"})
```

### put
**Description:** Send HTTP PUT request.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | str | Yes | URL to request |
| json_data | dict[str, Any] \| None | No | JSON body data |
| data | str \| bytes \| dict[str, Any] \| None | No | Raw body data |
| params | dict[str, Any] \| None | No | Query parameters |
| headers | dict[str, str] \| None | No | Additional headers |
| timeout | int \| None | No | Request timeout |

**Returns:** dict[str, Any] - Response dict

**Example:**
```python
http = HTTP()
http.put("/api/users/1", json_data={"name": "Updated Name"})
```

### delete
**Description:** Send HTTP DELETE request.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | str | Yes | URL to request |
| params | dict[str, Any] \| None | No | Query parameters |
| headers | dict[str, str] \| None | No | Additional headers |
| timeout | int \| None | No | Request timeout |

**Returns:** dict[str, Any] - Response dict

**Example:**
```python
http = HTTP()
http.delete("/api/users/1")
```

### patch
**Description:** Send HTTP PATCH request.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | str | Yes | URL to request |
| json_data | dict[str, Any] \| None | No | JSON body data |
| data | str \| bytes \| dict[str, Any] \| None | No | Raw body data |
| params | dict[str, Any] \| None | No | Query parameters |
| headers | dict[str, str] \| None | No | Additional headers |
| timeout | int \| None | No | Request timeout |

**Returns:** dict[str, Any] - Response dict

**Example:**
```python
http = HTTP()
http.patch("/api/users/1", json_data={"status": "active"})
```

### request
**Description:** Send HTTP request with any method.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| method | str | Yes | HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS) |
| url | str | Yes | URL to request |
| json_data | dict[str, Any] \| None | No | JSON body data |
| data | str \| bytes \| dict[str, Any] \| None | No | Raw body data |
| params | dict[str, Any] \| None | No | Query parameters |
| headers | dict[str, str] \| None | No | Additional headers |
| timeout | int \| None | No | Request timeout |
| retry_count | int \| None | No | Number of retries on failure |
| retry_delay | float \| None | No | Delay between retries |

**Returns:** dict[str, Any] - Response dict

**Example:**
```python
http = HTTP()
http.request("HEAD", "/api/health")
http.request("OPTIONS", "/api/users")
```

### close
**Description:** Close the HTTP session.

**Returns:** str - Confirmation message

**Example:**
```python
http = HTTP()
http.close()
```

## Response Structure

All HTTP methods return a dictionary with the following structure:

```python
{
    "status_code": 200,
    "reason": "OK",
    "headers": {"Content-Type": "application/json", ...},
    "url": "https://api.example.com/resource",
    "elapsed_ms": 125,
    "json": {"data": "..."},  # For JSON responses
    "text": "raw text"  # For non-JSON responses
}
```

## Common Use Cases

- REST API integration with external services
- Webhook handling and HTTP requests
- Authentication flow management
- File downloads via HTTP
- API rate limiting and retry handling
- Custom header injection for API access
- Health checks and status monitoring
- JSON data exchange with web services
- HTTP basic/bearer/API key authentication
- Building API clients for internal services
