"""
AI Summarization Module
-----------------------
Handles document and image summarization using BART and BLIP models.
Supports PDF, DOCX, DOC, TXT, and image files.
"""

import io
import re
from PIL import Image

# Document processing imports
import pdfplumber

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("Warning: pytesseract not available, OCR will be disabled")

try:
    from docx import Document as DocxDocument
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    print("Warning: python-docx not available, DOCX parsing will be disabled")


# Lazy-loaded model instances
_summarization_models = {
    "summarizer": None,
    "blip_processor": None,
    "blip_model": None,
}

SUMMARIZER_AVAILABLE = True
BLIP_AVAILABLE = True


# ==================== Model Loaders ====================

def get_summarizer():
    """Lazy load summarization pipeline (DistilBART model - faster than BART)."""
    global SUMMARIZER_AVAILABLE
    if _summarization_models["summarizer"] is None and SUMMARIZER_AVAILABLE:
        print("Loading summarization model (DistilBART-CNN - optimized for speed)...")
        try:
            from transformers import pipeline
            _summarization_models["summarizer"] = pipeline(
                "summarization", 
                model="sshleifer/distilbart-cnn-12-6",  # Faster distilled model
                device=-1  # CPU
            )
            print("Summarization model loaded (DistilBART-CNN).")
        except Exception as e:
            print(f"Warning: Could not load summarization model: {e}")
            SUMMARIZER_AVAILABLE = False
            return None
    return _summarization_models["summarizer"]


def get_blip():
    """Lazy load BLIP model and processor for image captioning."""
    global BLIP_AVAILABLE
    if _summarization_models["blip_model"] is None or _summarization_models["blip_processor"] is None:
        if not BLIP_AVAILABLE:
            return None, None
        print("Loading BLIP image captioning model...")
        try:
            from transformers import BlipProcessor, BlipForConditionalGeneration
            _summarization_models["blip_processor"] = BlipProcessor.from_pretrained(
                "Salesforce/blip-image-captioning-base",
                use_fast=True
            )
            _summarization_models["blip_model"] = BlipForConditionalGeneration.from_pretrained(
                "Salesforce/blip-image-captioning-base"
            )
            print("BLIP model loaded.")
        except Exception as e:
            print(f"Warning: Could not load BLIP model: {e}")
            BLIP_AVAILABLE = False
            return None, None
    return _summarization_models["blip_model"], _summarization_models["blip_processor"]


def warmup_models():
    """Pre-warm AI models for faster first inference."""
    print("Warming up summarization models...")
    try:
        # Warm up summarizer with a short text
        summarizer = get_summarizer()
        if summarizer:
            _ = summarizer("This is a test sentence for warming up the summarization model.", max_length=30, min_length=10)
            print("Summarizer warmed up.")
    except Exception as e:
        print(f"Summarizer warmup failed: {e}")
    
    try:
        # Warm up BLIP with a small dummy image
        blip_model, blip_processor = get_blip()
        if blip_model and blip_processor:
            from PIL import Image
            dummy_img = Image.new('RGB', (100, 100), color='white')
            inputs = blip_processor(images=dummy_img, return_tensors="pt")
            _ = blip_model.generate(**inputs, max_new_tokens=20)
            print("BLIP model warmed up.")
    except Exception as e:
        print(f"BLIP warmup failed: {e}")
    
    print("Model warmup complete.")


# ==================== Text Extraction ====================

def extract_text_from_pdf(buffer: bytes) -> str:
    """Extract text content from PDF file."""
    try:
        text_parts = []
        with pdfplumber.open(io.BytesIO(buffer)) as pdf:
            for page in pdf.pages[:20]:  # Limit to first 20 pages
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts)
    except Exception as e:
        print(f"PDF extraction failed: {e}")
        return ""


def extract_text_from_docx(buffer: bytes) -> str:
    """Extract text content from DOCX file."""
    if not DOCX_AVAILABLE:
        return ""
    try:
        doc = DocxDocument(io.BytesIO(buffer))
        text_parts = []
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                text_parts.append(paragraph.text)
        return "\n".join(text_parts)
    except Exception as e:
        print(f"DOCX extraction failed: {e}")
        return ""


def extract_text_from_doc(buffer: bytes) -> str:
    """Extract text from legacy DOC files (basic extraction)."""
    try:
        # Try to decode as text (works for some .doc files)
        text = buffer.decode('utf-8', errors='ignore')
        # Clean up binary artifacts
        text = re.sub(r'[^\x20-\x7E\n\r\t]', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        return text[:10000]  # Limit length
    except Exception as e:
        print(f"DOC extraction failed: {e}")
        return ""


def clean_text_for_summarization(text: str) -> str:
    """Clean and prepare text for summarization."""
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove special characters that might cause issues
    text = re.sub(r'[^\w\s.,!?;:\-\'\"()\[\]{}]', '', text)
    return text.strip()


# ==================== Summarization Functions ====================

def summarize_text(text: str, max_length: int = 130, min_length: int = 30) -> str:
    """Summarize text using DistilBART model (optimized for speed)."""
    summarizer = get_summarizer()
    if not SUMMARIZER_AVAILABLE or not summarizer:
        return "Summarization model not available."
    
    # Clean text
    text = clean_text_for_summarization(text)
    
    if len(text) < 100:
        return text  # Text too short to summarize
    
    # Truncate to fit model's max input - use smaller chunk for faster processing
    text = text[:3000]
    
    try:
        # Generate summary with optimized parameters
        summary = summarizer(
            text, 
            max_length=max_length, 
            min_length=min_length, 
            do_sample=False,
            truncation=True,
            num_beams=2,  # Reduced from default 4 for speed
            early_stopping=True
        )
        return summary[0]['summary_text']
    except Exception as e:
        print(f"Summarization failed: {e}")
        return f"Summarization failed: {str(e)}"


def generate_image_caption(buffer: bytes) -> str:
    """Generate caption for image using BLIP model."""
    blip_model, blip_processor = get_blip()
    if not BLIP_AVAILABLE or not blip_model:
        return "Image captioning model not available."
    
    try:
        # Load image
        img = Image.open(io.BytesIO(buffer)).convert('RGB')
        
        # Generate caption using BLIP
        inputs = blip_processor(images=img, return_tensors="pt")
        out = blip_model.generate(**inputs, max_new_tokens=100)
        caption = blip_processor.decode(out[0], skip_special_tokens=True)
        
        # Optional: Extract text from image using OCR if available
        ocr_text = ""
        if TESSERACT_AVAILABLE:
            try:
                ocr_text = pytesseract.image_to_string(img)
                ocr_text = ocr_text.strip()
                if ocr_text:
                    ocr_text = f"\n\nText in image: {ocr_text[:500]}"
            except Exception as e:
                print(f"OCR on image failed: {e}")
        
        return caption + ocr_text
    except Exception as e:
        print(f"Image captioning failed: {e}")
        return f"Image captioning failed: {str(e)}"


# ==================== Utility Functions ====================

def is_summarizable_mimetype(mimetype: str) -> bool:
    """Check if the mimetype supports summarization."""
    summarizable = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp'
    ]
    return any(s in mimetype.lower() for s in summarizable)


def process_file_for_summary(buffer: bytes, mimetype: str) -> str:
    """
    Process a file and generate its summary based on mimetype.
    
    Args:
        buffer: File content as bytes
        mimetype: MIME type of the file
        
    Returns:
        Summary string
    """
    mimetype = mimetype.lower()
    
    if 'image' in mimetype:
        # Image summarization using BLIP
        return generate_image_caption(buffer)
        
    elif 'pdf' in mimetype:
        # PDF document summarization
        text = extract_text_from_pdf(buffer)
        if text:
            return summarize_text(text)
        else:
            return "Could not extract text from PDF."
            
    elif 'msword' in mimetype or 'wordprocessingml' in mimetype:
        # Word document summarization
        if 'openxmlformats' in mimetype:
            text = extract_text_from_docx(buffer)
        else:
            text = extract_text_from_doc(buffer)
        
        if text:
            return summarize_text(text)
        else:
            return "Could not extract text from document."
            
    elif 'text' in mimetype:
        # Plain text summarization
        try:
            text = buffer.decode('utf-8', errors='ignore')
            if len(text) > 100:
                return summarize_text(text)
            else:
                return text
        except Exception as e:
            return f"Could not process text file: {str(e)}"
    else:
        return "File type not supported for summarization."
