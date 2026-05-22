# OCR Library

## Overview

OCR is a text recognition library using Tesseract and EasyOCR. It enables extracting text from images, performing OCR on screen regions, finding text coordinates, and reading barcodes/QR codes.

## Installation

```bash
pip install rpaforge-libraries[ocr]

# System dependencies:
# Windows: https://github.com/UB-Mannheim/tesseract/wiki
# Linux:   sudo apt-get install tesseract-ocr
# macOS:   brew install tesseract
```

## Keywords

### ocr_text_from_image
**Description:** Recognize text from an image file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str | Yes | Path to the image file |
| lang | str \| None | No | OCR language (uses default if not specified) |

**Returns:** str - Recognized text

**Example:**
```python
ocr = OCR()
text = ocr.ocr_text_from_image("document.png")
text = ocr.ocr_text_from_image("receipt.jpg", lang="eng+deu")
```

### ocr_text_from_screen
**Description:** Recognize text from screen region.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| region | tuple[int, int, int, int] \| None | No | Region as (x, y, width, height). Full screen if None. |

**Returns:** str - Recognized text

**Example:**
```python
ocr = OCR()
text = ocr.ocr_text_from_screen()  # Full screen
text = ocr.ocr_text_from_screen((100, 100, 400, 300))  # Specific region
```

### find_text_on_screen
**Description:** Find text coordinates on screen.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | Text to find |
| region | tuple[int, int, int, int] \| None | No | Search region |

**Returns:** tuple[int, int] \| None - Coordinates (x, y) of text center, or None if not found

**Example:**
```python
ocr = OCR()
coords = ocr.find_text_on_screen("Submit")
if coords:
    x, y = coords
    print(f"Found at {x}, {y}")
```

### click_text
**Description:** Click on text found on screen.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | Text to find and click |
| region | tuple[int, int, int, int] \| None | No | Search region |
| button | str | No | Mouse button: 'left', 'right', 'middle' (default: 'left') |

**Returns:** bool - True if text was found and clicked, False otherwise

**Example:**
```python
ocr = OCR()
success = ocr.click_text("Save")
success = ocr.click_text("Cancel", button="right")
```

### get_text_coordinates
**Description:** Get coordinates and dimensions of text on screen.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | Text to find |
| region | tuple[int, int, int, int] \| None | No | Search region |

**Returns:** dict[str, int] \| None - Dictionary with x, y, width, height or None

**Example:**
```python
ocr = OCR()
coords = ocr.get_text_coordinates("Error")
if coords:
    print(f"Text at ({coords['x']}, {coords['y']}) size {coords['width']}x{coords['height']}")
```

### set_ocr_language
**Description:** Set OCR language for subsequent operations.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| lang | str | Yes | Language code (e.g., 'eng', 'rus', 'deu') |

**Returns:** None

**Example:**
```python
ocr = OCR()
ocr.set_ocr_language("rus")  # Russian
ocr.set_ocr_language("eng+deu")  # Multiple languages
```

### set_ocr_confidence
**Description:** Set minimum confidence threshold for text detection.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| confidence | float | Yes | Minimum confidence (0.0 to 1.0) |

**Returns:** None

**Example:**
```python
ocr = OCR()
ocr.set_ocr_confidence(0.8)  # Only high-confidence text
```

### get_ocr_data
**Description:** Get detailed OCR data from screen region.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| region | tuple[int, int, int, int] \| None | No | Screen region or None for full screen |

**Returns:** list[dict[str, Any]] - List of dictionaries with text, coordinates, and confidence

**Example:**
```python
ocr = OCR()
data = ocr.get_ocr_data()
for item in data:
    print(f"Text: {item['text']}, confidence: {item['confidence']}")
```

### ocr_multi_language
**Description:** Run OCR with multiple Tesseract language packs.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str | Yes | Path to the image file |
| langs | list[str] | Yes | Language codes (e.g., ['eng', 'rus', 'deu']) |

**Returns:** str - Recognized text combining all specified languages

**Example:**
```python
ocr = OCR()
text = ocr.ocr_multi_language("multilingual_doc.png", ["eng", "deu", "fra"])
```

### ocr_with_confidence
**Description:** Run OCR and return each word with its confidence score.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str | Yes | Path to the image file |
| lang | str \| None | No | Tesseract language code (uses library default if None) |
| min_confidence | float \| None | No | Filter out words below this confidence (0-1) |

**Returns:** list[dict[str, Any]] - List of {'text': str, 'confidence': float} dicts

**Example:**
```python
ocr = OCR()
results = ocr.ocr_with_confidence("document.png", min_confidence=0.7)
for item in results:
    if item['confidence'] >= 0.9:
        print(f"High confidence: {item['text']}")
```

### compare_images
**Description:** Compare two images and return a similarity score.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path1 | str | Yes | Path to the first image |
| path2 | str | Yes | Path to the second image |

**Returns:** float - Similarity score between 0.0 (different) and 1.0 (identical)

**Example:**
```python
ocr = OCR()
similarity = ocr.compare_images("original.png", "copy.png")
if similarity > 0.95:
    print("Images are nearly identical")
```

### read_barcode
**Description:** Decode barcodes and QR codes from an image.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str | Yes | Path to the image file |

**Returns:** list[str] - List of decoded barcode/QR values

**Example:**
```python
ocr = OCR()
values = ocr.read_barcode("tickets.png")
for value in values:
    print(f"Barcode: {value}")
```

## Common Use Cases

- Extract text from scanned documents
- Optical character recognition for PDF images
- Screen text extraction for automation validation
- QR code scanning for ticket verification
- Text-based UI element identification
- Document comparison and verification
- Barcode reading for inventory systems
- Multi-language document processing
- Confidence-based text filtering
- Full-screen and region-specific OCR
